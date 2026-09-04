const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const GameSession = require('../models/GameSession');
const PlayerProfile = require('../models/PlayerProfile');
const QuestionBank = require('../models/QuestionBank');
const { predictDifficulty } = require('../services/difficultyService');
const { CONCEPT_GAME_MAPPING, GAME_TYPES, DIFFICULTY_LEVELS, DIFFICULTY_ALIASES } = require('../config/constants');

function getAuthenticatedUserId(req) {
    return req.user?.user_id || req.user?.userId || req.user?.id || req.user?.sub || null;
}

function assertUserAccess(req, userId) {
    const authenticatedUserId = getAuthenticatedUserId(req);
    const role = req.user?.role;
    const isPrivilegedRole = role === 'admin' || role === 'supervisor' || role === 'lecturer';

    return isPrivilegedRole || (authenticatedUserId && authenticatedUserId === userId);
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
        // keyed by THIS engine's three types, so an unresolved value matched
        // nothing: the query fell through to the concept-only fallback, which
        // ignores difficulty and returns a game of a different type than the URL
        // claims. That is why games appeared but the UI rendered wrong.
        const resolvedGameType = GAME_TYPES.includes(gameType)
            ? gameType
            : CONCEPT_GAME_MAPPING[conceptTag];

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

        if (!resolvedDifficulty) {
            const prediction = await predictDifficulty({
                userId,
                conceptTag,
                accessToken: req.accessToken
            });
            resolvedDifficulty = prediction.difficulty;
            difficultyChosenBy = prediction.source;
            difficultyConfidence = prediction.confidence;
        }

        let questions = resolvedGameType && resolvedDifficulty
            ? await QuestionBank.aggregate([
                { $match: { gameType: resolvedGameType, conceptTag, difficulty: resolvedDifficulty } },
                { $sample: { size: 1 } }
            ])
            : [];

        // Same type, any difficulty, before giving up on the type entirely.
        if (questions.length === 0 && resolvedGameType) {
            questions = await QuestionBank.aggregate([
                { $match: { gameType: resolvedGameType, conceptTag } },
                { $sample: { size: 1 } }
            ]);
        }

        if (questions.length === 0) {
            // fallback logic if exact match not found
            questions = await QuestionBank.aggregate([
                { $match: { conceptTag } },
                { $sample: { size: 1 } }
            ]);
            
            if (questions.length === 0) {
                 return res.status(404).json({ error: 'No matching game found in database' });
            }
        }

        // Return a random match
        const selected = questions[0];
        
        // Strip sensitive info before sending to client
        const safeQuestion = { ...selected };
        delete safeQuestion.correctAnswer;
        delete safeQuestion.explanation;

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

        res.json(safeQuestion);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch game question' });
    }
});

// POST /api/v1/gamification/game/submit
router.post('/game/submit', async (req, res) => {
    try {
        const { userId, learningSessionId, gameType, conceptTag, selectedAnswer, 
                hintUsage, timeTakenSeconds, attemptCount, questionId, traceAccuracy } = req.body;

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

        let isCorrect = false;
        try {
            // Grade against the game type stored on the QUESTION, not the one
            // the client sent. The client's value may be Code Coach's
            // vocabulary (loop_tracer), which used to fall through to the else
            // branch and reject a perfectly valid answer as
            // "Invalid gameType submitted". It is also simply not the client's
            // fact to assert.
            if (effectiveGameType === 'BugHunt') {
                isCorrect = String(selectedAnswer) === String(question.correctAnswer);
            } else if (effectiveGameType === 'DragDrop') {
                isCorrect = Array.isArray(selectedAnswer) &&
                            Array.isArray(question.correctAnswer) &&
                            selectedAnswer.length === question.correctAnswer.length &&
                            selectedAnswer.every((val, index) => String(val) === String(question.correctAnswer[index]));
            } else if (effectiveGameType === 'CodeTrace') {
                isCorrect = String(selectedAnswer).trim().toLowerCase() === String(question.correctAnswer).trim().toLowerCase();
            } else {
                return res.status(400).json({ error: 'Invalid gameType submitted' });
            }
        } catch (e) {
            console.error('Validation error:', e);
            return res.status(400).json({ error: 'Error validating answer format' });
        }

        
        const normalizedAttemptCount = Number(attemptCount);
        const normalizedHintUsage = Number(hintUsage);
        const normalizedTimeTaken = Number(timeTakenSeconds);
        const computedAttemptCount = Number.isFinite(normalizedAttemptCount) && normalizedAttemptCount > 0 ? normalizedAttemptCount : 1;
        const computedHintUsage = Number.isFinite(normalizedHintUsage) && normalizedHintUsage >= 0 ? normalizedHintUsage : 0;
        const computedTimeTaken = Number.isFinite(normalizedTimeTaken) && normalizedTimeTaken >= 0 ? normalizedTimeTaken : 0;

        // Score calculation: 100 - (hintUsage x 15) - ((attemptCount - 1) x 10)
        // Ensure negative score does not happen
        let rawScore = 100 - (computedHintUsage * 15) - ((computedAttemptCount - 1) * 10);
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
            difficultyLevel,
            score: finalScore,
            errorCount: isCorrect ? 0 : 1,
            attemptCount: computedAttemptCount,
            hintUsage: computedHintUsage,
            timeTakenSeconds: computedTimeTaken,
            traceAccuracy: Number.isFinite(traceAccuracy) ? traceAccuracy : undefined,
            status: 'completed'
        });
        await session.save();

        // The platform-wide record of this game lives in Code Coach, not here.
        // The frontend posts the result to /api/v1/gamification/me/session-results
        // as soon as this call returns, which is what updates the student's
        // concept mastery and puts the game on their activity timeline.
        //
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

        const conceptLabel = conceptTag.replace(/_/g, ' ');
        const masteredThisRound = finalScore >= 80;
        const attemptOutcome = masteredThisRound ? 'concept_progressed' : 'practice_recommended';
        const learnerFeedback = masteredThisRound
            ? `Great progress in ${conceptLabel}. Keep practicing to strengthen fluency.`
            : `Good effort on ${conceptLabel}. Try one more guided practice round with hints.`;

        res.json({
            score: finalScore,
            attemptOutcome,
            learnerFeedback,
            conceptProgressMessage: learnerFeedback,
            nextPracticeRecommendation: `${gameType} on ${conceptLabel}`,
            answerMatchedReference: isCorrect,
            referenceAnswer: question.correctAnswer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            newBadges: newBadgesUnlocked,
            currentStreak: profile.currentStreak,
            nextRecommendedGame: 'Optional: further recommendation logic'
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
