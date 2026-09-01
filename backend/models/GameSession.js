const mongoose = require('mongoose');
const crypto = require('crypto');
const { 
    GAME_TYPES, 
    CONCEPT_TAGS, 
    ERROR_TYPES, 
    DIFFICULTY_LEVELS,
    GAME_SESSION_STATUSES
} = require('../config/constants');

// Owned by Gamification Engine
const GameSessionSchema = new mongoose.Schema({
    gameSessionId: { type: String, unique: true, default: () => crypto.randomUUID() },
    userId: { type: String, required: true, index: true },
    learningSessionId: { type: String, required: true, index: true },
    gameType: { type: String, enum: GAME_TYPES, required: true },
    conceptTag: { type: String, enum: CONCEPT_TAGS, required: true, index: true },
    errorType: { type: String, enum: ERROR_TYPES },
    difficultyLevel: { type: String, enum: DIFFICULTY_LEVELS, required: true },
    score: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    attemptCount: { type: Number, default: 1 },
    hintUsage: { type: Number, default: 0 },
    timeTakenSeconds: { type: Number, default: 0 },
    traceAccuracy: { type: Number, min: 0, max: 1 },
    status: { type: String, enum: GAME_SESSION_STATUSES, default: 'completed' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: Date.now }
}, { collection: 'gameSessions' });

GameSessionSchema.index({ userId: 1, conceptTag: 1, completedAt: -1 });

module.exports = mongoose.model('GameSession', GameSessionSchema);
