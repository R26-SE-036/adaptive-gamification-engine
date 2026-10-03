/**
 * Weekly quests.
 *
 * Four a week, the same four for everyone - a shared goal is something to
 * talk about, a personal one is not - drawn from a pool by rotating through it
 * a step of three at a time. Three and the pool size of eight have no common
 * factor, so the four picked are always distinct and the combination changes
 * every week for eight weeks before repeating.
 *
 * Progress is counted only from rounds played during the week (Monday to
 * Sunday, local), and a quest pays out once, when it completes - the profile
 * keeps which quests of which week have been paid.
 */

const { statsFromSessions } = require('./stats');

const POOL = Object.freeze([
    { id: 'play_10', title: 'Warm-up', description: 'Play 10 rounds.', metric: 'rounds', target: 10, xp: 150, icon: 'gamepad' },
    { id: 'perfect_3', title: 'Sharpshooter', description: 'Score 100 three times.', metric: 'perfects', target: 3, xp: 200, icon: 'star' },
    { id: 'formats_3', title: 'Mix it up', description: 'Play 3 different game formats.', metric: 'formatsPlayed', target: 3, xp: 150, icon: 'compass' },
    { id: 'concepts_3', title: 'Branch out', description: 'Practise 3 different concepts.', metric: 'conceptsPlayed', target: 3, xp: 150, icon: 'layers' },
    { id: 'no_hints_5', title: 'No help needed', description: 'Pass 5 rounds without a hint.', metric: 'noHintPasses', target: 5, xp: 200, icon: 'brain' },
    { id: 'daily_3', title: 'Daily regular', description: 'Complete 3 daily challenges.', metric: 'dailyCompleted', target: 3, xp: 200, icon: 'calendar' },
    { id: 'hard_2', title: 'Level up', description: 'Pass 2 rounds at Intermediate or above.', metric: 'hardPasses', target: 2, xp: 200, icon: 'mountain' },
    { id: 'days_4', title: 'Showing up', description: 'Play on 4 different days.', metric: 'daysPlayed', target: 4, xp: 250, icon: 'flame' }
]);

const PER_WEEK = 4;
const STEP = 3;

/** The four quests of week number `index`. */
function questsForWeek(index) {
    const picked = [];
    for (let i = 0; i < PER_WEEK; i += 1) {
        picked.push(POOL[(((index + i * STEP) % POOL.length) + POOL.length) % POOL.length]);
    }
    return picked;
}

/**
 * This week's quests with progress.
 *
 * @param weekSessions  this week's rounds, each with `day` set
 * @param dailyCompleted daily challenges completed this week
 * @param paid          ids of this week's quests already paid out
 */
function evaluateQuests(index, weekSessions, dailyCompleted, paid = new Set()) {
    const stats = statsFromSessions(weekSessions, { dailyCompleted });

    return questsForWeek(index).map((quest) => {
        const value = Math.max(0, Number(stats[quest.metric]) || 0);
        return {
            ...quest,
            current: Math.min(quest.target, value),
            complete: value >= quest.target,
            claimed: paid.has(quest.id)
        };
    });
}

module.exports = { POOL, questsForWeek, evaluateQuests };
