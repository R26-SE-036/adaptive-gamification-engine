/**
 * Run: npm test
 *
 * The reward loop's rules: XP, levels, streaks, achievements, weekly quests
 * and the daily challenge pick. All pure, so every promise the Practice page
 * makes to a student is pinned here.
 */

const test = require('node:test');
const assert = require('node:assert');

process.env.PLAY_TZ_OFFSET_MINUTES = '330';

const calendar = require('../services/rewards/calendar');
const {
    xpForRound, levelFor, xpToReach, nextStreak, streakToday, titleFor
} = require('../services/rewards/progression');
const { statsFromSessions } = require('../services/rewards/stats');
const { CATALOGUE, evaluateAchievements, newlyUnlocked } = require('../services/rewards/achievements');
const { POOL, questsForWeek, evaluateQuests } = require('../services/rewards/quests');
const { pickDaily } = require('../services/rewards/daily');
const { displayNameFrom, initialsOf } = require('../services/rewardsService');

/* ── Calendar ───────────────────────────────────────────────────────────── */

test('the day changes at local midnight, not at midnight UTC', () => {
    // 18:29 UTC is 23:59 in Colombo; 18:31 UTC is 00:01 the next day there.
    const before = new Date('2026-10-05T18:29:00Z');
    const after = new Date('2026-10-05T18:31:00Z');
    assert.strictEqual(calendar.dayKey(before), '2026-10-05');
    assert.strictEqual(calendar.dayKey(after), '2026-10-06');
    assert.strictEqual(calendar.dayNumber(after) - calendar.dayNumber(before), 1);
});

test('a week runs Monday to Sunday and is keyed by its Monday', () => {
    // 2026-10-05 is a Monday; 2026-10-11 the Sunday after it.
    assert.strictEqual(calendar.weekKey(new Date('2026-10-05T06:00:00Z')), '2026-10-05');
    assert.strictEqual(calendar.weekKey(new Date('2026-10-11T12:00:00Z')), '2026-10-05');
    assert.strictEqual(calendar.weekKey(new Date('2026-10-12T06:00:00Z')), '2026-10-12');

    const { start, end } = calendar.weekBounds(new Date('2026-10-08T06:00:00Z'));
    assert.strictEqual(end - start, 7 * 86_400_000);
    assert.strictEqual(calendar.dayKey(start), '2026-10-05');
});

test('consecutive weeks have consecutive indexes', () => {
    const one = calendar.weekIndex(new Date('2026-10-05T06:00:00Z'));
    const two = calendar.weekIndex(new Date('2026-10-12T06:00:00Z'));
    assert.strictEqual(two - one, 1);
});

/* ── XP ─────────────────────────────────────────────────────────────────── */

test('XP starts from the score and pays more for a harder level', () => {
    const easy = xpForRound({ score: 80, difficulty: 'Beginner' });
    const hard = xpForRound({ score: 80, difficulty: 'Advanced' });
    assert.strictEqual(easy.total, 80);
    assert.strictEqual(hard.total, 120);
});

test('a flawless round earns a bonus line of its own', () => {
    const result = xpForRound({ score: 100, difficulty: 'Beginner' });
    assert.deepStrictEqual(result.lines.map((l) => l.label), ['Score', 'Flawless']);
    assert.strictEqual(result.total, 120);
});

test('a round that scored nothing still earns effort XP', () => {
    assert.strictEqual(xpForRound({ score: 0, difficulty: 'Expert' }).total, 5);
});

test('the streak bonus grows by 5% a day and stops at 50%', () => {
    assert.strictEqual(xpForRound({ score: 100, difficulty: 'Beginner', streak: 2 }).total, 132);
    const capped = xpForRound({ score: 100, difficulty: 'Beginner', streak: 30 });
    assert.strictEqual(capped.total, 180);
});

test('the daily challenge doubles everything before it', () => {
    const plain = xpForRound({ score: 90, difficulty: 'Intermediate' });
    const daily = xpForRound({ score: 90, difficulty: 'Intermediate', isDaily: true });
    assert.strictEqual(daily.total, plain.total * 2);
});

