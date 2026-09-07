/**
 * Was the model right? Calibration and accuracy over the recorded decisions.
 *
 *     node data/calibration.js
 *     node data/calibration.js --source model --exclude-extrapolated
 *     node data/calibration.js --include-inferred
 *
 * ============================ WHAT THIS MEASURES ============================
 * NFR-03 asks for "85% decision accuracy". Accuracy is a weak thing to ask of a
 * model that outputs probabilities: one can be 85% accurate while being
 * systematically overconfident, and a student handed a game the engine was
 * privately unsure about is in a different position from one handed a game it
 * was confident about, even when both succeed.
 *
 * CALIBRATION is the stronger question:
 *
 *     of the rounds where the model predicted a 70% chance of success,
 *     what share actually succeeded?
 *
 * A well-calibrated model answers "about 70%". The table below buckets
 * predictions by decile and prints predicted against observed, plus the Brier
 * score, which is the mean squared error of a probabilistic prediction and the
 * standard single number for this.
 *
 * Accuracy at the 0.5 threshold is printed too, because that is what the
 * proposal asks for - but it is reported alongside calibration rather than
 * instead of it.
 *
 * ============================ WHAT IT REFUSES ============================
 * The filters exist because a number computed over the wrong rows is worse than
 * no number:
 *
 *   --source model          only decisions a MODEL made. Heuristic and
 *                           cold-start rows are the if/else, and including them
 *                           would measure the fallback, which is how this
 *                           component's ML claim went wrong once already.
 *   --exclude-extrapolated  drop levels the loaded model was never fitted on.
 *   --include-inferred      by default only outcomes linked by the client
 *                           echoing its decisionId are counted. An inferred
 *                           link is a guess about which decision produced which
 *                           result.
 *
 * It prints the sample size first and refuses to draw conclusions from a small
 * one, in the same spirit as the trainer's sufficiency gate.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const AdaptationDecision = require('../models/AdaptationDecision');

/** Below this many resolved decisions, the numbers are noise. */
const MIN_ROWS = Number(process.env.CALIBRATION_MIN_ROWS || 100);

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : null;
};

function brier(rows) {
    const total = rows.reduce((sum, r) => sum + (r.predicted - (r.success ? 1 : 0)) ** 2, 0);
    return total / rows.length;
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const query = { outcomeAt: { $ne: null } };

    const source = option('source');
    if (source) query.source = source;
    if (!flag('include-inferred')) query.outcomeLinkedBy = 'echo';

    const decisions = await AdaptationDecision.find(query).lean();

    // The predicted probability for the level that was actually served. A
    // decision with no prediction (heuristic, cold start) has nothing to
    // calibrate, so it is counted and set aside rather than treated as 0.
    const rows = [];
    let withoutPrediction = 0;
    let droppedExtrapolated = 0;

    for (const decision of decisions) {
        if (flag('exclude-extrapolated') && (decision.extrapolated || []).includes(decision.difficulty)) {
            droppedExtrapolated += 1;
            continue;
        }

        const predicted = decision.predictedSuccess?.[decision.difficulty];
        if (typeof predicted !== 'number') {
            withoutPrediction += 1;
            continue;
        }

        rows.push({ predicted, success: decision.outcomeSuccess === true, decision });
    }

    console.log('\n── Corpus ──────────────────────────────────────────────────');
    console.log(`  resolved decisions matching the filters : ${decisions.length}`);
    console.log(`  with a probability to calibrate         : ${rows.length}`);
    if (withoutPrediction) console.log(`  without one (heuristic / cold start)    : ${withoutPrediction}`);
    if (droppedExtrapolated) console.log(`  dropped as extrapolated                 : ${droppedExtrapolated}`);

    const bySource = {};
    for (const d of decisions) bySource[d.source] = (bySource[d.source] || 0) + 1;
    console.log(`  by source                               : ${JSON.stringify(bySource)}`);

    const exploratory = decisions.filter((d) => d.wasExploratory).length;
    console.log(
        `  exploratory                             : ${exploratory}` +
            (decisions.length ? ` (${((exploratory / decisions.length) * 100).toFixed(1)}%)` : '')
    );

    if (rows.length === 0) {
        console.log('\nNothing to calibrate yet. Play some games, or relax the filters.\n');
        await mongoose.disconnect();
        return;
    }

    // ── Calibration table ────────────────────────────────────────────────────
    console.log('\n── Calibration ─────────────────────────────────────────────');
    console.log('  predicted    n   predicted avg   observed   gap');

    for (let bucket = 0; bucket < 10; bucket += 1) {
        const lo = bucket / 10;
        const hi = lo + 0.1;
        const inBucket = rows.filter((r) => r.predicted >= lo && (bucket === 9 ? r.predicted <= hi : r.predicted < hi));
        if (inBucket.length === 0) continue;

        const meanPredicted = inBucket.reduce((s, r) => s + r.predicted, 0) / inBucket.length;
        const observed = inBucket.filter((r) => r.success).length / inBucket.length;
        const gap = observed - meanPredicted;

        console.log(
            `  ${lo.toFixed(1)}-${hi.toFixed(1)}  ${String(inBucket.length).padStart(4)}` +
                `        ${meanPredicted.toFixed(3)}      ${observed.toFixed(3)}   ` +
                `${gap >= 0 ? '+' : ''}${gap.toFixed(3)}`
        );
    }

    // ── Headline numbers ─────────────────────────────────────────────────────
    const observedRate = rows.filter((r) => r.success).length / rows.length;
    const baseline = rows.map(() => ({ predicted: observedRate, success: false }));
    for (let i = 0; i < rows.length; i += 1) baseline[i].success = rows[i].success;

    const correctAtHalf = rows.filter((r) => (r.predicted >= 0.5) === r.success).length;

    console.log('\n── Summary ─────────────────────────────────────────────────');
    console.log(`  observed success rate          : ${(observedRate * 100).toFixed(1)}%`);
    console.log(`  Brier score                    : ${brier(rows).toFixed(4)}`);
    console.log(`  Brier, predicting the base rate: ${brier(baseline).toFixed(4)}  (beat this)`);
    console.log(`  accuracy at 0.5 (NFR-03)       : ${((correctAtHalf / rows.length) * 100).toFixed(1)}%`);

    console.log('\n── Verdict ─────────────────────────────────────────────────');
    if (rows.length < MIN_ROWS) {
        console.log(
            `  NOT REPORTABLE. ${rows.length} rows is below the ${MIN_ROWS} this script\n` +
                `  will draw a conclusion from. The numbers above are printed so the\n` +
                `  pipeline can be seen working, not so they can be quoted.`
        );
    } else if (brier(rows) >= brier(baseline)) {
        console.log(
            `  The model does not beat predicting the base rate. On this evidence\n` +
                `  it has learned nothing useful about which student succeeds where.`
        );
    } else {
        console.log(`  The model beats the base rate. Calibration table above for the shape of it.`);
    }
    console.log();

    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
