const mongoose = require('mongoose');
const { SOURCE_COMPONENT, LEARNING_EVENT_TYPES } = require('../config/constants');

const crypto = require('crypto');

// CORRECTION 7: Add LearningEvent model
const LearningEventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, default: () => crypto.randomUUID() },
  eventType: { type: String, required: true, enum: LEARNING_EVENT_TYPES, index: true },
  userId: { type: String, required: true, index: true },
  learningSessionId: { type: String, required: true, index: true },
  sourceComponent: { type: String, default: SOURCE_COMPONENT },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'learningEvents' });

LearningEventSchema.index({ userId: 1, learningSessionId: 1, eventType: 1, createdAt: -1 });

module.exports = mongoose.model('LearningEvent', LearningEventSchema);
