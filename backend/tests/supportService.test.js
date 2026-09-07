/**
 * Support recommendations (FR-10).
 *
 * `sessions` is injectable, so these test the rule rather than the database.
 * The case that matters most is the first one: before this existed, a student
 * who had failed the same concept four times running got the same single
 * sentence as a student who had missed once.
 */

const test = require('node:test');
const assert = require('node:assert');

const { recommendSupport } = require('../services/supportService');
const ruleConfig = require('../services/ruleConfigService');

ruleConfig.__setForTests({});
const { failuresBeforeLesson: FAILURES_BEFORE_LESSON, hintDependence: HINT_DEPENDENCE } =
    ruleConfig.rules().support;

/** Sessions newest LAST, so the array reads in the order they were played. */
function played(...entries) {
    return entries.map(([score, hintUsage], index) => ({
        score,
        hintUsage,
        errorCount: score >= 70 ? 0 : 1,
        completedAt: new Date(2026, 0, index + 1)
    }));
}

const ask = (args) => recommendSupport({ userId: 'u1', conceptTag: 'loop_boundaries', ...args });

test('three failures in a row send the student to the lesson', async () => {
    const result = await ask({ lastScore: 0, sessions: played([0, 0], [25, 1], [0, 2]) });

    assert.strictEqual(result.action, 'review_lesson');
    assert.strictEqual(result.evidence.consecutiveFailures, 3);
    assert.match(result.headline, /lesson/i);
});

test('two failures do not - the difficulty rule handles that', async () => {
    const result = await ask({ lastScore: 0, sessions: played([25, 0], [0, 0]) });

    assert.notStrictEqual(result.action, 'review_lesson');
    assert.strictEqual(result.evidence.consecutiveFailures, 2);
});

test('a pass breaks the run of failures', async () => {
    // Two failures, a pass, then two more. Not three in a row.
    const result = await ask({
        lastScore: 0,
        sessions: played([0, 0], [0, 0], [100, 0], [0, 0], [30, 0]),
    });

    assert.strictEqual(result.evidence.consecutiveFailures, 2);
    assert.notStrictEqual(result.action, 'review_lesson');
});

test('unresolved findings in the student\'s own code also send them to the lesson', async () => {
    // Different evidence from repeated game failure: this is their real editor.
    const result = await ask({
        lastScore: 40,
        repeatErrorCount: 4,
        sessions: played([90, 0], [40, 0]),
    });

    assert.strictEqual(result.action, 'review_lesson');
    assert.match(result.detail, /your own code/);
});

test('unresolved findings do NOT fire on a round the student passed', async () => {
    const result = await ask({
        lastScore: 100,
        repeatErrorCount: 5,
        sessions: played([100, 0]),
    });

    assert.notStrictEqual(result.action, 'review_lesson');
});

test('being dropped a level is met with extra practice, not a lesson', async () => {
    const result = await ask({
        lastScore: 30,
        progression: { moved: 'regressed', level: 'Beginner' },
        sessions: played([20, 0], [30, 0]),
    });

    assert.strictEqual(result.action, 'extra_practice');
    assert.match(result.detail, /Beginner/);
});

test('passing on hints is called out', async () => {
    const result = await ask({
        lastScore: 85,
        sessions: played([80, 2], [90, 2], [85, 3]),
    });

    assert.strictEqual(result.action, 'slow_down');
    assert.ok(result.evidence.averageHints > HINT_DEPENDENCE);
});

test('passing without leaning on hints needs no support', async () => {
    const result = await ask({ lastScore: 100, sessions: played([90, 0], [100, 1]) });

    assert.strictEqual(result.action, 'keep_going');
    assert.match(result.detail, /Nothing here needs/);
});

test('one missed round is not a pattern', async () => {
    const result = await ask({ lastScore: 25, sessions: played([100, 0], [25, 0]) });

    assert.strictEqual(result.action, 'keep_going');
    assert.match(result.detail, /not a pattern/);
});

test('a student with no history at all gets an answer rather than an error', async () => {
    const result = await ask({ lastScore: 100, sessions: [] });

    assert.strictEqual(result.action, 'keep_going');
    assert.strictEqual(result.evidence.sessionsConsidered, 0);
});

test('sessions handed over newest-first are read the same way', async () => {
    const chronological = played([0, 0], [25, 0], [0, 0]);
    const reversed = [...chronological].reverse();

    const a = await ask({ lastScore: 0, sessions: chronological });
    const b = await ask({ lastScore: 0, sessions: reversed });

    assert.strictEqual(a.action, b.action);
    assert.strictEqual(a.evidence.consecutiveFailures, b.evidence.consecutiveFailures);
});

test('sessions with no recorded hint count do not drag the average to zero', async () => {
    // hintUsage is undefined on rounds played before hints were measured.
    const result = await ask({
        lastScore: 85,
        sessions: [
            { score: 80, completedAt: new Date(2026, 0, 1) },
            { score: 90, hintUsage: 3, completedAt: new Date(2026, 0, 2) },
            { score: 85, hintUsage: 3, completedAt: new Date(2026, 0, 3) },
        ],
    });

    assert.strictEqual(result.evidence.averageHints, 3, 'only measured rounds count');
    assert.strictEqual(result.action, 'slow_down');
});

test('every branch names an action and carries its evidence', async () => {
    const cases = [
        { lastScore: 0, sessions: played([0, 0], [0, 0], [0, 0]) },
        { lastScore: 40, repeatErrorCount: 4, sessions: played([40, 0]) },
        { lastScore: 30, progression: { moved: 'regressed', level: 'Beginner' }, sessions: played([30, 0]) },
        { lastScore: 90, sessions: played([90, 3], [90, 3]) },
        { lastScore: 100, sessions: played([100, 0]) },
    ];

    const seen = new Set();
    for (const args of cases) {
        const result = await ask(args);
        assert.ok(result.action, 'an action');
        assert.ok(result.headline.length > 0, 'a headline');
        assert.ok(result.detail.length > 0, 'a detail');
        assert.ok(result.evidence, 'evidence');
        seen.add(result.action);
    }

    assert.strictEqual(seen.size, 4, `expected four distinct actions, got ${[...seen].join(', ')}`);
});

test('the lesson threshold is what the constant says', () => {
    assert.strictEqual(FAILURES_BEFORE_LESSON, 3);
});
