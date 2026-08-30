export const CONFIG = {
    CODE_COACH_API_URL: import.meta.env.VITE_CODE_COACH_API_URL || '/code-coach-api/api/v1',
    // 3002, not 3000 - PairPath's frontend owns 3000 and its API owns 3001.
    GAMIFICATION_API_URL: import.meta.env.VITE_GAMIFICATION_API_URL || 'http://localhost:3002/api/v1',

    // The shared Code Guru portal, and the flag that allows the localhost-only
    // login form instead of redirecting to it.
    PORTAL_URL: import.meta.env.VITE_PORTAL_URL || 'http://localhost:4200',
    DEV_LOGIN_FLAG: import.meta.env.VITE_ENABLE_DEV_LOGIN,

    // The `codeguru.` prefix is the platform's shared storage namespace, not a
    // local choice. The portal hands a session over by writing these exact keys
    // (see lib/codeguru-auth.js consumeHandoffFragment), so reading them here is
    // what lets a student arrive already signed in. They were 'accessToken' and
    // 'refreshToken', which the handoff would have written straight past.
    AUTH_TOKEN_STORAGE_KEY: 'codeguru.accessToken',
    REFRESH_TOKEN_STORAGE_KEY: 'codeguru.refreshToken',
    LEARNING_SESSION_STORAGE_KEY: 'codeguru.learningSessionId',
    USER_PROFILE_STORAGE_KEY: 'codeguru.user',
    CLIENT_NAME: 'code-guru-gamification'
};

function safeParseJwt(token) {
    if (!token || !token.includes('.')) return null;

    try {
        const payload = token.split('.')[1];
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

export function normalizeCodeCoachUser(authUser) {
    if (!authUser) return null;

    return {
        userId: authUser.user_id || authUser.userId,
        email: authUser.email,
        fullName: authUser.full_name || authUser.fullName,
        role: authUser.role || 'student',
        status: authUser.status
    };
}

export function extractUserIdFromClaims(claims) {
    if (!claims) return null;
    return claims.user_id || claims.userId || claims.id || claims.sub || null;
}

export function getAuthToken() {
    return window.localStorage.getItem(CONFIG.AUTH_TOKEN_STORAGE_KEY);
}

export function getRefreshToken() {
    return window.localStorage.getItem(CONFIG.REFRESH_TOKEN_STORAGE_KEY);
}

export function getRuntimeUserId() {
    return extractUserIdFromClaims(safeParseJwt(getAuthToken()));
}

export function getRuntimeLearningSessionId() {
    return window.localStorage.getItem(CONFIG.LEARNING_SESSION_STORAGE_KEY);
}

export function getStoredUserProfile() {
    const raw = window.localStorage.getItem(CONFIG.USER_PROFILE_STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setAuthSession({ accessToken, refreshToken, learningSessionId, user }) {
    if (accessToken) {
        window.localStorage.setItem(CONFIG.AUTH_TOKEN_STORAGE_KEY, accessToken);
    }

    if (refreshToken) {
        window.localStorage.setItem(CONFIG.REFRESH_TOKEN_STORAGE_KEY, refreshToken);
    }

    if (learningSessionId) {
        window.localStorage.setItem(CONFIG.LEARNING_SESSION_STORAGE_KEY, learningSessionId);
    }

    if (user) {
        window.localStorage.setItem(CONFIG.USER_PROFILE_STORAGE_KEY, JSON.stringify(user));
    }
}

export function clearAuthSession() {
    window.localStorage.removeItem(CONFIG.AUTH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(CONFIG.REFRESH_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(CONFIG.LEARNING_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(CONFIG.USER_PROFILE_STORAGE_KEY);
}

export function getRuntimeUser() {
    const stored = getStoredUserProfile();
    if (stored) return stored;

    const claims = safeParseJwt(getAuthToken());
    if (!claims) return null;

    return {
        userId: extractUserIdFromClaims(claims),
        email: claims.email || null,
        fullName: claims.full_name || claims.fullName || null,
        role: claims.role || 'student'
    };
}

export function isAuthenticated() {
    return Boolean(getAuthToken() && getRuntimeUserId());
}

/**
 * Human-readable name for a game type.
 *
 * Two vocabularies reach the UI: Code Coach recommends a kind of practice
 * (bug_hunt, loop_tracer, condition_debug, debug_challenge) and this engine
 * implements three games (BugHunt, DragDrop, CodeTrace). Either can arrive
 * here, and neither should be shown to a student raw - "Start loop_tracer
 * Practice" is an internal identifier leaking onto a button.
 */
const GAME_TYPE_LABELS = {
    bug_hunt: 'Bug Hunt',
    loop_tracer: 'Loop Trace',
    condition_debug: 'Condition Debug',
    debug_challenge: 'Debug Challenge',
    BugHunt: 'Bug Hunt',
    DragDrop: 'Code Ordering',
    CodeTrace: 'Code Trace'
};

export function formatGameType(gameType) {
    if (!gameType) return 'Practice';
    return GAME_TYPE_LABELS[gameType] || String(gameType).replace(/_/g, ' ');
}

export function mapStruggleLevelToBadge(struggleLevel) {
    const level = String(struggleLevel || '').toLowerCase();

    if (level.includes('critical') || level.includes('severe')) return 'critical';
    if (level.includes('high')) return 'hard';
    if (level.includes('moderate') || level.includes('medium')) return 'medium';
    return 'easy';
}

export function formatApiError(error) {
    const data = error?.response?.data;
    if (!data) return error?.message || 'Request failed';

    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
        return data.detail.map((item) => item.msg).join(', ');
    }

    return data.error || data.message || 'Request failed';
}
