const mongoose = require('mongoose');

/**
 * One grant of XP, and why.
 *
 * The profile holds the running total; this holds the history, which is what
 * a WEEKLY leaderboard needs - "XP earned this week" cannot be read off a
 * total. It also makes every point auditable: a total that looks wrong can be
 * re-added from here.
 */
const XpEventSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    // round | achievement | quest
    reason: { type: String, required: true },
    // The round's gameSessionId, the achievement id or the quest id.
    ref: { type: String, default: null },
    // Local week (its Monday, YYYY-MM-DD) and day, from rewards/calendar.js.
    week: { type: String, required: true },
    day: { type: String, required: true },
    at: { type: Date, default: Date.now }
}, { collection: 'xpEvents' });

XpEventSchema.index({ week: 1, userId: 1 });
XpEventSchema.index({ userId: 1, at: -1 });

module.exports = mongoose.model('XpEvent', XpEventSchema);
