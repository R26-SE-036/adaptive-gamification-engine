/**
 * XP, levels and streaks: the arithmetic of the reward loop.
 *
 * Pure functions only - no database - so every rule here is pinned by a test
 * and the route that applies them (services/rewardsService.js) is left with
 * nothing to decide.
 *
 * ========================= XP IS NOT THE SCORE =========================
 * The score says how well one question went and is evidence the adaptive
 * engine learns from; it must not move for anything else. XP is the reward:
 * it starts from the score and then pays for the things worth encouraging -
 * taking on a harder level, getting it flawless, coming back every day. Kept
 * as a separate number so a bonus can never leak into the training data.
 */

const DIFFICULTY_MULTIPLIER = Object.freeze({
    Beginner: 1,
    Elementary: 1.15,
    Intermediate: 1.3,
    Advanced: 1.5,
    Expert: 1.75
});

/** What a round that scored nothing still earns. Trying is worth something. */
const EFFORT_XP = 5;
const FLAWLESS_XP = 20;
/** +5% per streak day, capped: a 10-day streak and a 100-day one pay the same. */
const STREAK_STEP = 0.05;
const STREAK_CAP = 0.5;
/** XP for an achievement, on top of whatever it took to earn it. */
const ACHIEVEMENT_XP = 50;

/**
 * XP for one round, as an itemised receipt.
 *
 * The breakdown is the point as much as the total: "+130 XP" is a number,
 * "100 score, +30 Intermediate, +20 flawless" tells a student what to do to
 * earn more next time.
 */
function xpForRound({ score, difficulty, streak = 0, isDaily = false }) {
    const lines = [];
    const safeScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

    if (safeScore === 0) {
        lines.push({ label: 'Effort', amount: EFFORT_XP });
    } else {
        lines.push({ label: 'Score', amount: safeScore });

        const multiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? 1;
        if (multiplier > 1) {
            lines.push({
                label: `${difficulty} bonus`,
                amount: Math.round(safeScore * (multiplier - 1))
            });
        }

        // 100 is only reachable with no hints and a first-try answer - the
        // score already charges for both - so this needs no other condition.
        if (safeScore === 100) lines.push({ label: 'Flawless', amount: FLAWLESS_XP });

        if (streak >= 2) {
            const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
            lines.push({
                label: `${streak}-day streak`,
                amount: Math.round(subtotal * Math.min(STREAK_CAP, STREAK_STEP * streak))
            });
        }
    }

    if (isDaily) {
        const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
        lines.push({ label: 'Daily challenge x2', amount: subtotal });
    }

    return { total: lines.reduce((sum, line) => sum + line.amount, 0), lines };
}

/* ── Levels ─────────────────────────────────────────────────────────────── */

/**
 * XP needed to reach level `level`, from zero.
 *
 * Each level costs 100 XP more than the last: 100 to reach level 2, then 200,
 * 300, ... A good round is worth 100-150 XP, so the first levels come in a
 * round or two - early wins matter most - and level 10 is around 35 rounds.
 */
function xpToReach(level) {
    return 50 * level * (level - 1);
}

const TITLES = [
    { from: 1, title: 'Hello World' },
    { from: 3, title: 'Syntax Scout' },
    { from: 5, title: 'Loop Learner' },
    { from: 8, title: 'Bug Hunter' },
    { from: 12, title: 'Code Crafter' },
    { from: 16, title: 'Logic Wizard' },
    { from: 21, title: 'Java Guru' }
];

function titleFor(level) {
    let title = TITLES[0].title;
    for (const step of TITLES) if (level >= step.from) title = step.title;
    return title;
}

/** Where `xp` puts a player: level, title and the way to the next one. */
function levelFor(xp) {
    const total = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    while (xpToReach(level + 1) <= total) level += 1;

    const floor = xpToReach(level);
    const ceiling = xpToReach(level + 1);

    return {
        level,
        title: titleFor(level),
        xp: total,
        intoLevel: total - floor,
        levelSize: ceiling - floor,
        toNext: ceiling - total,
        progress: (total - floor) / (ceiling - floor)
    };
}

/* ── Streaks ────────────────────────────────────────────────────────────── */

const MAX_FREEZES = 2;
const FREEZE_EVERY = 7;

/**
 * The streak after playing on day `today`.
 *
 * `lastDay` is the local day number of the previous round, or null for a
 * first round. Playing twice in a day changes nothing; the next day extends
 * the streak; a gap ends it.
 *
 * Except once: a streak shield, earned every seventh day in a row (two at
 * most), covers exactly one missed day. Losing a 20-day streak to one busy
 * evening is the moment a student stops coming back, and the shield is there
 * for that evening - not for a week away, which still resets.
 */
function nextStreak({ current = 0, longest = 0, freezes = 0, lastDay = null }, today) {
    let next = current;
    let shields = freezes;
    let freezeUsed = false;

    if (lastDay === null || lastDay === undefined) {
        next = 1;
    } else {
        const gap = today - lastDay;
        if (gap <= 0) {
            next = Math.max(1, current);
        } else if (gap === 1) {
            next = current + 1;
        } else if (gap === 2 && shields > 0) {
            shields -= 1;
            freezeUsed = true;
            next = current + 1;
        } else {
            next = 1;
        }
    }

    const extended = next > current;
    const freezeEarned = extended && next % FREEZE_EVERY === 0 && shields < MAX_FREEZES;
    if (freezeEarned) shields += 1;

    return {
        current: next,
        longest: Math.max(longest, next),
        freezes: shields,
        freezeUsed,
        freezeEarned,
        extended
    };
}

/**
 * The streak as it stands on `today`, without playing.
 *
 * Stored streaks only change when a round is played, so a streak that ended
 * last week still reads as alive in the database. This is what the page
 * should show: 0 if it is already lost, and whether today is the day to save
 * it.
 */
function streakToday({ current = 0, freezes = 0, lastDay = null }, today) {
    if (lastDay === null || lastDay === undefined || current <= 0) {
        return { current: 0, playedToday: false, atRisk: false };
    }

    const gap = today - lastDay;
    if (gap <= 0) return { current, playedToday: true, atRisk: false };
    if (gap === 1) return { current, playedToday: false, atRisk: true };
    if (gap === 2 && freezes > 0) return { current, playedToday: false, atRisk: true, shieldWillBeUsed: true };
    return { current: 0, playedToday: false, atRisk: false };
}

module.exports = {
    DIFFICULTY_MULTIPLIER,
    ACHIEVEMENT_XP,
    xpForRound,
    xpToReach,
    levelFor,
    titleFor,
    nextStreak,
    streakToday
};
