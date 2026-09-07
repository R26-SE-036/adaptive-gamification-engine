/**
 * Falling back to a level the bank actually has.
 *
 * These exist because the fallback was not a UI nicety. The game route records
 * the session at the level of the question it SERVED, and progressionService
 * reads that back as the level the student is on - so serving "any difficulty"
 * when the requested one was missing could move a student up the ladder without
 * the two consecutive sessions FR-08 requires.
 *
 * The bank makes this reachable rather than theoretical: only CodeFix was
 * authored across all five levels. BugHunt, DragDrop and CodeTrace have
 * Beginner, Intermediate and Advanced, so every Elementary or Expert request in
 * those three formats takes this path.
 */

const test = require('node:test');
const assert = require('node:assert');

const { nearestDifficulty, DIFFICULTY_LEVELS, difficultyIndex } = require('../config/constants');

/** What the three older formats actually hold. */
const THREE_LEVEL_BANK = ['Beginner', 'Intermediate', 'Advanced'];

test('an available level is returned unchanged', () => {
    for (const level of THREE_LEVEL_BANK) {
        assert.strictEqual(nearestDifficulty(level, THREE_LEVEL_BANK), level);
    }
});

test('a missing level falls to the nearest one that exists', () => {
    // Elementary sits between Beginner and Intermediate, one step from each.
    // Expert is one step from Advanced.
    assert.strictEqual(nearestDifficulty('Elementary', THREE_LEVEL_BANK), 'Beginner');
    assert.strictEqual(nearestDifficulty('Expert', THREE_LEVEL_BANK), 'Advanced');
});

test('a tie breaks downward, never upward', () => {
    // The whole point. Elementary is equidistant from Beginner and Intermediate,
    // and the tie has to go to the easier one: a round that is one level too
    // easy costs a round, while one that is too hard is both the bad experience
    // this component exists to prevent AND the direction that silently moves a
    // student up the ladder.
    assert.strictEqual(nearestDifficulty('Elementary', ['Beginner', 'Intermediate']), 'Beginner');
    assert.strictEqual(nearestDifficulty('Intermediate', ['Elementary', 'Advanced']), 'Elementary');
});

test('no request is ever answered more than one level too hard', () => {
    // Exhaustive over every level and every non-empty subset of the ladder. The
    // guarantee being checked is not "close enough" but a bound: the answer is
    // never further ABOVE the target than the nearest available level is, so the
    // fallback cannot invent a promotion the bank did not force.
    const subsets = [];
    for (let mask = 1; mask < 1 << DIFFICULTY_LEVELS.length; mask += 1) {
        subsets.push(DIFFICULTY_LEVELS.filter((_, i) => mask & (1 << i)));
    }

    for (const target of DIFFICULTY_LEVELS) {
        const targetIndex = difficultyIndex(target);

        for (const available of subsets) {
            const chosen = nearestDifficulty(target, available);
            assert.ok(available.includes(chosen), `${chosen} is not in the bank`);

            const distance = Math.abs(difficultyIndex(chosen) - targetIndex);
            const best = Math.min(
                ...available.map((level) => Math.abs(difficultyIndex(level) - targetIndex))
            );

            assert.strictEqual(distance, best, `${target} in [${available}] chose ${chosen}`);

            // And when something at or below the target exists, that is what is
            // served - equidistant or not.
            const atOrBelow = available.filter((level) => difficultyIndex(level) <= targetIndex);
            if (atOrBelow.length > 0) {
                const nearestBelow = Math.min(
                    ...atOrBelow.map((level) => targetIndex - difficultyIndex(level))
                );
                if (nearestBelow <= best) {
                    assert.ok(
                        difficultyIndex(chosen) <= targetIndex,
                        `${target} in [${available}] went up to ${chosen}`
                    );
                }
            }
        }
    }
});

test('the old three-level spellings resolve before the distance is measured', () => {
    // Sessions and question rows written before the five-level migration say
    // Easy / Medium / Hard. Measuring distance on an unresolved string would
    // silently return null and drop the caller into the last-resort branch.
    assert.strictEqual(nearestDifficulty('medium', THREE_LEVEL_BANK), 'Intermediate');
    assert.strictEqual(nearestDifficulty('Elementary', ['easy', 'hard']), 'Beginner');
});

test('an unknown target or an empty bank returns null rather than guessing', () => {
    assert.strictEqual(nearestDifficulty('Impossible', THREE_LEVEL_BANK), null);
    assert.strictEqual(nearestDifficulty('Beginner', []), null);
    assert.strictEqual(nearestDifficulty('Beginner', ['nonsense']), null);
});
