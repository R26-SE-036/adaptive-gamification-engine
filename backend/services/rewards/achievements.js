/**
 * The achievement catalogue.
 *
 * Each one is a target on a single number from stats.js, so whether it is
 * earned - and how close a player is - is the same lookup. Showing progress on
 * the locked ones ("7 of 10") is most of what makes them worth chasing; a
 * locked badge with no way to tell how far off it is reads as a wall.
 *
 * Ids are permanent: they are stored on the player's profile when unlocked.
 * Rename a title freely, never an id.
 *
 * `icon` names a lucide icon the web app maps; `tier` sets the colour.
 */

const CATALOGUE = Object.freeze([
    // Getting started
    { id: 'first_round', title: 'Hello, World!', description: 'Finish your first round.', icon: 'rocket', tier: 'bronze', metric: 'rounds', target: 1 },
    { id: 'rounds_10', title: 'Warming Up', description: 'Play 10 rounds.', icon: 'gamepad', tier: 'bronze', metric: 'rounds', target: 10 },
    { id: 'rounds_50', title: 'Dedicated', description: 'Play 50 rounds.', icon: 'gamepad', tier: 'silver', metric: 'rounds', target: 50 },
    { id: 'rounds_150', title: 'Marathoner', description: 'Play 150 rounds.', icon: 'crown', tier: 'gold', metric: 'rounds', target: 150 },

    // Skill
    { id: 'perfect_1', title: 'Flawless', description: 'Score 100 on a round.', icon: 'star', tier: 'bronze', metric: 'perfects', target: 1 },
    { id: 'perfect_10', title: 'Perfectionist', description: 'Score 100 ten times.', icon: 'star', tier: 'silver', metric: 'perfects', target: 10 },
    { id: 'hat_trick', title: 'Hat-trick', description: 'Score 100 three rounds in a row.', icon: 'sparkles', tier: 'silver', metric: 'maxPerfectRun', target: 3 },
    { id: 'no_hints_10', title: 'Self-reliant', description: 'Pass 10 rounds without a hint.', icon: 'brain', tier: 'silver', metric: 'noHintPasses', target: 10 },
    { id: 'speed_5', title: 'Speed Demon', description: 'Pass 5 rounds in 20 seconds or less.', icon: 'zap', tier: 'silver', metric: 'fastPasses', target: 5 },
    { id: 'hard_5', title: 'Up for a Challenge', description: 'Pass 5 rounds at Intermediate or above.', icon: 'mountain', tier: 'silver', metric: 'hardPasses', target: 5 },
    { id: 'expert_1', title: 'Expert Mode', description: 'Pass a round at Expert level.', icon: 'trophy', tier: 'gold', metric: 'expertPasses', target: 1 },

    // Breadth
    { id: 'all_formats', title: 'Explorer', description: 'Play all four game formats.', icon: 'compass', tier: 'bronze', metric: 'formatsPlayed', target: 4 },
    { id: 'concepts_5', title: 'Collector', description: 'Pass rounds on 5 different concepts.', icon: 'layers', tier: 'silver', metric: 'conceptsPassed', target: 5 },
    { id: 'concepts_10', title: 'Well-rounded', description: 'Pass rounds on 10 different concepts.', icon: 'layers', tier: 'gold', metric: 'conceptsPassed', target: 10 },
    { id: 'comeback_1', title: 'Comeback Kid', description: 'Pass a concept you once failed.', icon: 'refresh', tier: 'bronze', metric: 'comebacks', target: 1 },

    // Habit
    { id: 'streak_3', title: 'On Fire', description: 'Play 3 days in a row.', icon: 'flame', tier: 'bronze', metric: 'longestStreak', target: 3 },
    { id: 'streak_7', title: 'Week Warrior', description: 'Play 7 days in a row.', icon: 'flame', tier: 'silver', metric: 'longestStreak', target: 7 },
    { id: 'streak_30', title: 'Unstoppable', description: 'Play 30 days in a row.', icon: 'flame', tier: 'gold', metric: 'longestStreak', target: 30 },
    { id: 'daily_1', title: 'Daily Dose', description: 'Complete a daily challenge.', icon: 'calendar', tier: 'bronze', metric: 'dailyCompleted', target: 1 },
    { id: 'daily_10', title: 'Creature of Habit', description: 'Complete 10 daily challenges.', icon: 'calendar', tier: 'gold', metric: 'dailyCompleted', target: 10 },

    // Levels
    { id: 'level_5', title: 'Rising Star', description: 'Reach level 5.', icon: 'trending', tier: 'bronze', metric: 'level', target: 5 },
    { id: 'level_10', title: 'Veteran', description: 'Reach level 10.', icon: 'medal', tier: 'gold', metric: 'level', target: 10 }
]);

/**
 * Every achievement with how far `stats` has got towards it.
 *
 * `alreadyUnlocked` is the set of ids stored on the profile. An achievement
 * stays unlocked once earned even if its number could in principle go down -
 * a round later invalidated as defective must not take a badge back.
 */
function evaluateAchievements(stats, alreadyUnlocked = new Map()) {
    return CATALOGUE.map((item) => {
        const value = Math.max(0, Number(stats[item.metric]) || 0);
        const stored = alreadyUnlocked.get(item.id) ?? null;
        const unlocked = Boolean(stored) || value >= item.target;

        return {
            ...item,
            current: unlocked ? item.target : Math.min(item.target, value),
            unlocked,
            unlockedAt: stored
        };
    });
}

/** The ones `stats` reaches that are not stored yet. */
function newlyUnlocked(stats, alreadyUnlocked = new Map()) {
    return evaluateAchievements(stats, alreadyUnlocked).filter(
        (item) => item.unlocked && !alreadyUnlocked.has(item.id)
    );
}

module.exports = { CATALOGUE, evaluateAchievements, newlyUnlocked };
