/**
 * The contracts BETWEEN the services. Run against live processes.
 *
 *     npm run test:integration
 *
 * ========================= WHY THESE ARE SEPARATE =========================
 * `npm test` is hermetic - no network, no database, no services - and it must
 * stay that way, because a suite that needs four processes running is a suite
 * people stop running. These are a second command, and they are the only tests
 * in the project that can fail for a reason no unit test can see.
 *
 * ======================= WHAT UNIT TESTS CANNOT CATCH =======================
 * Every defect below shipped, and every one of them lives in the SPACE between
 * two services rather than inside either:
 *
 *   * The engine transmitted a summary to Study Guider after every round
 *     (FR-12) and nothing ever read it back. The write worked, the store
 *     filled up, and no screen in the platform showed it - so a transmission
 *     that silently stopped would have looked exactly the same.
 *   * The client did not echo `decisionId` on submit, so every outcome was
 *     joined to its decision by GUESSING, recorded as 'inferred'. The
 *     calibration script counts only 'echo' rows, so the component could
 *     measure nothing about itself while every individual service was fine.
 *   * The cold start reads a BKT estimate from Study Guider and depends on the
 *     exact field names in that response. Nothing here would fail if Study
 *     Guider renamed `probability_known`; students would just quietly stop
 *     being seeded.
 *
 * The unit suite covers all three components' rules and cannot see any of it.
 *
 * =========================== HOW THEY BEHAVE ===========================
 * Missing services or missing credentials SKIP, loudly and by name. They do not
 * pass. A green run with everything skipped says "skipped" in the output, which
 * is the honest report - silently passing when nothing was checked is the
 * failure mode these are supposed to protect against.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// Atlas is reached by SRV lookup, which fails on this network against the
// default resolver. Every other entry point applies the same override; a test
// that talks to the database needs it too.
require('../../config/dns').applyDnsOverride();

const CODE_COACH = (process.env.CODE_COACH_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const STUDY_GUIDER = (process.env.STUDY_GUIDER_URL || 'http://127.0.0.1:8010').replace(/\/+$/, '');
const ENGINE = `http://127.0.0.1:${process.env.PORT || 3002}`;

/**
 * A real student to act as.
 *
 * From the environment, never from source. These are live credentials for a
 * real account on a real Atlas cluster; a default in a committed file is a
 * password in the repository however harmless the account.
 */
const EMAIL = process.env.INTEGRATION_STUDENT_EMAIL;
const PASSWORD = process.env.INTEGRATION_STUDENT_PASSWORD;

/** The concept these tests play. Any of the fourteen works. */
const CONCEPT = process.env.INTEGRATION_CONCEPT || 'loop_boundaries';

const json = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
};

/** Is a service answering at all? Any HTTP status counts; a refusal does not. */
async function reachable(url) {
    try {
        await fetch(url, { signal: AbortSignal.timeout(3000) });
        return true;
    } catch {
        return false;
    }
}

// ── Preflight ────────────────────────────────────────────────────────────────
// Resolved once, before the tests, so each one can skip with a reason rather
// than fail with a connection error that says nothing about what is wrong.
const context = { token: null, userId: null, missing: [] };

