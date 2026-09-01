const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const LearningSession = require('../models/LearningSession');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'shared-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

function signAccessToken(user) {
    return jwt.sign(
        {
            userId: user.userId,
            email: user.email,
            fullName: user.fullName,
            role: user.role || 'student'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

async function createGamificationSession(userId) {
    const learningSessionId = crypto.randomUUID();

    await LearningSession.create({
        learningSessionId,
        userId,
        sourceComponent: 'gamification',
        taskId: 'web_practice',
        language: 'java',
        status: 'active',
        startedAt: new Date()
    });

    return learningSessionId;
}

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail, status: { $ne: 'disabled' } });

        if (!user || !user.passwordHash) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const accessToken = signAccessToken(user);
        const learningSessionId = await createGamificationSession(user.userId);

        res.json({
            accessToken,
            learningSessionId,
            user: {
                userId: user.userId,
                email: user.email,
                fullName: user.fullName,
                role: user.role || 'student'
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// GET /api/v1/auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id || req.user?.sub;
        const user = await User.findOne({ userId }).select('userId email fullName role status');

        if (!user) {
            return res.json({
                userId,
                email: req.user?.email || null,
                fullName: req.user?.fullName || null,
                role: req.user?.role || 'student'
            });
        }

        res.json({
            userId: user.userId,
            email: user.email,
            fullName: user.fullName,
            role: user.role || 'student'
        });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

module.exports = router;
