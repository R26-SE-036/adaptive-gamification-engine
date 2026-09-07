/**
 * Rounds that must not count as evidence.
 *
 * Seventeen of twenty Drag & Drop questions were defective - eight unwinnable,
 * nine scoring 100 for touching nothing - and the rounds played against them are
 * still in the database. They are real rounds by a real student, so `dataSource`
 * cannot exclude them; what is wrong is the QUESTION, not the provenance.
 *
 * These tests cover the two things that are easy to get wrong about that:
 *
 *   1. the exclusion has to be applied in every consumer, and there are eight of
 *      them. A predicate that must be remembered in eight places gets forgotten
 *      in one, so it exists once and this asserts the call sites use it.
 *   2. an invalidated round is not only a bad label for ITSELF. It is also part
 *      of the history of every later round by that student, so excluding it from
 *      the target while leaving it in the features would let the defect
 *      propagate forward regardless.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const GameSession = require('../models/GameSession');
const { featuresFrom } = require('../services/difficultyService');
const { currentLevel } = require('../services/progressionService');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the predicate exists in exactly one place', () => {
    assert.deepStrictEqual(GameSession.COUNTS_AS_EVIDENCE, { invalidatedReason: null });

    // Frozen so a caller cannot mutate the shared fragment and change what
    // every other call site means.
    assert.ok(Object.isFrozen(GameSession.COUNTS_AS_EVIDENCE));
});

test('evidence() narrows a query to valid rounds', () => {
    const query = GameSession.evidence({ userId: 'u1', conceptTag: 'loop_boundaries' });

    assert.deepStrictEqual(query.getFilter(), {
        userId: 'u1',
        conceptTag: 'loop_boundaries',
        invalidatedReason: null
    });
});

test('evidence() cannot be talked out of the filter by a caller', () => {
    // A caller passing their own invalidatedReason must not be able to widen
    // the query back to including invalidated rows - the filter is applied
    // last, so it wins.
    const query = GameSession.evidence({ invalidatedReason: { $ne: null } });

    assert.deepStrictEqual(query.getFilter(), { invalidatedReason: null });
});

test('every consumer of session history applies the filter', () => {
    // A source-level check rather than a behavioural one, deliberately. These
    // are eight separate queries against a live database; the failure mode is
    // not that one of them computes wrongly but that somebody adds a ninth and
    // forgets. This test is what notices.
    const consumers = [
        'services/difficultyService.js',
        'services/gameTypeService.js',
        'services/supportService.js',
        'services/recommendationService.js',
        'routes/gamification.js',
        'data/question_difficulty.js'
    ];

    for (const file of consumers) {
        const source = read(file);

        // Every GameSession read is either an `evidence()` call or an aggregate
        // that spreads the shared fragment into its $match.
        const rawFinds = source.match(/GameSession\.find\(/g) ?? [];
        assert.strictEqual(
            rawFinds.length,
            0,
            `${file} calls GameSession.find directly; use GameSession.evidence`
        );

        const aggregates = (source.match(/GameSession\.aggregate\(/g) ?? []).length;
        const guarded = (source.match(/COUNTS_AS_EVIDENCE/g) ?? []).length;
        assert.ok(
            guarded >= aggregates,
            `${file} has ${aggregates} aggregate(s) but ${guarded} guard(s)`
        );
    }
});

test('the trainer drops invalidated rounds before building sequences', () => {
    // The ordering is the load-bearing part. `build_rows` sorts each student's
    // sessions and derives every feature from the ones before - so an
    // invalidated round left in the list would still contribute its score to
    // the next round's avg_score, recent_score and success_rate even if it were
    // never used as a target itself.
    const source = read('ml/training_data.py');

    const dropAt = source.indexOf('invalidatedReason');
    const orderAt = source.indexOf('ordered.setdefault');

    assert.ok(dropAt > 0, 'the trainer does not mention invalidatedReason');
    assert.ok(
        dropAt < orderAt,
        'invalidated rounds are dropped after the sequence is built, so they ' +
            'still feed the history features of later rounds'
    );
});

test('a defective round would otherwise misread the student', () => {
    // What the exclusion is worth, stated as the difference it makes. Five
    // unwinnable rounds and two genuine passes: including them halves the
    // student's apparent success rate and drags the average below the
    // heuristic's Beginner threshold.
    const genuine = [
        { score: 90, attemptCount: 1, hintUsage: 0, timeTakenSeconds: 40, difficultyLevel: 'Beginner' },
        { score: 85, attemptCount: 1, hintUsage: 0, timeTakenSeconds: 35, difficultyLevel: 'Beginner' }
    ];

    const withDefective = [
        { score: 0, attemptCount: 1, hintUsage: 0, timeTakenSeconds: 20, difficultyLevel: 'Beginner' },
        { score: 0, attemptCount: 1, hintUsage: 0, timeTakenSeconds: 20, difficultyLevel: 'Beginner' },
        ...genuine
    ];

    const clean = featuresFrom(genuine);
    const dirty = featuresFrom(withDefective);

    assert.strictEqual(clean.success_rate, 1);
    assert.strictEqual(dirty.success_rate, 0.5);
    assert.ok(dirty.avg_score < clean.avg_score - 30);
});

test('a defective round would otherwise hold the student down a level', () => {
    // The same rows through the progression rule. Two rounds at or below the
    // regress threshold are what the dual-threshold rule moves a student DOWN
    // on - so the corrupted history does not merely describe them wrongly, it
    // acts on them.
    const dated = (rows) =>
        rows.map((row, index) => ({
            ...row,
            completedAt: new Date(2026, 0, 1 + index)
        }));

    const afterDefective = currentLevel(
        dated([
            { score: 90, difficultyLevel: 'Intermediate' },
            { score: 0, difficultyLevel: 'Intermediate' },
            { score: 0, difficultyLevel: 'Intermediate' }
        ])
    );

    const afterExcluding = currentLevel(
        dated([{ score: 90, difficultyLevel: 'Intermediate' }])
    );

    assert.strictEqual(afterDefective.moved, 'regressed');
    assert.strictEqual(afterExcluding.moved, null);
    assert.strictEqual(afterExcluding.level, 'Intermediate');
});
