/**
 * What the student should play next, and why.
 *
 * ============================ WHY THIS FILE EXISTS ============================
 * FR-09 asks the engine to "determine and assign the most appropriate game type
 * for the student's next session based on diagnosed performance weaknesses", and
 * FR-11 asks it to show "the rationale for the next assigned activity".
 *
 * Neither was implemented. POST /game/submit answered with:
 *
 *     nextRecommendedGame: 'Optional: further recommendation logic'
 *
 * - a literal placeholder, sent to the client on every completed game for the
 * life of the project. Nothing downstream could act on it, and nothing did.
 *
 * ==================== WHAT FR-09 CAN AND CANNOT MEAN HERE ====================
 * The proposal frames game type as a free choice driven by error type:
 *
 *     IF errorType = 'syntax' AND frequency > 3   THEN assign Bug Hunt
 *     IF logicErrors > debugErrors                THEN assign Drag & Drop
 *
 * The implementation cannot honour that, and it is worth being precise about
 * why rather than pretending otherwise. `CONCEPT_GAME_MAPPING` in
 * config/constants.js fixes exactly one game type per concept, and the question
 * bank follows it - all 75 questions sit at that one type, with no concept
 * carrying a second. Measured on the live bank:
 *
 *     concepts with more than one game type: 0 of 14
 *
 * So game type is not an independent decision at all: choosing a concept
 * chooses the type. A rule that "assigns Drag & Drop for logic errors" would be
 * theatre - it would either pick a concept that happens to map to Drag & Drop,
 * or name a game the bank cannot serve.
 *
 * This file therefore recommends the CONCEPT, and reports the type that follows
 * from it. That is the decision the data can actually support. Making type a
 * real choice means authoring the same concept at several formats; until then
 * the honest version is this one, and docs/proposal-gap-analysis.md records the
 * gap rather than hiding it behind unreachable branches.
 *
 * (An earlier draft of this file had two extra rules - "weak in another format
 * on this concept" and "a format on this concept never tried". Both were dead
 * on arrival for the reason above: `playableTypes` returned nothing every time.)
 *
 * ========================== HOW THE CHOICE IS MADE ==========================
 * A priority-ordered rule set, matching the proposal's "rule-based expert
 * system" rather than a second model. Difficulty is the learned decision (see
 * difficultyService.js); what to study next is a pedagogical judgement with no
 * outcome in the data that says which answer was right, so a rule that can be
 * read and argued with is the honest instrument.
 *
 * First match wins:
 *
 *   R1  Not cleared this concept yet  -> stay on it.
 *   R2  Cleared it, weaker elsewhere  -> their weakest other attempted concept.
 *   R3  Everything attempted is       -> a concept they have never played.
 *       strong
 *   R4  Nothing left to go on         -> another round of the same concept.
 *
 * Every branch names itself in `rule` and explains itself in `reason`, because a
 * recommendation a student is asked to accept should be able to say why.
 *
 * Nothing is recommended unless the question bank can serve it. The bank is not
 * uniformly populated - conditional_logic has 10 questions, most concepts have
 * 5 - and a rule that ignored this would send students to an empty game.
 */

const GameSession = require('../models/GameSession');
const QuestionBank = require('../models/QuestionBank');
const { CONCEPT_GAME_MAPPING, CONCEPT_TAGS, GAME_TYPES } = require('../config/constants');
const { SUCCESS_SCORE } = require('./difficultyService');

/** The concepts from `candidates` the bank actually holds questions for. */
async function servableConcepts(candidates) {
    if (candidates.length === 0) return new Set();

    const rows = await QuestionBank.aggregate([
        { $match: { conceptTag: { $in: candidates } } },
        { $group: { _id: '$conceptTag' } }
    ]);

    return new Set(rows.map((row) => row._id));
}

/** The game type that follows from a concept, per CONCEPT_GAME_MAPPING. */
function gameTypeFor(conceptTag) {
    return CONCEPT_GAME_MAPPING[conceptTag] || GAME_TYPES[0];
}

function label(conceptTag) {
    return conceptTag.replace(/_/g, ' ');
}

/**
 * @returns {Promise<{gameType: string, conceptTag: string, rule: string, reason: string}>}
 *   Always resolves to something the bank can serve. The caller is answering a
 *   student who has just finished a game, so "no recommendation" is not useful.
 */
async function recommendNextGame({ userId, conceptTag, lastScore }) {
    const stay = {
        gameType: gameTypeFor(conceptTag),
        conceptTag,
        rule: 'R4_default',
        reason: `Another round of ${label(conceptTag)} to keep it fresh.`
    };

    // ── R1: not through this concept yet ─────────────────────────────────────
    // Their best on this concept, not just the round they have this second - one
    // unlucky attempt should not undo a concept they have already shown.
    const best = await GameSession.aggregate([
        { $match: { userId, conceptTag } },
        { $group: { _id: null, best: { $max: '$score' } } }
    ]);

    const bestHere = Math.max(best[0]?.best ?? 0, lastScore ?? 0);

    if (bestHere < SUCCESS_SCORE) {
        return {
            gameType: gameTypeFor(conceptTag),
            conceptTag,
            rule: 'R1_not_cleared',
            reason: `You have not cleared ${label(conceptTag)} yet, so the next round stays on it.`
        };
    }

    // ── R2: cleared here, weaker somewhere else ──────────────────────────────
    const elsewhere = await GameSession.aggregate([
        { $match: { userId, conceptTag: { $ne: conceptTag } } },
        { $group: { _id: '$conceptTag', average: { $avg: '$score' } } },
        { $match: { average: { $lt: SUCCESS_SCORE } } },
        { $sort: { average: 1 } },
        { $limit: 5 }
    ]);

    if (elsewhere.length > 0) {
        const servable = await servableConcepts(elsewhere.map((row) => row._id));
        const pick = elsewhere.find((row) => servable.has(row._id));

        if (pick) {
            return {
                gameType: gameTypeFor(pick._id),
                conceptTag: pick._id,
                rule: 'R2_weakest_other_concept',
                reason:
                    `${label(conceptTag)} is covered. ${label(pick._id)} is your ` +
                    `weakest concept at ${Math.round(pick.average)}%.`
            };
        }
    }

    // ── R3: everything attempted is strong - widen ───────────────────────────
    const played = await GameSession.distinct('conceptTag', { userId });
    const unplayed = CONCEPT_TAGS.filter((tag) => !played.includes(tag));

    if (unplayed.length > 0) {
        const servable = await servableConcepts(unplayed);
        const pick = unplayed.find((tag) => servable.has(tag));

        if (pick) {
            return {
                gameType: gameTypeFor(pick),
                conceptTag: pick,
                rule: 'R3_new_concept',
                reason:
                    `You are clearing what you have played. ${label(pick)} is new ` +
                    `ground.`
            };
        }
    }

    // ── R4: nothing left to go on ────────────────────────────────────────────
    return stay;
}

module.exports = { recommendNextGame, servableConcepts, gameTypeFor };