test('XP never trusts a score outside 0-100', () => {
    assert.strictEqual(xpForRound({ score: 900, difficulty: 'Beginner' }).total, 120);
    assert.strictEqual(xpForRound({ score: -40, difficulty: 'Beginner' }).total, 5);
});

/* ── Levels ─────────────────────────────────────────────────────────────── */

test('each level costs 100 XP more than the one before', () => {
    assert.deepStrictEqual([1, 2, 3, 4, 5].map(xpToReach), [0, 100, 300, 600, 1000]);
});

test('levelFor places XP on the ladder with the way to the next level', () => {
    assert.strictEqual(levelFor(0).level, 1);
    assert.strictEqual(levelFor(99).level, 1);
    const three = levelFor(450);
    assert.strictEqual(three.level, 3);
    assert.strictEqual(three.intoLevel, 150);
    assert.strictEqual(three.toNext, 150);
    assert.strictEqual(three.progress, 0.5);
});

test('titles change at their levels', () => {
    assert.strictEqual(titleFor(1), 'Hello World');
    assert.strictEqual(titleFor(5), 'Loop Learner');
    assert.strictEqual(titleFor(30), 'Java Guru');
});

/* ── Streaks ────────────────────────────────────────────────────────────── */

test('a first round starts a streak of one', () => {
    assert.strictEqual(nextStreak({}, 100).current, 1);
});

test('playing twice in one day does not move the streak', () => {
    const result = nextStreak({ current: 4, longest: 4, lastDay: 100 }, 100);
    assert.strictEqual(result.current, 4);
    assert.strictEqual(result.extended, false);
});

test('the next day extends it and a gap resets it', () => {
    assert.strictEqual(nextStreak({ current: 4, lastDay: 100 }, 101).current, 5);
    assert.strictEqual(nextStreak({ current: 4, longest: 9, lastDay: 100 }, 104).current, 1);
    assert.strictEqual(nextStreak({ current: 4, longest: 9, lastDay: 100 }, 104).longest, 9);
});

test('a shield covers exactly one missed day', () => {
    const saved = nextStreak({ current: 8, freezes: 1, lastDay: 100 }, 102);
    assert.strictEqual(saved.current, 9);
    assert.strictEqual(saved.freezes, 0);
    assert.strictEqual(saved.freezeUsed, true);

    const tooLong = nextStreak({ current: 8, freezes: 2, lastDay: 100 }, 103);
    assert.strictEqual(tooLong.current, 1);
    assert.strictEqual(tooLong.freezeUsed, false);
});

test('a shield is earned on every seventh day, two at most', () => {
    assert.strictEqual(nextStreak({ current: 6, freezes: 0, lastDay: 100 }, 101).freezes, 1);
    assert.strictEqual(nextStreak({ current: 13, freezes: 2, lastDay: 100 }, 101).freezes, 2);
});

test('a stored streak that has lapsed reads as zero', () => {
    assert.deepStrictEqual(
        streakToday({ current: 5, lastDay: 100 }, 101),
        { current: 5, playedToday: false, atRisk: true }
    );
    assert.strictEqual(streakToday({ current: 5, lastDay: 100 }, 103).current, 0);
    assert.strictEqual(streakToday({ current: 5, freezes: 1, lastDay: 100 }, 102).shieldWillBeUsed, true);
});

/* ── Stats ──────────────────────────────────────────────────────────────── */

const round = (overrides = {}) => ({
    score: 100,
    gameType: 'BugHunt',
    conceptTag: 'loop_boundaries',
    difficultyLevel: 'Beginner',
    hintUsage: 0,
    timeTakenSeconds: 40,
    day: 1,
    ...overrides
});

