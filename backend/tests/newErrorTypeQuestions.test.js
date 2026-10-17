/**
 * The questions for the eleven mistakes Code Coach added in its 30-type
 * upgrade, checked as content with no database - see
 * elementaryExpertQuestions.test.js for why content needs its own tests.
 */

const test = require('node:test');
const assert = require('node:assert');

const { QUESTIONS, validate } = require('../data/seed_new_error_types');
const { gradeAnswer } = require('../services/gradingService');
const GameSession = require('../models/GameSession');
const { CONCEPT_GAME_MAPPING, DIFFICULTY_LEVELS, ERROR_TYPES } = require('../config/constants');

const NEW_TYPES = {
    LOOP_SKIPS_LAST_ELEMENT: 'loop_boundaries',
    INDEX_PLUS_ONE_OUT_OF_BOUNDS: 'array_indexing',
    WRONG_LOOP_VARIABLE_IN_INDEX: 'array_indexing',
    NESTED_LOOP_WRONG_COUNTER: 'loop_control',
    LOOP_COUNTER_CHANGED_IN_BODY: 'loop_control',
    ACCUMULATOR_RESET_INSIDE_LOOP: 'loop_initialization',
    WRONG_EXTREME_INITIAL_VALUE: 'loop_initialization',
    EARLY_RETURN_IN_LOOP: 'control_flow',
    UNREACHABLE_ELSE_IF_ORDER: 'conditional_logic',
    MISLEADING_INDENTATION_NO_BRACES: 'statement_structure',
    NON_SHORT_CIRCUIT_OPERATOR: 'boolean_logic'
};

test("the seeder's own validator passes", () => {
    assert.deepStrictEqual(validate(), []);
});

test('the engine accepts every one of Code Coach\'s 30 error types', () => {
    assert.strictEqual(new Set(ERROR_TYPES).size, 30);
    for (const errorType of Object.keys(NEW_TYPES)) assert.ok(ERROR_TYPES.includes(errorType), errorType);
});

test('a finished game on a new mistake can be saved', () => {
    // GameSession.errorType is an enum; a type missing from it threw at save
    // and lost the whole result.
    for (const errorType of Object.keys(NEW_TYPES)) {
        const session = new GameSession({ userId: 'u', gameType: 'BugHunt', conceptTag: NEW_TYPES[errorType], errorType });
        const error = session.validateSync();
        assert.ok(!error || !error.errors.errorType, `${errorType} is rejected by GameSession`);
    }
});

test('each new mistake is playable at every level in its home format, and as a CodeFix', () => {
    for (const [errorType, conceptTag] of Object.entries(NEW_TYPES)) {
        const home = CONCEPT_GAME_MAPPING[conceptTag];
        for (const difficulty of DIFFICULTY_LEVELS) {
            const found = QUESTIONS.filter(
                (q) => q.errorType === errorType && q.gameType === home && q.difficulty === difficulty
            );
            assert.strictEqual(found.length, 1, `${errorType}: ${found.length} ${home} questions at ${difficulty}`);
            assert.strictEqual(found[0].conceptTag, conceptTag, `${found[0].id}: concept`);
        }
        assert.ok(QUESTIONS.some((q) => q.errorType === errorType && q.gameType === 'CodeFix'), `${errorType}: no CodeFix`);
    }
});

test('ids are unique and namespaced', () => {
    const ids = QUESTIONS.map((q) => q.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id');
    // Upserted by id: a clash with an existing question would overwrite it.
    for (const id of ids) assert.ok(id.startsWith('q_ne_'), `${id} is not namespaced`);
});

test('a BugHunt question is graded correct only on its own line', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'BugHunt')) {
        assert.strictEqual(gradeAnswer(q, q.buggyLineIndex).correct, true, q.id);
        for (let i = 0; i < q.codeLines.length; i += 1) {
            if (i !== q.buggyLineIndex) assert.strictEqual(gradeAnswer(q, i).correct, false, `${q.id}: line ${i} also passes`);
        }
    }
});

test('a DragDrop question needs moving, and its own answer passes', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'DragDrop')) {
        const untouched = q.codeLines.map((_, i) => i);
        assert.strictEqual(gradeAnswer(q, untouched).correct, false, `${q.id}: already in order`);
        assert.strictEqual(gradeAnswer(q, q.correctAnswer).correct, true, `${q.id}: own answer fails`);
        const rebuilt = q.correctAnswer.map((source) => q.codeLines[source]);
        assert.deepStrictEqual(rebuilt, q._correctOrder, `${q.id}: does not rebuild the code`);
    }
});

test('a CodeTrace answer passes in any case and spacing', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'CodeTrace')) {
        assert.strictEqual(gradeAnswer(q, q.correctAnswer).correct, true, q.id);
        assert.strictEqual(gradeAnswer(q, `  ${q.correctAnswer.toUpperCase()} `).correct, true, `${q.id}: case or spacing`);
    }
});

test('a CodeFix accepts every listed fix and refuses the broken line', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'CodeFix')) {
        for (const fix of q.correctAnswer) assert.strictEqual(gradeAnswer(q, fix).correct, true, `${q.id}: ${fix}`);
        assert.strictEqual(gradeAnswer(q, q.codeLines[q.buggyLineIndex]).correct, false, `${q.id}: the bug passes`);
    }
});

test('every question explains itself without repeating a hint', () => {
    for (const q of QUESTIONS) {
        assert.ok(q.hints.length >= 2, `${q.id}: needs hints`);
        assert.strictEqual(new Set(q.hints).size, q.hints.length, `${q.id}: duplicate hints`);
        assert.ok(q.explanation.length >= 30, `${q.id}: explanation too thin`);
    }
});
