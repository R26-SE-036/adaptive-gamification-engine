const mongoose = require('mongoose');

// Owned by Gamification Engine
const GameSessionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    learningSessionId: { type: String, required: true },
    gameType: { type: String, enum: ['BugHunt', 'DragDrop', 'CodeTrace'] },
    conceptTag: { type: String, enum: ['loop_boundaries', 'array_indexing', 'conditional_logic'] },
    errorType: { type: String, enum: ['OFF_BY_ONE_LOOP_BOUNDARY', 'ARRAY_LENGTH_INDEX_MISUSE', 'INCORRECT_CONDITIONAL_OPERATOR'] },
    difficultyLevel: { type: String, enum: ['Easy', 'Medium', 'Hard'] },
    score: { type: Number },
    attemptCount: { type: Number },
    hintUsage: { type: Number },
    timeTakenSeconds: { type: Number },
    completedAt: { type: Date, default: Date.now }
}, { collection: 'gameSessions' });

module.exports = mongoose.model('GameSession', GameSessionSchema);
