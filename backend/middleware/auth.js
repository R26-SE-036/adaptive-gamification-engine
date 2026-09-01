const jwt = require('jsonwebtoken');

function extractUserId(decoded) {
    return decoded.user_id || decoded.userId || decoded.id || decoded.sub || null;
}

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'shared-secret');
        const userId = extractUserId(decoded);

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: token does not contain a user identity' });
        }

        req.user = {
            ...decoded,
            userId,
            user_id: userId
        };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

module.exports = authMiddleware;
