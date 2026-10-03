/**
 * The reward loop: what a round earns, and where every player stands.
 *
 * The rules are in services/rewards/*, pure and tested. This file only reads
 * and writes: it loads a profile and the rounds behind it, asks the rules what
 * follows, and records the answer - on the profile (the running state) and as
 * XpEvents (the history the weekly leaderboard is summed from).
 *
 * =============== NOTHING HERE FEEDS THE ADAPTIVE ENGINE ===============
 * Difficulty, format choice and support all read GameSession. Rewards are
 * written only to the profile and to their own collections, so a bonus, a
 * streak or a badge can never become evidence about what a student knows.
 */

const GameSession = require('../models/GameSession');
const PlayerProfile = require('../models/PlayerProfile');
const QuestionBank = require('../models/QuestionBank');
const XpEvent = require('../models/XpEvent');
const DailyChallengeResult = require('../models/DailyChallengeResult');

const {
    dayNumber, dayKey, weekKey, weekIndex, weekBounds, nextDayStart
} = require('./rewards/calendar');
const {
    ACHIEVEMENT_XP, xpForRound, levelFor, nextStreak, streakToday
} = require('./rewards/progression');
const { statsFromSessions } = require('./rewards/stats');
const { evaluateAchievements, newlyUnlocked } = require('./rewards/achievements');
const { evaluateQuests } = require('./rewards/quests');
const { pickDaily } = require('./rewards/daily');

/* ── Identity ───────────────────────────────────────────────────────────── */

