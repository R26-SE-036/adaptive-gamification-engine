/**
 * Local dev seeder: plays every question in the bank as a set of invented
 * students, so `gameSessions` is not empty on a fresh database.
 *
 * ==================== WHAT THIS DATA IS, AND IS NOT ====================
 * These are GENERATED sessions. They are not students, and nothing measured
 * here happened. Two earlier claims to the contrary have been removed from this
 * file's own output; `ml-service/retrain_from_db.py` still prints "Fetching
 * authentic human game sessions", and that line is wrong whenever this script
 * produced the rows.
 *
 * It also must not be used to train the difficulty model, though it currently
 * is the only thing that fills the collection retrain_from_db.py reads.
 * The generator below derives each session's features FROM the question's
 * difficulty label - Hard questions get good performance, Easy questions get
 * struggling performance. A model then fitted to predict difficulty from those
 * features is not learning anything about students; it is recovering the
 * if/else on lines below. High reported accuracy is circularity, not skill.
 *
 * Seeding a database to click through the UI: fine, that is what this is for.
 * Reporting a metric from a model trained on it: not fine.
 * ======================================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 3002, not 3000 - 3000 is PairPath's frontend. This pointed at the wrong
// service, so every request went to something that had never heard of it.
const BASE_URL = process.env.GAMIFICATION_API_URL || 'http://localhost:3002';
const API_URL = `${BASE_URL}/api/v1/gamification/game/submit`;

// Every request is verified against Code Coach, so a placeholder string cannot
// work - the literal 'Bearer MOCK_JWT_TOKEN_HERE' that used to sit here made
// the script fail on its first call with a 401. Sign in and pass a real one.
const ACCESS_TOKEN = process.env.CODEGURU_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
    console.error(
        'Set CODEGURU_ACCESS_TOKEN to a Code Coach access token before running this.\n' +
        '  curl -X POST $CODE_COACH_URL/api/v1/auth/login -H "Content-Type: application/json" \\\n' +
        '    -d \'{"identifier":"you@example.com","password":"...","client_name":"codeguru-portal"}\''
    );
    process.exit(1);
}

// questions_seed.json. There is no questions.json and there never was, so this
// threw ENOENT before it reached a single request.
const questionsPath = path.join(__dirname, 'questions_seed.json');
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
            await axios.post(API_URL, payload, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
            console.log(`[${count + 1}/${questions.length}] generated ${userId} on ${q.difficulty} ${q.conceptTag}`);
            count++;
        } catch (err) {
            console.error(`Error saving simulation for ${q.id}:`, err.response?.data || err.message);
        }
    }
    // Says generated, not "realistic human". The count is the real one rather
    // than a hardcoded 45, which stopped matching the bank several seeds ago.
    console.log(`\nSeeded ${count}/${questions.length} GENERATED game sessions into MongoDB.`);
    console.log('These are not student data. Do not train a reported model on them - see the header.');
};

simulate();
