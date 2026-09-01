const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CodeDiagnostic = require('../models/CodeDiagnostic');

const seedDashboard = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB Cloud...');

        // Clear any old fake diagnostics for our test user to ensure a clean demo
        await CodeDiagnostic.deleteMany({ userId: 'test-user-123' });

        const fakeErrors = [];
        
        // 1. Simulate 4 Loop Boundary mistakes (Dashboard will aggregate this)
        for(let i=0; i<4; i++) {
            fakeErrors.push({
                userId: 'test-user-123',
                learningSessionId: `session_vscode_${Date.now()}`,
                errorType: 'OFF_BY_ONE_LOOP_BOUNDARY',
                conceptTag: 'loop_boundaries',
                errorMessage: 'Index out of bounds exception',
                codeContext: 'for(int i=0; i<=arr.length; i++)',
                severity: 'High'
            });
        }

        // 2. Simulate 2 Array Indexing mistakes
        for(let i=0; i<2; i++) {
            fakeErrors.push({
                userId: 'test-user-123',
                learningSessionId: `session_vscode_${Date.now()}`,
                errorType: 'ARRAY_LENGTH_INDEX_MISUSE',
                conceptTag: 'array_indexing',
                errorMessage: 'Attempted to access length property directly',
                codeContext: 'int last = arr[arr.length];',
                severity: 'Medium'
            });
        }

        // 3. Simulate 1 Conditional Logic mistake
        fakeErrors.push({
            userId: 'test-user-123',
            learningSessionId: `session_vscode_${Date.now()}`,
            errorType: 'INCORRECT_CONDITIONAL_OPERATOR',
            conceptTag: 'conditional_logic',
            errorMessage: 'Assignment inside if condition',
            codeContext: 'if(score = 100)',
            severity: 'Low'
        });

        await CodeDiagnostic.insertMany(fakeErrors);
        console.log('SUCCESS! Presentation dashboard data injected into the cloud database.');
        
        process.exit(0);

    } catch (err) {
        console.error('Failed to seed:', err);
        process.exit(1);
    }
};

seedDashboard();