/** "Ravindu Nethmina" -> "Ravindu N." - enough to recognise, not a full name. */
function displayNameFrom(fullName) {
    const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 24);
    return `${parts[0].slice(0, 24)} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function initialsOf(name) {
    const parts = String(name ?? '').replace('.', '').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

/**
 * The player's profile, created on first sight.
 *
 * Also the one place two kinds of old data are brought forward: a profile
 * from before XP existed is given its total score as XP, and the display name
 * is refreshed from the token so a renamed account shows its new name.
 */
async function loadProfile(userId, fullName) {
    let profile = await PlayerProfile.findOne({ userId });
    if (!profile) profile = new PlayerProfile({ userId });

    if (profile.xp === undefined || profile.xp === null) profile.xp = profile.totalScore || 0;

    const name = displayNameFrom(fullName);
    if (name && profile.displayName !== name) profile.displayName = name;

    if (profile.isNew || profile.isModified()) await profile.save();
    return profile;
}

/** Every round of the player's that counts, oldest first, with its local day. */
async function playerSessions(userId) {
    const rows = await GameSession.evidence({ userId })
        .select('gameSessionId score gameType conceptTag difficultyLevel hintUsage timeTakenSeconds completedAt')
        .sort({ completedAt: 1 })
        .lean();
    return rows.map((row) => ({ ...row, day: dayNumber(new Date(row.completedAt)) }));
}

function storedAchievements(profile) {
    return new Map((profile.achievements ?? []).map((item) => [item.id, item.unlockedAt]));
}

/* ── Achievements and quests ────────────────────────────────────────────── */

/**
 * Pay whatever the player has earned and not been paid for.
 *
 * Run after every round and on every visit to the overview, so an
 * achievement earned by something that happened elsewhere (a streak, a level
 * reached through a quest) is recorded the next time anyone looks rather than
 * waiting for a round that happens to trigger it.
 *
 * Mutates `profile` and pushes to `events`; the caller saves both.
 */
async function settle(profile, sessions, now, events) {
    const userId = profile.userId;
    const { start, end } = weekBounds(now);
    const week = weekKey(now);

    const [dailyCompleted, weekDaily] = await Promise.all([
        DailyChallengeResult.countDocuments({ userId }),
        DailyChallengeResult.countDocuments({ userId, completedAt: { $gte: start, $lt: end } })
    ]);

    const unlocked = [];
    const unlock = () => {
        const stats = statsFromSessions(sessions, {
            dailyCompleted,
            longestStreak: profile.longestStreak,
            level: levelFor(profile.xp).level
        });
        for (const item of newlyUnlocked(stats, storedAchievements(profile))) {
            profile.achievements.push({ id: item.id, unlockedAt: now });
            profile.xp += ACHIEVEMENT_XP;
            events.push({ reason: 'achievement', amount: ACHIEVEMENT_XP, ref: item.id });
            unlocked.push({ ...item, unlockedAt: now, xp: ACHIEVEMENT_XP });
        }
        return stats;
    };

    unlock();

    const weekSessions = sessions.filter((round) => {
        const at = new Date(round.completedAt);
        return at >= start && at < end;
    });
    const paid = new Set(
        (profile.questRewards ?? []).filter((r) => r.week === week).map((r) => r.questId)
    );
    const quests = evaluateQuests(weekIndex(now), weekSessions, weekDaily, paid);
    const questsCompleted = [];

    for (const quest of quests) {
        if (!quest.complete || quest.claimed) continue;
        profile.questRewards.push({ week, questId: quest.id, at: now });
        profile.xp += quest.xp;
        events.push({ reason: 'quest', amount: quest.xp, ref: quest.id });
        quest.claimed = true;
        questsCompleted.push(quest);
    }

    // Quest XP can carry a player over a level line, which can unlock a level
    // achievement. A second pass picks that up in the same visit.
    const stats = questsCompleted.length ? unlock() : statsFromSessions(sessions, {
        dailyCompleted,
        longestStreak: profile.longestStreak,
        level: levelFor(profile.xp).level
    });

    return { unlocked, quests, questsCompleted, stats, dailyCompleted };
}

async function recordEvents(userId, events, now) {
    if (!events.length) return;
    const stamp = { userId, week: weekKey(now), day: dayKey(now), at: now };
    await XpEvent.insertMany(events.map((event) => ({ ...event, ...stamp })));
}

/* ── Daily challenge ────────────────────────────────────────────────────── */

let dailyCache = { day: null, question: null };

/** Today's challenge question (the full document), or null for an empty bank. */
async function todaysQuestion(now = new Date()) {
    const day = dayKey(now);
    if (dailyCache.day === day) return dailyCache.question;

    const all = await QuestionBank.find({}).select('id difficulty').lean();
    const pick = pickDaily(all, day);
    const question = pick ? await QuestionBank.findOne({ id: pick.id }).lean() : null;

    dailyCache = { day, question };
    return question;
}

/**
 * Whether a submission of `questionId` now is this player's counted daily
 * attempt: it is today's question, and they have no result for today yet.
 */
async function isDailyAttempt(userId, questionId, now = new Date()) {
    const question = await todaysQuestion(now);
    if (!question || question.id !== questionId) return false;
    return !(await DailyChallengeResult.exists({ userId, day: dayKey(now) }));
}

async function dailyStatus(userId, now = new Date()) {
    const [question, result] = await Promise.all([
        todaysQuestion(now),
        DailyChallengeResult.findOne({ userId, day: dayKey(now) }).lean()
    ]);

    return {
        day: dayKey(now),
        resetsAt: nextDayStart(now),
        question,
        completed: result
            ? { score: result.score, xp: result.xp, timeTakenSeconds: result.timeTakenSeconds }
            : null
    };
}

/* ── After a round ──────────────────────────────────────────────────────── */

/** The three concept badges from before achievements, still awarded. */
const LEGACY_BADGES = Object.freeze({
    loop_boundaries: 'Loop Master',
    array_indexing: 'Array Ninja',
    conditional_logic: 'Logic Guru'
});

/**
 * Everything one finished round earns.
 *
 * `session` is the GameSession just saved - the score on it was computed by
 * the engine, never sent by the client. Returns the receipt the results
 * screen celebrates: XP itemised, level before and after, the streak, and any
 * achievements and quests completed.
 */
async function applyRound({ userId, fullName, session, isDaily = false, now = new Date() }) {
    const profile = await loadProfile(userId, fullName);
    const events = [];

    // The daily result is written FIRST, because its unique index is what
    // decides whether this really is the counted attempt. Two tabs submitting
    // at once both pass the route's check; only one insert succeeds, and the
    // other is scored as ordinary practice rather than earning double.
    let daily = null;
    if (isDaily) {
        try {
            daily = await DailyChallengeResult.create({
                userId,
                day: dayKey(now),
                questionId: session.questionId,
                gameSessionId: session.gameSessionId,
                score: session.score,
                timeTakenSeconds: session.timeTakenSeconds,
                completedAt: now
            });
        } catch (error) {
            if (error?.code !== 11000) throw error;
            daily = null;
        }
    }

    const today = dayNumber(now);
    const lastDay = profile.lastGamePlayedAt ? dayNumber(profile.lastGamePlayedAt) : null;
    const streak = nextStreak(
        {
            current: profile.currentStreak,
            longest: profile.longestStreak,
            freezes: profile.streakFreezes,
            lastDay
        },
        today
    );

    const before = levelFor(profile.xp);
    const round = xpForRound({
        score: session.score,
        difficulty: session.difficultyLevel,
        streak: streak.current,
        isDaily: Boolean(daily)
    });

    profile.xp += round.total;
    profile.totalScore += session.score;
    profile.currentStreak = streak.current;
    profile.longestStreak = streak.longest;
    profile.streakFreezes = streak.freezes;
    profile.lastGamePlayedAt = now;
    events.push({ reason: 'round', amount: round.total, ref: session.gameSessionId });

    const legacyBadges = [];
    const legacy = LEGACY_BADGES[session.conceptTag];
    if (session.score === 100 && legacy && !profile.badges.includes(legacy)) {
        profile.badges.push(legacy);
        legacyBadges.push(legacy);
    }

    const sessions = await playerSessions(userId);
    const settled = await settle(profile, sessions, now, events);

    await profile.save();
    await recordEvents(userId, events, now);

    if (daily) {
        await DailyChallengeResult.updateOne({ _id: daily._id }, { $set: { xp: round.total } });
    }

    const after = levelFor(profile.xp);

    return {
        xp: {
            total: events.reduce((sum, event) => sum + event.amount, 0),
            round
        },
        level: {
            before: before.level,
            ...after,
            leveledUp: after.level > before.level
        },
        streak: {
            current: streak.current,
            longest: streak.longest,
            freezes: streak.freezes,
            extended: streak.extended,
            freezeUsed: streak.freezeUsed,
            freezeEarned: streak.freezeEarned
        },
        achievements: settled.unlocked,
        questsCompleted: settled.questsCompleted,
        quests: settled.quests,
        daily: daily ? { counted: true, score: session.score, xp: round.total } : null,
        legacyBadges
    };
}

/* ── Leaderboards ───────────────────────────────────────────────────────── */

const PERIODS = ['week', 'all', 'today'];

/**
 * A leaderboard: the top `limit`, and where the asking player stands even
 * when that is outside it.
 *
 * week   XP earned since Monday - everyone starts level each week, which is
 *        what keeps a newcomer from facing a wall of veterans
 * all    total XP
 * today  today's daily challenge: score, then the faster time
 */
async function leaderboard({ period = 'week', userId, limit = 10, now = new Date() }) {
    const kind = PERIODS.includes(period) ? period : 'week';
    let rows = [];
    let resetsAt = null;

    if (kind === 'week') {
        rows = await XpEvent.aggregate([
            { $match: { week: weekKey(now) } },
            { $group: { _id: '$userId', value: { $sum: '$amount' } } },
            { $match: { value: { $gt: 0 } } },
            { $sort: { value: -1, _id: 1 } }
        ]);
        rows = rows.map((row) => ({ userId: row._id, value: row.value }));
        resetsAt = weekBounds(now).end;
    } else if (kind === 'all') {
        // A profile untouched since XP was introduced has no `xp` yet; it is
        // seeded from totalScore the next time the player is seen (see
        // loadProfile), and ranks on that same number until then rather than
        // vanishing from the board.
        const profiles = await PlayerProfile.find({
            $or: [{ xp: { $gt: 0 } }, { xp: { $exists: false }, totalScore: { $gt: 0 } }]
        })
            .select('userId xp totalScore')
            .lean();
        rows = profiles
            .map((p) => ({ userId: p.userId, value: p.xp ?? p.totalScore ?? 0 }))
            .sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));
    } else {
        const results = await DailyChallengeResult.find({ day: dayKey(now) })
            .sort({ score: -1, timeTakenSeconds: 1, completedAt: 1 })
            .lean();
        rows = results.map((r) => ({ userId: r.userId, value: r.score, seconds: r.timeTakenSeconds }));
        resetsAt = nextDayStart(now);
    }

    const top = rows.slice(0, Math.max(0, limit));
    const yourIndex = rows.findIndex((row) => row.userId === userId);
    const wanted = new Set(top.map((row) => row.userId));
    if (yourIndex >= 0) wanted.add(userId);

    const profiles = await PlayerProfile.find({ userId: { $in: [...wanted] } })
        .select('userId displayName showOnLeaderboard xp totalScore')
        .lean();
    const byId = new Map(profiles.map((p) => [p.userId, p]));

    const present = (row, index) => {
        const profile = byId.get(row.userId);
        const you = row.userId === userId;
        const visible = you || profile?.showOnLeaderboard !== false;
        const name = visible ? profile?.displayName || 'Code Guru player' : 'Anonymous coder';

        return {
            rank: index + 1,
            name,
            initials: visible ? initialsOf(name) : '?',
            level: levelFor(profile?.xp ?? profile?.totalScore ?? 0).level,
            value: row.value,
            seconds: row.seconds ?? null,
            you
        };
    };

    return {
        period: kind,
        total: rows.length,
        resetsAt,
        entries: top.map(present),
        you: yourIndex >= 0 ? present(rows[yourIndex], yourIndex) : null
    };
}

/* ── Overview ───────────────────────────────────────────────────────────── */

/** Everything the Practice home shows about the player, in one call. */
async function overview({ userId, fullName, now = new Date() }) {
    const profile = await loadProfile(userId, fullName);
    const sessions = await playerSessions(userId);

    const events = [];
    const settled = await settle(profile, sessions, now, events);
    if (events.length) {
        await profile.save();
        await recordEvents(userId, events, now);
    }

    const [daily, week, all] = await Promise.all([
        dailyStatus(userId, now),
        leaderboard({ period: 'week', userId, limit: 0, now }),
        leaderboard({ period: 'all', userId, limit: 0, now })
    ]);

    const today = dayNumber(now);
    const streak = streakToday(
        {
            current: profile.currentStreak,
            freezes: profile.streakFreezes,
            lastDay: profile.lastGamePlayedAt ? dayNumber(profile.lastGamePlayedAt) : null
        },
        today
    );

    const weekXp = week.you?.value ?? 0;
    const { end } = weekBounds(now);

    return {
        player: {
            displayName: profile.displayName,
            showOnLeaderboard: profile.showOnLeaderboard !== false,
            level: levelFor(profile.xp),
            totalScore: profile.totalScore
        },
        streak: {
            ...streak,
            longest: profile.longestStreak,
            freezes: profile.streakFreezes
        },
        stats: settled.stats,
        week: { xp: weekXp, rank: week.you?.rank ?? null, players: week.total, endsAt: end },
        allTime: { rank: all.you?.rank ?? null, players: all.total },
        achievements: evaluateAchievements(settled.stats, storedAchievements(profile)),
        quests: { endsAt: end, items: settled.quests },
        daily: {
            day: daily.day,
            resetsAt: daily.resetsAt,
            completed: daily.completed,
            question: daily.question
                ? {
                      gameType: daily.question.gameType,
                      conceptTag: daily.question.conceptTag,
                      difficulty: daily.question.difficulty
                  }
                : null
        },
        badges: profile.badges
    };
}

async function setPreferences({ userId, fullName, showOnLeaderboard }) {
    const profile = await loadProfile(userId, fullName);
    if (typeof showOnLeaderboard === 'boolean') profile.showOnLeaderboard = showOnLeaderboard;
    await profile.save();
    return { showOnLeaderboard: profile.showOnLeaderboard !== false };
}

module.exports = {
    applyRound,
    overview,
    leaderboard,
    dailyStatus,
    todaysQuestion,
    isDailyAttempt,
    setPreferences,
    displayNameFrom,
    initialsOf
};
