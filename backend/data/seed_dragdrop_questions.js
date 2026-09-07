/**
 * Seeds the Drag & Drop question bank: 20 questions, re-authored.
 *
 *     node data/seed_dragdrop_questions.js
 *
 * Idempotent - upserted by id.
 *
 * ========================== WHY THIS FILE EXISTS ==========================
 * The Drag & Drop questions were broken, and an audit of all 150 questions in
 * the bank found the damage confined to this one game:
 *
 *     8 of 20   UNWINNABLE. `correctAnswer` listed more entries than the
 *               question had lines - q_switch_02 had 6 lines and an answer of
 *               [0,1,2,3,4,5,6]. Grading compares lengths first, so no
 *               submission could ever match. Every attempt scored 0.
 *     9 of 20   NOTHING TO REARRANGE. `correctAnswer` was the identity
 *               permutation, so the lines were already in the right order. The
 *               UI starts the student in exactly that order, so pressing Submit
 *               without touching anything scored 100.
 *     3 of 20   actually playable.
 *
 * The cause is visible in the old file: the answers were sequential integers
 * with no relation to the lines - [0,1,2,3,4,5,6,7,8,9] against a six-line
 * question. They had never been derived from the content at all.
 *
 * ======================== HOW THIS MAKES IT IMPOSSIBLE ======================
 * A question is authored as the code in its CORRECT order, plus a `shuffle`
 * saying what the student is shown. Both stored fields are DERIVED:
 *
 *     codeLines[d]     = correctOrder[shuffle[d]]     what the student sees
 *     correctAnswer[p] = shuffle.indexOf(p)           where each line belongs
 *
 * So the answer cannot disagree with the lines, because nobody writes it. The
 * seeder then refuses to run if any shuffle is not a permutation, or is the
 * identity - the two failure modes above, each now impossible to commit.
 *
 * tests/dragDropQuestions.test.js asserts the same properties over the authored
 * set, so this is caught by `npm test` and not only at seed time.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const QuestionBank = require('../models/QuestionBank');

/**
 * @param {string} id
 * @param {string} errorType
 * @param {string} conceptTag
 * @param {string} difficulty
 * @param {string[]} correctOrder  the code as it should end up, top to bottom
 * @param {number[]} shuffle       display order: shuffle[d] is the index in
 *                                 correctOrder of the line shown at slot d
 * @param {string[]} hints
 * @param {string} explanation
 */
function dragDrop(id, errorType, conceptTag, difficulty, correctOrder, shuffle, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: 'DragDrop',
        codeLines: shuffle.map((source) => correctOrder[source]),
        correctAnswer: correctOrder.map((_, position) => shuffle.indexOf(position)),
        hints,
        explanation,
        // Kept for the validator's error messages and for anyone reading the
        // stored document who wants to know what the finished code looks like.
        _correctOrder: correctOrder
    };
}

