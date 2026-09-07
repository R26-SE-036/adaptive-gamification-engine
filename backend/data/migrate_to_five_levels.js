/**
 * Move the database from three difficulty levels to five.
 *
 *     node data/migrate_to_five_levels.js            # dry run, changes nothing
 *     node data/migrate_to_five_levels.js --apply    # writes
 *
 * Dry run is the default: this rewrites every question and every game session
 * in a live Atlas database, and the shape of that data is what is being
 * changed, so it should be read before it is changed. Idempotent - running it
 * twice does nothing the second time.
 *
 * ============================== WHAT IT DOES ==============================
 * Easy -> Beginner, Medium -> Intermediate, Hard -> Advanced.
 *
 * That mapping is not arbitrary. It places the old three-level scale on the new
 * five-level one at the points that were actually meant: the old middle was the
 * middle, and the old top was hard-but-reachable rather than the new ceiling.
 * Mapping Hard -> Expert instead would claim the existing "Hard" questions are
 * the hardest material the platform will ever hold, which is not true - the
 * Elementary and Expert CodeFix questions are authored deliberately at those
 * levels.
 *
 * Sessions are migrated as well as questions. They are the training corpus and
 * the input to the progression rule, and leaving them on the old vocabulary
 * would mean the rule reading a student's history through an alias table
 * forever. The alias table stays regardless - Code Coach still recommends
 * 'beginner' / 'intermediate' - but it should not be load-bearing for our own
 * records.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const QuestionBank = require('../models/QuestionBank');
const GameSession = require('../models/GameSession');
const { DIFFICULTY_LEVELS } = require('../config/constants');

const MAPPING = { Easy: 'Beginner', Medium: 'Intermediate', Hard: 'Advanced' };

const apply = process.argv.includes('--apply');

async function report(label, model, field) {
    const counts = await model.aggregate([
        { $group: { _id: `$${field}`, n: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    const line = counts.map((row) => `${row._id}=${row.n}`).join('  ');
    console.log(`  ${label.padEnd(14)} ${line || '(empty)'}`);
    return counts;
}

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('\nBefore:');
    await report('questions', QuestionBank, 'difficulty');
    await report('sessions', GameSession, 'difficultyLevel');

    let planned = 0;
    for (const [from, to] of Object.entries(MAPPING)) {
        const questions = await QuestionBank.countDocuments({ difficulty: from });
        const sessions = await GameSession.countDocuments({ difficultyLevel: from });
        if (questions || sessions) {
            console.log(`\n  ${from} -> ${to}: ${questions} question(s), ${sessions} session(s)`);
            planned += questions + sessions;
        }
    }

    if (planned === 0) {
        console.log('\nNothing to migrate - already on the five-level scale.');
        await mongoose.disconnect();
        return;
    }

    if (!apply) {
        console.log(`\nDry run. ${planned} document(s) would change. Re-run with --apply.`);
        await mongoose.disconnect();
        return;
    }

    for (const [from, to] of Object.entries(MAPPING)) {
        await QuestionBank.updateMany({ difficulty: from }, { $set: { difficulty: to } });
        await GameSession.updateMany(
            { difficultyLevel: from },
            { $set: { difficultyLevel: to } }
        );
    }

    console.log('\nAfter:');
    const questions = await report('questions', QuestionBank, 'difficulty');
    const sessions = await report('sessions', GameSession, 'difficultyLevel');

    // A value the enum does not know would be written but unreadable - the
    // schema would reject the next write of it and the progression rule would
    // fall back to Beginner. Worth failing loudly on rather than discovering
    // later.
    const stray = [...questions, ...sessions]
        .map((row) => row._id)
        .filter((level) => level && !DIFFICULTY_LEVELS.includes(level));

    if (stray.length > 0) {
        console.error(`\n  Levels outside the ladder remain: ${[...new Set(stray)].join(', ')}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    console.log('\nDone. Every level is now on the five-level ladder.');
    await mongoose.disconnect();
}

migrate().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
