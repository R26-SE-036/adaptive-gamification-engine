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
 * features. `ml/training_data.py` has the full account; the part that
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
const { currentLevel, permittedBand } = require('./progressionService');
const { DIFFICULTY_LEVELS } = require('../config/constants');

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

// The five levels, from config so this file and the ML service cannot disagree
// about what exists or in what order.
const DIFFICULTIES = DIFFICULTY_LEVELS;

/**
 * The history features, in the order ml/training_data.py lists them.
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

/** Matches SUCCESS_SCORE in ml/training_data.py. */
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
    return featuresFrom(
        await GameSession.find({ userId, conceptTag }).sort({ completedAt: 1 }).lean()
    );
}

/** The pure half, so a caller holding the sessions does not re-query for them. */
function featuresFrom(pastSessions) {
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
    if ((repeatErrorCount ?? 0) >= 5 || features.avg_score < 45) return 'Beginner';
    if ((repeatErrorCount ?? 0) >= 2 || features.avg_score < 75) return 'Intermediate';
    return 'Advanced';
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
    // The sessions are loaded once and used twice - by the feature builder and
    // by the progression rule. Two queries for the same rows would have doubled
    // the slowest local part of a decision already over its NFR-01 budget.
    const sessionsPromise = GameSession.find({ userId, conceptTag })
        .sort({ completedAt: 1 })
        .lean();

    // In parallel, because they are independent and both are remote: the
    // features come from MongoDB Atlas and the struggle count from Code Coach.
    // Awaited one after the other they cost the sum of two round trips, which on
    // a measured run was 123ms + 556ms against an NFR-01 budget of 200ms for the
    // whole decision. Overlapping them does not meet that budget on its own -
    // see docs/proposal-gap-analysis.md - but paying for the slower call twice
    // was pure waste.
    const [sessions, repeatErrorCount] = await Promise.all([
        sessionsPromise,
        fetchRepeatErrorCount({ conceptTag, accessToken })
    ]);

    const features = featuresFrom(sessions);

    // -- Where the dual-threshold rule says this student is -------------------
    // FR-08. The rule owns progression; the model chooses within the band it
    // permits. See services/progressionService.js for why they are split.
    const progression = currentLevel(sessions);
    const band = permittedBand(progression);

    // ── Cold start ────────────────────────────────────────────────────────────
    if (features.games_played === 0) {
        // "All students start at the Beginner level" - the proposal, section 4.1.
        // This used to consult the heuristic and could open at the middle level,
        // which is a worse first experience and is not what was specified.
        return {
            difficulty: progression.level,
            source: 'cold_start',
            confidence: null,
            features,
            repeatErrorCount,
            progression,
            wasExploratory: false,
            reason: progression.reason
        };
    }

    // ── Exploration ───────────────────────────────────────────────────────────
    // Before consulting the model, so the choice is genuinely independent of it.
    if (EXPLORATION_RATE > 0 && Math.random() < EXPLORATION_RATE) {
        // Random WITHIN THE BAND, not across all five. Exploring the whole
        // ladder would hand a Beginner an Expert game one time in seven, which
        // is not a corpus improvement worth that experience - and it would make
        // the stability FR-08 asks for a fiction.
        const difficulty = band[Math.floor(Math.random() * band.length)];
        return {
            difficulty,
            source: 'exploration',
            confidence: null,
            features,
            repeatErrorCount,
            progression,
            wasExploratory: true,
            reason:
                `Exploratory: served at random from ${band.join('/')} (rate ` +
                `${EXPLORATION_RATE}) so the corpus contains outcomes this policy ` +
                `would not have chosen.`
        };
    }

    try {
        const response = await axios.post(
            `${ML_SERVICE_URL}/predict`,
            { ...features, conceptTag, candidates: band },
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
        const floor = band[0];
        if ((repeatErrorCount ?? 0) >= 5 && difficulty !== floor) {
            guard =
                `capped to ${floor}: ${repeatErrorCount} unresolved struggles on this ` +
                `concept`;
            difficulty = floor;
        }

        // The model must not leapfrog the progression rule. It is asked only
        // about the band, so this should never fire - but a service answering
        // outside the set it was given is exactly the kind of drift that went
        // unnoticed here before, and silently accepting it would undo FR-08.
        if (!band.includes(difficulty)) {
            console.warn(
                `[difficulty] ML service answered ${difficulty}, outside the permitted ` +
                    `band ${band.join('/')}. Falling back to ${progression.level}.`
            );
            guard = `ML answered outside the permitted band; using ${progression.level}`;
            difficulty = progression.level;
        }

        return {
            difficulty,
            source: 'model',
            progression,
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
            // Clamped into the band: with the ML service down, the progression
            // rule alone decides, which is exactly the engine the proposal
            // describes. The heuristic only refines within what it permits.
            difficulty: band.includes(heuristicDifficulty(features, repeatErrorCount))
                ? heuristicDifficulty(features, repeatErrorCount)
                : progression.level,
            source: 'heuristic',
            confidence: null,
            features,
            repeatErrorCount,
            progression,
            wasExploratory: false,
            reason: detail
        };
    }
}

module.exports = {
    FEATURE_NAMES,
    featuresFrom,
    SUCCESS_SCORE,
    EXPLORATION_RATE,
    buildFeatures,
    fetchRepeatErrorCount,
    heuristicDifficulty,
    predictDifficulty
};
