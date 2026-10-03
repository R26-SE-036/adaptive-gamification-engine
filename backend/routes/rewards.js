const express = require('express');

const authMiddleware = require('../middleware/auth');
const QuestionBank = require('../models/QuestionBank');
const rewards = require('../services/rewardsService');

/**
 * The reward loop's read side: the player's overview, leaderboards, the daily
 * challenge and a catalogue for free play. What a round EARNS is applied by
 * POST /game/submit, which calls rewardsService.applyRound.
 *
 * These routes take the player from the token ("me") rather than from the
 * path. The older routes take :userId and compare it with the token, which
 * only ever allows one value anyway.
 *
 * Mounted on the same prefix as routes/gamification.js, so authentication is
 * attached per route rather than with router.use - a router-wide middleware
 * would run for every request passing through this router, including the
 * game routes it does not handle, and verify each token twice.
 */
const router = express.Router();

function me(req) {
    return req.user?.user_id || req.user?.userId || null;
}

/** A question as a player may see it: no answer, no explanation, no hints. */
function publicQuestion(question) {
    if (!question) return null;
    const safe = { ...question };
    delete safe._id;
    delete safe.__v;
    delete safe.correctAnswer;
    delete safe.explanation;
    safe.hintCount = (question.hints ?? []).length;
    delete safe.hints;
    return safe;
}

// GET /api/v1/gamification/me/overview
router.get('/me/overview', authMiddleware, async (req, res) => {
    try {
        res.json(await rewards.overview({ userId: me(req), fullName: req.user.fullName }));
    } catch (error) {
        console.error('[rewards] overview failed:', error);
        res.status(500).json({ error: 'Could not load your player profile' });
    }
});

// PATCH /api/v1/gamification/me/preferences   { showOnLeaderboard: boolean }
router.patch('/me/preferences', authMiddleware, async (req, res) => {
    try {
        const { showOnLeaderboard } = req.body ?? {};
        if (typeof showOnLeaderboard !== 'boolean') {
            return res.status(400).json({ error: 'showOnLeaderboard must be true or false' });
        }
        res.json(await rewards.setPreferences({
            userId: me(req),
            fullName: req.user.fullName,
            showOnLeaderboard
        }));
    } catch (error) {
        console.error('[rewards] preferences failed:', error);
        res.status(500).json({ error: 'Could not save your preference' });
    }
});

// GET /api/v1/gamification/leaderboard?period=week|all|today&limit=10
router.get('/leaderboard', authMiddleware, async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
        res.json(await rewards.leaderboard({
            period: String(req.query.period || 'week'),
            userId: me(req),
            limit
        }));
    } catch (error) {
        console.error('[rewards] leaderboard failed:', error);
        res.status(500).json({ error: 'Could not load the leaderboard' });
    }
});

// GET /api/v1/gamification/daily
//
// Today's challenge, ready to play. Submitting it through POST /game/submit
// with `mode: 'daily'` makes it the counted attempt - once a day.
router.get('/daily', authMiddleware, async (req, res) => {
    try {
        const status = await rewards.dailyStatus(me(req));
        if (!status.question) {
            return res.status(404).json({ error: 'There is no daily challenge today' });
        }
        res.json({
            day: status.day,
            resetsAt: status.resetsAt,
            completed: status.completed,
            question: {
                ...publicQuestion(status.question),
                targetDifficulty: status.question.difficulty,
                difficultyChosenBy: 'daily'
            }
        });
    } catch (error) {
        console.error('[rewards] daily failed:', error);
        res.status(500).json({ error: 'Could not load the daily challenge' });
    }
});

// GET /api/v1/gamification/catalog
//
// What free play can offer: for each game format, the concepts the bank holds
// questions for. Lets the page offer only games that exist, rather than links
// that fall back to a different game.
router.get('/catalog', authMiddleware, async (req, res) => {
    try {
        const cells = await QuestionBank.aggregate([
            { $group: { _id: { gameType: '$gameType', conceptTag: '$conceptTag' }, questions: { $sum: 1 } } },
            { $sort: { '_id.gameType': 1, '_id.conceptTag': 1 } }
        ]);

        const formats = {};
        for (const cell of cells) {
            const { gameType, conceptTag } = cell._id;
            (formats[gameType] ??= []).push({ conceptTag, questions: cell.questions });
        }

        res.json({ formats });
    } catch (error) {
        console.error('[rewards] catalog failed:', error);
        res.status(500).json({ error: 'Could not load the game catalogue' });
    }
});

module.exports = router;
