/**
 * The dual-threshold rule (FR-08).
 *
 * The case worth reading first is "a promotion does not carry its own evidence
 * forward" - without that, advancing is self-perpetuating and a student reaches
 * Expert without playing a round at any level in between.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
    ADVANCE_AT,
    REGRESS_AT,
    CONSECUTIVE_REQUIRED,
    STARTING_LEVEL,
    currentLevel,
    permittedBand
} = require('../services/progressionService');

/** Sessions oldest-first, one day apart, so ordering is unambiguous. */
function history(...entries) {
    return entries.map(([difficultyLevel, score], index) => ({
        difficultyLevel,
        score,
        completedAt: new Date(2026, 0, index + 1)
    }));
}

test('a student with no history starts at the first level', () => {
    const result = currentLevel([]);
    assert.strictEqual(result.level, STARTING_LEVEL);
    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.moved, null);
});

test('one strong session is not enough to advance', () => {
    const result = currentLevel(history(['Beginner', 100]));
    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.moved, null);
    assert.match(result.reason, /in a row are needed/);
});

test('two consecutive sessions above the threshold advance one level', () => {
    const result = currentLevel(history(['Beginner', 85], ['Beginner', 90]));
    assert.strictEqual(result.level, 'Elementary');
    assert.strictEqual(result.moved, 'advanced');
});

test('one strong session is not enough to regress', () => {
    const result = currentLevel(history(['Intermediate', 90], ['Intermediate', 10]));
    assert.strictEqual(result.level, 'Intermediate');
    assert.strictEqual(result.moved, null);
});

test('two consecutive sessions below the threshold regress one level', () => {
    const result = currentLevel(history(['Intermediate', 20], ['Intermediate', 0]));
    assert.strictEqual(result.level, 'Elementary');
    assert.strictEqual(result.moved, 'regressed');
});

test('a single anomaly between two strong sessions blocks the advance', () => {
    // The exact instability the dual threshold exists to prevent.
    const result = currentLevel(history(['Beginner', 95], ['Beginner', 30], ['Beginner', 95]));
    assert.strictEqual(result.moved, null, 'the run was broken by the middle session');
    assert.strictEqual(result.level, 'Beginner');
});

test('a promotion does not carry its own evidence forward', () => {
    // Two strong Beginner rounds promote to Elementary. Those same two rounds
    // must not then promote again - the student has not played Elementary yet.
    const promoted = currentLevel(history(['Beginner', 90], ['Beginner', 95]));
    assert.strictEqual(promoted.level, 'Elementary');

    const afterOneRound = currentLevel(
        history(['Beginner', 90], ['Beginner', 95], ['Elementary', 90])
    );
    assert.strictEqual(afterOneRound.level, 'Elementary', 'one Elementary round is not two');
    assert.strictEqual(afterOneRound.moved, null);

    const afterTwo = currentLevel(
        history(['Beginner', 90], ['Beginner', 95], ['Elementary', 90], ['Elementary', 88])
    );
    assert.strictEqual(afterTwo.level, 'Intermediate', 'now it is earned at Elementary');
});

test('the ceiling and the floor hold', () => {
    const top = currentLevel(history(['Expert', 100], ['Expert', 100]));
    assert.strictEqual(top.level, 'Expert');
    assert.strictEqual(top.moved, null);
    assert.match(top.reason, /highest level/);

    const bottom = currentLevel(history(['Beginner', 0], ['Beginner', 0]));
    assert.strictEqual(bottom.level, 'Beginner');
    assert.strictEqual(bottom.moved, null);
    assert.match(bottom.reason, /lowest level/);
});

test('a score between the thresholds keeps the student where they are', () => {
    const middle = Math.floor((ADVANCE_AT + REGRESS_AT) / 2);
    const result = currentLevel(history(['Intermediate', middle], ['Intermediate', middle]));
    assert.strictEqual(result.level, 'Intermediate');
    assert.strictEqual(result.moved, null);
    assert.match(result.reason, /band that keeps them/);
});

