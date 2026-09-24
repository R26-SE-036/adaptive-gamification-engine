const mongoose = require('mongoose');
const crypto = require('crypto');
const { 
    GAME_TYPES, 
    CONCEPT_TAGS, 
    ERROR_TYPES, 
    DIFFICULTY_LEVELS,
    GAME_SESSION_STATUSES
} = require('../config/constants');

// Owned by Gamification Engine
const GameSessionSchema = new mongoose.Schema({
    gameSessionId: { type: String, unique: true, default: () => crypto.randomUUID() },
    userId: { type: String, required: true, index: true },
    learningSessionId: { type: String, required: true, index: true },
    gameType: { type: String, enum: GAME_TYPES, required: true },
    conceptTag: { type: String, enum: CONCEPT_TAGS, required: true, index: true },
    errorType: { type: String, enum: ERROR_TYPES },

    // WHICH question was played.
    //
    // The session recorded the concept, the format and the level but never the
    // question itself, so nothing downstream could tell two rounds apart. The
    // repeat-avoidance in routes/gamification.js reads this to stop serving a
    // question the student has just seen, and without it that query excluded
    // nothing at all - silently, because an absent field simply yields no ids.
    //
    // It is also the only way to answer "how hard is question X" once a cohort
    // has played, which is what would let difficulty labels be measured rather
    // than authored.
    questionId: { type: String, index: true },
    difficultyLevel: { type: String, enum: DIFFICULTY_LEVELS, required: true },
    score: { type: Number, default: 0 },
    // How many wrong attempts. Real when errorCountMeasured is true: the
    // student checked answers via POST /game/check and this counts the ones
    // this server graded wrong. False means the old binary - one answer, so
    // 0 or 1 - which is a floor, not a count. The adaptation rules need to be
    // able to tell the difference before they read `errorCount > n`.
    errorCount: { type: Number, default: 0 },
    errorCountMeasured: { type: Boolean, default: false },
    attemptCount: { type: Number, default: 1 },
    // Hints taken. Real when hintUsageMeasured is true: the server handed each
    // one over through POST /game/hint and counted it. False means the client
    // reported it, which it could previously choose freely - hints shipped
    // inside the question payload, so all three could be read without the count
    // ever moving.
    hintUsage: { type: Number, default: 0 },
    hintUsageMeasured: { type: Boolean, default: false },
    timeTakenSeconds: { type: Number, default: 0 },
    traceAccuracy: { type: Number, min: 0, max: 1 },
    status: { type: String, enum: GAME_SESSION_STATUSES, default: 'completed' },

    // Was this difficulty served at random rather than chosen by the policy?
    //
    // The difficulty model can only learn what happens at levels it observes.
    // If every session is played at the level the current rule picked, the
    // corpus can never say what would have happened at another one, and a model
    // fitted on it re-learns the rule that produced it. difficultyService.js
    // therefore serves a random level a fraction of the time; these are the rows
    // that carry information the policy did not already contain.
    wasExploratory: { type: Boolean, default: false },

    // Where this row came from. 'real' is a person playing; 'simulated' is a
    // generated session (from a local seeder, since deleted); 'test' is manual
    // API poking.
    // backend/ml/training_data.py drops everything that is not 'real' before
    // fitting, so a seeded database cannot silently become a research result.
    dataSource: { type: String, enum: ['real', 'simulated', 'test'], default: 'real', index: true },

    /**
     * Why this round must not be read as evidence about the student.
     *
     * ===================== PROVENANCE IS NOT VALIDITY =====================
     * `dataSource` says WHO produced a row. This says whether the row means
     * what it appears to mean. They are different questions and a row can fail
     * the second while passing the first: a real student really did play these
     * rounds, so they are `real` and always will be - but 17 of the 20 Drag &
     * Drop questions in the bank at the time were defective. Eight had answers
     * that could not be reached, so passing was impossible; nine were the
     * identity permutation, so the starting arrangement already scored 100.
     *
     * A round lost to an unwinnable question is recorded as a student failing.
     * That is not a missing observation, it is a WRONG one, and a wrong label
     * is worse for a model than no label - it teaches that this student cannot
     * do this concept at this level, and the difficulty engine then keeps them
     * down there on the strength of it.
     *
     * Null means the row counts. A string is both the flag and the audit trail:
     * nothing is deleted, the reason travels with the row, and anyone can see
     * what was excluded and why.
     */
    invalidatedReason: { type: String, default: null, index: true },

    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: Date.now }
}, { collection: 'gameSessions' });

GameSessionSchema.index({ userId: 1, conceptTag: 1, completedAt: -1 });

/**
 * The predicate for "this round counts", as a match fragment.
 *
 * Exported as one object rather than written out at each call site because
 * there are eight of them - the feature builder, the progression rule, the
 * format chooser, the support rules, the recommender, repeat-avoidance and two
 * analysis scripts - and a filter that has to be remembered in eight places is
 * a filter that will be missing from one of them. Spread it into an aggregate's
 * $match; use the `evidence()` static for a find.
 */
GameSessionSchema.statics.COUNTS_AS_EVIDENCE = Object.freeze({ invalidatedReason: null });

/**
 * Sessions that count as evidence about a student.
 *
 * Use this rather than `.find()` anywhere the result feeds a decision, a
 * feature, or a reported number. `.find()` is still correct for a migration or
 * an audit, which needs to see the excluded rows too - so this is a separate
 * method rather than a hook that would silently hide them from everything.
 */
GameSessionSchema.statics.evidence = function evidence(match = {}) {
    return this.find({ ...match, invalidatedReason: null });
};

module.exports = mongoose.model('GameSession', GameSessionSchema);
