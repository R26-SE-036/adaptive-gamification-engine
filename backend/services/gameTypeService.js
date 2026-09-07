/**
 * Which FORMAT a concept should be practised in. The other half of FR-09.
 *
 * ========================= WHAT WAS STRUCTURALLY WRONG =======================
 * FR-09 asks the engine to assign the game type "based on diagnosed performance
 * weaknesses", with rules of the shape
 *
 *     IF errorType = 'syntax' AND frequency > 3   THEN assign Bug Hunt
 *     IF logicErrors > debugErrors                THEN assign Drag & Drop
 *
 * That was not implementable, and the reason was in the data rather than the
 * code. `CONCEPT_GAME_MAPPING` fixed exactly one game type per concept and the
 * question bank followed it:
 *
 *     concepts with more than one game type: 0 of 14
 *
 * So game type was not a decision at all - choosing a concept chose the format.
 * A rule "assigning Drag & Drop for logic errors" would either have been picking
 * a concept that happens to map to Drag & Drop, or naming a game the bank could
 * not serve. Phase 2 authored CodeFix for every error type, and every concept now
 * offers two formats, so the choice exists and this file makes it.
 *
 * ============================= THE ORDERING IDEA ============================
 * The four games do not differ only in topic; they differ in what they ask a
 * student to DO, and those demands are ordered:
 *
 *     BugHunt     recognise    point at the line that is wrong
 *     DragDrop    arrange      put correct pieces in the right order
 *     CodeTrace   predict      say what the code will do
 *     CodeFix     produce      write the corrected line yourself
 *
 * Recognising a broken loop bound is easier than writing the fixed one, and a
 * student who cannot yet recognise it will not be helped by being asked to
 * produce it. So the rule is: RECOGNISE BEFORE PRODUCE. Failing at a format
 * steps down the ladder; being comfortable at one steps up.
 *
 * That is a pedagogical claim, not a measurement - which is exactly why it is
 * a named table here rather than something fitted. It is the same division of
 * labour as difficulty: the model says how likely success is, the rule says
 * what should happen about it.
 *
 * ================================ HONESTY ==================================
 * With the bank as it stands each concept offers precisely two formats -
 * CodeFix and one other - so in practice this chooses between "recognise" and
 * "produce". The ladder is written for four because the bank can grow into it,
 * and because collapsing it to a boolean would have to be undone the moment a
 * second recognition format is authored for a concept.
 */

const GameSession = require('../models/GameSession');
const QuestionBank = require('../models/QuestionBank');
const { CONCEPT_GAME_MAPPING, GAME_TYPES } = require('../config/constants');
const { SUCCESS_SCORE } = require('./difficultyService');

/**
 * What each format asks of the student, low demand to high.
 *
 * DragDrop and CodeTrace share a rung deliberately: arranging correct pieces
 * and predicting behaviour are different skills, but neither is obviously the
 * harder, and inventing an order between them would be a claim with nothing
 * behind it.
 */
const DEMAND = {
    BugHunt: 1,
    DragDrop: 2,
    CodeTrace: 2,
    CodeFix: 3
};

const demandOf = (gameType) => DEMAND[gameType] ?? 2;

/** 'loop_boundaries' -> 'loop boundaries'. */
const label = (conceptTag) => String(conceptTag || '').replace(/_/g, ' ');

/** Which formats the bank can actually serve for this concept. */
async function availableFormats(conceptTag) {
    const rows = await QuestionBank.aggregate([
        { $match: { conceptTag } },
        { $group: { _id: '$gameType' } }
    ]);

    return rows
        .map((row) => row._id)
        .filter((gameType) => GAME_TYPES.includes(gameType))
        .sort((a, b) => demandOf(a) - demandOf(b));
}

/** Average score per format for one student on one concept. */
function averageByFormat(sessions) {
    const totals = new Map();

    for (const session of sessions) {
        const entry = totals.get(session.gameType) || { sum: 0, n: 0 };
        entry.sum += session.score || 0;
        entry.n += 1;
        totals.set(session.gameType, entry);
    }

    return new Map(Array.from(totals, ([gameType, { sum, n }]) => [gameType, sum / n]));
}

/**
 * Choose the format for this student's next round on this concept.
 *
 * `sessions`, `available` and `formatCounts` may be supplied by a caller that
 * already holds them - which saves queries on the path of a student waiting for
 * a game, and lets the rule be tested without a database.
 *
 * `formatCounts` is how many rounds this student has played of each format
 * ACROSS ALL CONCEPTS. Only G1 needs it, so it is fetched lazily rather than on
 * every call.
 *
 * @returns {Promise<{gameType: string, rule: string, reason: string,
 *                    available: string[], averages: Record<string, number>}>}
 */
