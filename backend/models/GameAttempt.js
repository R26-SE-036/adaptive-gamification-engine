const mongoose = require('mongoose');

/**
 * Every attempt a student makes at one question, graded but not final.
 *
 * ====================== WHY THIS EXISTS: THE ERROR COUNT ======================
 * `GameSession.errorCount` was set to `isCorrect ? 0 : 1`. It could never exceed
 * one, so the proposal's own adaptation rules could never fire:
 *
 *     IF score < 50 AND errorCount > 5 THEN decrease difficulty
 *
 * `> 5` was unreachable against a field whose maximum was 1. FR-04 lists error
 * count as one of the seven inputs the engine adapts on, and it was effectively
 * a duplicate of "did they pass".
 *
 * The reason it was binary is that the API only ever saw the FINAL answer. A
 * student could try six times in the browser and the server would learn about
 * one. `attemptCount` came from the client, which meant the engine's second
 * efficiency input was a number the client asserted about itself.
 *
 * CodeFix makes checking natural - the student types a line, asks whether it is
 * right, and tries again - so POST /game/check grades an attempt without ending
 * the session and writes it here. /game/submit then counts these rows instead of
 * trusting the payload, and both errorCount and attemptCount become measurements.
 *
 * ============================== SCOPE AND LIFETIME =============================
 * Keyed by (userId, learningSessionId, questionId): one document per question
 * per sitting. Replaying the same question in a later learning session starts a
 * new count, which is the reading that matches the question being asked - how
 * many tries did this attempt at this question take.
 *
 * These rows are working state, not history: GameSession is the permanent record
 * and carries the totals. `expiresAt` lets MongoDB remove them a day later so the
 * collection does not grow without bound.
 */
const GameAttemptSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, index: true },
        learningSessionId: { type: String, required: true },
        questionId: { type: String, required: true },

        // Every graded attempt, in order. The submitted answer is kept as well
        // as the verdict: "what did students type when they got it wrong" is a
        // question the write-up will want to answer, and it cannot be
        // reconstructed from a count.
        attempts: [
            {
                _id: false,
                answer: { type: mongoose.Schema.Types.Mixed },
                correct: { type: Boolean, required: true },
                at: { type: Date, default: Date.now }
            }
        ],

        // How many hints this student has taken on this question, and when.
        //
        // Hints used to be shipped inside the question payload, so every one was
        // free: a student could read all three in the network tab and still be
        // recorded as having used none. `hintUsage` came from the client, which
        // made the score - 100 minus 15 per hint - a number the client could
        // choose. They are handed out one at a time by POST /game/hint now, and
        // this is the record the score is computed from.
        hintsTaken: [
            {
                _id: false,
                index: { type: Number, required: true },
                at: { type: Date, default: Date.now }
            }
        ],

        createdAt: { type: Date, default: Date.now },

        // A day is far longer than any sitting and short enough that abandoned
        // ones do not accumulate. MongoDB deletes on this index, not the app.
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
            index: { expires: 0 }
        }
    },
    { collection: 'gameAttempts' }
);

// One document per question per sitting - the upsert in the check route relies
// on this, and without it a burst of clicks could create duplicates that split
// the count.
GameAttemptSchema.index(
    { userId: 1, learningSessionId: 1, questionId: 1 },
    { unique: true }
);

module.exports = mongoose.model('GameAttempt', GameAttemptSchema);
