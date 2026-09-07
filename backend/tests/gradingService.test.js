/**
 * Run: npm test        (node --test, no dependency)
 *
 * The CodeFix cases are the reason this file exists. Marking typed Java is the
 * first thing in this engine that can be wrong in a way `===` cannot be, and
 * both directions matter: accepting a correct answer written in an unfamiliar
 * style, and refusing a wrong one that differs by a single character.
 */

const test = require('node:test');
const assert = require('node:assert');

const { normaliseJavaLine, acceptedAnswers, gradeAnswer } = require('../services/gradingService');

/* ── The normaliser ──────────────────────────────────────────────────────── */

test('whitespace outside literals is insignificant', () => {
    const canonical = normaliseJavaLine('for (int i = 0; i < arr.length; i++) {');

    assert.strictEqual(normaliseJavaLine('for(int i=0;i<arr.length;i++){'), canonical);
    assert.strictEqual(normaliseJavaLine('for ( int i = 0 ; i < arr.length ; i++ ) {'), canonical);
    assert.strictEqual(normaliseJavaLine('   for (int i = 0; i < arr.length; i++) {   '), canonical);
    assert.strictEqual(normaliseJavaLine('for\t(int i = 0;\ti < arr.length; i++) {'), canonical);
});

test('whitespace INSIDE a string literal is significant', () => {
    assert.notStrictEqual(
        normaliseJavaLine('System.out.println("hello world");'),
        normaliseJavaLine('System.out.println("helloworld");'),
    );
});

test('a literal keeps its spaces while the code around it loses them', () => {
    assert.strictEqual(
        normaliseJavaLine('String s = "a b c" ;'),
        'Strings="a b c";',
    );
});

test('an escaped quote does not end the literal', () => {
    assert.strictEqual(
        normaliseJavaLine('String s = "she said \\" ok";'),
        'Strings="she said \\" ok";',
    );
});

test('char literals are treated as literals too', () => {
    assert.strictEqual(normaliseJavaLine("char c = ' ';"), "charc=' ';");
});

test('a trailing line comment is dropped', () => {
    assert.strictEqual(
        normaliseJavaLine('i < arr.length;   // fixed the off-by-one'),
        normaliseJavaLine('i < arr.length;'),
    );
});

test('a // inside a literal is not a comment', () => {
    assert.strictEqual(
        normaliseJavaLine('String url = "http://x";'),
        'Stringurl="http://x";',
    );
});

test('case is preserved - Java is case-sensitive', () => {
    assert.notStrictEqual(normaliseJavaLine('arr.length'), normaliseJavaLine('Arr.Length'));
});

test('empty and blank input normalise to nothing', () => {
    for (const value of ['', '   ', '\t', null, undefined]) {
        assert.strictEqual(normaliseJavaLine(value), '');
    }
});

/* ── Accepted answers ────────────────────────────────────────────────────── */

test('a question may accept several phrasings of the same fix', () => {
    const accepted = acceptedAnswers([
        'for (int i = 0; i < arr.length; i++) {',
        'for (int i = 0; i <= arr.length - 1; i++) {',
    ]);

    assert.strictEqual(accepted.length, 2);
    assert.ok(accepted.includes(normaliseJavaLine('for(int i=0;i<arr.length;i++){')));
});

test('a single string answer is accepted as well as an array', () => {
    assert.deepStrictEqual(acceptedAnswers('x = 1;'), acceptedAnswers(['x = 1;']));
});

/* ── CodeFix grading ─────────────────────────────────────────────────────── */

const codeFix = {
    id: 'q_test',
    gameType: 'CodeFix',
    correctAnswer: [
        'for (int i = 0; i < arr.length; i++) {',
        'for (int i = 0; i <= arr.length - 1; i++) {',
    ],
};

test('CodeFix accepts the answer however it is spaced', () => {
    for (const answer of [
        'for (int i = 0; i < arr.length; i++) {',
        'for(int i=0;i<arr.length;i++){',
        '  for ( int i = 0 ; i < arr.length ; i++ ) {  ',
    ]) {
        assert.strictEqual(gradeAnswer(codeFix, answer).correct, true, answer);
    }
});

