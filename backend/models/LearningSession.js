const mongoose = require('mongoose');

// CORRECTION 6: Read-only model owned by Code Coach team
const LearningSessionSchema = new mongoose.Schema({
    learningSessionId: { type: String, required: true },
    userId: { type: String, required: true },
    taskId: { type: String },
    sourceComponent: { type: String }
}, { collection: 'learningSessions' });

module.exports = mongoose.model('LearningSession', LearningSessionSchema);
