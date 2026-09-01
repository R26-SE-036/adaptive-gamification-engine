const mongoose = require('mongoose');

// Schema for Gamification Questions
const QuestionBankSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    errorType: { type: String, required: true },
    conceptTag: { type: String, required: true },
    difficulty: { type: String, required: true },
    gameType: { type: String, required: true, enum: ['BugHunt', 'DragDrop', 'CodeTrace'] },
    codeLines: { type: [String], required: true },
    buggyLineIndex: { type: Number },
    correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
    hints: { type: [String] },
    explanation: { type: String }
}, { collection: 'questionBank' });

module.exports = mongoose.model('QuestionBank', QuestionBankSchema);
