const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

const DEMO_USER = {
    userId: 'test-user-123',
    fullName: 'Demo Student',
    email: 'demo@codeguru.com',
    studentNumber: 'STU-001',
    role: 'student',
    status: 'active',
    password: 'demo123'
};

const seedDemoUser = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/code-guru');
        console.log('Connected to MongoDB...');

        const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);

        await User.findOneAndUpdate(
            { userId: DEMO_USER.userId },
            {
                userId: DEMO_USER.userId,
                fullName: DEMO_USER.fullName,
                email: DEMO_USER.email,
                studentNumber: DEMO_USER.studentNumber,
                role: DEMO_USER.role,
                status: DEMO_USER.status,
                passwordHash
            },
            { upsert: true, new: true }
        );

        console.log('Demo user ready:');
        console.log(`  Email:    ${DEMO_USER.email}`);
        console.log(`  Password: ${DEMO_USER.password}`);
        console.log(`  User ID:  ${DEMO_USER.userId}`);
        console.log('Run seed_presentation_dashboard.js next to inject Code Coach diagnostics for this user.');

        process.exit(0);
    } catch (err) {
        console.error('Failed to seed demo user:', err);
        process.exit(1);
    }
};

seedDemoUser();
