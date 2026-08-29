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

const DIAGNOSTIC_STATUSES = ['active', 'resolved', 'repeated', 'ignored'];
const GAME_SESSION_STATUSES = ['started', 'completed', 'abandoned'];

const LEARNING_EVENT_TYPES = [
    'code_diagnostic_detected',
    'hint_shown',
    'diagnostic_resolved',
    'struggle_signal_created',
    'game_session_created',
    'game_session_completed',
    'pair_session_started',
    'peer_review_submitted',
    'micro_lesson_triggered',
    'quiz_completed',
    'mastery_updated',
    'diagnostic_re_evaluation'
];

const SOURCE_COMPONENT = 'gamification';

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
    DIAGNOSTIC_STATUSES,
    GAME_SESSION_STATUSES,
    LEARNING_EVENT_TYPES,
    SOURCE_COMPONENT,
    CONCEPT_GAME_MAPPING
};
