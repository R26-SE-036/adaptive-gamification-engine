/**
 * Which question is today's daily challenge.
 *
 * Everyone gets the same one, so a leaderboard for it means something. It is
 * chosen by hashing the date, not stored: there is nothing to schedule, and
 * any instance of the engine picks the same question without coordinating.
 *
 * Drawn from the middle of the difficulty range so a beginner can finish it
 * and a stronger student is not bored by it. Candidates are sorted by id
 * before indexing, so the pick depends on the bank's contents and never on
 * the order the database happens to return them in.
 */

const DAILY_LEVELS = Object.freeze(['Elementary', 'Intermediate']);

/** FNV-1a, 32-bit. Stable across runs and platforms, unlike Math.random. */
function hash(text) {
    let value = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        value ^= text.charCodeAt(i);
        value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value >>> 0;
}

/**
 * Today's question from `questions`, or null if there are none.
 *
 * Falls back to the whole bank when nothing sits at the daily levels, so a
 * bank with an unusual spread still has a challenge.
 */
function pickDaily(questions, dayKey) {
    if (!questions?.length) return null;

    const preferred = questions.filter((q) => DAILY_LEVELS.includes(q.difficulty));
    const pool = (preferred.length ? preferred : questions)
        .slice()
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    return pool[hash(`daily:${dayKey}`) % pool.length];
}

module.exports = { pickDaily, hash, DAILY_LEVELS };
