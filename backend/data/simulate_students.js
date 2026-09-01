const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/v1/gamification/game/submit';
const MOCK_TOKEN = 'Bearer MOCK_JWT_TOKEN_HERE';

const questionsPath = path.join(__dirname, 'questions.json');
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

const simulate = async () => {
    let count = 0;
    
    // Simulating 5 distinct novice students
    const users = ['alpha_student', 'beta_student', 'gamma_student', 'delta_student', 'epsilon_student'];

    for (const q of questions) {
        // Distribute personas randomly
        let userId = users[Math.floor(Math.random() * users.length)];
        let hintUsage = 0;
        let attemptCount = 1;
        let timeTakenSeconds = 30;
        let selectedAnswer = q.correctAnswer;
        
        // Simulating the mathematical distributions typical of novices
        if (q.difficulty === 'Hard') {
            // These students handled hard difficulty (good performance)
            hintUsage = Math.floor(Math.random() * 2); // 0 or 1
            attemptCount = Math.floor(Math.random() * 2) + 1; // 1 or 2
            timeTakenSeconds = Math.floor(Math.random() * 50) + 40; // 40-90s
        } else if (q.difficulty === 'Medium') {
            // Handled medium difficulty
            hintUsage = Math.floor(Math.random() * 3); // 0, 1, or 2
            attemptCount = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
            timeTakenSeconds = Math.floor(Math.random() * 60) + 60; // 60-120s
        } else {
            // Handled easy difficulty (struggled)
            hintUsage = Math.floor(Math.random() * 2) + 2; // 2 or 3 hints
            attemptCount = Math.floor(Math.random() * 3) + 2; // 2 to 4 attempts
            timeTakenSeconds = Math.floor(Math.random() * 60) + 90; // 90-150s
            // Rarely skip the fallback check, make them get it wrong to simulate total failure
            if (Math.random() > 0.85) {
                selectedAnswer = q.correctAnswer === 1 ? 2 : 1;
            }
        }

        const payload = {
            userId: userId,
            learningSessionId: `session_sim_${Date.now()}`,
            gameType: q.gameType,
            conceptTag: q.conceptTag,
            questionId: q.id,
            selectedAnswer: selectedAnswer, // Need to make sure it exists
            hintUsage: hintUsage,
            timeTakenSeconds: timeTakenSeconds,
            attemptCount: attemptCount
        };

        try {
            await axios.post(API_URL, payload, { headers: { Authorization: MOCK_TOKEN } });
            console.log(`[${count+1}/45] Simulating ${userId} playing ${q.difficulty} level ${q.conceptTag}... Data saved to MongoDB.`);
            count++;
        } catch (err) {
            console.error(`Error saving simulation for ${q.id}:`, err.response?.data || err.message);
        }
    }
    console.log("SUCCESS! Your MongoDB is now perfectly seeded with 45 realistic human game sessions.");
};

simulate();
