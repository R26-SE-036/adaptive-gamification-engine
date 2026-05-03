const express = require('express');
const router = express.Router();
const axios = require('axios');

const authMiddleware = require('../middleware/auth');
const CodeDiagnostic = require('../models/CodeDiagnostic');
const GameSession = require('../models/GameSession');
const LearningEvent = require('../models/LearningEvent');
const PlayerProfile = require('../models/PlayerProfile');
const QuestionBank = require('../models/QuestionBank');

const FLASK_ML_URL = process.env.FLASK_ML_URL || 'http://127.0.0.1:5000';

// ALL routes protected by JWT
router.use(authMiddleware);

// GET /api/v1/gamification/dashboard/:userId
router.get('/dashboard/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Count repeat errors per conceptTag
        const pipeline = [
            { $match: { userId: userId, status: { $ne: 'resolved' } } },
            { $group: { _id: '$conceptTag', repeatCount: { $sum: 1 } } },
            { $sort: { repeatCount: -1 } }
        ];
        
        const weaknesses = await CodeDiagnostic.aggregate(pipeline);
        
        // Map concepts to recommended games
        const conceptGameMap = {
            'loop_boundaries': 'BugHunt',
            'array_indexing': 'BugHunt',
            'conditional_logic': 'DragDrop'
        };

        const results = weaknesses.map(w => ({
            conceptTag: w._id,
            repeatCount: w.repeatCount,
            recommendedGame: conceptGameMap[w._id] || 'CodeTrace'
        }));

        res.json({ weaknesses: results });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error retrieving dashboard data' });
    }
});

// POST /api/v1/gamification/predict-difficulty
router.post('/predict-difficulty', async (req, res) => {
    try {
        const { userId, conceptTag } = req.body;
        
        if (!userId || !conceptTag) {
            return res.status(400).json({ error: 'userId and conceptTag are required' });
        }

        // Aggregate past performance for this user and conceptTag
        const pastSessions = await GameSession.find({ userId, conceptTag });
        
        let avg_score = 50, avg_attempts = 1, avg_hint_usage = 0, avg_time_seconds = 60;
        let games_played = pastSessions.length;
        
        if (games_played > 0) {
            avg_score = pastSessions.reduce((sum, s) => sum + s.score, 0) / games_played;
            avg_attempts = pastSessions.reduce((sum, s) => sum + s.attemptCount, 0) / games_played;
            avg_hint_usage = pastSessions.reduce((sum, s) => sum + s.hintUsage, 0) / games_played;
            avg_time_seconds = pastSessions.reduce((sum, s) => sum + s.timeTakenSeconds, 0) / games_played;
        }

        const repeat_error_count = await CodeDiagnostic.countDocuments({ userId, conceptTag, status: { $ne: 'resolved' } });

        const mlPayload = {
            avg_score,
            avg_attempts,
            avg_hint_usage,
            avg_time_seconds,
            repeat_error_count,
            games_played,
            conceptTag
        };

        const mlResponse = await axios.post(`${FLASK_ML_URL}/predict`, mlPayload);
        
        res.json({ predictedDifficulty: mlResponse.data.difficulty });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to predict difficulty' });
    }
});

// GET /api/v1/gamification/game/:userId/:gameType/:conceptTag/:difficulty
router.get('/game/:userId/:gameType/:conceptTag/:difficulty', async (req, res) => {
    try {
        const { gameType, conceptTag, difficulty } = req.params;
        
        // Dynamically pull a random question from MongoDB Atlas
        let questions = await QuestionBank.aggregate([
            { $match: { gameType, conceptTag, difficulty } },
            { $sample: { size: 1 } }
        ]);

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
                hintUsage, timeTakenSeconds, attemptCount, questionId } = req.body;

        // Verify answer securely using MongoDB Database
        const question = await QuestionBank.findOne({ id: questionId });
        
        if (!question) {
            return res.status(404).json({ error: 'Question not found in database' });
        }

        const isCorrect = String(selectedAnswer) === String(question.correctAnswer);
        
        // Score calculation: 100 - (hintUsage x 15) - ((attemptCount - 1) x 10)
        // Ensure negative score does not happen
        let rawScore = 100 - (hintUsage * 15) - ((attemptCount - 1) * 10);
        if (!isCorrect) rawScore = 0; // if final submission is wrong
        const finalScore = Math.max(0, rawScore);

        // Determine difficulty the question was at
        const difficultyLevel = question.difficulty;
        const errorType = question.errorType;

        // Save GameSession
        const session = new GameSession({
            userId,
            learningSessionId,
            gameType,
            conceptTag,
            errorType,
            difficultyLevel,
            score: finalScore,
            attemptCount,
            hintUsage,
            timeTakenSeconds
        });
        await session.save();

        // Emit LearningEvent
        const evt = new LearningEvent({
            eventType: 'game_session_completed',
            userId,
            learningSessionId,
            payload: {
                gameType,
                conceptTag,
                score: finalScore,
                difficultyLevel,
                hintUsage
            }
        });
        await evt.save();

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

        res.json({
            score: finalScore,
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
        let profile = await PlayerProfile.findOne({ userId: req.params.userId });
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
