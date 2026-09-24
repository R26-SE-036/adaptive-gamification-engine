/**
 * Run: npm test
 *
 * Students were served the same question round after round. These pin the rule
 * that replaced "exclude the recent six, else pick at random".
 */

const test = require('node:test');
const assert = require('node:assert');

const { preferUnseen } = require('../services/questionSelection');

const slot = (...ids) => ids.map((id) => ({ id }));
const first = () => 0;
const last = () => 0.999;

test('a question never played is served before any repeat', () => {
    const result = preferUnseen(slot('a', 'b', 'c'), ['a', 'b']);
    assert.deepStrictEqual(result, { question: { id: 'c' }, fresh: true });
});

test('when all have been played, the one played longest ago comes back', () => {
    // Newest first: b was just answered, a before it.
    const result = preferUnseen(slot('a', 'b'), ['b', 'a']);
    assert.deepStrictEqual(result, { question: { id: 'a' }, fresh: false });
});

test('the question just answered is never served straight back from a two-question slot', () => {
    // The old $sample could return either. Five rounds in a two-question slot
    // must alternate, not repeat back to back.
    let history = [];
    const served = [];
    for (let round = 0; round < 5; round += 1) {
        const { question } = preferUnseen(slot('a', 'b'), history, round % 2 ? first : last);
        served.push(question.id);
        history = [question.id, ...history];
    }
    for (let i = 1; i < served.length; i += 1) {
        assert.notStrictEqual(served[i], served[i - 1], `round ${i + 1} repeated: ${served}`);
    }
});

test('a question played more than once is judged by its most recent play', () => {
    // a: played 1st and 4th most recently; b: 3rd. b is the staler one.
    const result = preferUnseen(slot('a', 'b'), ['c', 'a', 'b', 'a']);
    assert.strictEqual(result.question.id, 'b');
});

test('nothing to choose from is null, not an error', () => {
    assert.strictEqual(preferUnseen([], ['a']), null);
    assert.strictEqual(preferUnseen(null, []), null);
});
