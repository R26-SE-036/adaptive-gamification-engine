/**
 * Which level a student is ON, and when that moves. The dual-threshold rule.
 *
 * ============================ WHAT FR-08 ASKS FOR ============================
 * The proposal specifies five levels and a
 *
 *     "dual-threshold progression model that advances or regresses a student
 *      only after two consecutive sessions above or below the threshold,
 *      preventing erratic changes from single-session anomalies"
 *
 * The engine had three levels and moved on a single session, so one unlucky
 * round could drop a student a whole level and one lucky one could raise them.
 * That is the instability the rule exists to prevent, and it was the behaviour.
 *
 * ======================= WHY THIS IS A RULE, NOT A MODEL =====================
 * The difficulty model answers "how likely is this student to succeed at level
 * D", which is a question the data can settle - success is observed. Whether a
 * student SHOULD be moved after one good round or two is not that kind of
 * question. It is a judgement about stability, and the proposal makes it
 * explicitly: two, not one. So it lives here, in constants anyone can read and
 * argue with, rather than inside fitted weights.
 *
 * The two work together rather than competing (see difficultyService.js): this
 * rule decides the BAND a student is in, and the model chooses within it. If the
 * ML service is unreachable, this rule alone decides, which is exactly the
 * engine the proposal describes.
 *
 * =========================== THE ONE SUBTLE PART ============================
 * Only sessions at the student's CURRENT level count toward a move.
 *
 * Without that, advancing is self-perpetuating: a student promoted on the
 * strength of two strong rounds still has those two rounds as their most recent
 * history, so the very next evaluation promotes them again, and again, to the
 * ceiling - without them having played a single round at the new level. The run
 * has to be re-earned at each level, which is also the honest reading of
 * "two consecutive sessions above the threshold".
 */

const {
    DIFFICULTY_LEVELS,
    difficultyIndex,
    difficultyAt,
    resolveDifficulty
} = require('../config/constants');


/**
 * The thresholds, read at decision time rather than captured at import.
 *
 * They used to be `const X = Number(process.env...)`, which meant changing one
 * required a restart - and FR-15 asks for configuration "without requiring
 * source code changes". `rules()` is a synchronous read of an in-memory
 * snapshot, so this stays a pure function; see services/ruleConfigService.js.
 *
 * The defaults are unchanged and live there now:
 *   advanceAt 80  - higher than the 70 pass mark on purpose. Passing means the
 *                   level is appropriate; moving up should require comfort.
 *   regressAt 40
 *   consecutiveRequired 2 - what the proposal specifies.
 */
const { rules } = require('./ruleConfigService');

/** Where a student starts. The proposal: "All students start at the Beginner level". */
const STARTING_LEVEL = DIFFICULTY_LEVELS[0];

/**
 * Work out the level this student is on for this concept.
 *
 * @param {Array<{difficultyLevel: string, score: number, completedAt?: Date}>} sessions
 *   The student's sessions on one concept. Order does not matter; they are
 *   sorted here, because a caller passing them newest-first would otherwise
 *   read the history backwards and reach the opposite conclusion.
 * @returns {{level: string, previousLevel: string, moved: 'advanced'|'regressed'|null,
 *            consecutive: number, reason: string}}
 */
