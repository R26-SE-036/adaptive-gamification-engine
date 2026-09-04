/**
 * Adaptive difficulty: the one place this engine decides how hard a game should be.
 *
 * ============================ WHY THIS FILE EXISTS ============================
 * The Random Forest had never run in the product.
 *
 * Three separate things had to be true for it to work, and none of them were:
 *
 *   1. `model.pkl` was gitignored, so it never reached a checkout or an image.
 *      The ML service answered every /predict with 500 "Model not trained yet".
 *   2. The route that called /predict — POST /predict-difficulty — had no caller.
 *      The frontend read a difficulty straight off Code Coach's recommendation
 *      and passed it through in the game URL.
 *   3. When /predict failed, the route returned a hand-written heuristic with a
 *      `fallback: true` flag and logged nothing, so the substitution was silent.
 *
 * (1) is fixed in .gitignore, (3) is fixed below, and this module fixes (2) by
 * being callable from the game route as well as the endpoint.
 *
 * ======================= AND WHY IT WAS REWRITTEN AGAIN =======================
 * Once the model did run, it was answering the wrong question with leaked
 * features. `ml-service/training_data.py` has the full account; the part that
 * shows up here is that this file used to send `games_played` — the real number
 * of past sessions, 0 for a newcomer and rising with use — to a model trained
 * where games_played=1 meant Easy and 4 meant Hard. The engine pushed a student
 * toward Hard the longer they played, largely regardless of how they did.
 *
 * The model now predicts P(success | history, difficulty), the ML service scores
 * all three difficulties, and a stated policy chooses. The feature vector below
 * is history only: every value describes sessions that finished BEFORE the one
 * being chosen, so there is no way for the answer to appear in the question.
 * =============================================================================
 */

const axios = require('axios');

const GameSession = require('../models/GameSession');
const { getStrugglingConcepts } = require('./codeCoachClient');

const ML_SERVICE_URL =
    process.env.ML_SERVICE_URL || process.env.FLASK_ML_URL || 'http://127.0.0.1:5000';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 5000);

/**
 * How often to serve a difficulty the policy would NOT have chosen.
 *
 * Without this the corpus only ever contains outcomes at the difficulty the
 * current rule picked, so it can never answer "what would have happened at the
 * other level" — and a model fitted on it just re-learns the rule that produced
 * it. That is the circularity the rewrite exists to break, and exploration is
 * the only thing that breaks it. Every exploratory session is stamped so the
 * model card can report what share of the corpus is free of the policy's
 * influence.
 *
 * 0.15 trades a slightly worse-fitting game roughly one time in seven for a
 * corpus that can eventually support a causal claim. Set to 0 to disable.
 */
const EXPLORATION_RATE = Number(
    process.env.DIFFICULTY_EXPLORATION_RATE !== undefined
        ? process.env.DIFFICULTY_EXPLORATION_RATE
        : 0.15
);

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

/**
 * The history features, in the order ml-service/training_data.py lists them.
 * Named here so a change on either side shows up as a change to this list —
 * a model served different features than it was trained on does not fail, it
 * just quietly gets worse.
 */
const FEATURE_NAMES = [
    'games_played',
    'avg_score',
    'avg_attempts',
    'avg_hint_usage',
    'avg_time_seconds',
    'recent_score',
    'success_rate'
];

/** Matches SUCCESS_SCORE in ml-service/training_data.py. */
const SUCCESS_SCORE = Number(process.env.SUCCESS_SCORE || 70);

/**
 * Build the model's feature vector for one student on one concept.
 *
 * Everything here is computed from sessions that have already finished. There
 * are no defaults for a student with no history: `games_played` is 0 and the
 * caller takes the cold-start path, because inventing a median student and
 * calling the result a prediction is how the previous version got its numbers.
 */
async function buildFeatures({ userId, conceptTag }) {
    const pastSessions = await GameSession.find({ userId, conceptTag })
        .sort({ completedAt: 1 })
        .lean();

    const gamesPlayed = pastSessions.length;

    if (gamesPlayed === 0) {
        return {
            games_played: 0,
            avg_score: 0,
            avg_attempts: 0,
            avg_hint_usage: 0,
            avg_time_seconds: 0,
            recent_score: 0,
            success_rate: 0
        };
    }

    const mean = (pick) =>
        pastSessions.reduce((sum, session) => sum + (pick(session) || 0), 0) / gamesPlayed;

    const successes = pastSessions.filter((s) => (s.score || 0) >= SUCCESS_SCORE).length;

    return {
        games_played: gamesPlayed,
        avg_score: mean((s) => s.score),
        avg_attempts: mean((s) => s.attemptCount ?? 1),
        avg_hint_usage: mean((s) => s.hintUsage),
        avg_time_seconds: mean((s) => s.timeTakenSeconds),
        recent_score: pastSessions[gamesPlayed - 1].score || 0,
        success_rate: successes / gamesPlayed
    };
}

/**
 * Unresolved occurrences of this concept, from Code Coach.
 *
 * Deliberately NOT a model feature. Code Coach stores the CURRENT state of its
 * remediation triggers, not a history of it, so there is no way to reconstruct
 * what this number was at the moment of a session last week. Training on a
 * value the serve path can measure and the training path can only invent is the
 * exact defect being removed. It is used below as a stated guard instead, which
 * claims to have learned nothing.
 */
