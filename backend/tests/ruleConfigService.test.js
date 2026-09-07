/**
 * Runtime rule configuration (FR-15).
 *
 * `__setForTests` installs a snapshot directly, so these exercise the merge
 * order and the validation without a database. The database path - reading the
 * stored document, writing it, refreshing - is covered by the live checks in
 * the phase's verification rather than mocked here, because mocking Mongoose
 * would test the mock.
 */

const test = require('node:test');
const assert = require('node:assert');

const ruleConfig = require('../services/ruleConfigService');
const { SCHEMA, rules, describe: describeConfig, __setForTests } = ruleConfig;

/** Run a body with specific env vars set, restoring them afterwards. */
function withEnv(vars, body) {
    const before = {};
    for (const [name, value] of Object.entries(vars)) {
        before[name] = process.env[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = String(value);
    }

    try {
        return body();
    } finally {
        for (const [name, value] of Object.entries(before)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        __setForTests({});
    }
}

test('the defaults are the values the phases actually chose', () => {
    __setForTests({});
    const r = rules();

    assert.strictEqual(r.scoring.passMark, 70);
    assert.strictEqual(r.scoring.hintPenalty, 15);
    assert.strictEqual(r.scoring.attemptPenalty, 10);
    assert.strictEqual(r.progression.advanceAt, 80);
    assert.strictEqual(r.progression.regressAt, 40);
    assert.strictEqual(r.progression.consecutiveRequired, 2);
    assert.strictEqual(r.support.failuresBeforeLesson, 3);
    assert.strictEqual(r.difficulty.explorationRate, 0.15);
});

test('a stored value beats the environment, which beats the default', () => {
    withEnv({ PROGRESSION_ADVANCE_AT: 85 }, () => {
        __setForTests({});
        assert.strictEqual(rules().progression.advanceAt, 85, 'env over default');

        __setForTests({ 'progression.advanceAt': 90 });
        assert.strictEqual(rules().progression.advanceAt, 90, 'stored over env');
    });

    __setForTests({});
    assert.strictEqual(rules().progression.advanceAt, 80, 'back to the default');
});

test('each layer only overrides what it sets', () => {
    withEnv({ SUPPORT_WINDOW: 9 }, () => {
        __setForTests({ 'scoring.hintPenalty': 5 });
        const r = rules();

        assert.strictEqual(r.scoring.hintPenalty, 5, 'the stored one');
        assert.strictEqual(r.support.window, 9, 'the env one');
        assert.strictEqual(r.scoring.attemptPenalty, 10, 'everything else defaults');
    });
});

test('an unparseable environment value falls through to the default', () => {
    withEnv({ PROGRESSION_ADVANCE_AT: 'quite high' }, () => {
        __setForTests({});
        assert.strictEqual(rules().progression.advanceAt, 80);
    });
});

test('an empty environment value is treated as unset', () => {
    withEnv({ PROGRESSION_ADVANCE_AT: '' }, () => {
        __setForTests({});
        assert.strictEqual(rules().progression.advanceAt, 80);
    });
});

test('describe reports where every value came from', () => {
    withEnv({ SUPPORT_WINDOW: 7 }, () => {
        __setForTests({ 'scoring.passMark': 65 });
        const described = describeConfig();

        assert.strictEqual(described.sources['scoring.passMark'], 'stored');
        assert.strictEqual(described.sources['support.window'], 'env');
        assert.strictEqual(described.sources['scoring.hintPenalty'], 'default');
    });
});

test('describe carries the bounds, so a caller knows what it may set', () => {
    __setForTests({});
    const { schema } = describeConfig();

    for (const [path, spec] of Object.entries(schema)) {
        assert.ok(Number.isFinite(spec.min), `${path} has a min`);
        assert.ok(Number.isFinite(spec.max), `${path} has a max`);
        assert.ok(spec.min < spec.max, `${path} bounds are ordered`);
        assert.ok(spec.describe.length > 0, `${path} explains itself`);
    }
});

test('every default sits inside its own bounds', () => {
    for (const [path, spec] of Object.entries(SCHEMA)) {
        assert.ok(
            spec.default >= spec.min && spec.default <= spec.max,
            `${path} default ${spec.default} is outside ${spec.min}..${spec.max}`,
        );
    }
});

test('every threshold names an environment variable, and none is reused', () => {
    const seen = new Set();
    for (const [path, spec] of Object.entries(SCHEMA)) {
        assert.ok(spec.env, `${path} names an env var`);
        // Two thresholds sharing one variable would make it impossible to set
        // either independently.
        assert.ok(!seen.has(spec.env), `${spec.env} is used by more than one threshold`);
        seen.add(spec.env);
    }
});

test('the shape is nested by group, which is how callers read it', () => {
    __setForTests({});
    const r = rules();

    for (const path of Object.keys(SCHEMA)) {
        const [group, name] = path.split('.');
        assert.ok(r[group], `${group} exists`);
        assert.ok(name in r[group], `${path} exists`);
    }
});

test('a snapshot is returned even before anything has been loaded', () => {
    // The database being unreachable must not take the engine down: env and
    // defaults are a complete configuration on their own.
    __setForTests(null);
    assert.strictEqual(rules().scoring.passMark, 70);
});
