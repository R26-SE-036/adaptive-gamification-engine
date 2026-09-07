/**
 * The Elementary and Expert questions, and the shape of the ladder.
 *
 * Two of the five difficulty levels existed only in CodeFix:
 *
 *     game           Beginner   Elementary Intermediate     Advanced    Expert
 *     BugHunt              24            0           24           24         0
 *     DragDrop             10            0           10            9         0
 *     CodeTrace             9            0            9            9         0
 *     CodeFix              43           43           43           43        43
 *
 * Nothing failed because of it. nearestDifficulty() serves the closest level
 * that exists and records the level it actually served, so no student was
 * falsely promoted - the five-level progression simply had three usable rungs
 * in three of the four formats, and the only way to notice was to count.
 *
 * These run against the authored set with no database, and they check content
 * rather than plumbing. That distinction is the whole reason they exist:
 * seventeen of the original twenty Drag & Drop questions were unplayable and
 * every test in the suite passed throughout, because nothing looked at what
 * was inside a question.
 */

const test = require('node:test');
const assert = require('node:assert');

const { QUESTIONS, validate } = require('../data/seed_elementary_expert');
const { gradeAnswer } = require('../services/gradingService');
const {
    CONCEPT_GAME_MAPPING,
    CONCEPT_TAGS,
    DIFFICULTY_LEVELS,
    ERROR_TYPES,
    GAME_TYPES
} = require('../config/constants');

test("the seeder's own validator passes", () => {
    // It refuses to write anything when this is non-empty, so a failure here
    // is the same failure the seeder would report.
    assert.deepStrictEqual(validate(), []);
});

test('only Elementary and Expert are added', () => {
    // The other three levels already exist. Adding to them here would make the
    // per-level counts drift from what the audit measured.
    const levels = new Set(QUESTIONS.map((q) => q.difficulty));
    assert.deepStrictEqual([...levels].sort(), ['Elementary', 'Expert']);
});

test('every game type that was missing a level now has both', () => {
    for (const gameType of ['BugHunt', 'DragDrop', 'CodeTrace']) {
        for (const difficulty of ['Elementary', 'Expert']) {
            const count = QUESTIONS.filter(
                (q) => q.gameType === gameType && q.difficulty === difficulty
            ).length;
            assert.ok(count > 0, `${gameType}/${difficulty} is still empty`);

            // More than one, so repeat-avoidance has somewhere to go. With a
            // single question per cell a student replaying the same concept at
            // the same level is served the same question every time.
            assert.ok(count > 1, `${gameType}/${difficulty} has only ${count}`);
        }
    }
});

test('CodeFix is left alone', () => {
    // It already had all five levels; adding to it here would be scope creep
    // dressed as a fix.
    assert.strictEqual(QUESTIONS.filter((q) => q.gameType === 'CodeFix').length, 0);
});

test('every concept keeps its home format', () => {
    // CONCEPT_GAME_MAPPING decides which game a concept is played as, so a
    // question seeded into the wrong format can never be served for its
    // concept - it would sit in the bank looking like coverage.
    for (const q of QUESTIONS) {
        assert.strictEqual(
            q.gameType,
            CONCEPT_GAME_MAPPING[q.conceptTag],
            `${q.id}: ${q.conceptTag} is played as ${CONCEPT_GAME_MAPPING[q.conceptTag]}`
        );
    }
});

test('every concept the three formats own is covered at both new levels', () => {
    const owned = (gameType) =>
        CONCEPT_TAGS.filter((tag) => CONCEPT_GAME_MAPPING[tag] === gameType);

    for (const gameType of ['BugHunt', 'DragDrop', 'CodeTrace']) {
        for (const difficulty of ['Elementary', 'Expert']) {
            for (const conceptTag of owned(gameType)) {
                const count = QUESTIONS.filter(
                    (q) =>
                        q.gameType === gameType &&
                        q.difficulty === difficulty &&
                        q.conceptTag === conceptTag
                ).length;
                assert.ok(
                    count > 0,
                    `no ${difficulty} ${gameType} for ${conceptTag} - the level exists but this concept cannot reach it`
                );
            }
        }
    }
});

test('every question uses the canonical vocabulary', () => {
    for (const q of QUESTIONS) {
        assert.ok(GAME_TYPES.includes(q.gameType), `${q.id}: gameType`);
        assert.ok(DIFFICULTY_LEVELS.includes(q.difficulty), `${q.id}: difficulty`);
        assert.ok(CONCEPT_TAGS.includes(q.conceptTag), `${q.id}: conceptTag`);
        assert.ok(ERROR_TYPES.includes(q.errorType), `${q.id}: errorType`);
    }
});

