const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const GameSession = require('../models/GameSession');
const PlayerProfile = require('../models/PlayerProfile');
const QuestionBank = require('../models/QuestionBank');
const GameAttempt = require('../models/GameAttempt');
const { predictDifficulty } = require('../services/difficultyService');
const { recommendNextGame } = require('../services/recommendationService');
const { gradeAnswer } = require('../services/gradingService');
const { chooseGameType } = require('../services/gameTypeService');
const { recommendSupport } = require('../services/supportService');
const { sendGameSummary, summaryFrom } = require('../services/studyGuiderClient');
const ruleConfig = require('../services/ruleConfigService');
const AdaptationDecision = require('../models/AdaptationDecision');
const { permittedBand } = require('../services/progressionService');

/**
 * How many of a student's recent rounds on a concept are checked before serving
 * another question from it.
 *
 * Six is a little over one pass of a five-question slot, so a student works
 * through what exists before anything comes round again. Higher would exhaust
 * the smaller slots and fall back to repeating anyway, just after a longer
 * query.
 */
const RECENT_QUESTION_MEMORY = Number(process.env.RECENT_QUESTION_MEMORY || 6);
const { CONCEPT_GAME_MAPPING, GAME_TYPES, DIFFICULTY_LEVELS, DIFFICULTY_ALIASES,
        nearestDifficulty } = require('../config/constants');

function getAuthenticatedUserId(req) {
    return req.user?.user_id || req.user?.userId || req.user?.id || req.user?.sub || null;
}

/**
 * You may only ever touch your own data.
 *
 * This used to grant a bypass to roles named 'admin', 'supervisor' and
 * 'lecturer'. None of them could exist: Code Coach hardcoded every account to
 * 'student' and had no path to create anything else - so the branch had never
 * been true, and never could be, while reading as though privileged access was
 * a supported feature of the service.
 *
 * The platform is now student-only by decision, not by omission. Roles are gone
 * from Code Coach's user records and from its tokens entirely, so there is no
 * claim left to bypass with.
 */
function assertUserAccess(req, userId) {
    const authenticatedUserId = getAuthenticatedUserId(req);

    return Boolean(authenticatedUserId) && authenticatedUserId === userId;
}

// ALL routes protected by JWT
router.use(authMiddleware);

// GET /api/v1/gamification/dashboard/:userId was here.
//
// Deleted: nothing called it. It read struggling concepts from Code Coach and
// mapped each to a game type, which is exactly what the dashboard already does
// for itself against Code Coach directly. Keeping a second, slower path to the
// same numbers only created somewhere for them to disagree.

