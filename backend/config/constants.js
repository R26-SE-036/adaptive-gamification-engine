/**
 * Central Configuration Constants
 * 
 * This file acts as the single source of truth for the application's domain boundaries.
 * It prevents hardcoding string literals directly into the business logic or database schemas.
 */

// CodeFix is the fourth, and the only one that asks the student to WRITE Java
// rather than recognise, order or predict it. It also carries the fix for the
// error count: because an answer can be checked without ending the session
// (POST /game/check), a wrong attempt is a measured event rather than a number
// the client reports about itself. See services/gradingService.js.
const GAME_TYPES = ['BugHunt', 'DragDrop', 'CodeTrace', 'CodeFix'];

const CONCEPT_TAGS = [
    'loop_boundaries',
    'conditional_logic',
    'array_indexing',
    'string_comparison',
    'loop_control',
    'control_flow',
    'switch_statements',
    'statement_structure',
    'assignment_logic',
    'boolean_logic',
    'immutable_strings',
    'arithmetic_operations',
    'loop_initialization',
    'loop_termination'
];

const ERROR_TYPES = [
    'OFF_BY_ONE_LOOP_BOUNDARY',
    'INCORRECT_CONDITIONAL_OPERATOR',
    'ARRAY_LENGTH_INDEX_MISUSE',
    'STRING_EQUALITY_WITH_OPERATOR',
    'LOOP_UPDATE_WRONG_DIRECTION',
    'UNREACHABLE_CODE_AFTER_RETURN',
    'MISSING_BREAK_IN_SWITCH',
    'EMPTY_CONDITIONAL_BODY',
    'SELF_ASSIGNMENT',
    'ALWAYS_TRUE_OR_CONDITION',
    'IGNORED_STRING_METHOD_RESULT',
    'DIVISION_BY_ZERO_LITERAL',
    'CONSTANT_FALSE_LOOP_CONDITION',
    'DUPLICATE_IF_ELSE_CONDITION',
    'WHILE_VARIABLE_NOT_UPDATED'
];

/**
 * The five difficulty levels, in order from easiest to hardest.
 *
 * ORDER IS LOAD-BEARING. Progression walks this array by index (see
 * services/progressionService.js) and the ML service turns it into the ordinal
 * feature the model is fitted on, so reordering it silently changes both.
 *
 * This was Easy / Medium / Hard. Three levels made the proposal's dual-threshold
 * progression almost meaningless - with only one step either side of the middle,
 * a student who advanced once was already at the ceiling.
 */
const DIFFICULTY_LEVELS = ['Beginner', 'Elementary', 'Intermediate', 'Advanced', 'Expert'];

/** 0-based position on the ladder, or -1 for anything unrecognised. */
const difficultyIndex = (level) => DIFFICULTY_LEVELS.indexOf(level);

/** Clamp an index back onto the ladder. */
const difficultyAt = (index) =>
    DIFFICULTY_LEVELS[Math.max(0, Math.min(DIFFICULTY_LEVELS.length - 1, index))];

/**
 * Code Coach's difficulty vocabulary mapped onto this engine's.
 *
 * Code Coach recommends 'beginner' or 'intermediate'; the question bank is
 * keyed by Easy / Medium / Hard. Without this translation the two never match,
 * the query silently falls back to "any difficulty", and an engine whose whole
 * purpose is adaptive difficulty quietly stops adapting.
 */
const DIFFICULTY_ALIASES = {
    beginner: 'Beginner',
    elementary: 'Elementary',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    expert: 'Expert',

    // The retired three-level scale. Every game session written before this
    // change still says Easy / Medium / Hard, and Code Coach still recommends
    // 'beginner' / 'intermediate'. Easy -> Beginner, Medium -> Intermediate,
    // Hard -> Advanced places the old scale on the new one at the points that
    // were actually meant: the old middle was the middle, and the old top was
    // hard-but-reachable rather than the new ceiling.
    easy: 'Beginner',
    medium: 'Intermediate',
    hard: 'Advanced'
};