test('the thresholds are inclusive at both ends', () => {
    assert.strictEqual(
        currentLevel(history(['Beginner', ADVANCE_AT], ['Beginner', ADVANCE_AT])).moved,
        'advanced',
    );
    assert.strictEqual(
        currentLevel(history(['Advanced', REGRESS_AT], ['Advanced', REGRESS_AT])).moved,
        'regressed',
    );
});

test('sessions written under the old three-level scale still resolve', () => {
    // Every session recorded before the five-level change says Easy/Medium/Hard.
    const result = currentLevel(history(['Medium', 90], ['Medium', 95]));
    assert.strictEqual(result.previousLevel, 'Intermediate', 'Medium maps onto Intermediate');
    assert.strictEqual(result.level, 'Advanced');
});

test('history passed newest-first is still read oldest-first', () => {
    const oldestFirst = history(['Beginner', 20], ['Beginner', 95], ['Beginner', 90]);
    const newestFirst = [...oldestFirst].reverse();

    assert.deepStrictEqual(currentLevel(newestFirst), currentLevel(oldestFirst));
    assert.strictEqual(currentLevel(newestFirst).moved, 'advanced');
});

test('sessions without a usable score are ignored rather than counted as zero', () => {
    const result = currentLevel([
        { difficultyLevel: 'Beginner', score: 90, completedAt: new Date(2026, 0, 1) },
        { difficultyLevel: 'Beginner', score: null, completedAt: new Date(2026, 0, 2) },
        { difficultyLevel: 'Beginner', score: 95, completedAt: new Date(2026, 0, 3) },
    ]);
    assert.strictEqual(result.moved, 'advanced', 'the null is skipped, not treated as a failure');
});

test('the required run length is what the proposal says', () => {
    assert.strictEqual(CONSECUTIVE_REQUIRED, 2);
});

/* ── The band the model may choose within ────────────────────────────────── */

test('when the rule holds a student, the model has no choice at all', () => {
    const held = currentLevel(history(['Intermediate', 60], ['Intermediate', 60]));
    assert.strictEqual(held.moved, null);
    assert.deepStrictEqual(permittedBand(held), ['Intermediate']);
});

test('an advance permits exactly the old level and the new one', () => {
    const advanced = currentLevel(history(['Beginner', 90], ['Beginner', 95]));
    assert.strictEqual(advanced.moved, 'advanced');
    assert.deepStrictEqual(permittedBand(advanced), ['Beginner', 'Elementary']);
});

test('a regression permits exactly the old level and the new one', () => {
    const regressed = currentLevel(history(['Advanced', 10], ['Advanced', 0]));
    assert.strictEqual(regressed.moved, 'regressed');
    assert.deepStrictEqual(permittedBand(regressed), ['Intermediate', 'Advanced']);
});

test('the band never spans two levels - the FR-08 guarantee', () => {
    // Caught in live testing: the band used to be built around the rule's
    // OUTPUT, so two strong Beginner rounds advanced to Elementary and then
    // allowed Intermediate as well. The student reached a level they had never
    // seen without the two consecutive sessions the rule exists to require.
    for (const entries of [
        [['Beginner', 90], ['Beginner', 95]],
        [['Elementary', 100], ['Elementary', 100]],
        [['Advanced', 0], ['Advanced', 0]],
        [['Intermediate', 60], ['Intermediate', 60]],
    ]) {
        const band = permittedBand(currentLevel(history(...entries)));
        assert.ok(band.length <= 2, `band ${band.join('/')} spans more than one step`);
    }
});

test('a bare level is still accepted, and means "no movement"', () => {
    assert.deepStrictEqual(permittedBand('Intermediate'), ['Intermediate']);
});

test('an unrecognised level falls back to the starting level alone', () => {
    assert.deepStrictEqual(permittedBand('nonsense'), [STARTING_LEVEL]);
    assert.deepStrictEqual(permittedBand(null), [STARTING_LEVEL]);
});
