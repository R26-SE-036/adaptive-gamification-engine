/**
 * Which question to serve from a set of candidates, given what this student
 * has recently played.
 *
 * ============================ WHY THIS EXISTS ============================
 * Students reported getting the same question round after round. The cause was
 * not a thin bank - every (format, concept, level) slot holds two to four
 * questions - but how a slot ran out:
 *
 *   * A run is five rounds, usually in the same slot. Recently played questions
 *     were excluded, so rounds one to three were different - and after that the
 *     exclusion was dropped and the pick was `$sample` over the whole slot. In a
 *     two-question slot rounds three, four and five were all repeats, and a
 *     random pick could hand back the question answered a moment ago.
 *   * The slot was the only place looked. A concept at one level holds five to
 *     eight questions across its formats, so an unseen question was usually
 *     available - just in another format.
 *
 * So: never-played first, and when everything has been played, the one played
 * longest ago - never a random one, which is what made back-to-back repeats
 * possible. The route asks other formats at the same level before settling for
 * a repeat; see routes/gamification.js.
 */

/**
 * @param {Array<{id: string}>} candidates   the questions that match
 * @param {string[]} recentIds  question ids this student played, newest first
 * @param {() => number} [random]  for tests
 * @returns {{question: object, fresh: boolean} | null}
 *   `fresh` is false when every candidate has been played recently.
 */
function preferUnseen(candidates, recentIds, random = Math.random) {
    if (!candidates || candidates.length === 0) return null;

    const pickOne = (list) => list[Math.floor(random() * list.length)];
    const recency = new Map();
    recentIds.forEach((id, index) => {
        if (!recency.has(id)) recency.set(id, index);
    });

    const unseen = candidates.filter((question) => !recency.has(question.id));
    if (unseen.length > 0) return { question: pickOne(unseen), fresh: true };

    // All played. The largest index is the one played longest ago.
    const oldest = Math.max(...candidates.map((question) => recency.get(question.id)));
    const stalest = candidates.filter((question) => recency.get(question.id) === oldest);
    return { question: pickOne(stalest), fresh: false };
}

module.exports = { preferUnseen };