test('CodeFix accepts an alternative correct fix', () => {
    assert.strictEqual(
        gradeAnswer(codeFix, 'for (int i = 0; i <= arr.length - 1; i++) {').correct,
        true,
    );
});

test('CodeFix refuses the original bug', () => {
    // One character apart from the answer, and the entire point of the question.
    assert.strictEqual(
        gradeAnswer(codeFix, 'for (int i = 0; i <= arr.length; i++) {').correct,
        false,
    );
});

test('CodeFix refuses an empty answer', () => {
    for (const answer of ['', '    ', '// I do not know']) {
        assert.strictEqual(gradeAnswer(codeFix, answer).correct, false, JSON.stringify(answer));
    }
});

/* ── The other three still grade as they did ─────────────────────────────── */

test('BugHunt compares the line index, as a string either way round', () => {
    const question = { id: 'q', gameType: 'BugHunt', correctAnswer: 2 };

    assert.strictEqual(gradeAnswer(question, 2).correct, true);
    assert.strictEqual(gradeAnswer(question, '2').correct, true);
    assert.strictEqual(gradeAnswer(question, 3).correct, false);
});

test('DragDrop compares the resulting code, not the index sequence', () => {
    // Three distinct lines, so ordering and code agree exactly.
    const question = {
        id: 'q',
        gameType: 'DragDrop',
        codeLines: ['b();', 'c();', 'a();'],
        correctAnswer: [2, 0, 1],
    };

    assert.strictEqual(gradeAnswer(question, [2, 0, 1]).correct, true);
    assert.strictEqual(gradeAnswer(question, ['2', '0', '1']).correct, true, 'string indices');
    assert.strictEqual(gradeAnswer(question, [0, 1, 2]).correct, false, 'wrong order');
    assert.strictEqual(gradeAnswer(question, [2, 0]).correct, false, 'too short');
    assert.strictEqual(gradeAnswer(question, 'not an array').correct, false);
});

test('DragDrop accepts either arrangement of two identical lines', () => {
    // A switch with two `break;` lines: swapping them produces the same
    // program, so marking one arrangement wrong would reject a correct answer.
    const question = {
        id: 'q',
        gameType: 'DragDrop',
        codeLines: ['break;', 'a();', 'break;', 'b();'],
        correctAnswer: [1, 0, 3, 2],
    };

    assert.strictEqual(gradeAnswer(question, [1, 0, 3, 2]).correct, true);
    assert.strictEqual(gradeAnswer(question, [1, 2, 3, 0]).correct, true, 'breaks swapped');
    assert.strictEqual(gradeAnswer(question, [1, 0, 2, 3]).correct, false, 'genuinely wrong');
});

test('DragDrop refuses an index that is not a line', () => {
    const question = {
        id: 'q',
        gameType: 'DragDrop',
        codeLines: ['a();', 'b();'],
        correctAnswer: [1, 0],
    };

    assert.strictEqual(gradeAnswer(question, [1, 9]).correct, false, 'out of range');
    assert.strictEqual(gradeAnswer(question, [1, 'x']).correct, false, 'not a number');
});

test('CodeTrace ignores case and surrounding space', () => {
    const question = { id: 'q', gameType: 'CodeTrace', correctAnswer: 'false' };

    assert.strictEqual(gradeAnswer(question, '  FALSE ').correct, true);
    assert.strictEqual(gradeAnswer(question, 'true').correct, false);
});

test('the question decides the game type, not the caller', () => {
    // The client sends Code Coach's vocabulary; it must not select the branch.
    const question = { id: 'q', gameType: 'BugHunt', correctAnswer: 2 };
    assert.strictEqual(gradeAnswer(question, 2).correct, true);
});

test('a question with an unknown game type throws rather than marking silently', () => {
    assert.throws(
        () => gradeAnswer({ id: 'q_bad', gameType: 'loop_tracer', correctAnswer: 1 }, 1),
        /ungradeable gameType/,
    );
});
