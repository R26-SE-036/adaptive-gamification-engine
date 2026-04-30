const mongoose = require('mongoose');

// CORRECTION 7: Add LearningEvent model
const LearningEventSchema = new mongoose.Schema({
  eventType: { type: String, required: true },
  userId: { type: String, required: true },
  learningSessionId: { type: String, required: true },
  sourceComponent: { type: String, default: "gamification" },
  payload: {
    gameType: String,
    conceptTag: String,
    score: Number,
    difficultyLevel: String,
    hintUsage: Number
  },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'learningEvents' });

module.exports = mongoose.model('LearningEvent', LearningEventSchema);
