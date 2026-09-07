/**
 * Every threshold the engine adapts on, in one place, changeable at runtime.
 *
 * ============================ WHAT FR-15 ASKS FOR ============================
 *     "The system shall support configuration of rule thresholds by authorised
 *      administrators without requiring source code changes."
 *
 * Some thresholds were environment variables, which needs a restart. Several
 * were literals buried in the middle of a function - the score formula's 15 and
 * 10, the heuristic's 45 and 75, the mastery bar's 80 - and changing those meant
 * editing and redeploying.
 *
 * ======================= "AUTHORISED ADMINISTRATORS" ========================
 * There are none. The platform is student-only by decision: roles were removed
 * from Code Coach entirely, so there is no account type to grant this to and no
 * role claim left to check. See docs/proposal-gap-analysis.md §4a.
 *
 * The endpoints are gated by a shared secret instead - the same pattern the ML
 * service already uses for POST /retrain. The "administrator" is whoever holds
 * `RULE_CONFIG_SECRET`, which is whoever deployed the service. That is a weaker
 * claim than the proposal makes and the honest one to make: a student-only
 * platform cannot have a privileged user without first having privileged users.
 *
 * ============================= THE MERGE ORDER ==============================
 *     stored config  >  environment variable  >  code default
 *
 * Each layer only overrides what it actually sets, so a stored config never has
 * to be complete, an env var still works for anyone deploying without a
 * database write, and a threshold added in code needs no migration.
 *
 * ========================== WHY THE READ IS SYNC ===========================
 * `rules()` returns an in-memory snapshot and never awaits. The callers are
 * pure, synchronous decision functions - progressionService.currentLevel is
 * called inside a sort - and making them async to fetch configuration would
 * turn a rule engine into a chain of promises for a value that changes maybe
 * twice a year.
 *
 * The snapshot is refreshed at boot, immediately after any write, and lazily
 * when a read finds it stale: the stale read returns the old values and kicks
 * off a background refresh, so a change takes effect within TTL_MS rather than
 * instantly. For thresholds that is the right trade - nothing here needs to be
 * read-your-writes across a fleet, and the alternative is a database round trip
 * on the path of every game.
 */

const RuleConfig = require('../models/RuleConfig');

/** How long a snapshot is trusted before a read triggers a background refresh. */
const TTL_MS = Number(process.env.RULE_CONFIG_TTL_MS || 30_000);

/**
 * Every tunable, its default, and where it is read.
 *
 * `env` is the variable that overrides the default; `min`/`max` bound what a
 * stored config may set it to. The bounds are not decoration - they are what
 * stops a typo in a PUT from making the engine incoherent, and an out-of-range
 * value is refused rather than clamped so the caller learns they were wrong.
 */
