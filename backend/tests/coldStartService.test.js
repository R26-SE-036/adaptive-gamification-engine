/**
 * The cross-component cold start.
 *
 * `seedStartingLevel` normally asks Study Guider for a BKT estimate over the
 * network. The fetch is injectable, so these tests supply the estimate directly
 * and no service has to be running. What is under test is the RULE: given what
 * the platform knows about a student from elsewhere, where does their first game
 * on a concept open.
 *
 * The two properties that matter most are at the bottom, and neither is about a
 * particular threshold:
 *
 *   * a seed produces a band of exactly ONE level, so the model cannot add a
 *     step of its own on top of a head start; and
 *   * every path is capped, so no student is ever opened above the ceiling
 *     however strong the evidence.
 */

const test = require('node:test');
const assert = require('node:assert');

const { seedStartingLevel } = require('../services/coldStartService');
const { permittedBand } = require('../services/progressionService');
const { DIFFICULTY_LEVELS } = require('../config/constants');

/** A Study Guider estimate, in the shape /api/progress/me/mastery returns. */
const estimate = (probabilityKnown, observations = 8) => async () => ({
    concept: 'loop_boundaries',
    probability_known: probabilityKnown,
    predicted_correct: probabilityKnown,
    observations,
    mastered: probabilityKnown >= 0.95
});

/** Study Guider is down, or the student has attempted nothing. */
const nothingKnown = async () => null;

const seed = (fetchMastery, repeatErrorCount = 0) =>
    seedStartingLevel({
        conceptTag: 'loop_boundaries',
        accessToken: 'test-token',
        repeatErrorCount,
        fetchMastery
    });

test('a student the platform knows nothing about starts at Beginner', async () => {
    const result = await seed(nothingKnown);

    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.seeded, false);
    assert.strictEqual(result.evidence.source, 'default');
});

test('a failure looking up mastery does not reach the student', async () => {
    // The real client swallows its own errors and answers null, so a throwing
    // fetch is not a realistic case - it is a proof that nothing on this path
    // can stop a first game loading. A student whose game 500s because another
    // service is down is the whole failure mode being avoided here.
    const result = await seed(async () => {
        throw new Error('Study Guider fell over');
    });

    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.seeded, false);
});

test('strong quiz mastery opens two levels up', async () => {
    const result = await seed(estimate(0.9));

    assert.strictEqual(result.level, 'Intermediate');
    assert.strictEqual(result.seeded, true);
    assert.strictEqual(result.evidence.source, 'study_guider');
    assert.match(result.reason, /Study Guider/);
});

test('moderate quiz mastery opens one level up', async () => {
    const result = await seed(estimate(0.7));
    assert.strictEqual(result.level, 'Elementary');
});

test('weak quiz mastery still opens at Beginner', async () => {
    const result = await seed(estimate(0.3));

    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.seeded, false);
});

test('one or two quiz answers are not enough to seed from', async () => {
    // BKT after a single observation has barely moved off its prior, so seeding
    // from it would hand almost every student the same head start and call it
    // personalisation.
    const result = await seed(estimate(0.95, 1));

    assert.strictEqual(result.level, 'Beginner');
    assert.match(result.reason, /too few/);
});

test('unresolved findings in Code Coach outrank a strong quiz score', async () => {
    // Five unresolved findings on this concept: the student is demonstrably
    // getting it wrong in code they wrote themselves. A quiz score of 0.95 does
    // not override that.
    const result = await seed(estimate(0.95), 5);

    assert.strictEqual(result.level, 'Beginner');
    assert.strictEqual(result.evidence.source, 'code_coach');
    assert.match(result.reason, /Code Coach/);
});

test('a couple of findings hold the seed to the smaller head start', async () => {
    const result = await seed(estimate(0.95), 2);

    assert.strictEqual(result.level, 'Elementary');
    assert.match(result.evidence.cappedBy, /unresolved findings/);
});

test('no evidence can seed above the ceiling', async () => {
    // The ceiling defaults to Intermediate, the middle of five. Nothing below is
    // allowed to produce Advanced or Expert on a student who has never played.
    const ceiling = DIFFICULTY_LEVELS.indexOf('Intermediate');

    for (const probability of [0.6, 0.75, 0.9, 0.99, 1]) {
        for (const struggles of [0, 1, 2, 3, 4]) {
            const result = await seed(estimate(probability, 20), struggles);
            assert.ok(
                DIFFICULTY_LEVELS.indexOf(result.level) <= ceiling,
                `mastery ${probability} with ${struggles} struggles seeded ${result.level}`
            );
        }
    }
});

test('a seeded start permits exactly one level, never a range', async () => {
    // This is the property that keeps the seed a head start rather than a
    // promotion. permittedBand returns the inclusive range between where the
    // student WAS and where they are now; a seed sets both to the same level, so
    // the model gets no choice and cannot add a step of its own on top.
    for (const probability of [0.3, 0.7, 0.9]) {
        const result = await seed(estimate(probability));
        const band = permittedBand(result);

        assert.deepStrictEqual(band, [result.level]);
    }
});

test('every path reports why, in words a student could be shown', async () => {
    const cases = [
        await seed(nothingKnown),
        await seed(estimate(0.9)),
        await seed(estimate(0.3)),
        await seed(estimate(0.95), 5),
        await seed(estimate(0.95, 1))
    ];

    for (const result of cases) {
        assert.ok(result.reason.length > 20, `too terse: ${result.reason}`);
        assert.ok(result.reason.includes(result.level), `does not name the level: ${result.reason}`);
    }
});
