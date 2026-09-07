/**
 * Format selection (FR-09).
 *
 * `chooseGameType` normally reads the question bank to learn which formats a
 * concept can be served in, and the student's sessions from the database. Both
 * are injectable, so these tests supply them directly. What is being tested is
 * the RULE - given what the bank offers and how the student has done, which
 * format is next - and that has no business touching Atlas.
 */

const test = require('node:test');
const assert = require('node:assert');

const { demandOf, chooseGameType } = require('../services/gameTypeService');

/**
 * Run the chooser against a fixed set of available formats.
 *
 * `formatCounts` is what the student has played across ALL concepts, which only
 * G1 consults. Defaulting it to empty keeps every other case a pure rule test.
 */
function choose(available, sessions, formatCounts = []) {
    return chooseGameType({
        userId: 'u1',
        conceptTag: 'loop_boundaries',
        sessions,
        available,
        formatCounts
    });
}

const play = (gameType, ...scores) => scores.map((score) => ({ gameType, score }));

/* ── The demand ladder ───────────────────────────────────────────────────── */

test('recognising is a lower demand than producing', () => {
    assert.ok(demandOf('BugHunt') < demandOf('CodeFix'));
    assert.ok(demandOf('DragDrop') < demandOf('CodeFix'));
    assert.ok(demandOf('CodeTrace') < demandOf('CodeFix'));
});

test('arranging and predicting share a rung', () => {
    // Neither is obviously the harder, and inventing an order between them
    // would be a claim with nothing behind it.
    assert.strictEqual(demandOf('DragDrop'), demandOf('CodeTrace'));
});

test('an unknown format sits in the middle rather than at an extreme', () => {
    assert.strictEqual(demandOf('SomethingNew'), 2);
});

/* ── The rules ───────────────────────────────────────────────────────────── */

test('G1: a student who has played nothing at all starts at the lowest demand', async () => {
    const result = await choose(['BugHunt', 'CodeFix'], []);
    assert.strictEqual(result.gameType, 'BugHunt');
    assert.strictEqual(result.rule, 'G1_start_low');
});

test('G1: a new concept is met in the format played least elsewhere', async () => {
    // Why this rule exists: the old one always picked the lowest demand, and 8
    // of the 14 concepts have BugHunt at the bottom - so a student saw BugHunt
    // on most concepts and never met CodeFix at all until they had passed
    // something. Variety across concepts is the point.
    const result = await choose(['BugHunt', 'CodeFix'], [], [{ _id: 'BugHunt', n: 6 }]);

    assert.strictEqual(result.gameType, 'CodeFix');
    assert.strictEqual(result.rule, 'G1_least_played_format');
});

test('G1 still respects what the bank can serve', async () => {
    // Played CodeFix a lot elsewhere, but this concept has no CodeFix questions.
    const result = await choose(['BugHunt'], [], [{ _id: 'CodeFix', n: 9 }]);
    assert.strictEqual(result.gameType, 'BugHunt');
});

test('G1 breaks a tie by demand, so an even history still starts low', async () => {
    const result = await choose(
        ['BugHunt', 'CodeFix'],
        [],
        [{ _id: 'BugHunt', n: 4 }, { _id: 'CodeFix', n: 4 }],
    );
    assert.strictEqual(result.gameType, 'BugHunt');
});

test('G2: failing at production steps down to recognition', async () => {
    // The point of the whole ladder: a student who cannot write the fix is not
    // helped by being asked to write it again.
    const result = await choose(['BugHunt', 'CodeFix'], [
        ...play('BugHunt', 90),
        ...play('CodeFix', 20, 30),
    ]);
    assert.strictEqual(result.gameType, 'BugHunt');
    assert.strictEqual(result.rule, 'G2_step_down');
});

test('G2: failing at the simplest format keeps them there', async () => {
    const result = await choose(['BugHunt', 'CodeFix'], play('BugHunt', 10, 20));
    assert.strictEqual(result.gameType, 'BugHunt');
    assert.strictEqual(result.rule, 'G2_step_down_at_floor');
    assert.match(result.reason, /already the/);
});

test('G3: comfortable at recognition steps up to production', async () => {
    const result = await choose(['BugHunt', 'CodeFix'], play('BugHunt', 90, 100));
    assert.strictEqual(result.gameType, 'CodeFix');
    assert.strictEqual(result.rule, 'G3_step_up');
});

test('G3 does not fire when there is nothing harder available', async () => {
    const result = await choose(['CodeFix'], play('CodeFix', 90, 100));
    assert.strictEqual(result.gameType, 'CodeFix');
    assert.strictEqual(result.rule, 'G5_stay_at_top');
});

test('G4: strong at production but weak at recognition goes back to it', async () => {
    const result = await choose(['DragDrop', 'CodeFix'], [
        ...play('DragDrop', 40, 50),
        ...play('CodeFix', 95),
    ]);
    assert.strictEqual(result.gameType, 'DragDrop');
    assert.strictEqual(result.rule, 'G4_weakest_format');
});

test('G5: solid everywhere stays at the most demanding format', async () => {
    const result = await choose(['BugHunt', 'CodeFix'], [
        ...play('BugHunt', 90),
        ...play('CodeFix', 95),
    ]);
    assert.strictEqual(result.gameType, 'CodeFix');
    assert.strictEqual(result.rule, 'G5_stay_at_top');
});

/* ── Guarantees that must hold whatever the history ──────────────────────── */

test('never recommends a format the bank cannot serve', async () => {
    const histories = [
        [],
        play('CodeFix', 10, 20),
        play('BugHunt', 100, 100),
        [...play('BugHunt', 30), ...play('CodeFix', 90)],
        [...play('BugHunt', 90), ...play('CodeFix', 90)],
        // A format the bank no longer offers, from a session played before it
        // was withdrawn.
        [...play('CodeTrace', 80), ...play('BugHunt', 50)],
    ];

    for (const available of [['BugHunt', 'CodeFix'], ['CodeTrace', 'CodeFix'], ['CodeFix']]) {
        for (const sessions of histories) {
            const result = await choose(available, sessions);
            assert.ok(
                available.includes(result.gameType),
                `${result.rule} chose ${result.gameType}, not in ${available.join('/')}`,
            );
        }
    }
});

test('every decision carries a rule and a reason', async () => {
    const result = await choose(['BugHunt', 'CodeFix'], play('BugHunt', 90, 100));
    assert.match(result.rule, /^G\d/);
    assert.ok(result.reason.length > 0);
    assert.deepStrictEqual(result.available, ['BugHunt', 'CodeFix']);
    assert.deepStrictEqual(result.averages, { BugHunt: 95 });
});

test('a concept with no questions at all still returns something usable', async () => {
    const result = await choose([], play('BugHunt', 90));
    assert.strictEqual(result.rule, 'G0_nothing_available');
    assert.ok(result.gameType, 'the caller still needs a value to query with');
});