function currentLevel(sessions) {
    const { advanceAt: ADVANCE_AT, regressAt: REGRESS_AT, consecutiveRequired: CONSECUTIVE_REQUIRED } =
        rules().progression;

    const played = [...(sessions || [])]
        .filter((session) => Number.isFinite(session?.score))
        .sort((a, b) => new Date(a.completedAt || 0) - new Date(b.completedAt || 0));

    if (played.length === 0) {
        return {
            level: STARTING_LEVEL,
            previousLevel: STARTING_LEVEL,
            moved: null,
            consecutive: 0,
            reason: `No sessions on this concept yet, so it starts at ${STARTING_LEVEL}.`
        };
    }

    // The level they last played at, translated through the alias table so
    // sessions written under the old three-level scale still resolve.
    const last = played[played.length - 1];
    const previousLevel = resolveDifficulty(last.difficultyLevel) || STARTING_LEVEL;
    const index = difficultyIndex(previousLevel);

    // The trailing run of sessions AT that level - see the header for why the
    // run cannot be allowed to span a promotion.
    const runAtLevel = [];
    for (let i = played.length - 1; i >= 0; i -= 1) {
        if (resolveDifficulty(played[i].difficultyLevel) !== previousLevel) break;
        runAtLevel.unshift(played[i]);
    }

    const recent = runAtLevel.slice(-CONSECUTIVE_REQUIRED);
    const enough = recent.length >= CONSECUTIVE_REQUIRED;

    const allAbove = enough && recent.every((session) => session.score >= ADVANCE_AT);
    const allBelow = enough && recent.every((session) => session.score <= REGRESS_AT);

    const atCeiling = index >= DIFFICULTY_LEVELS.length - 1;
    const atFloor = index <= 0;

    if (allAbove && !atCeiling) {
        return {
            level: difficultyAt(index + 1),
            previousLevel,
            moved: 'advanced',
            consecutive: recent.length,
            reason:
                `${CONSECUTIVE_REQUIRED} sessions in a row at ${ADVANCE_AT}% or above ` +
                `on ${previousLevel}.`
        };
    }

    if (allBelow && !atFloor) {
        return {
            level: difficultyAt(index - 1),
            previousLevel,
            moved: 'regressed',
            consecutive: recent.length,
            reason:
                `${CONSECUTIVE_REQUIRED} sessions in a row at ${REGRESS_AT}% or below ` +
                `on ${previousLevel}.`
        };
    }

    // Staying is the default, and the common case. The reason distinguishes
    // "not enough evidence yet" from "evidence says stay", because they feel
    // different to a student being told why.
    let reason;
    if (!enough) {
        reason =
            `${recent.length} session${recent.length === 1 ? '' : 's'} so far at ` +
            `${previousLevel}; ${CONSECUTIVE_REQUIRED} in a row are needed to move.`;
    } else if (allAbove && atCeiling) {
        reason = `Already at ${previousLevel}, the highest level.`;
    } else if (allBelow && atFloor) {
        reason = `Already at ${previousLevel}, the lowest level.`;
    } else {
        reason = `Performance at ${previousLevel} is in the band that keeps them there.`;
    }

    return { level: previousLevel, previousLevel, moved: null, consecutive: recent.length, reason };
}

/**
 * The levels the model may choose between, given what the rule just decided.
 *
 * ===================== THE MODEL IS A BRAKE, NOT AN ENGINE ====================
 * The band is the inclusive range between where the student WAS and where the
 * rule says they are now:
 *
 *   rule holds them   ->  { current }                 the model has no choice
 *   rule advances     ->  { previous, advanced }      the model may decline it
 *   rule regresses    ->  { regressed, previous }     the model may decline it
 *
 * So the model can refuse a move the rule wants, and can never make one the
 * rule did not. That is what actually delivers FR-08: "advances or regresses a
 * student only after two consecutive sessions above or below the threshold".
 *
 * An earlier version of this function took one level and returned everything
 * within one step of it. Called with the rule's OUTPUT that was a two-level
 * jump: two strong Beginner rounds advanced the student to Elementary, the band
 * around Elementary included Intermediate, and the model picked Intermediate -
 * a level the student had never seen, reached without the two consecutive
 * sessions the rule exists to require. It was caught by playing two rounds and
 * watching the engine serve Intermediate.
 */
function permittedBand(progression) {
    // Tolerate a bare level for callers that only know where the student is.
    const from = typeof progression === 'string' ? progression : progression?.previousLevel;
    const to = typeof progression === 'string' ? progression : progression?.level;

    const fromIndex = difficultyIndex(from);
    const toIndex = difficultyIndex(to);

    if (fromIndex < 0 || toIndex < 0) return [STARTING_LEVEL];

    const low = Math.min(fromIndex, toIndex);
    const high = Math.max(fromIndex, toIndex);

    return DIFFICULTY_LEVELS.slice(low, high + 1);
}

module.exports = {
    STARTING_LEVEL,
    currentLevel,
    permittedBand
};