test('stats count perfect runs, comebacks and breadth from rounds alone', () => {
    const stats = statsFromSessions([
        round({ score: 40, conceptTag: 'array_indexing' }),
        round(),
        round({ gameType: 'CodeFix' }),
        round({ gameType: 'DragDrop', conceptTag: 'array_indexing', day: 2 }),
        round({ score: 80, difficultyLevel: 'Expert', hintUsage: 1, timeTakenSeconds: 12 })
    ]);

    assert.strictEqual(stats.rounds, 5);
    assert.strictEqual(stats.perfects, 3);
    assert.strictEqual(stats.maxPerfectRun, 3);
    assert.strictEqual(stats.comebacks, 1);
    assert.strictEqual(stats.formatsPlayed, 3);
    assert.strictEqual(stats.conceptsPassed, 2);
    assert.strictEqual(stats.noHintPasses, 3);
    assert.strictEqual(stats.fastPasses, 1);
    assert.strictEqual(stats.expertPasses, 1);
    assert.strictEqual(stats.daysPlayed, 2);
});

/* ── Achievements ───────────────────────────────────────────────────────── */

test('every achievement id is unique and has a reachable target', () => {
    const ids = CATALOGUE.map((item) => item.id);
    assert.strictEqual(new Set(ids).size, ids.length);
    for (const item of CATALOGUE) assert.ok(item.target >= 1, item.id);
});

test('locked achievements report how close they are', () => {
    const rounds10 = evaluateAchievements({ rounds: 7 }).find((a) => a.id === 'rounds_10');
    assert.strictEqual(rounds10.unlocked, false);
    assert.strictEqual(rounds10.current, 7);
});

test('an unlocked achievement stays unlocked even if its number drops', () => {
    const stored = new Map([['perfect_1', new Date('2026-10-01')]]);
    const flawless = evaluateAchievements({ perfects: 0 }, stored).find((a) => a.id === 'perfect_1');
    assert.strictEqual(flawless.unlocked, true);
});

test('newlyUnlocked returns only what is not already stored', () => {
    const stored = new Map([['first_round', new Date()]]);
    const ids = newlyUnlocked({ rounds: 10 }, stored).map((a) => a.id);
    assert.ok(ids.includes('rounds_10'));
    assert.ok(!ids.includes('first_round'));
});

/* ── Quests ─────────────────────────────────────────────────────────────── */

test('every week has four different quests, and the set rotates', () => {
    const seen = new Set();
    for (let week = 0; week < POOL.length; week += 1) {
        const ids = questsForWeek(week).map((q) => q.id);
        assert.strictEqual(new Set(ids).size, 4);
        seen.add(ids.slice().sort().join());
    }
    assert.ok(seen.size > 1);
});

test('quest progress comes from the week, and a paid quest is marked claimed', () => {
    const index = POOL.findIndex((q) => q.id === 'play_10');
    const sessions = Array.from({ length: 10 }, () => round());
    const quests = evaluateQuests(index, sessions, 0, new Set(['play_10']));
    const warmUp = quests.find((q) => q.id === 'play_10');
    assert.strictEqual(warmUp.complete, true);
    assert.strictEqual(warmUp.claimed, true);
});

/* ── Daily challenge ────────────────────────────────────────────────────── */

const bank = [
    { id: 'c', difficulty: 'Intermediate' },
    { id: 'a', difficulty: 'Elementary' },
    { id: 'b', difficulty: 'Expert' },
    { id: 'd', difficulty: 'Elementary' }
];

test('the daily pick is the same for everyone on a day, whatever the order', () => {
    const one = pickDaily(bank, '2026-10-05');
    const two = pickDaily(bank.slice().reverse(), '2026-10-05');
    assert.strictEqual(one.id, two.id);
});

test('the daily pick prefers the middle levels', () => {
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
        assert.notStrictEqual(pickDaily(bank, day).id, 'b');
    }
});

test('an empty bank has no daily challenge', () => {
    assert.strictEqual(pickDaily([], '2026-10-05'), null);
});

/* ── Names ──────────────────────────────────────────────────────────────── */

test('leaderboard names are first name and last initial', () => {
    assert.strictEqual(displayNameFrom('Ravindu Nethmina'), 'Ravindu N.');
    assert.strictEqual(displayNameFrom('Ada'), 'Ada');
    assert.strictEqual(displayNameFrom('  '), null);
    assert.strictEqual(initialsOf('Ravindu N.'), 'RN');
});