test('the platform is up and we can act as a student', async (t) => {
    for (const [name, url] of [
        ['Code Coach', CODE_COACH],
        ['the gamification engine', ENGINE],
        ['Study Guider', STUDY_GUIDER]
    ]) {
        if (!(await reachable(url))) context.missing.push(`${name} (${url})`);
    }

    if (!EMAIL || !PASSWORD) {
        context.missing.push(
            'INTEGRATION_STUDENT_EMAIL / INTEGRATION_STUDENT_PASSWORD in backend/.env'
        );
    }

    if (context.missing.length > 0) {
        t.skip(`not runnable: ${context.missing.join(', ')}`);
        return;
    }

    const login = await json(`${CODE_COACH}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: EMAIL, password: PASSWORD })
    });

    assert.strictEqual(login.status, 200, `login failed: ${JSON.stringify(login.body)}`);

    context.token = login.body?.tokens?.access_token ?? login.body?.access_token;
    context.userId = login.body?.user?.user_id;

    assert.ok(context.token, 'no access token in the login response');
    assert.ok(context.userId, 'no user_id in the login response');
});

/** Skip the body of a test when the preflight did not complete. */
function requirePlatform(t) {
    if (!context.token) {
        t.skip(
            context.missing.length > 0
                ? `not runnable: ${context.missing.join(', ')}`
                : 'the preflight did not obtain a token'
        );
        return false;
    }
    return true;
}

const auth = () => ({ Authorization: `Bearer ${context.token}` });

// ── The identity boundary ────────────────────────────────────────────────────

test('the engine accepts a Code Coach token and resolves the same student', async (t) => {
    if (!requirePlatform(t)) return;

    // The engine holds no share of Code Coach's signing secret and verifies by
    // calling it. This is the contract that makes one login work across four
    // services, and it breaks silently: a signature check that stopped calling
    // Code Coach would still accept valid tokens while no longer noticing
    // revoked ones.
    const profile = await json(`${ENGINE}/api/v1/gamification/profile/${context.userId}`, {
        headers: auth()
    });

    assert.strictEqual(profile.status, 200, JSON.stringify(profile.body));
});

test('the engine refuses to serve one student another student data', async (t) => {
    if (!requirePlatform(t)) return;

    // :userId is in the PATH here rather than taken from the token, which is a
    // design this service is stuck with - so the comparison against the token's
    // owner is the only thing standing between a student and everyone else's
    // history. Worth a test that fails loudly rather than a code comment.
    const other = await json(
        `${ENGINE}/api/v1/gamification/game/user_someone_else/auto/${CONCEPT}/auto`,
        { headers: auth() }
    );

    assert.strictEqual(other.status, 403, `expected 403, got ${other.status}`);
});

// ── The game round, end to end ───────────────────────────────────────────────

test('a served question withholds everything the student is meant to earn', async (t) => {
    if (!requirePlatform(t)) return;

    const game = await json(
        `${ENGINE}/api/v1/gamification/game/${context.userId}/auto/${CONCEPT}/auto`,
        { headers: auth() }
    );

    assert.strictEqual(game.status, 200, JSON.stringify(game.body));

    // The answer and the hints used to ship inside the payload. Both were
    // readable in the network tab, and hints were therefore free while the
    // score charged 15 points each from a count the client reported about
    // itself. This asserts they are gone - a regression here is invisible to
    // the student and total for the data.
    assert.strictEqual(game.body.correctAnswer, undefined, 'correctAnswer was served');
    assert.strictEqual(game.body.explanation, undefined, 'explanation was served');
    assert.strictEqual(game.body.hints, undefined, 'hints were served');
    assert.strictEqual(typeof game.body.hintCount, 'number', 'hintCount is missing');

    // And the fields the client must send back, without which the engine cannot
    // join an outcome to the decision that produced it.
    assert.ok(game.body.id, 'no question id');
    assert.ok(game.body.difficultyChosenBy, 'no difficultyChosenBy');
    assert.ok('decisionId' in game.body, 'no decisionId field');
});

test('a finished round reaches Study Guider and can be read back', async (t) => {
    if (!requirePlatform(t)) return;

    // ================== THE ONE THAT WOULD HAVE CAUGHT IT ==================
    // FR-12's whole loop, across three services in one test: the engine serves
    // a game, grades it, and transmits a summary to the Progress Tracker, which
    // stores it and hands it back on a different endpoint entirely.
    //
    // Nothing short of this can see it. The engine's own tests pass with the
    // transmission removed; Study Guider's pass with nothing ever posted to it.
    const learningSessionId = `integration-${Date.now()}`;

    const game = await json(
        `${ENGINE}/api/v1/gamification/game/${context.userId}/auto/${CONCEPT}/auto`,
        { headers: auth() }
    );
    assert.strictEqual(game.status, 200, JSON.stringify(game.body));

    const submit = await json(`${ENGINE}/api/v1/gamification/game/submit`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: context.userId,
            learningSessionId,
            gameType: game.body.gameType,
            conceptTag: CONCEPT,
            questionId: game.body.id,
            // Deliberately wrong. The round has to be RECORDED, and whether the
            // student passed is beside the point - a test that had to answer
            // correctly would have to know the answer, which the endpoint above
            // has just been asserted not to reveal.
            selectedAnswer: '__integration_test_wrong_answer__',
            hintUsage: 0,
            timeTakenSeconds: 1,
            attemptCount: 1,
            decisionId: game.body.decisionId,
            wasExploratory: game.body.wasExploratory === true,
            // Marked so these rounds never reach a reported figure.
            dataSource: 'test'
        })
    });

    assert.strictEqual(submit.status, 200, JSON.stringify(submit.body));
    assert.strictEqual(typeof submit.body.score, 'number', 'no score returned');

    // The transmission is fire-and-forget by design - a student must get their
    // score whether or not Study Guider is well - so it is awaited by polling
    // rather than assumed to have completed by the time submit returned.
    const deadline = Date.now() + 10000;
    let found = null;

    while (Date.now() < deadline && !found) {
        const summaries = await json(`${STUDY_GUIDER}/api/games/me?limit=20`, {
            headers: auth()
        });

        if (summaries.status === 200 && summaries.body?.success) {
            found = (summaries.body.data || []).find(
                (row) => row.game_session_id === submit.body.gameSessionId
            );
        }

        if (!found) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    assert.ok(
        found,
        'the round was never readable from Study Guider - FR-12 transmission is broken'
    );
    assert.strictEqual(found.concept, CONCEPT);
});

test('the outcome is joined to its decision by echo, not by guessing', async (t) => {
    if (!requirePlatform(t)) return;

    // A decision is recorded when the game is served and resolved when the
    // student finishes. If the client does not echo the decisionId the engine
    // falls back to the most recent unresolved decision for that student and
    // concept, and records the link as 'inferred' - which the calibration
    // script excludes by default. The component then measures nothing while
    // appearing to work, which is exactly what it was doing.
    const mongoose = require('mongoose');
    const AdaptationDecision = require('../../models/AdaptationDecision');

    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI);
    }

    const latest = await AdaptationDecision.findOne({
        userId: context.userId,
        conceptTag: CONCEPT,
        outcomeAt: { $ne: null }
    })
        .sort({ outcomeAt: -1 })
        .lean();

    await mongoose.disconnect();

    assert.ok(latest, 'no resolved decision found for this student and concept');
    assert.strictEqual(
        latest.outcomeLinkedBy,
        'echo',
        'the outcome was linked by inference, so the client is not echoing decisionId'
    );
});

// ── The cold start's dependency on Study Guider ──────────────────────────────

test('Study Guider still answers mastery in the shape the cold start reads', async (t) => {
    if (!requirePlatform(t)) return;

    // services/coldStartService.js seeds a first game from these exact field
    // names. A rename on the Study Guider side would not fail anything - the
    // lookup would return undefined, every student would quietly open at
    // Beginner, and the feature would be gone with no error anywhere.
    const mastery = await json(`${STUDY_GUIDER}/api/progress/me/mastery`, { headers: auth() });

    assert.strictEqual(mastery.status, 200, JSON.stringify(mastery.body));
    assert.strictEqual(mastery.body?.success, true, 'mastery answered unsuccessfully');
    assert.ok(Array.isArray(mastery.body.data), 'mastery data is not a list');

    if (mastery.body.data.length === 0) {
        t.diagnostic('this student has no quiz history; only the envelope was checked');
        return;
    }

    const estimate = mastery.body.data[0];
    assert.strictEqual(typeof estimate.concept, 'string', 'concept is missing');
    assert.strictEqual(
        typeof estimate.probability_known,
        'number',
        'probability_known is missing - the cold start would silently stop seeding'
    );
    assert.strictEqual(typeof estimate.observations, 'number', 'observations is missing');
});

test('Code Coach still answers struggles in the shape the difficulty guard reads', async (t) => {
    if (!requirePlatform(t)) return;

    // The same class of dependency. `active_count` caps a struggling student to
    // the bottom of their band; if the field vanished the guard would read 0 and
    // stop protecting anybody, without erroring.
    const struggles = await json(
        `${CODE_COACH}/api/v1/students/me/struggling-concepts?limit=5`,
        { headers: auth() }
    );

    assert.strictEqual(struggles.status, 200, JSON.stringify(struggles.body));
    assert.ok(Array.isArray(struggles.body?.struggles), 'struggles is not a list');

    if (struggles.body.struggles.length === 0) {
        t.diagnostic('this student has no struggles recorded; only the envelope was checked');
        return;
    }

    const struggle = struggles.body.struggles[0];
    assert.strictEqual(typeof struggle.concept_tag, 'string', 'concept_tag is missing');
    assert.ok(
        typeof struggle.active_count === 'number' || typeof struggle.repeat_count === 'number',
        'neither active_count nor repeat_count is present - the difficulty guard reads these'
    );
});