const SCHEMA = {
    'scoring.hintPenalty': {
        env: 'SCORE_HINT_PENALTY', default: 15, min: 0, max: 100,
        describe: 'Points deducted per hint taken.'
    },
    'scoring.attemptPenalty': {
        env: 'SCORE_ATTEMPT_PENALTY', default: 10, min: 0, max: 100,
        describe: 'Points deducted per attempt after the first.'
    },
    'scoring.passMark': {
        env: 'SUCCESS_SCORE', default: 70, min: 1, max: 100,
        describe: 'Score at or above which a round counts as a success.'
    },
    'scoring.masteryMark': {
        env: 'SCORE_MASTERY_MARK', default: 80, min: 1, max: 100,
        describe: 'Score at or above which a round is reported as progress.'
    },

    'difficulty.explorationRate': {
        env: 'DIFFICULTY_EXPLORATION_RATE', default: 0.15, min: 0, max: 1,
        describe: 'Share of rounds served at a random level in the permitted band.'
    },
    'difficulty.heuristicEasyBelow': {
        env: 'DIFFICULTY_HEURISTIC_EASY_BELOW', default: 45, min: 0, max: 100,
        describe: 'Average score below which the fallback rule serves the lowest level.'
    },
    'difficulty.heuristicMediumBelow': {
        env: 'DIFFICULTY_HEURISTIC_MEDIUM_BELOW', default: 75, min: 0, max: 100,
        describe: 'Average score below which the fallback rule serves the middle level.'
    },
    'difficulty.strugglesCapToFloor': {
        env: 'DIFFICULTY_STRUGGLES_CAP', default: 5, min: 1, max: 50,
        describe: 'Unresolved Code Coach findings that cap the level to the band floor.'
    },
    'difficulty.strugglesForMiddle': {
        env: 'DIFFICULTY_STRUGGLES_MIDDLE', default: 2, min: 1, max: 50,
        describe: 'Unresolved findings at which the fallback rule stops serving the top level.'
    },

    // Where a student with no history on a concept opens. See
    // services/coldStartService.js - and note that ceilingIndex 0 restores the
    // proposal's literal "all students start at the Beginner level".
    'coldStart.ceilingIndex': {
        env: 'COLD_START_CEILING_INDEX', default: 2, min: 0, max: 4,
        describe: 'Highest level index a first game may be seeded to. 0 disables seeding.'
    },
    'coldStart.masteryForElementary': {
        env: 'COLD_START_MASTERY_ELEMENTARY', default: 0.6, min: 0, max: 1,
        describe: 'Study Guider mastery at or above which a first game starts one level up.'
    },
    'coldStart.masteryForIntermediate': {
        env: 'COLD_START_MASTERY_INTERMEDIATE', default: 0.85, min: 0, max: 1,
        describe: 'Study Guider mastery at or above which a first game starts two levels up.'
    },
    'coldStart.minObservations': {
        env: 'COLD_START_MIN_OBSERVATIONS', default: 3, min: 1, max: 50,
        describe: 'Quiz observations needed before mastery is trusted to seed a level.'
    },

    'progression.advanceAt': {
        env: 'PROGRESSION_ADVANCE_AT', default: 80, min: 1, max: 100,
        describe: 'Score at or above which a session counts toward advancing.'
    },
    'progression.regressAt': {
        env: 'PROGRESSION_REGRESS_AT', default: 40, min: 0, max: 99,
        describe: 'Score at or below which a session counts toward regressing.'
    },
    'progression.consecutiveRequired': {
        env: 'PROGRESSION_CONSECUTIVE', default: 2, min: 1, max: 10,
        describe: 'Consecutive sessions needed before the level moves.'
    },

    'support.failuresBeforeLesson': {
        env: 'SUPPORT_FAILURES_BEFORE_LESSON', default: 3, min: 1, max: 20,
        describe: 'Failures in a row before the student is sent to the lesson.'
    },
    'support.hintDependence': {
        env: 'SUPPORT_HINT_DEPENDENCE', default: 1.5, min: 0, max: 10,
        describe: 'Average hints per round above which a passing student is flagged.'
    },
    'support.window': {
        env: 'SUPPORT_WINDOW', default: 5, min: 1, max: 50,
        describe: 'How many recent sessions the support rules look at.'
    }
};

let snapshot = null;
let loadedAt = 0;
let refreshing = false;

/** Read one env var as a number, or undefined when unset or unparseable. */
function fromEnv(name) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/** Nest 'a.b' keys into { a: { b } }. */
function nest(flat) {
    const out = {};
    for (const [path, value] of Object.entries(flat)) {
        const [group, name] = path.split('.');
        (out[group] ??= {})[name] = value;
    }
    return out;
}

/** Build the effective values from the three layers. */
function merge(stored = {}) {
    const flat = {};
    const sources = {};

    for (const [path, spec] of Object.entries(SCHEMA)) {
        const storedValue = stored[path];
        const envValue = fromEnv(spec.env);

        if (Number.isFinite(storedValue)) {
            flat[path] = storedValue;
            sources[path] = 'stored';
        } else if (envValue !== undefined) {
            flat[path] = envValue;
            sources[path] = 'env';
        } else {
            flat[path] = spec.default;
            sources[path] = 'default';
        }
    }

    return { values: nest(flat), flat, sources };
}

/** The current effective thresholds. Synchronous, never throws. */
function rules() {
    if (!snapshot) {
        // Before the first load - during boot, or with the database unreachable.
        // Env and defaults still apply, so the engine runs with the same values
        // it would have had before this file existed.
        snapshot = merge({});
        loadedAt = 0;
    }

    if (Date.now() - loadedAt > TTL_MS) {
        // Stale. Return what we have and refresh behind the caller: a game
        // request must not wait on a configuration lookup.
        void refresh();
    }

    return snapshot.values;
}