const QUESTIONS = [
    /* ── INCORRECT_CONDITIONAL_OPERATOR / conditional_logic ─────────────── */
    dragDrop('q_cond_op_01', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Beginner',
        ['int score = readScore();',
         'if (score >= 50) {',
         '    System.out.println("Pass");',
         '}',
         'System.out.println("Done");'],
        [1, 0, 4, 2, 3],
        ['A variable has to exist before a condition can test it.',
         'The println that depends on the condition belongs inside the braces.',
         '"Done" runs whatever the score was, so it comes after the closing brace.'],
        'The declaration comes first, the guarded statement sits inside the if, and the unconditional line follows the block.'),

    dragDrop('q_cond_op_02', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Beginner',
        ['int age = 20;',
         'if (age >= 18) {',
         '    System.out.println("Adult");',
         '} else {',
         '    System.out.println("Minor");',
         '}'],
        [3, 1, 0, 4, 2, 5],
        ['Which branch belongs to the condition being true?',
         'The else clause closes the first block and opens the second.',
         'Only one closing brace ends the whole statement.'],
        'An if/else is four structural lines around two bodies, and the true branch comes first.'),

    dragDrop('q_cond_op_03', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Intermediate',
        ['if (index >= 0 && index < arr.length) {',
         '    System.out.println(arr[index]);',
         '} else {',
         '    System.out.println("Out of range");',
         '}'],
        [2, 3, 0, 4, 1],
        ['The bounds check has to come before the array is read.',
         'Reading arr[index] is only safe inside the true branch.',
         'The message about being out of range belongs in the else.'],
        'The guard must precede the access it protects - which is the whole point of checking bounds with && before indexing.'),

    dragDrop('q_cond_op_04', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Intermediate',
        ['String name = lookup(id);',
         'if (name != null && !name.isEmpty()) {',
         '    System.out.println(name.trim());',
         '} else {',
         '    System.out.println("No name");',
         '}'],
        [1, 2, 0, 5, 3, 4],
        ['name.trim() throws if name is null.',
         'The null check has to run before anything calls a method on it.',
         '&& stops evaluating as soon as the left side is false, which is what makes the guard work.'],
        'Order matters twice here: the lookup before the check, and the check before the method call it protects.'),

    dragDrop('q_cond_op_05', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Advanced',
        ['if (mark >= 75) {',
         '    grade = "A";',
         '} else if (mark >= 50) {',
         '    grade = "B";',
         '} else {',
         '    grade = "C";',
         '}'],
        [2, 3, 0, 1, 6, 4, 5],
        ['A mark of 80 satisfies both >= 75 and >= 50. Which branch should win?',
         'A condition ladder has to test the highest threshold first.',
         'Put them in descending order, with the catch-all else last.'],
        'Ladder conditions are checked top to bottom and stop at the first match, so the strictest test must come first or it can never be reached.'),

    /* ── MISSING_BREAK_IN_SWITCH / switch_statements ────────────────────── */
    dragDrop('q_switch_01', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Beginner',
        ['switch (day) {',
         '    case 1:',
         '        System.out.println("Monday");',
         '        break;',
         '    default:',
         '        System.out.println("Other day");',
         '}'],
        [1, 3, 0, 5, 2, 6, 4],
        ['A case label comes before the statements it runs.',
         'break belongs at the end of a case body, not before it.',
         'default is the last branch, and the closing brace ends the switch.'],
        'Each case is a label, then its body, then break - and default sits last inside the switch.'),

    dragDrop('q_switch_02', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Beginner',
        ['switch (grade) {',
         '    case \'A\':',
         '        System.out.println("Excellent");',
         '        break;',
         '    case \'B\':',
         '        System.out.println("Good");',
         '        break;',
         '}'],
        [2, 0, 4, 1, 6, 3, 7, 5],
        ['Every case needs its own break, or it falls into the next one.',
         'The break for case A goes before the label for case B.',
         'Two complete cases: label, body, break, twice over.'],
        'Without the break after the first body, an A prints both messages - which is the fall-through this concept is about.'),

    dragDrop('q_switch_03', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Intermediate',
        ['switch (month) {',
         '    case 1:',
         '    case 3:',
         '        System.out.println("31 days");',
         '        break;',
         '    default:',
         '        System.out.println("30 days");',
         '}'],
        [1, 0, 3, 2, 5, 7, 4, 6],
        ['Two labels can share one body. That fall-through is deliberate.',
         'The shared body comes after both labels.',
         'One break ends the shared case, not one per label.'],
        'Stacked labels are the one legitimate use of fall-through: case 1 and case 3 run the same body, which still ends with a single break.'),

    dragDrop('q_switch_04', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Intermediate',
        ['switch (op) {',
         '    case "+":',
         '        result = a + b;',
         '        break;',
         '    case "-":',
         '        result = a - b;',
         '        break;',
         '    default:',
         '        result = 0;',
         '}'],
        [3, 1, 5, 0, 8, 2, 6, 9, 4, 7],
        ['Each operator assigns and then breaks.',
         'Without a break, "+" would compute a + b and then overwrite it with a - b.',
         'default needs no break because nothing follows it.'],
        'A missing break here does not just print twice - it computes the wrong answer, because the next case overwrites the result.'),

    dragDrop('q_switch_05', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Advanced',
        ['switch (command) {',
         '    case "save":',
         '        save();',
         '        break;',
         '    case "quit":',
         '        quit();',
         '        break;',
         '    default:',
         '        help();',
         '}'],
        [1, 4, 0, 7, 2, 9, 5, 8, 3, 6],
        ['Both real commands have a side effect, so both need a break.',
         'Falling from "save" into "quit" would exit the program after saving.',
         'The break belongs immediately after the call it protects.'],
        'Fall-through is worst when the next case has a side effect: without the break after save(), every save also quits.'),

    /* ── ALWAYS_TRUE_OR_CONDITION / boolean_logic ───────────────────────── */
    dragDrop('q_bool_or_01', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Beginner',
        ['boolean inRange = value > 0 && value < 100;',
         'if (inRange) {',
         '    System.out.println("Accepted");',
         '} else {',
         '    System.out.println("Rejected");',
         '}'],
        [1, 0, 3, 5, 2, 4],
        ['The boolean has to be computed before it can be tested.',
         '&& is what makes both bounds hold at once - with || everything passes.',
         'The accepted message belongs to the true branch.'],
        'Naming the condition first makes it readable, and && is what makes it a range rather than a test every number passes.'),

    dragDrop('q_bool_or_02', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Beginner',
        ['boolean isWeekend = day.equals("Sat") || day.equals("Sun");',
         'if (isWeekend) {',
         '    System.out.println("Rest");',
         '} else {',
         '    System.out.println("Work");',
         '}'],
        [2, 1, 4, 0, 5, 3],
        ['Here || is correct - a day can be Saturday or Sunday, not both.',
         'Both halves must be .equals() calls, not != comparisons.',
         'Compute the boolean, then branch on it.'],
        'This is the case where || is right: two alternatives that cannot both hold. The mistake to avoid is writing one half as a reference comparison.'),

    dragDrop('q_bool_or_03', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Intermediate',
        ['if (user == null) {',
         '    System.out.println("No user");',
         '    return;',
         '}',
         'if (user.isActive() && user.hasAccess()) {',
         '    grant();',
         '}'],
        [4, 0, 5, 1, 6, 2, 3],
        ['The null check has to complete before any method is called on user.',
         'Returning early is what lets the second block assume user exists.',
         'Both permissions must hold, so && rather than ||.'],
        'An early return for the null case is cleaner than nesting, and it is what makes the && on the next block safe.'),

    dragDrop('q_bool_or_04', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Intermediate',
        ['boolean valid = day >= 1 && day <= 31;',
         'if (!valid) {',
         '    throw new IllegalArgumentException("Bad day");',
         '}',
         'process(day);'],
        [4, 2, 0, 3, 1],
        ['With || instead of &&, every integer would be valid.',
         'The check has to happen before the value is used.',
         'The throw belongs inside the if, and process runs after it.'],
        'Validating with && and rejecting early means process() only ever sees a day in range.'),

    dragDrop('q_bool_or_05', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Advanced',
        ['boolean hasText = input != null && !input.isBlank();',
         'boolean isShort = hasText && input.length() < 20;',
         'if (isShort) {',
         '    accept(input);',
         '} else {',
         '    reject(input);',
         '}'],
        [2, 0, 5, 1, 6, 3, 4],
        ['isShort depends on hasText, so hasText must be computed first.',
         'Each && short-circuits, which is what stops length() being called on null.',
         'The branch comes after both booleans exist.'],
        'Chained guards only work in order: hasText protects the length() call, and isShort depends on hasText having been computed already.'),

    /* ── DUPLICATE_IF_ELSE_CONDITION / conditional_logic ────────────────── */
    dragDrop('q_dup_if_01', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Beginner',
        ['if (n > 0) {',
         '    System.out.println("positive");',
         '} else if (n < 0) {',
         '    System.out.println("negative");',
         '} else {',
         '    System.out.println("zero");',
         '}'],
        [2, 0, 1, 4, 3, 6, 5],
        ['Three outcomes need three distinct branches.',
         'Repeating the same condition would make the second branch unreachable.',
         'Zero is neither positive nor negative, so it is the catch-all.'],
        'Each branch must test something different, or it can never run - and the case that matches neither test belongs in the else.'),

    dragDrop('q_dup_if_02', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Beginner',
        ['if (temp > 30) {',
         '    System.out.println("hot");',
         '} else if (temp > 20) {',
         '    System.out.println("warm");',
         '} else {',
         '    System.out.println("cold");',
         '}'],
        [1, 3, 0, 2, 5, 4, 6],
        ['A temperature of 35 passes both tests. Which should win?',
         'The higher threshold has to be checked first.',
         'Repeating > 30 would leave "warm" unreachable.'],
        'Descending thresholds are what make each branch reachable: > 20 is only ever tested for values that already failed > 30.'),

    dragDrop('q_dup_if_03', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Intermediate',
        ['if (type.equals("admin")) {',
         '    grantAll();',
         '} else if (type.equals("editor")) {',
         '    grantWrite();',
         '} else {',
         '    grantRead();',
         '}'],
        [4, 2, 5, 0, 3, 6, 1],
        ['Each role must be tested with a different string.',
         'The negation of the first condition is not a second condition worth writing.',
         'Everyone who is neither falls to the else.'],
        'Testing a condition and then its exact negation makes the else unreachable; distinct positive tests plus one catch-all does not.'),

    dragDrop('q_dup_if_04', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Intermediate',
        ['if (score >= 75) {',
         '    grade = "A";',
         '} else if (score >= 50) {',
         '    grade = "B";',
         '} else if (score >= 25) {',
         '    grade = "C";',
         '} else {',
         '    grade = "F";',
         '}'],
        [2, 4, 0, 6, 1, 3, 5, 8, 7],
        ['Four outcomes, four branches, each with a lower bar than the last.',
         'Any repeated threshold makes everything below it unreachable.',
         'The final else needs no condition.'],
        'A four-branch ladder is only correct if every threshold is strictly lower than the one above it.'),

    dragDrop('q_dup_if_05', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Advanced',
        ['int remainder = n % 2;',
         'if (remainder == 0) {',
         '    System.out.println("even");',
         '} else {',
         '    System.out.println("odd");',
         '}'],
        [3, 1, 4, 0, 5, 2],
        ['n % 2 is computed once and tested once.',
         'A second condition testing remainder != 1 would be the same claim written differently.',
         'Two outcomes need an if and an else, not two ifs.'],
        'Even and odd are exhaustive, so the second branch needs no condition at all - writing one invites a duplicate that makes it unreachable, and n % 2 is -1 for negative n anyway.')
];

