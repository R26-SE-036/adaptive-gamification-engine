/**
 * The only place the gamification backend talks to Code Coach.
 *
 * Code Coach is the platform's identity provider and the owner of every
 * struggle signal. Two jobs live here:
 *
 *   1. verifyToken()  - turn the bearer token a browser sent into a verified
 *      user. This service cannot check the signature itself: it has no share of
 *      Code Coach's secret, and sessions are revocable server-side, so a valid
 *      signature is not the same as a live session.
 *
 *   2. getStrugglingConcepts() - the real per-concept struggle data. This used
 *      to be read from a local `CodeDiagnostic` collection that nothing ever
 *      populated except a seed script full of invented errors, while the
 *      frontend read the same numbers live from Code Coach. Two sources of
 *      truth that were guaranteed to disagree.
 *
 * The student's own token is forwarded rather than a service account, so
 * authorization comes free: every `me` endpoint resolves to the user that token
 * belongs to, and this service cannot read another student's data even by
 * accident.
 */

const axios = require('axios');

const CODE_COACH_URL = (process.env.CODE_COACH_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.CODE_COACH_TIMEOUT_MS || 10000);
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS || 60000);

/**
 * A call to Code Coach failed.
 *
 * `status` is the upstream HTTP status, or 503 when the request never got
 * there. Callers must keep these apart: a 401 means the token is genuinely no
 * good, while an unreachable Code Coach means "try again later". Reporting the
 * second as the first logs students out over someone else's downtime.
 */
class CodeCoachError extends Error {
    constructor(message, status = 503) {
        super(message);
        this.name = 'CodeCoachError';
        this.status = status;
    }
}

/**
 * Verified tokens, cached briefly.
 *
 * Without this every request pays a network round trip to Code Coach before it
 * can do anything, and the dashboard alone makes several. The TTL is the whole
 * trade: a signed-out token keeps working for at most this long.
 */
const tokenCache = new Map();

function cacheGet(token) {
    const entry = tokenCache.get(token);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
        tokenCache.delete(token);
        return null;
    }
    return entry.user;
}

function cacheSet(token, user) {
    // Bounded, so a burst of distinct tokens cannot grow this without limit.
    // Sessions are few here; clearing outright is simpler than an LRU and costs
    // only a round trip for tokens that were about to expire anyway.
    if (tokenCache.size > 512) tokenCache.clear();

    tokenCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

/**
 * Struggling concepts, cached briefly.
 *
 * ============================ WHY THIS MATTERS =============================
 * Token verification was cached and this was not, and this is the expensive
 * one. Measured on the difficulty decision:
 *
 *     the Random Forest making its prediction        7 ms
 *     reading the student's history from Atlas     123 ms
 *     asking Code Coach for the struggle count     556 ms   <- uncached
 *     total                                        639 ms
 *
 * NFR-01 budgets 200 ms for the whole decision. The single largest cost in it
 * was a call being made in full on every game, for a number that changes only
 * when the student writes code - which they are not doing while playing one.
 *
 * The TTL is the trade, and it is a mild one: a struggle resolved in the editor
 * takes up to this long to affect the difficulty guard. That guard exists to
 * stop a struggling student being handed a hard game, and being slightly slow
 * to notice they have STOPPED struggling errs in the safe direction.
 *
 * Keyed by token rather than by user id because that is what the caller has.
 * The token already identifies one student, and a re-issued token simply misses
 * the cache once.
 */
const STRUGGLE_CACHE_TTL_MS = Number(process.env.STRUGGLE_CACHE_TTL_MS || 30_000);

const struggleCache = new Map();

function struggleCacheKey(token, limit) {
    return `${token}::${limit}`;
}

function struggleCacheGet(key) {
    const entry = struggleCache.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
        struggleCache.delete(key);
        return null;
    }
    return entry.struggles;
}

function struggleCacheSet(key, struggles) {
    if (struggleCache.size > 512) struggleCache.clear();
    struggleCache.set(key, { struggles, expiresAt: Date.now() + STRUGGLE_CACHE_TTL_MS });
}

/**
 * Drop a student's cached struggles.
 *
 * Called when this engine does something that could change them, so the next
 * decision sees the new state rather than waiting out the TTL.
 */
function forgetStruggles(token) {
    for (const key of struggleCache.keys()) {
        if (key.startsWith(`${token}::`)) struggleCache.delete(key);
    }
}

function detailFrom(error) {
    const data = error?.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    return error?.message || 'Code Coach request failed';
}

async function request(method, path, accessToken, options = {}) {
    try {
        const response = await axios({
            method,
            url: CODE_COACH_URL + path,
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: TIMEOUT_MS,
            ...options
        });
        return response.data;
    } catch (error) {
        const status = error?.response?.status;
        if (status) throw new CodeCoachError(detailFrom(error), status);

        // No response at all: DNS failure, connection refused, timeout.
        throw new CodeCoachError(
            `Cannot reach Code Coach at ${CODE_COACH_URL}: ${error.message}`,
            503
        );
    }
}

/**
 * GET /api/v1/auth/me - the verified user behind this token.
 * Throws CodeCoachError(401) when the token is invalid, expired or revoked.
 */
async function verifyToken(accessToken) {
    const cached = cacheGet(accessToken);
    if (cached) return cached;

    const payload = await request('get', '/api/v1/auth/me', accessToken);
    const user = payload?.user;

    if (!user?.user_id) {
        throw new CodeCoachError('Code Coach returned an unexpected /auth/me body', 502);
    }

    cacheSet(accessToken, user);
    return user;
}

/**
 * GET /api/v1/students/me/struggling-concepts
 *
 * Returns Code Coach's per-concept struggle analysis for the token's owner:
 * concept_tag, repeat_count, active_count, struggle_score, struggle_level and
 * the recommended action.
 */
async function getStrugglingConcepts(accessToken, limit = 20) {
    const key = struggleCacheKey(accessToken, limit);

    const cached = struggleCacheGet(key);
    if (cached) return cached;

    const payload = await request('get', '/api/v1/students/me/struggling-concepts', accessToken, {
        params: { limit }
    });

    const struggles = payload?.struggles || [];
    struggleCacheSet(key, struggles);
    return struggles;
}

/** Drop a cached token (used on sign-out). */
function forgetToken(accessToken) {
    tokenCache.delete(accessToken);
    forgetStruggles(accessToken);
}

module.exports = {
    CODE_COACH_URL,
    STRUGGLE_CACHE_TTL_MS,
    CodeCoachError,
    verifyToken,
    getStrugglingConcepts,
    forgetStruggles,
    forgetToken
};
