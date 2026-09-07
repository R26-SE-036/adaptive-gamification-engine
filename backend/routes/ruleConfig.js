const express = require('express');

const ruleConfig = require('../services/ruleConfigService');

const router = express.Router();

/**
 * Reading and changing the engine's thresholds at runtime. FR-15.
 *
 * ============================== WHO MAY DO THIS =============================
 * Whoever holds `RULE_CONFIG_SECRET`, sent as `X-Config-Secret`.
 *
 * The proposal says "authorised administrators". There are none: the platform is
 * student-only by decision, so there is no account type to grant this to and no
 * role claim left to check (docs/proposal-gap-analysis.md §4a). A shared secret
 * is the same pattern the ML service already uses to gate POST /retrain, and it
 * is the honest instrument here - the administrator is whoever deployed the
 * service, because that is the only party the system can actually distinguish.
 *
 * Mounted BEFORE the gamification router and outside its auth middleware, since
 * an operator changing a threshold is not acting as a student and should not
 * need a student's token to do it.
 *
 * With the secret unset every request here is refused. That is deliberate: a
 * missing secret means the operator has not set one up, and defaulting to open
 * would put the engine's scoring under the control of anyone who can reach the
 * port.
 */
function requireSecret(req, res, next) {
    const secret = process.env.RULE_CONFIG_SECRET;

    if (!secret) {
        return res.status(403).json({
            error: 'Rule configuration is disabled.',
            detail:
                'RULE_CONFIG_SECRET is not set on this service, so there is no way to ' +
                'authorise a change. Set it and restart to enable these endpoints.'
        });
    }

    if (req.get('X-Config-Secret') !== secret) {
        return res.status(403).json({ error: 'Forbidden: invalid or missing X-Config-Secret' });
    }

    return next();
}

router.use(requireSecret);

/**
 * GET - the effective thresholds, where each came from, and what may be set.
 *
 * `sources` is the useful half. "It is 80" does not tell an operator whether
 * that is the code default, an environment variable they set last month, or a
 * stored override - and those need different actions to change.
 */
router.get('/', async (_req, res) => {
    try {
        await ruleConfig.refresh();
        return res.json(ruleConfig.describe());
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Could not read the rule configuration' });
    }
});

/**
 * PUT - set overrides. Partial: only the keys sent are changed.
 *
 * A key set to null clears its override, so the environment variable or the code
 * default takes over again. That is a different outcome from setting it back to
 * the default value by hand, which would leave a stored override that silently
 * pins the threshold if the default ever changes.
 */
router.put('/', async (req, res) => {
    const patch = req.body?.values;

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return res.status(400).json({
            error: 'Body must be { "values": { "group.name": number|null, ... } }'
        });
    }

    try {
        const result = await ruleConfig.update(patch, req.body?.note);

        if (!result.ok) {
            // 422, not 400: the request was well formed and the values were
            // understood - they just describe an engine that cannot work.
            return res.status(422).json({ error: 'Rejected', errors: result.errors });
        }

        return res.json({
            message: 'Rule configuration updated.',
            values: result.values,
            sources: result.sources
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Could not write the rule configuration' });
    }
});

/** DELETE - drop every stored override at once. */
router.delete('/', async (_req, res) => {
    try {
        const values = await ruleConfig.reset();
        return res.json({ message: 'Stored overrides cleared.', values });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Could not reset the rule configuration' });
    }
});

module.exports = router;
