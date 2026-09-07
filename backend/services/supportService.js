/**
 * When a student needs more than the next game, and what.
 *
 * ============================ WHAT FR-10 ASKS FOR ============================
 *     "The system shall provide hints and support recommendations when student
 *      performance indicators suggest difficulty or repeated failure."
 *
 * and, from the rule set the proposal sketches:
 *
 *     IF score < 50 AND errorCount > 5 THEN decrease difficulty level
 *                                      AND assign additional practice
 *
 * Half of that existed. Hints were on the question, and difficulty already
 * decreases (services/progressionService.js). The other half - noticing that a
 * student is in trouble and saying something about it - did not exist at all.
 * The submit response carried one fixed sentence:
 *
 *     "Good effort on X. Try one more guided practice round with hints."
 *
 * for every failing round on every concept, whether the student had missed once
 * or six times in a row.
 *
 * =========================== WHAT SUPPORT MEANS HERE =========================
 * Not more encouragement. A support recommendation is a concrete next action
 * that is NOT simply "play again", because a student who has failed the same
 * concept four times has already demonstrated that playing again is not what
 * they need:
 *
 *   review_lesson    read the Study Guider lesson for this concept before
 *                    playing it again
 *   extra_practice   more rounds at the level just dropped to, to rebuild
 *   slow_down        they are passing, but on hints - the score flatters them
 *   keep_going       nothing is wrong
 *
 * Each carries the evidence it fired on, because a recommendation a student is
 * asked to act on should be able to say what it saw.
 *
 * ============================= WHY IT IS A RULE ==============================
 * Same reasoning as the rest of the engine. Whether four failures means "read
 * the lesson" or "try once more" is a pedagogical judgement with no outcome in
 * the data that settles it, so it belongs in constants that can be read and
 * argued with rather than inside fitted weights.
 */

const GameSession = require('../models/GameSession');
const { rules } = require('./ruleConfigService');

/**
 * The thresholds live in services/ruleConfigService.js so they can be changed
 * without a redeploy (FR-15). Their defaults, and why:
 *
 *   failuresBeforeLesson 3   Three, not two. Two failures in a row is a bad
 *                            afternoon and the difficulty rule already responds
 *                            by dropping a level; three is a pattern another
 *                            round at any level is unlikely to fix.
 *   hintDependence 1.5       Questions carry three hints and the score charges
 *                            for each. A student averaging more than one and a
 *                            half is passing on scaffolding rather than on the
 *                            concept - which the score alone cannot distinguish
 *                            from a student who is simply slower.
 *   window 5                 How many recent sessions the rules look at.
 */

/**
 * Decide what support, if any, this student needs on this concept.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.conceptTag
 * @param {number} args.lastScore              the round just finished
 * @param {object} [args.progression]          from progressionService.currentLevel
 * @param {number|null} [args.repeatErrorCount] unresolved Code Coach struggles
 * @param {Array} [args.sessions]              pre-loaded, to avoid a second query
 *
 * @returns {Promise<{action: string, headline: string, detail: string,
 *                    evidence: object}>}
 */
async function recommendSupport({
    userId,
    conceptTag,
    lastScore,
    progression,
    repeatErrorCount,
    sessions
}) {
    const {
        failuresBeforeLesson: FAILURES_BEFORE_LESSON,
        hintDependence: HINT_DEPENDENCE,
        window: WINDOW
    } = rules().support;
    const SUCCESS_SCORE = rules().scoring.passMark;

    const history =
        sessions ||
        (await GameSession.evidence({ userId, conceptTag })
            .sort({ completedAt: -1 })
            .limit(WINDOW)
            .select('score hintUsage errorCount completedAt')
            .lean());

    // Newest first, and the round just finished is not in the database yet when
    // this runs from the submit path - so it is prepended rather than assumed
    // to be there. Counting it twice would make three failures look like four.
    const recent = [...history]
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))
        .slice(0, WINDOW);

    const label = conceptTag.replace(/_/g, ' ');

    // The trailing run of failures, newest backwards.
    let consecutiveFailures = 0;
    for (const session of recent) {
        if ((session.score ?? 0) >= SUCCESS_SCORE) break;
        consecutiveFailures += 1;
    }

    const passed = (lastScore ?? 0) >= SUCCESS_SCORE;

    const withHints = recent.filter((s) => Number.isFinite(s.hintUsage));
    const averageHints = withHints.length
        ? withHints.reduce((sum, s) => sum + s.hintUsage, 0) / withHints.length
        : 0;

    const evidence = {
        consecutiveFailures,
        averageHints: Math.round(averageHints * 10) / 10,
        sessionsConsidered: recent.length,
        repeatErrorCount: repeatErrorCount ?? null,
        movedLevel: progression?.moved ?? null
    };

    // ── S1: repeated failure - stop playing, go and read ─────────────────────
    if (consecutiveFailures >= FAILURES_BEFORE_LESSON) {
        return {
            action: 'review_lesson',
            headline: `Read the ${label} lesson before the next round`,
            detail:
                `That is ${consecutiveFailures} rounds in a row on ${label} without ` +
                `passing. Another game is unlikely to be what closes the gap - the ` +
                `written lesson explains the mistake itself.`,
            evidence
        };
    }

    // ── S2: Code Coach still sees this in their actual code ──────────────────
    // Different evidence from the one above: those are game rounds, this is the
    // student's own editor. Worth its own branch because a student can pass the
    // game and keep making the mistake where it matters.
    if (!passed && (repeatErrorCount ?? 0) >= 3) {
        return {
            action: 'review_lesson',
            headline: `Read the ${label} lesson`,
            detail:
                `You still have ${repeatErrorCount} unresolved ${label} findings in ` +
                `your own code, and this round did not clear the concept either.`,
            evidence
        };
    }

    // ── S3: the difficulty rule just dropped them ────────────────────────────
    if (progression?.moved === 'regressed') {
        return {
            action: 'extra_practice',
            headline: `A few easier rounds on ${label}`,
            detail:
                `The next games move down to ${progression.level} for a while. ` +
                `Rebuilding at a level that fits beats grinding at one that does not.`,
            evidence
        };
    }

    // ── S4: passing, but on scaffolding ──────────────────────────────────────
    if (passed && averageHints > HINT_DEPENDENCE) {
        return {
            action: 'slow_down',
            headline: `Try the next ${label} round without hints`,
            detail:
                `You are clearing these, but on ${evidence.averageHints} hints a round. ` +
                `Reading the code first for a minute is worth more than the points ` +
                `the hints cost.`,
            evidence
        };
    }

    // ── S5: nothing is wrong ─────────────────────────────────────────────────
    return {
        action: 'keep_going',
        headline: passed ? `${label} is going well` : `Worth one more round of ${label}`,
        detail: passed
            ? `Nothing here needs extra support.`
            : `One missed round is not a pattern. Try it again before changing tack.`,
        evidence
    };
}

module.exports = { recommendSupport };
