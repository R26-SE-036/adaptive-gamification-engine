import axios from 'axios';
import {
    CONFIG,
    clearAuthSession,
    formatApiError,
    getAuthToken,
    getRefreshToken,
    setAuthSession
} from '../config';

const codeCoachClient = axios.create({
    baseURL: CONFIG.CODE_COACH_API_URL,
    headers: { 'Content-Type': 'application/json' }
});

let refreshPromise = null;

async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const response = await axios.post(`${CONFIG.CODE_COACH_API_URL}/auth/refresh`, {
        refresh_token: refreshToken
    });

    const { tokens } = response.data;
    setAuthSession({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token
    });

    return tokens.access_token;
}

codeCoachClient.interceptors.request.use((requestConfig) => {
    const token = getAuthToken();
    if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
});

codeCoachClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const isAuthRoute = originalRequest?.url?.includes('/auth/login') ||
            originalRequest?.url?.includes('/auth/refresh');

        if (error.response?.status !== 401 || isAuthRoute || originalRequest._retry) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
            if (!refreshPromise) {
                refreshPromise = refreshAccessToken().finally(() => {
                    refreshPromise = null;
                });
            }

            const newToken = await refreshPromise;
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return codeCoachClient(originalRequest);
        } catch {
            clearAuthSession();
            window.dispatchEvent(new CustomEvent('auth:expired'));
            return Promise.reject(error);
        }
    }
);

export const codeCoachApi = {
    async login(email, password) {
        const response = await codeCoachClient.post('/auth/login', {
            identifier: email,
            password,
            client_name: CONFIG.CLIENT_NAME
        });
        return response.data;
    },

    async logout() {
        try {
            await codeCoachClient.post('/auth/logout');
        } catch {
            // Ignore logout failures; local session is still cleared.
        }
    },

    async getMe() {
        const response = await codeCoachClient.get('/auth/me');
        return response.data;
    },

    async createLearningSession() {
        const response = await codeCoachClient.post('/learning-sessions', {
            source_component: 'gamification',
            language: 'java',
            task_id: 'adaptive_practice'
        });
        return response.data;
    },

    async getRecommendations(limit = 5) {
        const response = await codeCoachClient.get('/gamification/me/recommendations', {
            params: { limit }
        });
        return response.data;
    },

    async getStrugglingConcepts(limit = 10) {
        const response = await codeCoachClient.get('/students/me/struggling-concepts', {
            params: { limit }
        });
        return response.data;
    },

    async recordAdaptationDecision(payload) {
        const response = await codeCoachClient.post('/gamification/me/adaptation-decisions', payload);
        return response.data;
    },

    async recordSessionResult(payload) {
        const response = await codeCoachClient.post('/gamification/me/session-results', payload);
        return response.data;
    }
};

export { formatApiError };
