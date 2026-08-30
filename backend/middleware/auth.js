/**
 * Authentication for the gamification backend.
 *
 * This service has no accounts of its own. A student signs in once through the
 * Code Guru portal, and every request here carries the Code Coach access token
 * that sign-in produced.
 *
 * WHAT CHANGED AND WHY
 *
 * This used to verify the signature locally:
 *
 *     jwt.verify(token, process.env.JWT_SECRET || 'shared-secret')
 *
 * which only worked if that secret was byte-identical to Code Coach's - and no
 * .env.example said so, so the default rejected every real token. Worse, a
 * valid signature is not the same as a live session: signing out of Code Coach
 * revokes the session server-side, but a locally-verified token kept working
 * here until it expired. Asking Code Coach makes sign-out mean something, and
 * keeps its signing secret inside the one repo that owns it.
 */

const { CodeCoachError, verifyToken } = require('../services/codeCoachClient');

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Sign in through the Code Guru portal to use the gamification engine'
        });
    }

    const accessToken = authHeader.slice('Bearer '.length).trim();

    try {
        const user = await verifyToken(accessToken);

        // Both spellings are populated because the route handlers read
        // `user_id` and `userId` interchangeably.
        req.user = {
            ...user,
            userId: user.user_id,
            user_id: user.user_id,
            fullName: user.full_name,
            role: user.role || 'student'
        };
        // Routes forward this to Code Coach when they need the student's own
        // data, so authorization is carried rather than re-derived.
        req.accessToken = accessToken;

        return next();
    } catch (error) {
        if (error instanceof CodeCoachError) {
            // 401/403 mean the token really is no good. Anything else is Code
            // Coach having a bad day, and answering 401 would send the student
            // to a login page that cannot help them.
            if (error.status === 401 || error.status === 403) {
                return res.status(401).json({ error: error.message });
            }
            return res.status(503).json({ error: error.message });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}

module.exports = authMiddleware;
