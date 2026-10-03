const mongoose = require('mongoose');

/**
 * A player's standing in the reward loop. Owned by the Gamification Engine.
 *
 * Everything here is a REWARD, derived from rounds the engine graded itself -
 * never evidence about the student. The adaptive engine reads GameSession and
 * nothing on this document, so a bonus or a badge cannot feed back into the
 * difficulty model.
 */
const PlayerProfileSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },

    // The sum of round scores. Kept because older clients read it; the reward
    // loop runs on `xp`.
    totalScore: { type: Number, default: 0 },

    // No default on purpose. A profile written before XP existed has no `xp`,
    // and the first time it is touched it is seeded from totalScore - so a
    // student who had played before does not start again from level 1. A
    // default of 0 would make that profile indistinguishable from a new one.
    xp: { type: Number },

    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    // Streak shields: each covers one missed day. See rewards/progression.js.
    streakFreezes: { type: Number, default: 0 },
    lastGamePlayedAt: { type: Date, default: null },

    // The three concept badges from before achievements existed. Kept, and
    // still awarded, so nobody loses one.
    badges: { type: [String], default: [] },

    achievements: {
        type: [{ id: String, unlockedAt: Date, _id: false }],
        default: []
    },

    // Which weekly quests have paid out, so a quest pays once.
    questRewards: {
        type: [{ week: String, questId: String, at: Date, _id: false }],
        default: []
    },

    // How the player appears on leaderboards: first name and last initial,
    // taken from the sign-in token. Hidden players still rank, as "Anonymous
    // coder", so turning it off never changes anyone else's position.
    displayName: { type: String, default: null },
    showOnLeaderboard: { type: Boolean, default: true },

    createdAt: { type: Date, default: Date.now }
}, { collection: 'playerProfiles' });

PlayerProfileSchema.index({ xp: -1 });

module.exports = mongoose.model('PlayerProfile', PlayerProfileSchema);
