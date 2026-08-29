const mongoose = require('mongoose');

// CORRECTION 6: Read-only model owned by Code Coach team
const LearningSessionSchema = new mongoose.Schema({
    learningSessionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    sourceComponent: { type: String },
    taskId: { type: String },
    language: { type: String, default: 'java' },
    status: { type: String, default: 'active' },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    lastAnalysisAt: { type: Date, default: null }
}, { collection: 'learningSessions' });

module.exports = mongoose.model('LearningSession', LearningSessionSchema);