/** Refuse to seed anything that could reproduce either original defect. */
function validate() {
    const problems = [];
    const ids = new Set();

    for (const q of QUESTIONS) {
        const n = q._correctOrder.length;

        if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
        ids.add(q.id);

        if (q.codeLines.length !== n) {
            problems.push(`${q.id}: ${q.codeLines.length} lines for ${n} authored`);
        }

        const sorted = [...q.correctAnswer].sort((a, b) => a - b);
        if (sorted.length !== n || sorted.some((v, i) => v !== i)) {
            problems.push(`${q.id}: answer is not a permutation of 0..${n - 1}`);
            continue;
        }

        if (q.correctAnswer.every((v, i) => v === i)) {
            problems.push(`${q.id}: answer is the identity - nothing to rearrange`);
        }

        // The derived answer must actually reconstruct the authored code.
        const rebuilt = q.correctAnswer.map((source) => q.codeLines[source]);
        if (rebuilt.join('\n') !== q._correctOrder.join('\n')) {
            problems.push(`${q.id}: applying the answer does not rebuild the authored order`);
        }

        if ((q.hints || []).length < 3) problems.push(`${q.id}: fewer than 3 hints`);
        if (!q.explanation) problems.push(`${q.id}: no explanation`);
    }

    return problems;
}

const seed = async () => {
    const problems = validate();
    if (problems.length > 0) {
        console.error('Refusing to seed. Problems found:');
        problems.forEach((p) => console.error('  ' + p));
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);

    for (const question of QUESTIONS) {
        const { _correctOrder, ...document } = question;
        void _correctOrder;
        await QuestionBank.updateOne({ id: document.id }, { $set: document }, { upsert: true });
    }

    const total = await QuestionBank.countDocuments({ gameType: 'DragDrop' });
    console.log(`Upserted ${QUESTIONS.length} Drag & Drop questions. Bank holds ${total}.`);

    await mongoose.disconnect();
};

module.exports = { QUESTIONS, validate };

if (require.main === module) {
    seed().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
