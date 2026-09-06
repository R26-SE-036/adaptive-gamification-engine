const mongoose = require('mongoose');

// The enum below used to restate the list. Two copies meant adding a game
// type in constants.js left this schema silently rejecting it.
const { GAME_TYPES } = require('../config/constants');

// Schema for Gamification Questions
const QuestionBankSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    errorType: { type: String, required: true },
    conceptTag: { type: String, required: true },
    difficulty: { type: String, required: true },
    gameType: { type: String, required: true, enum: GAME_TYPES },
    codeLines: { type: [String], required: true },
    buggyLineIndex: { type: Number },
    correctAnswer: { type: mongoose.Schema.Types.Mixed, required: true },
    hints: { type: [String] },
    explanation: { type: String }
}, { collection: 'questionBank' });

module.exports = mongoose.model('QuestionBank', QuestionBankSchema);
