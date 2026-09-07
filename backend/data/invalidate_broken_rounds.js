/**
 * Mark the rounds that were played against defective questions.
 *
 *     node data/invalidate_broken_rounds.js            # dry run, changes nothing
 *     node data/invalidate_broken_rounds.js --apply
 *     node data/invalidate_broken_rounds.js --undo --apply
 *
 * ============================== WHAT HAPPENED ==============================
 * Seventeen of the twenty Drag & Drop questions in the bank were defective, and
 * it took an audit to notice because nothing in the test suite had ever looked
 * at question CONTENT:
 *
 *   * eight had an answer with a different number of entries than the question
 *     had lines. Grading compares lengths first, so those could not be passed
 *     by any student, by any arrangement, ever.
 *   * nine were the identity permutation. The UI starts the student in exactly
 *     that order, so pressing Submit without touching anything scored 100.
 *
 * The bank was re-authored in 602a19c. This script deals with what the old one
 * left behind in the session history.
 *
 * ========================= WHY NOT JUST DELETE THEM =========================
 * Because "we removed the data that disagreed with us" is indistinguishable
 * from "we removed the data that was wrong" once the rows are gone. Marking
 * keeps the row, records the reason on it, and lets anybody count exactly what
 * was excluded and re-derive the decision. `invalidatedReason` is both the flag
 * and the audit trail; --undo reverses it exactly.
 *
 * ======================== WHY THE CUT IS BY TIME ========================
 * The precise test would be "was this round played against one of the
 * seventeen", and that cannot be asked: `questionId` was added to GameSession
 * in 6de7497, AFTER these rounds were played, so the rows do not record which
 * question they were. The honest cut is therefore every Drag & Drop round
 * completed before the bank was fixed.
 *
 * That over-includes the three questions that were fine - about 15% of the
 * affected rows. Erring that way is deliberate: excluding a valid round costs
 * one observation out of a corpus that will grow, while keeping an invalid one
 * puts a wrong label in a corpus small enough for it to matter. The script
 * prints exactly how many rows it touched so the over-inclusion is visible
 * rather than assumed.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const GameSession = require('../models/GameSession');

/**
 * When the Drag & Drop bank was re-authored - commit 602a19c,
 * 2026-09-07 06:36:13 +0530, expressed in UTC.
 *
 * Rounds completed at or after this instant were played against the corrected
 * questions and are untouched.
 */
const BANK_FIXED_AT = new Date('2026-09-07T01:06:13Z');

/** Written onto every affected row. Specific enough to be undone precisely. */
const REASON =
    'dragdrop_bank_defective_before_602a19c: 17 of 20 questions were unwinnable ' +
    'or scored 100 without input';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const undo = args.includes('--undo');

const selector = undo
    ? { invalidatedReason: REASON }
    : {
          gameType: 'DragDrop',
          completedAt: { $lt: BANK_FIXED_AT },
          invalidatedReason: null
      };

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const affected = await GameSession.find(selector)
        .select('userId conceptTag difficultyLevel score dataSource completedAt')
        .sort({ completedAt: 1 })
        .lean();

    console.log(`\n── ${undo ? 'Restoring' : 'Invalidating'} ──────────────────────────────────────`);
    console.log(`  cut-off                 : ${BANK_FIXED_AT.toISOString()}`);
    console.log(`  rounds matched          : ${affected.length}`);

    if (affected.length === 0) {
        console.log('\n  Nothing to do.\n');
        await mongoose.disconnect();
        return;
    }

    // Broken out by provenance, because it changes what the number means. A
    // simulated row was already excluded from training; a `real` one was not,
    // and those are the rows that have been corrupting every reported figure.
    const bySource = {};
    const byScore = { zero: 0, full: 0, other: 0 };
    for (const row of affected) {
        const source = row.dataSource ?? '(none recorded)';
        bySource[source] = (bySource[source] || 0) + 1;

        if (row.score === 0) byScore.zero += 1;
        else if (row.score === 100) byScore.full += 1;
        else byScore.other += 1;
    }

    console.log(`  by provenance           : ${JSON.stringify(bySource)}`);
    console.log(
        `  scored 0 (unwinnable?)  : ${byScore.zero}` +
            `   scored 100 (free?): ${byScore.full}   other: ${byScore.other}`
    );

    // How much of the usable corpus this is. A filter that removes a third of
    // the evidence is a different decision from one that removes a rounding
    // error, and whoever runs this should see which they are making.
    const realTotal = await GameSession.countDocuments({
        dataSource: 'real',
        invalidatedReason: null
    });
    const realAffected = bySource.real ?? 0;

    if (!undo && realTotal > 0) {
        console.log(
            `  share of the real corpus: ${realAffected} of ${realTotal} ` +
                `(${((realAffected / realTotal) * 100).toFixed(1)}%)`
        );
    }

    if (!apply) {
        console.log(
            '\n  DRY RUN - nothing written. Re-run with --apply to make the change.\n'
        );
        await mongoose.disconnect();
        return;
    }

    const result = await GameSession.updateMany(selector, {
        $set: { invalidatedReason: undo ? null : REASON }
    });

    console.log(`\n  rows updated            : ${result.modifiedCount}`);
    console.log(
        undo
            ? '  These rounds count as evidence again.\n'
            : '  These rounds are excluded from features, progression, support,\n' +
                  '  recommendations, difficulty measurement and training. Nothing was\n' +
                  '  deleted; run with --undo --apply to reverse it exactly.\n'
    );

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
