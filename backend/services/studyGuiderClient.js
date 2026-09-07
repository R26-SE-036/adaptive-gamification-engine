/**
 * Sending a finished round to Study Guider, the Progress Tracker.
 *
 * ============================ WHAT FR-12 ASKS FOR ============================
 *     "The system shall transmit a performance summary to the external Progress
 *      Tracker component via a defined REST API after every session."
 *
 * "The system" being this engine. What actually happened was that the WEB PAGE
 * posted the result to Code Coach once the game finished, so the data arrived -
 * but only because a browser chose to send it. Close the tab at the wrong
 * moment, lose the network for a second, or write a second client, and the
 * Progress Tracker silently never hears about the round. This engine had no
 * code that talked to it at all.
 *
 * ========================= HOW THE BOUNDARY IS KEPT =========================
 * The STUDENT'S OWN token is forwarded, taken from the request that finished the
 * game. That matters more than it looks:
 *
 *   * Study Guider authenticates it exactly as it does every other request, by
 *     asking Code Coach. There is no service account, no shared secret, and no
 *     second way into that service.
 *   * The student in the token is the student the summary is filed under, so
 *     this engine cannot write a round against anybody else. Identity is not
 *     ours to assert.
 *   * The dependency runs one way. Study Guider never calls back here.
 *
 * ============================== NEVER BLOCKING ==============================
 * A student who has just finished a game must get their score. Study Guider
 * being slow, down, or misconfigured is not their problem, so this is fired
 * without being awaited and every failure is swallowed after a warning.
 *
 * That is a deliberate trade: the summary can be lost. It is the same guarantee
 * the browser gave, made from a place that at least always runs - and losing a
 * summary costs a row in a secondary store, while blocking the response costs
 * the student the round they just played.
 */

const axios = require('axios');

const STUDY_GUIDER_URL = process.env.STUDY_GUIDER_URL || 'http://127.0.0.1:8010';
const TIMEOUT_MS = Number(process.env.STUDY_GUIDER_TIMEOUT_MS || 5000);

/**
 * A shorter budget for the one call that a student WAITS on.
 *
 * Sending a summary is fire-and-forget, so five seconds costs nobody anything.
 * Reading mastery happens while a student is waiting for their first game to
 * load, so the timeout is the longest that read may delay it. Two and a half
 * seconds is generous for a local call and short enough that a hung Study
 * Guider costs a noticeable pause rather than an abandoned page.
 */
const READ_TIMEOUT_MS = Number(process.env.STUDY_GUIDER_READ_TIMEOUT_MS || 2500);

/**
 * Whether to send at all.
 *
 * Off by an explicit `STUDY_GUIDER_SUMMARIES=off` rather than by the URL being
 * unset, because an unset URL should mean "use the default", not "silently stop
 * transmitting" - a silent stop is exactly the failure this file exists to fix.
 */
const ENABLED = String(process.env.STUDY_GUIDER_SUMMARIES || 'on').toLowerCase() !== 'off';

/**
 * Send one completed round. Resolves to true when it was accepted.
 *
 * @param {object} args
 * @param {string} args.accessToken  the student's own token, forwarded
 * @param {object} args.summary      the shape Study Guider's /api/games/summary takes
 */
async function sendGameSummary({ accessToken, summary }) {
    if (!ENABLED) return false;

    if (!accessToken) {
        // Without the student's token there is no way to file the summary
        // against them, and this service has no credential of its own by
        // design. Worth a warning rather than a silent skip: it means an
        // authenticated route reached here without carrying its authorization.
        console.warn('[study-guider] No access token on the request; summary not sent.');
        return false;
    }

    try {
        await axios.post(`${STUDY_GUIDER_URL}/api/games/summary`, summary, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: TIMEOUT_MS
        });
        return true;
    } catch (error) {
        const detail = error.response
            ? `${error.response.status} ${JSON.stringify(error.response.data)}`
            : error.message;

        // Loudly, and with the session id, so a missing summary can be traced
        // to the round it belonged to rather than merely noticed as a gap.
        console.warn(
            `[study-guider] Could not transmit the summary for session ` +
                `${summary?.game_session_id}: ${detail}`
        );
        return false;
    }
}