// POST /api/v1/gamification/predict-difficulty
//
// The explicit form of what the game route now does on its own. Kept because it
// is useful to ask for a prediction without starting a game - and because the
// response says which engine answered.
router.post('/predict-difficulty', async (req, res) => {
    try {
        const { userId, conceptTag } = req.body;

        if (!userId || !conceptTag) {
            return res.status(400).json({ error: 'userId and conceptTag are required' });
        }

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot predict for another user' });
        }

        const prediction = await predictDifficulty({
            userId,
            conceptTag,
            accessToken: req.accessToken
        });

        return res.json({
            predictedDifficulty: prediction.difficulty,
            source: prediction.source,
            confidence: prediction.confidence,
            // Preserved for callers written against the old shape, which only
            // ever signalled the heuristic and never named it.
            fallback: prediction.source === 'heuristic'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to predict difficulty' });
    }
});

// GET /api/v1/gamification/game/:userId/:gameType/:conceptTag/:difficulty
router.get('/game/:userId/:gameType/:conceptTag/:difficulty', async (req, res) => {
    try {
        const { userId, gameType, conceptTag, difficulty } = req.params;

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot fetch another user game' });
        }
        
        // Resolve the requested game type to one this engine actually implements.
        //
        // Code Coach recommends a KIND of practice using its own vocabulary
        // (bug_hunt, loop_tracer, condition_debug, debug_challenge), and the
        // frontend passes that straight through in the URL. The question bank is
        // keyed by THIS engine's own types, so an unresolved value matched
        // nothing: the query fell through to the concept-only fallback, which
        // ignores difficulty and returns a game of a different type than the URL
        // claims. That is why games appeared but the UI rendered wrong.
        //
        // An unresolved value used to become CONCEPT_GAME_MAPPING[conceptTag] -
        // a fixed lookup, one format per concept, which is precisely why FR-09
        // could not be satisfied. It now goes through the chooser, which reads
        // how this student has done in each format the bank can serve for this
        // concept. See services/gameTypeService.js.
        let resolvedGameType = GAME_TYPES.includes(gameType) ? gameType : null;
        let gameTypeChosenBy = 'requested';
        let gameTypeReason = null;

        if (!resolvedGameType) {
            const choice = await chooseGameType({ userId, conceptTag });
            resolvedGameType = choice.gameType;
            gameTypeChosenBy = choice.rule;
            gameTypeReason = choice.reason;
        }

        // Difficulty needs the same treatment: Code Coach says 'beginner' /
        // 'intermediate', the bank stores Easy / Medium / Hard.
        let resolvedDifficulty = DIFFICULTY_LEVELS.includes(difficulty)
            ? difficulty
            : DIFFICULTY_ALIASES[String(difficulty || '').toLowerCase()];

        // This is where the Random Forest earns its place in the product.
        //
        // Ask for 'auto' and the model picks, from this student's own history on
        // this concept plus their unresolved struggle count from Code Coach. An
        // unrecognised value takes the same path rather than falling through to
        // a question of arbitrary difficulty, which is what used to happen.
        //
        // A caller that names a level still gets that level: a student choosing
        // "Hard" deliberately should not be quietly overridden by a model that
        // disagrees.
        let difficultyChosenBy = 'requested';
        let difficultyConfidence = null;
        let difficultyWasExploratory = false;
        let difficultyReason = null;

        // Recorded so the decision can later be checked against what happened.
        // Null when the caller NAMED a level: there is no adaptation decision to
        // evaluate in that case, and storing one would put rows the engine did
        // not choose into a measurement of how well the engine chooses.
        let decisionId = null;

        if (!resolvedDifficulty) {
            const prediction = await predictDifficulty({
                userId,
                conceptTag,
                accessToken: req.accessToken
            });
            resolvedDifficulty = prediction.difficulty;
            difficultyChosenBy = prediction.source;
            difficultyConfidence = prediction.confidence;
            difficultyWasExploratory = prediction.wasExploratory === true;
            difficultyReason = prediction.reason || prediction.progression?.reason || null;

            // Best effort: a student waiting for a game must not lose it
            // because an analytics write failed.
            try {
                const decision = await AdaptationDecision.create({
                    userId,
                    conceptTag,
                    difficulty: prediction.difficulty,
                    gameType: resolvedGameType,
                    source: prediction.source,
                    confidence: prediction.confidence ?? null,
                    predictedSuccess: prediction.predictedSuccess ?? null,
                    permittedBand: prediction.progression
                        ? permittedBand(prediction.progression)
                        : [],
                    progressionLevel: prediction.progression?.level,
                    progressionPrevious: prediction.progression?.previousLevel,
                    progressionMoved: prediction.progression?.moved ?? null,
                    reason: prediction.reason || prediction.progression?.reason || '',
                    repeatErrorCount: prediction.repeatErrorCount ?? null,
                    coldStartSource: prediction.progression?.evidence?.source ?? null,
                    coldStartEvidence: prediction.progression?.evidence ?? null,
                    features: prediction.features ?? null,
                    modelVersion: prediction.modelVersion ?? null,
                    extrapolated: prediction.extrapolated ?? [],
                    wasExploratory: prediction.wasExploratory === true
                });
                decisionId = decision.decisionId;
            } catch (error) {
                console.warn(`[decision] Could not record the decision: ${error.message}`);
            }
        }

        // ── Don't serve a question they have just seen ───────────────────────
        //
        // The selection was `$sample: { size: 1 }` with no memory, so the same
        // question could come back immediately - and 78 of the bank's 112
        // (concept, level, format) slots hold exactly ONE question, which makes
        // a repeat certain on the second visit rather than merely likely.
        //
        // More questions is the real fix and it is an authoring job. Excluding
        // what they have recently played costs one indexed query and makes the
        // 150 that exist go much further.
        //
        // EXCLUSION IS A PREFERENCE, NOT A FILTER. Every query below falls back
        // to ignoring it, because "you have seen them all" must mean "here is
        // one again", never "no game for you".
        // Invalidated rounds are excluded here too, and for a reason beyond
        // consistency: a question withdrawn because it was defective has since
        // been re-authored, so it is one we actively WANT to serve again rather
        // than suppress as recently seen.
        const recentlyPlayed = await GameSession.evidence({ userId, conceptTag })
            .sort({ completedAt: -1 })
            .limit(RECENT_QUESTION_MEMORY)
            .select('questionId')
            .lean();

        const seen = [...new Set(recentlyPlayed.map((row) => row.questionId).filter(Boolean))];

        /** One question matching `match`, preferring one not recently seen. */
        const pick = async (match) => {
            if (seen.length > 0) {
                const fresh = await QuestionBank.aggregate([
                    { $match: { ...match, id: { $nin: seen } } },
                    { $sample: { size: 1 } }
                ]);
                if (fresh.length > 0) return fresh;
            }

            return QuestionBank.aggregate([{ $match: match }, { $sample: { size: 1 } }]);
        };

        let questions = resolvedGameType && resolvedDifficulty
            ? await pick({ gameType: resolvedGameType, conceptTag, difficulty: resolvedDifficulty })
            : [];

        // ── Falling back to the NEAREST level, not to any level ──────────────
        //
        // The bank does not cover every cell: only CodeFix was authored across
        // all five levels, so an Elementary Bug Hunt on array_indexing simply
        // does not exist. This used to fall through to "same type, any
        // difficulty", which could hand that student an Advanced question - and
        // because the session is recorded at the SERVED level and
        // progressionService reads that back as where the student is, the
        // fallback was quietly promoting people. See nearestDifficulty().
        if (questions.length === 0 && resolvedGameType && resolvedDifficulty) {
            const available = await QuestionBank.distinct('difficulty', {
                gameType: resolvedGameType,
                conceptTag
            });

            const nearest = nearestDifficulty(resolvedDifficulty, available);
            if (nearest) {
                questions = await pick({
                    gameType: resolvedGameType,
                    conceptTag,
                    difficulty: nearest
                });
            }
        }

        // Type unresolved, or the type has nothing at all for this concept.
        if (questions.length === 0) {
            if (resolvedDifficulty) {
                const available = await QuestionBank.distinct('difficulty', { conceptTag });
                const nearest = nearestDifficulty(resolvedDifficulty, available);
                if (nearest) questions = await pick({ conceptTag, difficulty: nearest });
            }

            if (questions.length === 0) questions = await pick({ conceptTag });

            if (questions.length === 0) {
                 return res.status(404).json({ error: 'No matching game found in database' });
            }
        }

        // Return a random match
        const selected = questions[0];
        
        // Strip everything the student is meant to earn rather than receive.
        //
        // `hints` used to be shipped with the question. Every hint was therefore
        // free: a student could read all three in the network tab and still be
        // recorded as having used none, while the score - 100 minus 15 per hint
        // - was computed from a count the client sent about itself. They come
        // one at a time from POST /game/hint now, and that endpoint records each
        // one. Only the COUNT is sent, so the UI can say "3 hints available"
        // without giving them away.
        const safeQuestion = { ...selected };
        delete safeQuestion.correctAnswer;
        delete safeQuestion.explanation;
        safeQuestion.hintCount = (selected.hints ?? []).length;
        delete safeQuestion.hints;

        // Say which engine chose the difficulty. A UI that tells a student their
        // practice is adapting to them should be able to tell whether it truly
        // is: 'model' means the Random Forest, 'heuristic' means it was down and
        // the if/else answered, 'requested' means the caller named the level.
        //
        // `difficulty` is left exactly as the question bank stored it and is NOT
        // overwritten with the level we asked for. The two both fall back
        // independently — the type-only and concept-only queries above ignore
        // difficulty entirely — so they genuinely can differ, and claiming the
        // requested level when the student was handed something else would make
        // every session record wrong at the point it matters most.
        safeQuestion.targetDifficulty = resolvedDifficulty;
        safeQuestion.difficultyChosenBy = difficultyChosenBy;
        safeQuestion.difficultyConfidence = difficultyConfidence;

        // In the student's own words, where there are any. A first game served
        // at Intermediate because Study Guider says they know the concept is
        // adaptation the student can be TOLD about; silently handing them a
        // harder game than the one their friend got is just confusing.
        safeQuestion.difficultyReason = difficultyReason;

        // Same contract as the difficulty fields: a UI telling a student their
        // practice adapts to them should be able to say what adapted and why.
        safeQuestion.gameTypeChosenBy = gameTypeChosenBy;
        safeQuestion.gameTypeReason = gameTypeReason;

        // Sent back so the submit call can stamp the session. An exploratory
        // difficulty is the only kind that carries information the policy did
        // not already have, and it is worthless to the trainer if the row that
        // records the outcome does not say so.
        safeQuestion.wasExploratory = difficultyWasExploratory;

        // Echoed back on submit so the outcome can be joined to the decision
        // that produced it. See models/AdaptationDecision.js.
        safeQuestion.decisionId = decisionId;

        res.json(safeQuestion);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch game question' });
    }
});

