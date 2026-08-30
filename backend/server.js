const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const { CODE_COACH_URL } = require('./services/codeCoachClient');

const app = express();

// Browsers that may call this API. The frontend dev server is 5174 and the
// Code Guru portal is 4200. Comes from the environment so a deployed origin can
// be added without a code change.
const allowedOrigins = (process.env.CORS_ORIGINS ||
    'http://localhost:5174,http://127.0.0.1:5174,http://localhost:4200,http://127.0.0.1:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// This service has no login of its own. Identity comes from Code Coach, and
// every route below verifies the caller's token against it - see
// middleware/auth.js. A local password login used to live at /api/v1/auth,
// unmounted but present; it was a second identity system waiting to be
// switched on, and has been removed.
const gamificationRoutes = require('./routes/gamification');
app.use('/api/v1/gamification', gamificationRoutes);

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        component: 'Adaptive Gamification Engine',
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        identity_provider: CODE_COACH_URL
    });
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/code-guru';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log('MongoDB connection error:', err));

// 3002, not 3000: PairPath's frontend owns 3000 and its API owns 3001. The old
// default collided with PairPath and whichever service started second failed.
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Gamification Backend running on port ${PORT}`);
    console.log(`Identity provider: ${CODE_COACH_URL}`);
});
