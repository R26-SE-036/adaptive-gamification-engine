const mongoose = require('mongoose');

const PlayerProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    totalScore: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    lastGamePlayedAt: { type: Date, default: null },
    badges: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }
}, { collection: 'playerProfiles' });

module.exports = mongoose.model('PlayerProfile', PlayerProfileSchema);
