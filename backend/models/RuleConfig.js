const mongoose = require('mongoose');

/**
 * The engine's tunable thresholds, stored rather than compiled in.
 *
 * ONE document, keyed 'active'. A collection of one row looks odd until you ask
 * what the alternative is: per-cohort or per-concept configuration is a feature
 * nobody has asked for, and building the key structure for it now would mean
 * every read had to decide which row applied.
 *
 * `values` is a free-form object rather than a field per threshold. The schema
 * that matters is in services/ruleConfigService.js, which owns the defaults,
 * the validation and the merge order - putting it here as well would create two
 * places to add a threshold and one of them would be forgotten.
 */
const RuleConfigSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, default: 'active' },

        // Only the thresholds an operator has actually overridden. Anything
        // absent falls through to the environment and then to the code default,
        // so a stored config never has to be complete and a new threshold does
        // not need a migration.
        values: { type: mongoose.Schema.Types.Mixed, default: {} },

        updatedAt: { type: Date, default: Date.now },

        // Free text from the caller: why this was changed. Not who - the engine
        // has no identity for an operator, only the shared secret that gates the
        // endpoint, and inventing a name here would be worse than an honest gap.
        note: { type: String, default: '' }
    },
    { collection: 'ruleConfig' }
);

module.exports = mongoose.model('RuleConfig', RuleConfigSchema);
