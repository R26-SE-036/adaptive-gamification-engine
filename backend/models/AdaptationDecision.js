const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * Every adaptation decision the engine makes, and how it turned out.
 *
 * ============================ WHY THIS EXISTS ============================
 * The engine computed a great deal and then threw all of it away. Choosing a
 * difficulty produced a source, a confidence, a predicted success probability
 * for every level in the permitted band, the progression rule's verdict and its
 * reason - and none of it was stored. The student got a game; the decision that
 * produced it left no trace.
 *
 * That cost two things.
 *
 * 1. NOTHING COULD BE MEASURED. NFR-03 asks for 85% decision accuracy, and
 *    there was no record of what had been decided to check anything against.
 *    With this, the question becomes answerable - and answerable in a better
 *    form than "accuracy":
 *
 *        of the rounds where the model predicted a 70% chance of success,
 *        what share actually succeeded?
 *
 *    That is CALIBRATION, and it is the standard way to evaluate a model that
 *    outputs probabilities. A classifier can be 85% "accurate" while being
 *    systematically overconfident; calibration catches that and accuracy does
 *    not. dev_tools/calibration.js computes it from these rows.
 *
 * 2. NOTHING COULD BE EXPLAINED. A student asking "why was I given this?" a day
 *    later had no answer, because the reason existed only for the length of one
 *    request.
 *
 * ========================= HOW THE OUTCOME IS LINKED =========================
 * The decision is made when a game is FETCHED and the outcome is known when it
 * is SUBMITTED, so the two have to be joined. The fetch returns `decisionId` and
 * the client echoes it back on submit.
 *
 * A client that does not echo it - anything written before this existed - falls
 * back to the most recent unresolved decision for that student and concept.
 * `outcomeLinkedBy` records which route was taken, because a calibration figure
 * computed over guessed links would be worth less than one that says how many
 * of its rows were guessed.
 */
const AdaptationDecisionSchema = new mongoose.Schema(
    {
        decisionId: { type: String, unique: true, default: () => crypto.randomUUID() },

        userId: { type: String, required: true, index: true },
        conceptTag: { type: String, required: true, index: true },

        // ── What was decided ────────────────────────────────────────────────
        difficulty: { type: String, required: true },
        gameType: { type: String },

        /**
         * Which mechanism chose it: 'model', 'heuristic', 'cold_start',
         * 'exploration' or 'requested'.
         *
         * Load-bearing for any claim about the model. A calibration figure that
         * silently included heuristic and cold-start rows would be measuring
         * the if/else, which is exactly the confusion this whole component has
         * had to be dug out of once already.
         */
        source: { type: String, required: true, index: true },

        /** The model's confidence in the level it chose, when a model chose. */
        confidence: { type: Number, default: null },

        /**
         * P(success) for every level the model was asked about, as
         * { Beginner: 0.81, Elementary: 0.62, ... }.
         *
         * The whole distribution rather than only the chosen level, because the
         * counterfactual is the interesting part: what the model thought would
         * happen at the levels it did not serve is what the exploration rows
         * eventually let us check.
         */
        predictedSuccess: { type: mongoose.Schema.Types.Mixed, default: null },

        /** The levels the progression rule permitted the model to choose from. */
        permittedBand: { type: [String], default: [] },

        // ── Why ─────────────────────────────────────────────────────────────
        progressionLevel: { type: String },
        progressionPrevious: { type: String },
        progressionMoved: { type: String, default: null },
        reason: { type: String, default: '' },

        /** Unresolved Code Coach findings at the moment of the decision. */
        repeatErrorCount: { type: Number, default: null },

        /**
         * For a cold start, what the opening level was seeded from:
         * 'study_guider', 'code_coach', or 'default' for the plain Beginner.
         *
         * Separated from `reason`, which is prose for a student, because this is
         * the thing an evaluation has to GROUP BY. "Do students seeded from
         * quiz mastery pass their first game at the same rate as students who
         * started at Beginner" is the question that says whether seeding was a
         * good idea, and it cannot be asked of a sentence.
         */
        coldStartSource: { type: String, default: null, index: true },

        /**
         * The evidence behind the seed, as it stood at the moment of the
         * decision - the mastery probability, how many observations it rested
         * on, and any cap applied.
         *
         * Stored rather than re-read for the same reason `features` is: Study
         * Guider holds the CURRENT belief, so by the time anybody evaluates this
         * decision the number that produced it is gone.
         */
        coldStartEvidence: { type: mongoose.Schema.Types.Mixed, default: null },

        /**
         * The feature vector the model was given.
         *
         * Stored so a prediction can be reproduced later. Without it, a row
         * saying "the model said 0.7" cannot be checked against the model that
         * said it, and a refit silently invalidates every past decision.
         */
        features: { type: mongoose.Schema.Types.Mixed, default: null },

        /** Which model produced it, from the model card's trained_at. */
        modelVersion: { type: String, default: null },

        /** Was the model asked about a level it had never been fitted on? */
        extrapolated: { type: [String], default: [] },

        wasExploratory: { type: Boolean, default: false, index: true },

        // ── How it turned out ───────────────────────────────────────────────
        // Null until the student finishes the round. A decision with no outcome
        // is an abandoned game, which is itself worth being able to count.
        outcomeScore: { type: Number, default: null },
        outcomeSuccess: { type: Boolean, default: null },
        outcomeAt: { type: Date, default: null },
        gameSessionId: { type: String, default: null },
        questionId: { type: String, default: null },

        /** 'echo' when the client returned the decisionId, 'inferred' otherwise. */
        outcomeLinkedBy: { type: String, default: null },

        decidedAt: { type: Date, default: Date.now, index: true }
    },
    { collection: 'adaptationDecisions' }
);

// The lookup the fallback link performs: this student, this concept, no outcome
// yet, most recent first.
AdaptationDecisionSchema.index({ userId: 1, conceptTag: 1, outcomeAt: 1, decidedAt: -1 });

module.exports = mongoose.model('AdaptationDecision', AdaptationDecisionSchema);
