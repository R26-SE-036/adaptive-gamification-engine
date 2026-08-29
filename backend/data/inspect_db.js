require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const cols = await db.listCollections().toArray();
    console.log('COLLECTIONS:', cols.map((c) => c.name).join(', '));

    const names = ['users', 'codeDiagnostics', 'learningSessions', 'gameSessions', 'questionBank', 'playerProfiles', 'remediationTriggers', 'conceptMastery', 'learningEvents'];

    for (const name of names) {
        const count = await db.collection(name).countDocuments();
        console.log(`${name} count:`, count);
        if (count > 0) {
            const sample = await db.collection(name).findOne({});
            console.log(`${name} sample keys:`, Object.keys(sample).join(', '));
            if (name === 'users') {
                console.log('user sample:', JSON.stringify({
                    userId: sample.userId,
                    email: sample.email,
                    fullName: sample.fullName,
                    hasPassword: Boolean(sample.passwordHash),
                    role: sample.role,
                    status: sample.status
                }, null, 2));
            }
            if (name === 'codeDiagnostics') {
                console.log('diag sample:', JSON.stringify({
                    userId: sample.userId,
                    conceptTag: sample.conceptTag,
                    errorType: sample.errorType,
                    status: sample.status,
                    confidence: sample.confidence
                }, null, 2));
            }
        }
    }

    const users = await db.collection('users').find({}, { projection: { userId: 1, email: 1, fullName: 1, _id: 0 } }).limit(10).toArray();
    console.log('USERS:', JSON.stringify(users, null, 2));

    const diagAgg = await db.collection('codeDiagnostics').aggregate([
        { $match: { status: { $ne: 'resolved' } } },
        { $group: { _id: { userId: '$userId', conceptTag: '$conceptTag' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
    ]).toArray();
    console.log('TOP UNRESOLVED DIAGNOSTICS:', JSON.stringify(diagAgg, null, 2));

    await mongoose.disconnect();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