async function chooseGameType({
    userId,
    conceptTag,
    sessions,
    available: given,
    formatCounts
}) {
    const available = given || (await availableFormats(conceptTag));

    // Nothing in the bank for this concept: hand back the mapping's answer so
    // the caller still has something to query with. It will fall through to the
    // concept-only fallback, which is the honest outcome for a concept that has
    // no questions.
    if (available.length === 0) {
        const fallback = CONCEPT_GAME_MAPPING[conceptTag] || GAME_TYPES[0];
        return {
            gameType: fallback,
            rule: 'G0_nothing_available',
            reason: `The bank holds no questions for ${conceptTag}.`,
            available,
            averages: {}
        };
    }

    const played =
        sessions ||
        (await GameSession.find({ userId, conceptTag }).select('gameType score').lean());

    const averages = averageByFormat(played);
    const attempted = available.filter((gameType) => averages.has(gameType));
    const untried = available.filter((gameType) => !averages.has(gameType));

    const asObject = Object.fromEntries(
        Array.from(averages, ([gameType, average]) => [gameType, Math.round(average)])
    );

    // ── G1: nothing played on THIS concept yet ───────────────────────────────
    //
    // This used to return `available[0]` - always the lowest demand. That was
    // right in isolation and wrong in aggregate: 8 of the 14 concepts have
    // BugHunt as their lowest rung, so a new student was served BugHunt on 57%
    // of concepts and never saw CodeFix at all until they had passed something.
    // "I only see Bug Hunt" was the entirely predictable result.
    //
    // The fix is to look at what they have played ANYWHERE, not just here. A
    // student who has done three rounds of BugHunt on other concepts meets a
    // new concept in a format they have not seen yet, which is both more varied
    // and a better read on them - the same idea in a new form tells you more
    // than the fourth repetition of one form.
    //
    // Recognise-before-produce still holds as the tie-break: with nothing played
    // anywhere, `available` is ordered by demand and the first is still lowest.
    if (attempted.length === 0) {
        const playedAnywhere =
            formatCounts ||
            (await GameSession.aggregate([
                { $match: { userId } },
                { $group: { _id: '$gameType', n: { $sum: 1 } } }
            ]));

        const timesPlayed = new Map(playedAnywhere.map((row) => [row._id, row.n]));
        const seenAnything = timesPlayed.size > 0;

        // Least-played first; demand order breaks ties, so a brand-new student
        // still starts at the bottom of the ladder.
        const pick = [...available].sort(
            (a, b) =>
                (timesPlayed.get(a) ?? 0) - (timesPlayed.get(b) ?? 0) ||
                demandOf(a) - demandOf(b)
        )[0];

        return {
            gameType: pick,
            rule: seenAnything ? 'G1_least_played_format' : 'G1_start_low',
            reason: seenAnything
                ? `First round on ${label(conceptTag)}. ${pick} is the format you have ` +
                  `played least, so it is the one worth seeing here.`
                : `First round on ${label(conceptTag)}, so it starts with ${pick}.`,
            available,
            averages: asObject
        };
    }

    // The format they are currently working in: the highest-demand one they
    // have attempted. A student who has done both recognition and production is
    // "at" production, and the question is whether to keep them there.
    const at = attempted[attempted.length - 1];
    const atAverage = averages.get(at);

    // ── G2: struggling - step DOWN in demand ─────────────────────────────────
    if (atAverage < SUCCESS_SCORE) {
        const easier = available.filter((gameType) => demandOf(gameType) < demandOf(at));

        if (easier.length > 0) {
            const pick = easier[easier.length - 1];
            return {
                gameType: pick,
                rule: 'G2_step_down',
                reason:
                    `Averaging ${Math.round(atAverage)}% at ${at}. ${pick} asks the same ` +
                    `idea in a form that is easier to get started with.`,
                available,
                averages: asObject
            };
        }

        return {
            gameType: at,
            rule: 'G2_step_down_at_floor',
            reason:
                `Averaging ${Math.round(atAverage)}% at ${at}, which is already the ` +
                `simplest format for this concept.`,
            available,
            averages: asObject
        };
    }

    // ── G3: comfortable, and something harder exists - step UP ───────────────
    const harder = untried.filter((gameType) => demandOf(gameType) > demandOf(at));

    if (harder.length > 0) {
        return {
            gameType: harder[0],
            rule: 'G3_step_up',
            reason:
                `${Math.round(atAverage)}% at ${at}. ${harder[0]} asks for the same ` +
                `idea in a more demanding form.`,
            available,
            averages: asObject
        };
    }

    // ── G4: everything attempted - go back to one not yet passed ─────────────
    //
    // The test is the pass mark, NOT "whichever is lower". Comparing averages
    // pulled a student who was on 90% and 95% back to the 90% one, which made
    // G5 unreachable and meant nobody ever stayed on the demanding format for
    // two rounds running. Being better at one thing than another is not a
    // weakness; being below the pass mark is.
    const weakest = attempted.reduce((worst, gameType) =>
        averages.get(gameType) < averages.get(worst) ? gameType : worst
    );

    if (weakest !== at && averages.get(weakest) < SUCCESS_SCORE) {
        return {
            gameType: weakest,
            rule: 'G4_weakest_format',
            reason:
                `Comfortable at ${at}, but ${Math.round(averages.get(weakest))}% at ` +
                `${weakest} is still short of ${SUCCESS_SCORE}%.`,
            available,
            averages: asObject
        };
    }

    // ── G5: solid everywhere - stay at the most demanding ────────────────────
    return {
        gameType: at,
        rule: 'G5_stay_at_top',
        reason: `Solid across every format for this concept; staying with ${at}.`,
        available,
        averages: asObject
    };
}

module.exports = { DEMAND, demandOf, availableFormats, chooseGameType };