/** Build the wire shape from a saved GameSession document. */
function summaryFrom(session, extra = {}) {
    return {
        game_session_id: session.gameSessionId,
        concept_tag: session.conceptTag,
        game_type: session.gameType,
        difficulty_level: session.difficultyLevel,
        score: session.score,
        error_count: session.errorCount,
        hint_usage: session.hintUsage,
        attempt_count: session.attemptCount,
        time_taken_seconds: session.timeTakenSeconds,
        // Provenance travels with the numbers. Study Guider cannot otherwise
        // tell a counted error from the 0/1 flag the old path recorded.
        error_count_measured: Boolean(session.errorCountMeasured),
        hint_usage_measured: Boolean(session.hintUsageMeasured),
        was_exploratory: Boolean(session.wasExploratory),
        data_source: session.dataSource,
        played_at: (session.completedAt || new Date()).toISOString?.()
            ?? new Date().toISOString(),
        ...extra
    };
}

module.exports = { STUDY_GUIDER_URL, ENABLED, sendGameSummary, summaryFrom };


/**
 * ======================= READING BACK: THE COLD START =======================
 * Everything above sends. This reads, and it is the only place this engine asks
 * another component what it knows about a student.
 *
 * The problem it solves: a student who has ground through Study Guider's quizzes
 * on `loop_boundaries` until BKT puts their mastery at 0.9 still gets handed a
 * Beginner game the first time they play one, because this engine's evidence is
 * its own GameSession rows and there are none. The platform knows; this
 * component just was not asking.
 *
 * Two things keep that honest:
 *
 *   * It is used ONLY for the first game on a concept. Once this engine has its
 *     own observations they are better evidence about games than a quiz score
 *     is, and the seeded level survives only through the session it produced.
 *   * It is NOT a model feature. Adding it to the feature vector would repeat
 *     the exact defect ml/training_data.py documents: a value the serve path can
 *     read live and the training path can only invent, because Study Guider
 *     stores the CURRENT belief and not what it was last Tuesday.
 */

/** Cached mastery, keyed by token. See the struggle cache for the same reasoning. */
const MASTERY_CACHE_TTL_MS = Number(process.env.MASTERY_CACHE_TTL_MS || 60_000);
const masteryCache = new Map();

/**
 * GET /api/progress/me/mastery - this student's per-concept BKT estimates.
 *
 * Returns a Map of concept -> estimate, or null when Study Guider could not
 * answer. NULL AND EMPTY MEAN DIFFERENT THINGS and the caller must keep them
 * apart: an empty map is "this student has done no quizzes", which is evidence,
 * while null is "we do not know", which is not.
 *
 * Never throws. A student starting their first game must not be blocked by
 * another component being down.
 */
async function getMastery(accessToken) {
    if (!accessToken) return null;

    const cached = masteryCache.get(accessToken);
    if (cached && cached.expiresAt > Date.now()) return cached.mastery;

    try {
        const response = await axios.get(`${STUDY_GUIDER_URL}/api/progress/me/mastery`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: READ_TIMEOUT_MS
        });

        // Study Guider answers 200 with { success: false, error } when Neo4j is
        // unreachable, rather than a 5xx. Treating that as an empty map would
        // turn "the graph is down" into "this student knows nothing", which is
        // the difference between no seed and a wrong one.
        if (response.data?.success !== true) {
            console.warn(
                `[study-guider] Mastery unavailable: ${response.data?.error || 'unsuccessful response'}`
            );
            return null;
        }

        const mastery = new Map();
        for (const estimate of response.data.data || []) {
            if (estimate?.concept) mastery.set(estimate.concept, estimate);
        }

        if (masteryCache.size > 512) masteryCache.clear();
        masteryCache.set(accessToken, { mastery, expiresAt: Date.now() + MASTERY_CACHE_TTL_MS });

        return mastery;
    } catch (error) {
        const detail = error.response
            ? `${error.response.status} ${JSON.stringify(error.response.data)}`
            : error.message;
        console.warn(`[study-guider] Could not read mastery: ${detail}`);
        return null;
    }
}

/**
 * One concept's estimate, or null when it is unknown or unreachable.
 *
 * The concept vocabulary is shared - both services key on the same fourteen
 * tags, from Code Coach's knowledge base - so this is a direct lookup and not a
 * fuzzy match. A tag missing from the map means the student has attempted no
 * quizzes on it.
 */
async function getConceptMastery(accessToken, conceptTag) {
    const mastery = await getMastery(accessToken);
    if (!mastery) return null;
    return mastery.get(conceptTag) ?? null;
}

/** Drop a student's cached mastery. */
function forgetMastery(accessToken) {
    masteryCache.delete(accessToken);
}

module.exports.READ_TIMEOUT_MS = READ_TIMEOUT_MS;
module.exports.MASTERY_CACHE_TTL_MS = MASTERY_CACHE_TTL_MS;
module.exports.getMastery = getMastery;
module.exports.getConceptMastery = getConceptMastery;
module.exports.forgetMastery = forgetMastery;
