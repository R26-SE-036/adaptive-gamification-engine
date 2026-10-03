/**
 * Days and weeks, as the students live them.
 *
 * A streak, a daily challenge and a weekly quest all depend on where one day
 * ends and the next begins. The server runs in UTC, the students are in Sri
 * Lanka, and midnight UTC is 05:30 there - so measured in UTC, a student who
 * plays at 23:00 and again at 07:00 the next morning has played on the SAME
 * day, and their streak does not move. Everything here shifts by a fixed
 * offset first, so the day boundary is local midnight.
 *
 * A fixed offset rather than a time-zone database because Sri Lanka has no
 * daylight saving, and because the whole cohort shares one zone. Set
 * PLAY_TZ_OFFSET_MINUTES for a deployment somewhere else.
 *
 * Days are counted as whole numbers since 1970-01-01 local, which makes "how
 * many days apart" a subtraction rather than date arithmetic.
 */

const DAY_MS = 86_400_000;

function offsetMinutes() {
    const configured = Number(process.env.PLAY_TZ_OFFSET_MINUTES);
    return Number.isFinite(configured) ? configured : 330;
}

/** Whole local days since the epoch. */
function dayNumber(date = new Date()) {
    return Math.floor((date.getTime() + offsetMinutes() * 60_000) / DAY_MS);
}

/** 'YYYY-MM-DD' of a local day number. */
function keyOfDay(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' of the local day `date` falls on. */
function dayKey(date = new Date()) {
    return keyOfDay(dayNumber(date));
}

/** The real instant a local day starts. */
function startOfDay(day) {
    return new Date(day * DAY_MS - offsetMinutes() * 60_000);
}

/**
 * The Monday that starts `date`'s week, as a day number.
 *
 * Day 0 (1970-01-01) was a Thursday. With Monday as 0, Thursday is 3, so
 * (day + 3) % 7 is the weekday and subtracting it lands on Monday.
 */
function weekStartDay(date = new Date()) {
    const day = dayNumber(date);
    return day - ((day + 3) % 7);
}

/** 'YYYY-MM-DD' of the week's Monday - the id a week's quests are filed under. */
function weekKey(date = new Date()) {
    return keyOfDay(weekStartDay(date));
}

/** Weeks since the epoch, for rotating the quest pool. */
function weekIndex(date = new Date()) {
    return Math.floor((weekStartDay(date) + 3) / 7);
}

/** [start, end) of `date`'s week as real instants. */
function weekBounds(date = new Date()) {
    const first = weekStartDay(date);
    return { start: startOfDay(first), end: startOfDay(first + 7) };
}

/** When today's daily challenge stops being today's. */
function nextDayStart(date = new Date()) {
    return startOfDay(dayNumber(date) + 1);
}

module.exports = {
    dayNumber,
    dayKey,
    keyOfDay,
    startOfDay,
    weekStartDay,
    weekKey,
    weekIndex,
    weekBounds,
    nextDayStart
};
