export const CONFIG = {
    CODE_COACH_API_URL: import.meta.env.VITE_CODE_COACH_API_URL || '/code-coach-api/api/v1',
    GAMIFICATION_API_URL: import.meta.env.VITE_GAMIFICATION_API_URL || 'http://localhost:3000/api/v1',
    AUTH_TOKEN_STORAGE_KEY: 'accessToken',
    REFRESH_TOKEN_STORAGE_KEY: 'refreshToken',
    LEARNING_SESSION_STORAGE_KEY: 'learningSessionId',
    USER_PROFILE_STORAGE_KEY: 'userProfile',
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
