/**
 * The Drag & Drop question bank.
 *
 * These exist because 17 of the original 20 questions were unplayable and it
 * took an audit to notice - nothing in the suite looked at question CONTENT,
 * only at grading logic. A broken answer is as much a defect as a broken
 * function, and it is the kind that reaches a student directly.
 *
 * Two failure modes, both of which shipped:
 *
 *   * an answer with a different number of entries than the question has lines.
 *     Grading compares lengths first, so the question could never be passed.
 *   * an answer that is the identity permutation. The UI starts the student in
 *     that exact order, so Submit without touching anything scored 100.
 *
 * Everything below runs against the authored set, with no database.
 */

const test = require('node:test');
const assert = require('node:assert');

const { QUESTIONS, validate } = require('../data/seed_dragdrop_questions');
const { gradeAnswer } = require('../services/gradingService');

test('the seeder\'s own validator passes', () => {
    assert.deepStrictEqual(validate(), []);
});

test('every answer is a permutation of the line indices', () => {
    for (const q of QUESTIONS) {
        const n = q.codeLines.length;
        const sorted = [...q.correctAnswer].sort((a, b) => a - b);

        assert.strictEqual(
            q.correctAnswer.length,
            n,
            `${q.id}: ${q.correctAnswer.length} answer entries for ${n} lines`,
        );
        assert.deepStrictEqual(
            sorted,
            Array.from({ length: n }, (_, i) => i),
            `${q.id}: answer is not a permutation`,
        );
    }
});

test('no question is already in the right order', () => {
    for (const q of QUESTIONS) {
        assert.ok(
            !q.correctAnswer.every((value, index) => value === index),
            `${q.id}: nothing to rearrange - Submit without moving anything would score 100`,
        );
    }
});

test('every question is actually winnable', () => {
    // The strongest check: run the stored answer through the real grader.
    for (const q of QUESTIONS) {
        assert.strictEqual(
            gradeAnswer(q, q.correctAnswer).correct,
            true,
            `${q.id}: the stored answer does not grade as correct`,
        );
    }
});

test('the ordering the student starts from is NOT already correct', () => {
    // game-player.tsx initialises the answer to codeLines.map((_, i) => i).
    // If that graded as correct the game would be a no-op.
    for (const q of QUESTIONS) {
        const asShown = q.codeLines.map((_, index) => index);

        assert.strictEqual(
            gradeAnswer(q, asShown).correct,
            false,
            `${q.id}: the initial ordering already grades as correct`,
        );
    }
});

test('applying the answer rebuilds the code the author wrote', () => {
    for (const q of QUESTIONS) {
        const rebuilt = q.correctAnswer.map((source) => q.codeLines[source]);

        assert.deepStrictEqual(
            rebuilt,
            q._correctOrder,
            `${q.id}: the answer does not reconstruct the authored order`,
        );
    }
});

test('identical lines are interchangeable', () => {
    // A switch with two `break;` lines has two identical entries, and swapping
    // them produces the same program. Grading compares the resulting code
    // rather than the index sequence, so both arrangements must pass - marking
    // one wrong would show a student a correct solution and reject it.
    for (const q of QUESTIONS) {
        const duplicates = q.codeLines
            .map((line, index) => ({ line, index }))
            .filter(({ line }, _, all) => all.filter((o) => o.line === line).length > 1);

        if (duplicates.length < 2) continue;

        const swapped = [...q.correctAnswer];
        const a = swapped.indexOf(duplicates[0].index);
        const b = swapped.indexOf(duplicates[1].index);
        [swapped[a], swapped[b]] = [swapped[b], swapped[a]];

        assert.strictEqual(
            gradeAnswer(q, swapped).correct,
            true,
            `${q.id}: swapping two identical lines was marked wrong`,
        );
    }
});

test('the puzzle is not trivially close to solved', () => {
    // At least two lines out of place. A single adjacent swap is a puzzle in
    // name only, and it was one of the ways the old set was too easy.
    for (const q of QUESTIONS) {
        const misplaced = q.correctAnswer.filter((value, index) => value !== index).length;
        assert.ok(
            misplaced >= 2,
            `${q.id}: only ${misplaced} line(s) out of place`,
        );
    }
});

test('every question carries hints and an explanation', () => {
    for (const q of QUESTIONS) {
        assert.ok(q.hints.length >= 3, `${q.id}: fewer than 3 hints`);
        assert.ok(q.explanation.length > 0, `${q.id}: no explanation`);
        assert.ok(q.errorType && q.conceptTag && q.difficulty, `${q.id}: missing metadata`);
    }
});

test('ids are unique', () => {
    const ids = QUESTIONS.map((q) => q.id);
    assert.strictEqual(new Set(ids).size, ids.length);
});