// POST /api/v1/gamification/game/check
//
// Grade one attempt WITHOUT ending the session, and record it.
//
// This is what makes the error count a measurement. The API previously only saw
// a student's final answer, so `errorCount` was `isCorrect ? 0 : 1` and
// `attemptCount` was whatever the client claimed - see models/GameAttempt.js.
// CodeFix makes checking natural (type a line, ask, try again), and every check
// is graded here and counted.
//
// Deliberately does NOT reveal the correct answer on a wrong attempt: unlimited
// checking would otherwise be a way to read the answer out of the API one guess
// at a time. It reports how many hints are still available; taking one is a
// separate, recorded, scored request to POST /game/hint.
router.post('/game/check', async (req, res) => {
    try {
        const { userId, learningSessionId, questionId, attempt } = req.body;

        if (!userId || !learningSessionId || !questionId || attempt === undefined) {
            return res.status(400).json({
                error: 'userId, learningSessionId, questionId and attempt are required'
            });
        }

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot check another user answer' });
        }

        const question = await QuestionBank.findOne({ id: questionId });
        if (!question) {
            return res.status(404).json({ error: 'Question not found in database' });
        }

        let correct;
        try {
            ({ correct } = gradeAnswer(question, attempt));
        } catch (gradingError) {
            return res.status(400).json({ error: gradingError.message });
        }

        // One upsert-and-push. The unique index on
        // (userId, learningSessionId, questionId) means concurrent clicks
        // cannot create two documents that split the count - the second waits
        // and appends to the first rather than racing it.
        const updated = await GameAttempt.findOneAndUpdate(
            { userId, learningSessionId, questionId },
            { $push: { attempts: { answer: attempt, correct } } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        const attempts = updated?.attempts ?? [];
        const wrongSoFar = attempts.filter((entry) => !entry.correct).length;

        // No hint is handed over here, only the fact that one is available.
        //
        // This used to auto-reveal the next hint on every wrong attempt. That
        // was right while hints were free and already in the payload; it is
        // wrong now that POST /game/hint records each one and the score charges
        // 15 points for it. A student must not be billed for a hint they did
        // not ask for - and being told one is there is itself the support FR-10
        // describes, without spending anything on their behalf.
        const hintsAvailable = (question.hints ?? []).length;
        const takenSoFar = (updated?.hintsTaken ?? []).length;

        return res.json({
            correct,
            attemptNumber: attempts.length,
            wrongAttempts: wrongSoFar,
            hintsRemaining: Math.max(0, hintsAvailable - takenSoFar)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check the answer' });
    }
});

// POST /api/v1/gamification/game/hint
//
// Hand over the next hint, and record that it was taken.
//
// FR-10 asks the system to "provide hints ... when student performance
// indicators suggest difficulty". Hints existed, but they arrived inside the
// question payload, so taking one cost nothing and the engine could not tell a
// student who used three from one who used none. `hintUsage` came from the
// client, which made the score a number the client chose.
//
// Hints are ordered easiest-to-most-explicit on the question, so this always
// returns the NEXT one the student has not seen. Asking again for one already
// taken returns it without counting it twice - a page refresh must not cost 15
// points.
router.post('/game/hint', async (req, res) => {
    try {
        const { userId, learningSessionId, questionId } = req.body;

        if (!userId || !learningSessionId || !questionId) {
            return res.status(400).json({
                error: 'userId, learningSessionId and questionId are required'
            });
        }

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot take a hint for another user' });
        }

        const question = await QuestionBank.findOne({ id: questionId }).lean();
        if (!question) {
            return res.status(404).json({ error: 'Question not found in database' });
        }

        const hints = question.hints ?? [];
        if (hints.length === 0) {
            return res.json({ hint: null, hintsTaken: 0, hintsRemaining: 0 });
        }

        const existing = await GameAttempt.findOne({
            userId,
            learningSessionId,
            questionId
        }).lean();

        const takenSoFar = (existing?.hintsTaken ?? []).length;

        if (takenSoFar >= hints.length) {
            // All of them already. Return the last rather than an error: the
            // student has paid for it and asking twice should not be a failure.
            return res.json({
                hint: hints[hints.length - 1],
                hintsTaken: takenSoFar,
                hintsRemaining: 0
            });
        }

        const updated = await GameAttempt.findOneAndUpdate(
            { userId, learningSessionId, questionId },
            { $push: { hintsTaken: { index: takenSoFar } } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();

        const taken = (updated?.hintsTaken ?? []).length;

        return res.json({
            hint: hints[takenSoFar],
            hintsTaken: taken,
            hintsRemaining: Math.max(0, hints.length - taken)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch a hint' });
    }
});

// POST /api/v1/gamification/game/submit
router.post('/game/submit', async (req, res) => {
    try {
        const { userId, learningSessionId, gameType, conceptTag, selectedAnswer, 
                hintUsage, timeTakenSeconds, attemptCount, questionId, traceAccuracy,
                wasExploratory, dataSource, decisionId } = req.body;

        if (!userId || !learningSessionId || !gameType || !conceptTag || selectedAnswer === undefined || !questionId) {
            return res.status(400).json({ error: 'Missing required fields for game submission' });
        }

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot submit another user game' });
        }

        // Verify answer securely using MongoDB Database
        const question = await QuestionBank.findOne({ id: questionId });
        
        if (!question) {
            return res.status(404).json({ error: 'Question not found in database' });
        }

        // The game type stored on the QUESTION is the truth. The client may send
        // Code Coach's vocabulary (loop_tracer), which is neither a valid grading
        // branch nor a valid GameSession enum value.
        const effectiveGameType = question.gameType || gameType;

        // Grading lives in services/gradingService.js so this route and
        // POST /game/check cannot drift apart on what counts as correct. The
        // game type comes from the QUESTION there, not from the client.
        let isCorrect = false;
        try {
            ({ correct: isCorrect } = gradeAnswer(question, selectedAnswer));
        } catch (gradingError) {
            console.error('Grading error:', gradingError);
            return res.status(400).json({ error: gradingError.message });
        }

        
        // ── The error count, measured rather than reported ───────────────────
        //
        // errorCount used to be `isCorrect ? 0 : 1`, so it could never exceed
        // one and the proposal's own rule `errorCount > 5` was unreachable.
        // attemptCount came from the client, which made the engine's efficiency
        // input a number the client asserted about itself.
        //
        // Both are now read from the attempts this server graded via
        // POST /game/check. When there are none - the three older games do not
        // check, they answer once - the client's attemptCount is still used and
        // the error count falls back to the old binary, which is at least
        // honest about being a floor rather than a count.
        const graded = await GameAttempt.findOne({
            userId,
            learningSessionId,
            questionId
        }).lean();

        const gradedAttempts = graded?.attempts ?? [];
        const measuredErrors = gradedAttempts.filter((attempt) => !attempt.correct).length;
        const measured = gradedAttempts.length > 0;

        // Hints are counted the same way and for the same reason: the server
        // handed them out, so the server knows. The client's `hintUsage` is used
        // only when no hint was taken through the API at all, which covers a
        // client written before /game/hint existed.
        const takenHints = (graded?.hintsTaken ?? []).length;
        const hintsMeasured = takenHints > 0 || measured;

        const normalizedAttemptCount = Number(attemptCount);
        const normalizedHintUsage = Number(hintUsage);
        const normalizedTimeTaken = Number(timeTakenSeconds);
        const computedAttemptCount = measured
            ? gradedAttempts.length
            : (Number.isFinite(normalizedAttemptCount) && normalizedAttemptCount > 0 ? normalizedAttemptCount : 1);
        const computedHintUsage = Number.isFinite(normalizedHintUsage) && normalizedHintUsage >= 0 ? normalizedHintUsage : 0;
        const computedTimeTaken = Number.isFinite(normalizedTimeTaken) && normalizedTimeTaken >= 0 ? normalizedTimeTaken : 0;

        // Score calculation: 100 - (hintUsage x 15) - ((attemptCount - 1) x 10)
        // Ensure negative score does not happen
        // The hint count the score is charged for is the server's, not the
        // client's - see the note beside `takenHints`.
        //
        // The two penalties are configuration, not literals. They used to be 15
        // and 10 written into this expression, so tuning how much a hint costs
        // meant editing and redeploying - which is exactly what FR-15 asks the
        // system not to require.
        const { hintPenalty, attemptPenalty } = ruleConfig.rules().scoring;
        const chargedHints = hintsMeasured ? takenHints : computedHintUsage;
        let rawScore =
            100 - chargedHints * hintPenalty - (computedAttemptCount - 1) * attemptPenalty;
        if (!isCorrect) rawScore = 0; // if final submission is wrong
        const finalScore = Math.max(0, rawScore);

        // Determine difficulty the question was at
        const difficultyLevel = question.difficulty;
        const errorType = question.errorType;
        // Save GameSession
        const session = new GameSession({
            userId,
            learningSessionId,
            // effectiveGameType, not the client's value: GameSession enforces an
            // enum of this engine's three types, so persisting Code Coach's
            // vocabulary threw a validation error and lost the whole result.
            gameType: effectiveGameType,
            conceptTag,
            errorType,
            // Recorded so a later round can avoid repeating it, and so the
            // per-question difficulty can eventually be measured from outcomes.
            questionId,
            difficultyLevel,
            score: finalScore,
            // The number of wrong attempts this server graded, not a flag.
            errorCount: measured ? measuredErrors : (isCorrect ? 0 : 1),
            errorCountMeasured: measured,
            attemptCount: computedAttemptCount,
            hintUsage: hintsMeasured ? takenHints : computedHintUsage,
            hintUsageMeasured: hintsMeasured,
            timeTakenSeconds: computedTimeTaken,
            traceAccuracy: Number.isFinite(traceAccuracy) ? traceAccuracy : undefined,
            status: 'completed',

            // Echoed back from the game payload. The client is trusted with it
            // because it cannot benefit from lying and a wrong value only ever
            // costs the trainer a usable row - unlike the score, which is
            // computed here and never taken from the client.
            wasExploratory: wasExploratory === true,

            // Defaults to 'real'; the local seeder marks its own rows
            // 'simulated' so the trainer drops them. Only these two
            // downgrades are accepted from the client - a caller cannot
            // promote anything TO 'real', and marking your own row as
            // seeded only ever costs you a training row.
            dataSource: ['simulated', 'test'].includes(dataSource) ? dataSource : 'real'
        });
        await session.save();

        // ── Close the loop on the adaptation decision ────────────────────────
        //
        // The decision was made when the game was fetched; the outcome is known
        // now. Without this join the engine can say what it decided and what
        // happened, but never whether the two agreed - which is the only
        // question worth asking of a predictive model.
        //
        // Best effort, and never blocking: the student has their score.
        try {
            const outcome = {
                outcomeScore: finalScore,
                outcomeSuccess: finalScore >= ruleConfig.rules().scoring.passMark,
                outcomeAt: new Date(),
                gameSessionId: session.gameSessionId,
                questionId
            };

            if (decisionId) {
                await AdaptationDecision.findOneAndUpdate(
                    { decisionId, outcomeAt: null },
                    { $set: { ...outcome, outcomeLinkedBy: 'echo' } }
                );
            } else {
                // A client that does not echo the id - anything written before
                // this existed - falls back to the most recent unresolved
                // decision for this student and concept. Recorded as 'inferred'
                // so a calibration figure can say how many of its rows were
                // guessed rather than known.
                await AdaptationDecision.findOneAndUpdate(
                    { userId, conceptTag, outcomeAt: null },
                    { $set: { ...outcome, outcomeLinkedBy: 'inferred' } },
                    { sort: { decidedAt: -1 } }
                );
            }
        } catch (error) {
            console.warn(`[decision] Could not attach the outcome: ${error.message}`);
        }

        // FR-12: transmit the summary to the Progress Tracker.
        //
        // This is the engine doing it, not the browser. The web page still posts
        // the result to Code Coach for the activity timeline and concept
        // mastery, and that stays - but it meant the Progress Tracker only heard
        // about a round if a browser chose to tell it. A closed tab, a dropped
        // connection or a second client and the round was silently never
        // transmitted, while FR-12 says "the system shall".
        //
        // Not awaited. The student has finished their game and is owed their
        // score; Study Guider being slow is not their problem. The token is
        // theirs, forwarded, so Study Guider authenticates this exactly as it
        // does every other request and files the round under the student it
        // belongs to - see services/studyGuiderClient.js.
        // A local LearningEvent used to be written here too. Nothing ever read
        // it - it was a write-only mirror of a Code Coach concept, and a third
        // place for the same fact to disagree with the other two.

        // Badge and Streak Logic (Gamification Engine)
        let profile = await PlayerProfile.findOne({ userId });
        if (!profile) {
            profile = new PlayerProfile({ userId });
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        let newBadgesUnlocked = [];

        if (profile.lastGamePlayedAt) {
            const lastPlayedDate = new Date(profile.lastGamePlayedAt);
            const startOfLastPlayed = new Date(lastPlayedDate.getFullYear(), lastPlayedDate.getMonth(), lastPlayedDate.getDate());
            
            const diffTime = Math.abs(startOfToday - startOfLastPlayed);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays === 1) {
                profile.currentStreak += 1;
            } else if (diffDays > 1) {
                profile.currentStreak = 1;
            }
        } else {
            profile.currentStreak = 1;
        }

        profile.lastGamePlayedAt = now;
        profile.totalScore += finalScore;

        if (finalScore === 100) {
            let badgeName = '';
            if (conceptTag === 'loop_boundaries') badgeName = 'Loop Master';
            if (conceptTag === 'array_indexing') badgeName = 'Array Ninja';
            if (conceptTag === 'conditional_logic') badgeName = 'Logic Guru';
            
            if (badgeName && !profile.badges.includes(badgeName)) {
                profile.badges.push(badgeName);
                newBadgesUnlocked.push(badgeName);
            }
        }

        await profile.save();

        // FR-09 and FR-11: what to play next, and the reason for it. Computed
        // from this student's own sessions - see services/recommendationService.js
        // for the rule set. Never fails the submission: a student who has just
        // finished a game must get their score even if the recommendation query
        // does not come back.
        let recommendation = null;
        try {
            recommendation = await recommendNextGame({
                userId,
                conceptTag,
                lastScore: finalScore
            });
        } catch (recommendationError) {
            console.warn(
                `[gamification] Could not build a next-game recommendation for ` +
                    `user=${userId} concept=${conceptTag}: ${recommendationError.message}`
            );
        }

        // FR-10: what this student needs beyond another round. Never fails the
        // submission - a student who has just played must get their score even
        // if the support query does not come back.
        let support = null;
        try {
            support = await recommendSupport({
                userId,
                conceptTag,
                lastScore: finalScore,
                repeatErrorCount: null
            });
        } catch (supportError) {
            console.warn(
                `[gamification] Could not build a support recommendation for ` +
                    `user=${userId} concept=${conceptTag}: ${supportError.message}`
            );
        }

        sendGameSummary({
            accessToken: req.accessToken,
            summary: summaryFrom(session, { support_action: support?.action ?? '' })
        }).catch(() => {});

        const conceptLabel = conceptTag.replace(/_/g, ' ');
        const masteredThisRound = finalScore >= ruleConfig.rules().scoring.masteryMark;
        const attemptOutcome = masteredThisRound ? 'concept_progressed' : 'practice_recommended';

        // The support headline, always. It used to be one of two fixed sentences
        // chosen by `masteredThisRound` (>= 80), while support judges passing at
        // the platform pass mark (>= 70) - so a round scoring 70-79 was told
        // "one more round should settle it" underneath a support line saying it
        // was going well. One source for the message, one threshold.
        const learnerFeedback = support
            ? support.headline
            : masteredThisRound
              ? `Great progress in ${conceptLabel}. Keep practicing to strengthen fluency.`
              : `Good effort on ${conceptLabel}. One more round should settle it.`;

        res.json({
            score: finalScore,
            attemptOutcome,
            learnerFeedback,
            conceptProgressMessage: learnerFeedback,
            // effectiveGameType, not the client's `gameType`: everything else in
            // this handler already refuses to take the client's word for it, and
            // echoing it back here made the summary disagree with the session
            // that was just written.
            nextPracticeRecommendation: `${effectiveGameType} on ${conceptLabel}`,
            answerMatchedReference: isCorrect,
            referenceAnswer: question.correctAnswer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            newBadges: newBadgesUnlocked,
            currentStreak: profile.currentStreak,
            // Was the string 'Optional: further recommendation logic', sent to
            // the client on every completed game. FR-09 in full is now below.
            nextRecommendedGame: recommendation ? recommendation.gameType : null,
            nextRecommendedConcept: recommendation ? recommendation.conceptTag : null,
            nextRecommendationReason: recommendation ? recommendation.reason : null,
            nextRecommendationRule: recommendation ? recommendation.rule : null,

            // FR-10. `action` is the contract; the headline and detail are what
            // a student reads. `evidence` is what the rule actually saw, so a
            // recommendation can be argued with rather than just obeyed.
            support: support
                ? {
                      action: support.action,
                      headline: support.headline,
                      detail: support.detail,
                      evidence: support.evidence
                  }
                : null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Submission failed' });
    }
});

// GET /api/v1/gamification/profile/:userId
router.get('/profile/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!assertUserAccess(req, userId)) {
            return res.status(403).json({ error: 'Forbidden: cannot fetch another user profile' });
        }

        let profile = await PlayerProfile.findOne({ userId });
        if (!profile) {
            profile = { totalScore: 0, currentStreak: 0, badges: [] };
        }
        res.json(profile);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

module.exports = router;