async function fetchRepeatErrorCount({ conceptTag, accessToken }) {
    try {
        const struggles = await getStrugglingConcepts(accessToken);
        const match = struggles.find((s) => s.concept_tag === conceptTag);
        return match ? match.active_count ?? match.repeat_count ?? 0 : 0;
    } catch (error) {
        console.warn(
            `[difficulty] Code Coach unreachable while checking struggles for ` +
                `concept=${conceptTag}; the guard is skipped. ${error.message}`
        );
        return null;
    }
}

/**
 * The pre-ML rule, kept as the fallback for when the ML service is down and as
 * the cold-start choice for a student with no history on a concept.
 *
 * It is not a second opinion and must not be read as one — it exists so a
 * student can still play, and so a first game has a defensible starting point.
 */
function heuristicDifficulty(features, repeatErrorCount = 0) {
    if ((repeatErrorCount ?? 0) >= 5 || features.avg_score < 45) return 'Easy';
    if ((repeatErrorCount ?? 0) >= 2 || features.avg_score < 75) return 'Medium';
    return 'Hard';
}

/**
 * Choose a difficulty for this student on this concept.
 *
 * Always resolves — never throws — because the caller is on the path of a
 * student trying to start a game.
 *
 * @returns {Promise<{difficulty: string, source: 'model'|'heuristic'|'cold_start'|'exploration',
 *                    confidence: number|null, features: object, wasExploratory: boolean,
 *                    predictedSuccess?: object, reason?: string}>}
 *   `source` is part of the contract, not debug output: a caller that reports
 *   "adaptive difficulty" to a student should be able to tell whether a model
 *   actually chose it. It is also what makes the silent-fallback bug this file
 *   documents impossible to reintroduce unnoticed.
 */
async function predictDifficulty({ userId, conceptTag, accessToken }) {
    const features = await buildFeatures({ userId, conceptTag });
    const repeatErrorCount = await fetchRepeatErrorCount({ conceptTag, accessToken });

    // ── Cold start ────────────────────────────────────────────────────────────
    if (features.games_played === 0) {
        return {
            difficulty: heuristicDifficulty({ avg_score: 50 }, repeatErrorCount),
            source: 'cold_start',
            confidence: null,
            features,
            repeatErrorCount,
            wasExploratory: false,
            reason: 'No sessions on this concept yet, so there is no history to read.'
        };
    }

    // ── Exploration ───────────────────────────────────────────────────────────
    // Before consulting the model, so the choice is genuinely independent of it.
    if (EXPLORATION_RATE > 0 && Math.random() < EXPLORATION_RATE) {
        const difficulty = DIFFICULTIES[Math.floor(Math.random() * DIFFICULTIES.length)];
        return {
            difficulty,
            source: 'exploration',
            confidence: null,
            features,
            repeatErrorCount,
            wasExploratory: true,
            reason:
                `Exploratory: served at random (rate ${EXPLORATION_RATE}) so the corpus ` +
                `contains outcomes this policy would not have chosen.`
        };
    }

    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict`,
            { ...features, conceptTag },
            { timeout: ML_TIMEOUT_MS }
        );

        let difficulty = response.data?.difficulty;
        if (!difficulty) {
            throw new Error('ML service returned no difficulty field');
        }

        // ── The one guard the model cannot apply for itself ───────────────────
        // A student with several unresolved struggles on this concept should not
        // be handed Hard on the strength of past game scores. Stated here rather
        // than buried in weights, and reported so a capped choice is visible.
        let guard;
        if ((repeatErrorCount ?? 0) >= 5 && difficulty !== 'Easy') {
            guard = `capped to Easy: ${repeatErrorCount} unresolved struggles on this concept`;
            difficulty = 'Easy';
        }

        return {
            difficulty,
            source: 'model',
            confidence: response.data?.confidence ?? null,
            predictedSuccess: response.data?.predicted_success ?? null,
            policy: response.data?.policy ?? null,
            reportable: response.data?.reportable ?? false,
            features,
            repeatErrorCount,
            wasExploratory: false,
            reason: guard
        };
    } catch (error) {
        // Loudly. The whole reason the model went unnoticed for the life of the
        // project is that this substitution used to happen in silence.
        const detail = error.response
            ? `${error.response.status} ${JSON.stringify(error.response.data)}`
            : error.message;

        console.warn(
            `[difficulty] ML service did not answer usefully (${ML_SERVICE_URL}/predict): ` +
                `${detail}. Falling back to the heuristic for user=${userId} concept=${conceptTag}.`
        );

        return {
            difficulty: heuristicDifficulty(features, repeatErrorCount),
            source: 'heuristic',
            confidence: null,
            features,
            repeatErrorCount,
            wasExploratory: false,
            reason: detail
        };
    }
}

module.exports = {
    FEATURE_NAMES,
    SUCCESS_SCORE,
    EXPLORATION_RATE,
    buildFeatures,
    fetchRepeatErrorCount,
    heuristicDifficulty,
    predictDifficulty
};