/** Reload from the database. Safe to call concurrently. */
async function refresh() {
    if (refreshing) return snapshot?.values;
    refreshing = true;

    try {
        const document = await RuleConfig.findOne({ key: 'active' }).lean();
        snapshot = merge(document?.values || {});
        loadedAt = Date.now();
    } catch (error) {
        // A database that cannot be read must not take the engine down: env and
        // defaults are a complete configuration on their own. Logged rather than
        // silent, because running on defaults when an operator believes they
        // have configured something is exactly the confusion to avoid.
        console.warn(`[rule-config] Could not read the stored config: ${error.message}`);
        if (!snapshot) {
            snapshot = merge({});
            loadedAt = Date.now();
        }
    } finally {
        refreshing = false;
    }

    return snapshot.values;
}

/**
 * Validate and store an override set.
 *
 * @returns {Promise<{ok: true, values: object, sources: object} | {ok: false, errors: string[]}>}
 */
async function update(patch, note = '') {
    const errors = [];
    const accepted = {};

    for (const [path, raw] of Object.entries(patch || {})) {
        const spec = SCHEMA[path];

        if (!spec) {
            errors.push(`${path} is not a configurable threshold`);
            continue;
        }

        // null clears an override and lets the env or default take over again.
        if (raw === null) {
            accepted[path] = null;
            continue;
        }

        const value = Number(raw);
        if (!Number.isFinite(value)) {
            errors.push(`${path} must be a number`);
            continue;
        }
        if (value < spec.min || value > spec.max) {
            errors.push(`${path} must be between ${spec.min} and ${spec.max}`);
            continue;
        }

        accepted[path] = value;
    }

    if (errors.length > 0) return { ok: false, errors };

    // Cross-field checks. Individually valid numbers can still describe an
    // engine that cannot work - a regress threshold above the advance one would
    // make a single score count as both.
    const existing = (await RuleConfig.findOne({ key: 'active' }).lean())?.values || {};
    const next = { ...existing };
    for (const [path, value] of Object.entries(accepted)) {
        if (value === null) delete next[path];
        else next[path] = value;
    }

    const effective = merge(next).flat;

    if (effective['progression.regressAt'] >= effective['progression.advanceAt']) {
        return {
            ok: false,
            errors: [
                `progression.regressAt (${effective['progression.regressAt']}) must be below ` +
                    `progression.advanceAt (${effective['progression.advanceAt']})`
            ]
        };
    }

    if (effective['difficulty.heuristicEasyBelow'] >= effective['difficulty.heuristicMediumBelow']) {
        return {
            ok: false,
            errors: [
                `difficulty.heuristicEasyBelow must be below difficulty.heuristicMediumBelow`
            ]
        };
    }

    await RuleConfig.updateOne(
        { key: 'active' },
        { $set: { values: next, updatedAt: new Date(), note: String(note || '').slice(0, 500) } },
        { upsert: true }
    );

    await refresh();
    return { ok: true, values: snapshot.values, sources: snapshot.sources };
}

/** Drop every stored override. Env and defaults take over again. */
async function reset() {
    await RuleConfig.updateOne(
        { key: 'active' },
        { $set: { values: {}, updatedAt: new Date(), note: 'reset' } },
        { upsert: true }
    );
    await refresh();
    return snapshot.values;
}

/** The effective values plus where each came from, for the read endpoint. */
function describe() {
    rules();
    return {
        values: snapshot.values,
        sources: snapshot.sources,
        schema: Object.fromEntries(
            Object.entries(SCHEMA).map(([path, spec]) => [
                path,
                {
                    default: spec.default,
                    env: spec.env,
                    min: spec.min,
                    max: spec.max,
                    describe: spec.describe
                }
            ])
        )
    };
}

/** Test seam: install a snapshot without touching the database. */
function __setForTests(flat) {
    snapshot = merge(flat || {});
    loadedAt = Date.now();
}

module.exports = { SCHEMA, TTL_MS, rules, refresh, update, reset, describe, __setForTests };
