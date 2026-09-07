/**
 * Where a student starts on a concept they have never played.
 *
 * ============================ THE PROBLEM ============================
 * Every student started at Beginner on every one of the fourteen concepts.
 * Fourteen first games at the easiest level, each of them uninformative, and the
 * dual-threshold rule needs two consecutive strong rounds to move up one step -
 * so a student who already understands loops has to play at least eight rounds
 * to reach Advanced on a concept the platform ALREADY KNEW they were good at.
 *
 * It knew in two places:
 *
 *   * Study Guider runs Bayesian Knowledge Tracing over their quiz attempts and
 *     holds P(knows the concept) for each of the same fourteen tags.
 *   * Code Coach counts their unresolved struggles per concept, from real code
 *     they wrote in the editor.
 *
 * Neither was consulted. This engine's own history was the only evidence it
 * would accept, which for a first game is no evidence at all - so it fell back
 * to a constant and called it a cold start.
 *
 * ========================= WHY THIS IS A RULE ==========================
 * The same reasoning as services/progressionService.js. "How likely is this
 * student to pass an Intermediate game" is a question data can settle. "Should a
 * quiz mastery of 0.85 be worth two levels of head start" is a judgement, and it
 * is being made here in constants that can be read and argued with rather than
 * fitted into weights nobody can inspect.
 *
 * It is deliberately NOT a model feature. ml/training_data.py documents at
 * length why a value the serve path can read live and the training path can only
 * invent is poison: Study Guider stores the CURRENT belief, not a history of it,
 * so there is no way to reconstruct what a student's mastery was at the moment
 * of a session last week. Training on it would leak, exactly as `games_played`
 * did.
 *
 * ======================= WHERE THIS DEPARTS FROM THE PROPOSAL =======================
 * Section 4.1 says "All students start at the Beginner level". This does not,
 * when the platform holds evidence to the contrary, and that is a deliberate
 * scope decision rather than a drift - see docs/proposal-gap-analysis.md.
 *
 * The proposal's behaviour is one config value away: set `coldStart.ceilingIndex`
 * to 0 and every student starts at Beginner again, whatever else is known about
 * them. Nothing else has to change, and the seeding then reports itself as
 * disabled rather than silently doing nothing.
 *
 * ============================ THE CEILING ============================
 * A seed can never exceed `coldStart.ceilingIndex`, which defaults to
 * Intermediate - the middle of five. Being wrong upward is much more expensive
 * than being wrong downward: an Advanced game handed to somebody who is not
 * ready is a bad first experience of a component whose entire premise is that it
 * meets students where they are, while a slightly easy first game costs one
 * round and is corrected by the rule two rounds later.
 *
 * The seed is a HEAD START, not a promotion. The dual-threshold rule still owns
 * every move after this one, and the seeded level survives only by being written
 * onto the session it produced - progressionService reads it back from there
 * like any other level, so there is no second source of truth about where a
 * student is.
 */

const { getConceptMastery } = require('./studyGuiderClient');
const { rules } = require('./ruleConfigService');
const { DIFFICULTY_LEVELS, difficultyAt, difficultyIndex } = require('../config/constants');

/** Where the proposal says everyone starts, and where this falls back to. */
const STARTING_LEVEL = DIFFICULTY_LEVELS[0];

/**
 * A progression-shaped object, so callers cannot tell a seeded start from a
 * rule-derived one and none of them need to.
 *
 * `previousLevel === level` matters: permittedBand() returns the inclusive range
 * between them, so a seed produces a band of exactly one level. The model may
 * not then wander a step further up on a student it has never seen.
 */
function progressionAt(level, reason, evidence) {
    return {
        level,
        previousLevel: level,
        moved: null,
        consecutive: 0,
        reason,
        seeded: evidence?.source !== 'default',
        evidence
    };
}

/**
 * Decide the opening level for a student with no sessions on this concept.
 *
 * Always resolves and never throws: the caller is on the path of a student
 * waiting for their first game, and every failure here has the same safe
 * answer, which is the level the proposal specifies.
 *
 * @param {object} args
 * @param {string} args.conceptTag
 * @param {string} [args.accessToken]        the student's own token, forwarded
 * @param {number|null} [args.repeatErrorCount]  unresolved struggles from Code
 *        Coach. Already fetched by the caller; passed in rather than re-read so
 *        the cold-start path costs one extra round trip, not two.
 * @param {Function} [args.fetchMastery]  injected by the tests. Stubbing the
 *        module export would not work: this module calls the real function
 *        directly, and a stub on `module.exports` never intercepts that.
 * @returns {Promise<object>} a progression-shaped object
 */