/**
 * The closest level to `target` that actually exists in `available`.
 *
 * ===================== WHY THE FALLBACK NEEDED A RULE =====================
 * The question bank does not cover every (concept, format, level) cell. CodeFix
 * was authored across all five levels; BugHunt, DragDrop and CodeTrace exist
 * only at Beginner, Intermediate and Advanced - so asking for an Elementary Bug
 * Hunt on array_indexing matches nothing.
 *
 * The fallback for that used to be "same type, ANY difficulty", which is not a
 * near miss but a random one, and it was not merely a worse game. The session is
 * recorded at the level of the question actually served, and
 * progressionService reads that back as the level the student is ON. So a
 * student the rule held at Elementary could be handed an Intermediate question
 * because no Elementary one existed, and the next evaluation would treat
 * Intermediate as their current level - a promotion without the two consecutive
 * sessions FR-08 exists to require, arriving through a gap in the DATA rather
 * than a bug in the rule.
 *
 * Ties break DOWNWARD. One level too easy costs a round; one level too hard is
 * the bad experience the whole component exists to avoid, and it is the
 * direction that silently moves a student up the ladder.
 */
function nearestDifficulty(target, available) {
    const targetIndex = difficultyIndex(resolveDifficulty(target));
    if (targetIndex < 0) return null;

    const candidates = (available || [])
        .map((value) => resolveDifficulty(value))
        .filter((value) => value !== null);

    if (candidates.length === 0) return null;

    return candidates.reduce((best, level) => {
        const distance = Math.abs(difficultyIndex(level) - targetIndex);
        const bestDistance = Math.abs(difficultyIndex(best) - targetIndex);

        if (distance !== bestDistance) return distance < bestDistance ? level : best;
        return difficultyIndex(level) < difficultyIndex(best) ? level : best;
    });
}

/** Resolve any known spelling to a level on the ladder, or null. */
function resolveDifficulty(value) {
    if (DIFFICULTY_LEVELS.includes(value)) return value;
    return DIFFICULTY_ALIASES[String(value || '').toLowerCase()] ?? null;
}

const GAME_SESSION_STATUSES = ['started', 'completed', 'abandoned'];

// DIAGNOSTIC_STATUSES, LEARNING_EVENT_TYPES and SOURCE_COMPONENT were here.
//
// All three were exported and read by nothing. They described a shared-database
// era when this service wrote LearningEvent rows alongside Code Coach's own; that
// write was removed as a write-only mirror of a Code Coach concept, and the
// vocabulary outlived it.
//
// LEARNING_EVENT_TYPES is also where the last trace of the Pair Challenge game
// lived - it listed 'pair_session_started' and 'peer_review_submitted' as valid
// events. Nothing ever emitted either. The engine is single-player.
//
// Note that PairPath, the platform's separate pairing component, is unrelated to
// any of this and is untouched; the port comments elsewhere that mention it are
// about avoiding a collision with it, not about a game here.

// Strict Game-Type Mapping per Concept Tag
const CONCEPT_GAME_MAPPING = {
    'loop_boundaries': 'BugHunt',
    'conditional_logic': 'DragDrop',
    'array_indexing': 'BugHunt',
    'string_comparison': 'CodeTrace',
    'loop_control': 'BugHunt',
    'control_flow': 'BugHunt',
    'switch_statements': 'DragDrop',
    'statement_structure': 'BugHunt',
    'assignment_logic': 'BugHunt',
    'boolean_logic': 'DragDrop',
    'immutable_strings': 'CodeTrace',
    'arithmetic_operations': 'BugHunt',
    'loop_initialization': 'CodeTrace',
    'loop_termination': 'BugHunt'
};

module.exports = {
    GAME_TYPES,
    CONCEPT_TAGS,
    ERROR_TYPES,
    DIFFICULTY_LEVELS,
    DIFFICULTY_ALIASES,
    difficultyIndex,
    difficultyAt,
    resolveDifficulty,
    nearestDifficulty,
    GAME_SESSION_STATUSES,
    CONCEPT_GAME_MAPPING
};
