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
 * The net effect was an adaptive-difficulty engine whose difficulty came from a
 * five-line if/else. (1) is fixed in .gitignore, (3) is fixed below, and this
 * module fixes (2) by being callable from the game route as well as the
 * endpoint — so starting a game actually consults the model.
 *
 * Keeping it in one module rather than inlining it in both callers is the point:
 * the feature vector here must stay identical to the one the model was trained
 * on (see ml-service/retrain_from_db.py). Two copies would drift, and a model
 * served different features than it was trained on fails quietly rather than
 * loudly — it just gets worse.
 * =============================================================================
 */

const axios = require('axios');

const GameSession = require('../models/GameSession');
const { getStrugglingConcepts } = require('./codeCoachClient');

const ML_SERVICE_URL =
    process.env.ML_SERVICE_URL || process.env.FLASK_ML_URL || 'http://127.0.0.1:5000';
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 5000);

/**
 * The exact feature order the model was fitted on, from retrain_from_db.py.
 * Named here so a change on either side is visible as a change to this list.
 */
const FEATURE_NAMES = [
    'avg_score',
    'avg_attempts',
    'avg_hint_usage',
    'avg_time_seconds',
    'repeat_error_count',
    'games_played'
];

/**
 * Build the model's feature vector for one student on one concept.
 *
 * Local history supplies the four averages; Code Coach supplies the struggle
 * count, because Code Coach owns diagnostics and this service deliberately keeps
 * no copy of them.
 */
async function buildFeatures({ userId, conceptTag, accessToken }) {
    const pastSessions = await GameSession.find({ userId, conceptTag });
    const gamesPlayed = pastSessions.length;

    // Defaults describe a median student, not a zero one. A first-time player
    // with avg_score 0 looks identical to someone failing everything, and the
    // model would pin them to Easy forever.
    let avgScore = 50;
    let avgAttempts = 1;
    let avgHintUsage = 0;
    let avgTimeSeconds = 60;

    if (gamesPlayed > 0) {
        const mean = (pick) =>
            pastSessions.reduce((sum, session) => sum + pick(session), 0) / gamesPlayed;

        avgScore = mean((s) => s.score || 0);
        avgAttempts = mean((s) => s.attemptCount || 1);
        avgHintUsage = mean((s) => s.hintUsage || 0);
        avgTimeSeconds = mean((s) => s.timeTakenSeconds || 0);
    }

    // Unresolved occurrences of this concept. `active_count` is Code Coach's
    // name for what a local query would have called status != resolved.
    let repeatErrorCount = 0;
    try {
        const struggles = await getStrugglingConcepts(accessToken);
        const match = struggles.find((s) => s.concept_tag === conceptTag);
        repeatErrorCount = match ? match.active_count ?? match.repeat_count ?? 0 : 0;
    } catch (error) {
        // Code Coach being unreachable must not block a game from starting. The
        // feature degrades to 0, which biases the prediction harder, so say so
        // rather than letting it look like a student with no struggles.
        console.warn(
            `[difficulty] Code Coach unreachable while building features for ` +
                `concept=${conceptTag}; repeat_error_count defaulted to 0. ${error.message}`
        );
    }

    return {
        avg_score: avgScore,
        avg_attempts: avgAttempts,
        avg_hint_usage: avgHintUsage,
        avg_time_seconds: avgTimeSeconds,
        repeat_error_count: repeatErrorCount,
        games_played: gamesPlayed
    };
}

/**
 * The pre-ML rule, kept as the fallback for when the ML service is down.
 *
 * It is not a second opinion and must not be read as one — it exists so a
 * student can still play during an outage.
 */
function heuristicDifficulty(features) {
    if (features.repeat_error_count >= 5 || features.avg_score < 45) return 'Easy';
    if (features.repeat_error_count >= 2 || features.avg_score < 75) return 'Medium';
    return 'Hard';
}

/**
 * Choose a difficulty for this student on this concept.
 *
 * Always resolves — never throws — because the caller is on the path of a
 * student trying to start a game.
 *
 * @returns {Promise<{difficulty: string, source: 'model'|'heuristic',
 *                    confidence: number|null, features: object, reason?: string}>}
 *   `source` is part of the contract, not debug output: a caller that reports
 *   "adaptive difficulty" to a student should be able to tell whether a model
 *   actually chose it. It is also what makes the silent-fallback bug this file
 *   documents impossible to reintroduce unnoticed.
 */
async function predictDifficulty({ userId, conceptTag, accessToken }) {
    const features = await buildFeatures({ userId, conceptTag, accessToken });

    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict`,
            { ...features, conceptTag },
            { timeout: ML_TIMEOUT_MS }
        );

        const difficulty = response.data?.difficulty;
        if (!difficulty) {
            throw new Error('ML service returned no difficulty field');
        }

        return {
            difficulty,
            source: 'model',
            confidence: response.data?.confidence ?? null,
            features
        };
    } catch (error) {
        // Loudly. The whole reason the model went unnoticed for the life of the
        // project is that this substitution used to happen in silence.
        const detail = error.response
            ? `${error.response.status} ${JSON.stringify(error.response.data)}`
            : error.message;

        console.warn(
            `[difficulty] ML service did not answer (${ML_SERVICE_URL}/predict): ${detail}. ` +
                `Falling back to the heuristic for user=${userId} concept=${conceptTag}.`
        );

        return {
            difficulty: heuristicDifficulty(features),
            source: 'heuristic',
            confidence: null,
            features,
            reason: detail
        };
    }
}

module.exports = {
    FEATURE_NAMES,
    buildFeatures,
    heuristicDifficulty,
    predictDifficulty
};
