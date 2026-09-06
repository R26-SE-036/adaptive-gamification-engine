/**
 * Marking an answer. One place, so every caller marks the same way.
 *
 * The grading branches used to sit inline in routes/gamification.js. They moved
 * here when CodeFix arrived, because CodeFix needs real comparison logic rather
 * than `===`, and a route handler is not where that belongs - it also has to be
 * callable from POST /game/check, which grades an attempt WITHOUT ending the
 * session.
 *
 * ======================= WHY CodeFix NEEDS A NORMALISER =======================
 * The other three games have exact answers: a line index, an ordering, a printed
 * value. CodeFix asks the student to TYPE the corrected line, so these are all
 * the same answer and all must be accepted:
 *
 *     for (int i = 0; i < arr.length; i++) {
 *     for(int i=0;i<arr.length;i++){
 *     for ( int i = 0 ; i < arr.length ; i++ ) {
 *
 * and this one must not be, even though it differs by one character:
 *
 *     for (int i = 0; i <= arr.length; i++) {
 *
 * So whitespace is insignificant and everything else is significant. The one
 * place that rule cannot apply is inside a string or character literal, where
 * spaces are part of the value: "hello world" and "helloworld" are different
 * programs. The normaliser below tracks literals for exactly that reason.
 */

const { GAME_TYPES } = require('../config/constants');

/**
 * Collapse a line of Java to its significant characters.
 *
 * Removes whitespace and any trailing `//` comment, both only where they are
 * not inside a literal. Case is preserved - Java is case-sensitive and
 * `Arr.length` is a different program from `arr.length`.
 */
function normaliseJavaLine(line) {
    const text = String(line ?? '');
    let out = '';
    let quote = null; // '"' or "'" when inside a literal
    let escaped = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];

        if (quote) {
            out += char;
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }

        // A trailing comment is the student annotating their own answer
        // ("// fixed"), not part of the code. Everything after it is dropped.
        if (char === '/' && text[i + 1] === '/') break;

        if (char === '"' || char === "'") {
            quote = char;
            out += char;
            continue;
        }

        if (/\s/.test(char)) continue;

        out += char;
    }

    return out;
}

/**
 * Every form of the answer this question accepts.
 *
 * A CodeFix question may store one string or several. Several is the normal
 * case: `i < arr.length` and `i <= arr.length - 1` are both correct fixes for an
 * off-by-one, and a game that accepted only the author's phrasing would be
 * marking style rather than understanding.
 */
function acceptedAnswers(correctAnswer) {
    const candidates = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
    return candidates
        .filter((value) => value !== null && value !== undefined)
        .map(normaliseJavaLine)
        .filter(Boolean);
}

/**
 * Mark one answer against one question.
 *
 * The GAME TYPE COMES FROM THE QUESTION, never from the caller. The client may
 * send Code Coach's vocabulary (`loop_tracer`), which is not a grading branch
 * here - and it is not the client's fact to assert in any case.
 *
 * @returns {{correct: boolean, gameType: string}}
 * @throws {Error} when the question's own game type is not one this engine grades
 */
function gradeAnswer(question, submittedAnswer) {
    const gameType = question.gameType;

    if (!GAME_TYPES.includes(gameType)) {
        throw new Error(`Question ${question.id} has an ungradeable gameType: ${gameType}`);
    }

    const correctAnswer = question.correctAnswer;

    if (gameType === 'BugHunt') {
        // A line index. String-compared because the client may send "2" or 2.
        return { correct: String(submittedAnswer) === String(correctAnswer), gameType };
    }

    if (gameType === 'DragDrop') {
        const correct =
            Array.isArray(submittedAnswer) &&
            Array.isArray(correctAnswer) &&
            submittedAnswer.length === correctAnswer.length &&
            submittedAnswer.every((value, index) => String(value) === String(correctAnswer[index]));
        return { correct, gameType };
    }

    if (gameType === 'CodeTrace') {
        // A printed value. Case and surrounding space are noise here - the
        // student is reporting what the program prints, not writing code.
        const correct =
            String(submittedAnswer).trim().toLowerCase() ===
            String(correctAnswer).trim().toLowerCase();
        return { correct, gameType };
    }

    // CodeFix: the student typed a line of Java.
    const submitted = normaliseJavaLine(submittedAnswer);
    if (!submitted) return { correct: false, gameType };

    return { correct: acceptedAnswers(correctAnswer).includes(submitted), gameType };
}

module.exports = { normaliseJavaLine, acceptedAnswers, gradeAnswer };
