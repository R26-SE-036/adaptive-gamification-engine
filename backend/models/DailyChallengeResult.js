const mongoose = require('mongoose');

/**
 * A player's one counted attempt at a day's challenge.
 *
 * Unique per player per day: the first submission is the one that ranks and
 * earns double XP. Playing it again is allowed - it is still a good question -
 * but it is ordinary practice from then on.
 */
const DailyChallengeResultSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    // Local day, YYYY-MM-DD.
    day: { type: String, required: true },
    questionId: { type: String, required: true },
    gameSessionId: { type: String, default: null },
    score: { type: Number, required: true },
    timeTakenSeconds: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    completedAt: { type: Date, default: Date.now }
}, { collection: 'dailyChallengeResults' });

DailyChallengeResultSchema.index({ userId: 1, day: 1 }, { unique: true });
DailyChallengeResultSchema.index({ day: 1, score: -1, timeTakenSeconds: 1 });

module.exports = mongoose.model('DailyChallengeResult', DailyChallengeResultSchema);
