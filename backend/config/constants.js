/**
 * Central Configuration Constants
 * 
 * This file acts as the single source of truth for the application's domain boundaries.
 * It prevents hardcoding string literals directly into the business logic or database schemas.
 */

const GAME_TYPES = ['BugHunt', 'DragDrop', 'CodeTrace'];

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

const DIFFICULTY_LEVELS = ['Easy', 'Medium', 'Hard'];

/**
 * Code Coach's difficulty vocabulary mapped onto this engine's.
 *
 * Code Coach recommends 'beginner' or 'intermediate'; the question bank is
 * keyed by Easy / Medium / Hard. Without this translation the two never match,
 * the query silently falls back to "any difficulty", and an engine whose whole
 * purpose is adaptive difficulty quietly stops adapting.
 */
const DIFFICULTY_ALIASES = {
    beginner: 'Easy',
    intermediate: 'Medium',
    advanced: 'Hard',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard'
};

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
    GAME_SESSION_STATUSES,
    CONCEPT_GAME_MAPPING
};
