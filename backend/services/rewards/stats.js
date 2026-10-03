/**
 * Counts over a player's rounds, shared by achievements and quests.
 *
 * Read from GameSession - the engine's own record of what was graded - and
 * never from anything the browser reports, so nothing here can be claimed
 * without being played. Only rounds that count as evidence are passed in (see
 * GameSession.evidence): a round lost to a defective question should not cost
 * anyone a quest either.
 */

const PASS = 70;
const HARD_LEVELS = new Set(['Intermediate', 'Advanced', 'Expert']);
const FAST_SECONDS = 20;

/**
 * @param sessions  rounds oldest first: { score, gameType, conceptTag,
 *                  difficultyLevel, hintUsage, timeTakenSeconds, completedAt }
 * @param extra     facts that do not live on a round: dailyCompleted,
 *                  longestStreak, level
 */
function statsFromSessions(sessions, extra = {}) {
    let perfects = 0;
    let perfectRun = 0;
    let maxPerfectRun = 0;
    let noHintPasses = 0;
    let fastPasses = 0;
    let hardPasses = 0;
    let expertPasses = 0;

    const formats = new Set();
    const conceptsPlayed = new Set();
    const conceptsPassed = new Set();
    const failedConcepts = new Set();
    const comebacks = new Set();
    const days = new Set();

    for (const round of sessions) {
        const score = Number(round.score) || 0;
        const passed = score >= PASS;

        formats.add(round.gameType);
        conceptsPlayed.add(round.conceptTag);
        if (round.day !== undefined) days.add(round.day);

        if (score >= 100) {
            perfects += 1;
            perfectRun += 1;
            maxPerfectRun = Math.max(maxPerfectRun, perfectRun);
        } else {
            perfectRun = 0;
        }

        if (passed) {
            conceptsPassed.add(round.conceptTag);
            if (!round.hintUsage) noHintPasses += 1;
            if (round.timeTakenSeconds > 0 && round.timeTakenSeconds <= FAST_SECONDS) fastPasses += 1;
            if (HARD_LEVELS.has(round.difficultyLevel)) hardPasses += 1;
            if (round.difficultyLevel === 'Expert') expertPasses += 1;
            // Passed a concept this player had failed before: a comeback.
            if (failedConcepts.has(round.conceptTag)) comebacks.add(round.conceptTag);
        } else {
            failedConcepts.add(round.conceptTag);
        }
    }

    return {
        rounds: sessions.length,
        perfects,
        maxPerfectRun,
        noHintPasses,
        fastPasses,
        hardPasses,
        expertPasses,
        formatsPlayed: formats.size,
        conceptsPlayed: conceptsPlayed.size,
        conceptsPassed: conceptsPassed.size,
        comebacks: comebacks.size,
        daysPlayed: days.size,
        dailyCompleted: extra.dailyCompleted ?? 0,
        longestStreak: extra.longestStreak ?? 0,
        level: extra.level ?? 1
    };
}

module.exports = { statsFromSessions, PASS };
