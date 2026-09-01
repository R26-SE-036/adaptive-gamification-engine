const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const QuestionBank = require('../models/QuestionBank');

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Starting question migration...');
        
        // 1. Clear existing questions
        await QuestionBank.deleteMany({});
        console.log('Cleared existing QuestionBank collection.');
        
        // 2. Read the static JSON
        const questionsPath = path.join(__dirname, 'questions_seed.json');
        const rawData = fs.readFileSync(questionsPath, 'utf8');
        const questions = JSON.parse(rawData);
        
        // 3. Insert into DB
        await QuestionBank.insertMany(questions);
        console.log(`Successfully migrated ${questions.length} questions into MongoDB!`);
        
        process.exit(0);
    })
    .catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
