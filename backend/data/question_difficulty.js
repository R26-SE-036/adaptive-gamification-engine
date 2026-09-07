/**
 * Is each question as hard as its label says?
 *
 *     node data/question_difficulty.js
 *     node data/question_difficulty.js --min-attempts 10
 *     node data/question_difficulty.js --real-only
 *
 * ============================ WHY THIS MATTERS ============================
 * Every question carries a difficulty label - Beginner through Expert - and
 * every one of those labels is an AUTHOR'S JUDGEMENT. Nobody has ever checked
 * one against a student.
 *
 * That is not a cosmetic problem. `difficulty_ordinal` is a feature the model is
 * fitted on, and the progression rule moves students between these levels. If a
 * question labelled Expert is passed by 90% of students, then:
 *
 *   * the model is being trained on a mislabelled input, so every downstream
 *     number inherits the error;
 *   * a student is advanced for clearing something that was not hard;
 *   * and NFR-03's accuracy figure is measured against a scale that does not
 *     mean what it says.
 *
 * ============================== WHAT IT COMPUTES ==============================
 * The p-value in the classical-test-theory sense: the proportion of attempts
 * that succeeded. High p means easy.
 *
 *     p = successes / attempts
 *
 * A well-ordered bank has p falling as the label rises. This prints the observed
 * p per question, the mean per level, and flags questions whose observed
 * difficulty contradicts their label - either far easier than their level's
 * average, or far harder.
 *
 * ============================== WHAT IT REFUSES ==============================
 * A p-value from three attempts is noise. Questions below `--min-attempts` are
 * counted and set aside rather than ranked, and the script says how much of the
 * bank it could not judge - which, until a cohort has played, will be all of it.
 *
 * `--real-only` drops simulated and manual-test rows, the same filter the
 * trainer applies. On by default would hide the pipeline working during
 * development; off by default would let seeded data reach a reported number, so
 * it is a flag and the output always says which was used.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const GameSession = require('../models/GameSession');
const QuestionBank = require('../models/QuestionBank');
const { DIFFICULTY_LEVELS } = require('../config/constants');
const { rules } = require('../services/ruleConfigService');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
};

/** Below this many attempts a p-value is noise rather than a measurement. */
const MIN_ATTEMPTS = option('min-attempts', 8);

/** How far from its level's mean a question has to sit to be flagged. */
const FLAG_GAP = 0.25;

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const passMark = rules().scoring.passMark;

    // Invalidated rounds are excluded unconditionally, not behind a flag. The
    // whole purpose of this script is to measure how hard a question is from
    // how students did on it, and a round lost to a DEFECTIVE question measures
    // the defect. Provenance is a choice (--real-only); validity is not.
    const match = {
        questionId: { $ne: null, $exists: true },
        ...GameSession.COUNTS_AS_EVIDENCE
    };
    if (flag('real-only')) match.dataSource = 'real';

    const attempts = await GameSession.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$questionId',
                attempts: { $sum: 1 },
                successes: { $sum: { $cond: [{ $gte: ['$score', passMark] }, 1, 0] } },
                meanScore: { $avg: '$score' }
            }
        }
    ]);

    const questions = await QuestionBank.find({}).select('id difficulty gameType conceptTag').lean();
    const byId = new Map(questions.map((q) => [q.id, q]));

    console.log('\n── Corpus ──────────────────────────────────────────────────');
    console.log(`  questions in the bank        : ${questions.length}`);
    console.log(`  questions with any attempts  : ${attempts.length}`);
    console.log(`  filter                       : ${flag('real-only') ? 'real sessions only' : 'ALL sessions, including simulated and test'}`);
    console.log(`  pass mark                    : ${passMark}`);

    const measured = [];
    let tooFew = 0;

    for (const row of attempts) {
        const question = byId.get(row._id);
        if (!question) continue; // a retired question

        if (row.attempts < MIN_ATTEMPTS) {
            tooFew += 1;
            continue;
        }

        measured.push({
            id: row._id,
            level: question.difficulty,
            gameType: question.gameType,
            concept: question.conceptTag,
            attempts: row.attempts,
            p: row.successes / row.attempts,
            meanScore: row.meanScore
        });
    }

    console.log(`  with at least ${MIN_ATTEMPTS} attempts     : ${measured.length}`);
    if (tooFew) console.log(`  seen but too few to judge    : ${tooFew}`);

    if (measured.length === 0) {
        console.log(
            '\nNothing measurable yet. Every difficulty label in the bank is still\n' +
                'an authored judgement - which is the honest position to state until a\n' +
                'cohort has played enough for these numbers to mean something.\n'
        );
        await mongoose.disconnect();
        return;
    }

    // ── Is the ladder actually ordered? ──────────────────────────────────────
    console.log('\n── Observed difficulty by level ────────────────────────────');
    console.log('  level           n    mean p   (lower p = harder)');

    const meanByLevel = {};
    for (const level of DIFFICULTY_LEVELS) {
        const inLevel = measured.filter((m) => m.level === level);
        if (inLevel.length === 0) continue;

        const mean = inLevel.reduce((s, m) => s + m.p, 0) / inLevel.length;
        meanByLevel[level] = mean;
        console.log(`  ${level.padEnd(14)}${String(inLevel.length).padStart(3)}    ${mean.toFixed(3)}`);
    }

    const ordered = DIFFICULTY_LEVELS.filter((l) => l in meanByLevel);
    const monotonic = ordered.every(
        (level, i) => i === 0 || meanByLevel[level] <= meanByLevel[ordered[i - 1]] + 0.02
    );

    console.log(
        `\n  ladder is monotonic (harder levels really are harder): ` +
            `${monotonic ? 'YES' : 'NO'}`
    );
    if (!monotonic) {
        console.log(
            '  A level whose questions are EASIER than the level below it means the\n' +
                '  labels do not describe the content, and difficulty_ordinal is feeding\n' +
                '  the model a scale that does not hold.'
        );
    }

    // ── Individual questions that contradict their label ─────────────────────
    const flagged = measured
        .filter((m) => meanByLevel[m.level] !== undefined)
        .map((m) => ({ ...m, gap: m.p - meanByLevel[m.level] }))
        .filter((m) => Math.abs(m.gap) >= FLAG_GAP)
        .sort((a, b) => b.gap - a.gap);

    console.log('\n── Questions that contradict their label ───────────────────');
    if (flagged.length === 0) {
        console.log('  None. Every measured question sits near its level\'s average.');
    } else {
        console.log('  question                level         n     p     vs level');
        for (const m of flagged) {
            console.log(
                `  ${m.id.padEnd(22)}${m.level.padEnd(14)}${String(m.attempts).padStart(3)}  ` +
                    `${m.p.toFixed(2)}   ${m.gap >= 0 ? '+' : ''}${m.gap.toFixed(2)} ` +
                    `${m.gap > 0 ? '(too easy for its level)' : '(too hard for its level)'}`
            );
        }
    }

    console.log(
        '\n  These are candidates for relabelling, not verdicts. A question can be\n' +
            '  legitimately easier than its neighbours; what matters is whether the\n' +
            '  pattern holds once more students have played it.\n'
    );

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
