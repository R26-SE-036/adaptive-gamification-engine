import axios from 'axios';
import { CONFIG } from '../config';

// Create an axios instance
const apiClient = axios.create({
    baseURL: CONFIG.API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        // In reality, this would dynamically get the JWT from local storage.
        // Using a mock auth token for development
        'Authorization': `Bearer MOCK_JWT_TOKEN_HERE`
    }
});

// CORRECTION 9: Central API service layer
export const apiService = {
    getProfile(userId) {
        return apiClient.get(`/gamification/profile/${userId}`);
    },

    getDashboard(userId) {
        return apiClient.get(`/gamification/dashboard/${userId}`);
    },

    predictDifficulty(userId, conceptTag) {
        return apiClient.post('/gamification/predict-difficulty', { userId, conceptTag });
    },

    getGame(userId, gameType, conceptTag, difficulty) {
        return apiClient.get(`/gamification/game/${userId}/${gameType}/${conceptTag}/${difficulty}`);
    },

    submitGame(payload) {
        return apiClient.post('/gamification/game/submit', payload);
    }
};