async function seedStartingLevel({
    conceptTag,
    accessToken,
    repeatErrorCount,
    fetchMastery = getConceptMastery
}) {
    const config = rules().coldStart;
    const difficultyRules = rules().difficulty;

    const ceiling = Math.round(config.ceilingIndex);

    // ── Disabled: the proposal's literal behaviour ───────────────────────────
    if (ceiling <= 0) {
        return progressionAt(
            STARTING_LEVEL,
            `Starts at ${STARTING_LEVEL}: seeding from other components is turned off.`,
            { source: 'default' }
        );
    }

    const struggles = repeatErrorCount ?? 0;

    // ── Struggling in the editor outranks anything a quiz says ───────────────
    //
    // Checked BEFORE the mastery read, and not merely as a cap afterwards. A
    // student with unresolved findings on this concept is demonstrably getting
    // it wrong in code they wrote themselves, which is stronger evidence about
    // whether they can debug it in a game than a quiz score is - and it is the
    // same guard difficultyService applies to the model's own answer, so
    // applying it here keeps one rule rather than two that can disagree.
    if (struggles >= difficultyRules.strugglesCapToFloor) {
        return progressionAt(
            STARTING_LEVEL,
            `Starts at ${STARTING_LEVEL}: ${struggles} unresolved findings on this ` +
                `concept in Code Coach.`,
            { source: 'code_coach', struggles }
        );
    }

    // ── What Study Guider believes ───────────────────────────────────────────
    //
    // The client swallows its own failures and answers null, so this catch
    // should never fire. It is here because the docstring above promises this
    // function never throws, and a promise like that is worth being true rather
    // than merely intended: everything on this path runs while a student waits
    // for their first game, and the cost of an unexpected error escaping is
    // that the game does not load at all.
    let estimate = null;
    try {
        estimate = await fetchMastery(accessToken, conceptTag);
    } catch (error) {
        console.warn(`[cold-start] Mastery lookup failed unexpectedly: ${error.message}`);
    }

    if (!estimate) {
        // Null covers both "no quiz attempts" and "Study Guider could not
        // answer". They are different facts, but they have the same consequence
        // here - no evidence to seed from - and the client has already logged
        // which one it was.
        return progressionAt(
            STARTING_LEVEL,
            `Starts at ${STARTING_LEVEL}: nothing known about this concept from ` +
                `elsewhere on the platform yet.`,
            { source: 'default' }
        );
    }

    const observations = Number(estimate.observations ?? estimate.attempts ?? 0);
    const probabilityKnown = Number(estimate.probability_known ?? 0);

    // BKT after one question is barely moved off its prior, so a single answer
    // would seed almost every student the same way and call it personalisation.
    if (observations < config.minObservations) {
        return progressionAt(
            STARTING_LEVEL,
            `Starts at ${STARTING_LEVEL}: only ${observations} quiz observation` +
                `${observations === 1 ? '' : 's'} on this concept, too few to start higher.`,
            { source: 'default', observations, probabilityKnown }
        );
    }

    // ── The ladder ───────────────────────────────────────────────────────────
    let index = 0;
    if (probabilityKnown >= config.masteryForIntermediate) index = 2;
    else if (probabilityKnown >= config.masteryForElementary) index = 1;

    if (index === 0) {
        return progressionAt(
            STARTING_LEVEL,
            `Starts at ${STARTING_LEVEL}: Study Guider puts mastery of this concept ` +
                `at ${(probabilityKnown * 100).toFixed(0)}%.`,
            { source: 'default', observations, probabilityKnown }
        );
    }

    // Some struggles, but not enough to floor it: allow a head start, but only
    // the smaller one. Reuses `strugglesForMiddle`, the same threshold the
    // fallback heuristic uses to stop serving the top level, so the two rules
    // treat "a couple of unresolved findings" identically.
    let cappedBy = null;
    if (struggles >= difficultyRules.strugglesForMiddle && index > 1) {
        index = 1;
        cappedBy = `held to ${difficultyAt(1)} by ${struggles} unresolved findings in Code Coach`;
    }

    if (index > ceiling) {
        index = ceiling;
        cappedBy = cappedBy || `capped at the configured ceiling, ${difficultyAt(ceiling)}`;
    }

    const level = difficultyAt(index);

    return progressionAt(
        level,
        `Starts at ${level} rather than ${STARTING_LEVEL}: Study Guider puts mastery ` +
            `of this concept at ${(probabilityKnown * 100).toFixed(0)}% over ` +
            `${observations} quiz observations` +
            (cappedBy ? `, ${cappedBy}` : '') +
            `.`,
        {
            source: 'study_guider',
            observations,
            probabilityKnown,
            struggles,
            cappedBy
        }
    );
}

module.exports = {
    STARTING_LEVEL,
    seedStartingLevel,
    // Exported for the tests, which need to drive the ladder without a network.
    progressionAt,
    difficultyIndex
};
