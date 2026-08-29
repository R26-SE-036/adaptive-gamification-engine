import axios from 'axios';
import { CONFIG, getAuthToken } from '../config';

const apiClient = axios.create({
    baseURL: CONFIG.GAMIFICATION_API_URL,
    headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use((requestConfig) => {
    const token = getAuthToken();
    if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
});

export const apiService = {
    getProfile(userId) {
        return apiClient.get(`/gamification/profile/${userId}`);
    },

    getGame(userId, gameType, conceptTag, difficulty) {
        return apiClient.get(`/gamification/game/${userId}/${gameType}/${conceptTag}/${difficulty}`);
    },

    submitGame(payload) {
        return apiClient.post('/gamification/game/submit', payload);
    }
};