test('ids are unique and namespaced', () => {
    const ids = QUESTIONS.map((q) => q.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate id');
    // The seeder upserts by id, so a collision with an existing question would
    // silently overwrite it rather than adding one.
    for (const id of ids) assert.ok(id.startsWith('q_ee_'), `${id} is not namespaced`);
});

test('a BugHunt answer points at a line that exists', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'BugHunt')) {
        assert.ok(
            Number.isInteger(q.buggyLineIndex) &&
                q.buggyLineIndex >= 0 &&
                q.buggyLineIndex < q.codeLines.length,
            `${q.id}: buggyLineIndex ${q.buggyLineIndex} outside ${q.codeLines.length} lines`
        );
        assert.strictEqual(q.correctAnswer, q.buggyLineIndex, `${q.id}: answer disagrees`);
    }
});

test('a BugHunt question is graded correct only on its own line', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'BugHunt')) {
        assert.strictEqual(gradeAnswer(q, q.buggyLineIndex).correct, true, `${q.id}`);

        // Every other line is wrong. Without this a question whose answer
        // happened to match several lines would look fine.
        for (let i = 0; i < q.codeLines.length; i += 1) {
            if (i === q.buggyLineIndex) continue;
            assert.strictEqual(gradeAnswer(q, i).correct, false, `${q.id}: line ${i} also passes`);
        }
    }
});

test('a DragDrop answer is a permutation that rebuilds the code', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'DragDrop')) {
        const n = q.codeLines.length;
        assert.strictEqual(q.correctAnswer.length, n, `${q.id}: length mismatch`);

        const sorted = [...q.correctAnswer].sort((a, b) => a - b);
        assert.deepStrictEqual(sorted, [...Array(n).keys()], `${q.id}: not a permutation`);

        const rebuilt = q.correctAnswer.map((source) => q.codeLines[source]);
        assert.deepStrictEqual(rebuilt, q._correctOrder, `${q.id}: does not rebuild the code`);
    }
});

test('a DragDrop question cannot be passed without moving anything', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'DragDrop')) {
        const untouched = q.codeLines.map((_, i) => i);
        // Nine of the original twenty scored 100 for pressing Submit, because
        // the lines were presented already in order.
        assert.strictEqual(
            gradeAnswer(q, untouched).correct,
            false,
            `${q.id}: the starting arrangement is already correct`
        );
    }
});

test('a DragDrop question is passable by its own answer', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'DragDrop')) {
        // Eight of the original twenty could not be passed by any arrangement.
        assert.strictEqual(gradeAnswer(q, q.correctAnswer).correct, true, `${q.id}`);
    }
});

test('a CodeTrace answer is the text the program prints', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'CodeTrace')) {
        assert.strictEqual(typeof q.correctAnswer, 'string', `${q.id}`);
        assert.ok(q.correctAnswer.trim().length > 0, `${q.id}: empty answer`);

        // Graded case-insensitively and trimmed, so both forms have to pass.
        assert.strictEqual(gradeAnswer(q, q.correctAnswer).correct, true, `${q.id}`);
        assert.strictEqual(
            gradeAnswer(q, `  ${q.correctAnswer.toUpperCase()}  `).correct,
            true,
            `${q.id}: not tolerant of case and spacing`
        );
    }
});

test('no question gives its own answer away in the code', () => {
    for (const q of QUESTIONS.filter((x) => x.gameType === 'CodeTrace')) {
        // A trace question whose expected output appears verbatim in the
        // snippet is answerable by copying rather than by reading.
        const printed = q.codeLines.join('\n');
        const answer = q.correctAnswer.trim();
        if (answer.length < 4) continue; // "0", "1", "true" occur legitimately
        assert.ok(!printed.includes(answer), `${q.id}: the answer is visible in the code`);
    }
});

test('every question explains itself', () => {
    for (const q of QUESTIONS) {
        assert.ok(q.hints.length >= 2, `${q.id}: needs hints`);
        assert.ok(q.explanation.length >= 30, `${q.id}: explanation too thin`);

        // Hints are shown one at a time and cost score, so two identical ones
        // charge a student twice for the same information.
        assert.strictEqual(new Set(q.hints).size, q.hints.length, `${q.id}: duplicate hints`);
    }
});
