/**
 * The two missing rungs of the ladder.
 *
 *     node data/seed_elementary_expert.js            # validate only
 *     node data/seed_elementary_expert.js --apply
 *
 * ========================== WHAT WAS MISSING ==========================
 * The bank held 343 questions across five difficulty levels, and only CodeFix
 * had all five:
 *
 *     game           Beginner   Elementary Intermediate     Advanced    Expert
 *     BugHunt              24            0           24           24         0
 *     DragDrop             10            0           10            9         0
 *     CodeTrace             9            0            9            9         0
 *     CodeFix              43           43           43           43        43
 *
 * So the five-level progression FR-08 walks was only real in one of the four
 * formats. Ask for an Elementary BugHunt and nearestDifficulty() serves
 * Beginner instead - correct behaviour, and it records the level it actually
 * served so nobody is falsely promoted, but it means three quarters of the
 * bank effectively had three levels. A student moving up in BugHunt jumped
 * from Beginner to Intermediate with nothing between, and could never be
 * served anything above Advanced.
 *
 * This fills those six cells. Concept coverage is deliberately NOT changed:
 * CONCEPT_GAME_MAPPING assigns each concept a home format - loop_boundaries is
 * a BugHunt, conditional_logic is a DragDrop - so DragDrop covering three of
 * fourteen concepts is the design, not a gap.
 * ======================================================================
 *
 * ======================== HOW THE LEVELS DIFFER ========================
 * Taken from how CodeFix, the one format that had all five, actually varies:
 *
 *   Elementary  the same mistake as Beginner in a barer snippet - no method
 *               wrapper, no surrounding program. Less to read, so the error is
 *               the only thing to look at.
 *   Expert      the mistake inside code that is doing something real, where it
 *               is one plausible line among several and the surrounding logic
 *               is correct.
 *
 * Difficulty here is the subtlety of the error and the plausibility of the
 * lines around it, not the number of lines.
 * =======================================================================
 *
 * ======================= WHY THE VALIDATOR MATTERS =======================
 * Seventeen of the original twenty Drag & Drop questions were unplayable, and
 * it took an audit to find them: eight had an answer of a different length
 * from the question, and nine were already in the correct order so Submit
 * without touching anything scored 100. Nothing in the suite had ever looked
 * at question CONTENT.
 *
 * So none of the Drag & Drop entries below writes a permutation by hand. Each
 * gives the code in its CORRECT order plus a shuffle, and the helper derives
 * both stored fields - which makes a length mismatch impossible and an
 * accidental identity arrangement detectable. validate() runs before anything
 * is written, and `--apply` refuses if it reports anything.
 * ========================================================================
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const QuestionBank = require('../models/QuestionBank');
const {
    CONCEPT_TAGS,
    DIFFICULTY_LEVELS,
    ERROR_TYPES,
    GAME_TYPES,
    CONCEPT_GAME_MAPPING
} = require('../config/constants');

/** Find the buggy line: `correctAnswer` is the index the student clicks. */
function bugHunt(id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: 'BugHunt',
        codeLines,
        buggyLineIndex,
        correctAnswer: buggyLineIndex,
        hints,
        explanation
    };
}

/** Predict what the program prints: `correctAnswer` is that text. */
function codeTrace(id, errorType, conceptTag, difficulty, codeLines, correctAnswer, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: 'CodeTrace',
        codeLines,
        correctAnswer,
        hints,
        explanation
    };
}

/**
 * Reorder the lines.
 *
 * `correctOrder` is the finished code; `shuffle` says how it is presented.
 * Both stored fields are derived, so the two cannot disagree about length and
 * nobody writes an index sequence by hand - which is how the original twenty
 * went wrong.
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
        _correctOrder: correctOrder
    };
}

const QUESTIONS = [
    /* ═════════════════════ BugHunt · Elementary ═════════════════════ */

    bugHunt('q_ee_loop_bound_e1', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Elementary',
        ['int[] data = {1, 2, 3};',
         'for (int i = 0; i <= data.length; i++) {',
         '    System.out.println(data[i]);',
         '}'],
        1,
        ['An array of three has valid positions 0, 1 and 2.',
         'What is the largest value i reaches here?',
         'The condition decides where the loop stops.'],
        'With <= the loop runs while i equals data.length, and data[3] does not exist on a three-element array.'),

    bugHunt('q_ee_loop_bound_e2', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Elementary',
        ['String[] names = {"Ada", "Grace"};',
         'int i = 0;',
         'while (i <= names.length) {',
         '    System.out.println(names[i]);',
         '    i++;',
         '}'],
        2,
        ['The array has two elements.',
         'The last valid index is one less than the length.',
         'Which line decides when the loop stops?'],
        'The loop continues while i equals names.length, so it reads names[2] on a two-element array.'),

    bugHunt('q_ee_array_index_e1', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Elementary',
        ['int[] scores = {10, 20, 30};',
         'System.out.println(scores[scores.length]);'],
        1,
        ['length is a count, not a position.',
         'Three elements sit at 0, 1 and 2.',
         'What index does scores.length give you?'],
        'scores.length is 3, and the last element is at index 2. The last element is scores[scores.length - 1].'),

    bugHunt('q_ee_array_index_e2', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Elementary',
        ['char[] letters = {\'a\', \'b\', \'c\'};',
         'int last = letters.length;',
         'System.out.println(letters[last]);'],
        1,
        ['Trace what value last holds.',
         'Positions run from 0 up to length - 1.',
         'The problem is where last is worked out, not where it is used.'],
        'last is set to the length rather than the final index, so it is one past the end before it is ever used.'),

    bugHunt('q_ee_loop_control_e1', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Elementary',
        ['for (int i = 0; i < 5; i--) {',
         '    System.out.println(i);',
         '}'],
        0,
        ['Which way does i move each time round?',
         'Which way does the condition need it to move?',
         'Start, condition and update all live on one line here.'],
        'i starts at 0 and decreases, so it never reaches 5 and the condition stays true forever.'),

    bugHunt('q_ee_loop_control_e2', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Elementary',
        ['int n = 10;',
         'while (n > 0) {',
         '    System.out.println(n);',
         '    n++;',
         '}'],
        3,
        ['The condition stops the loop when n reaches 0.',
         'Is n getting closer to 0 or further away?',
         'Look at the update, not the condition.'],
        'n grows away from the bound the condition tests, so n > 0 never becomes false.'),

    bugHunt('q_ee_control_flow_e1', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Elementary',
        ['public static int doubled(int n) {',
         '    return n * 2;',
         '    System.out.println("done");',
         '}'],
        2,
        ['What happens the moment a return runs?',
         'Can anything after it execute?',
         'The compiler rejects this method.'],
        'return leaves the method immediately, so the println can never run and Java refuses to compile it.'),

    bugHunt('q_ee_control_flow_e2', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Elementary',
        ['public static String label(boolean ok) {',
         '    if (ok) {',
         '        return "yes";',
         '    }',
         '    return "no";',
         '    System.out.println("checked");',
         '}'],
        5,
        ['Both branches already leave the method.',
         'Which line can no path reach?',
         'Look below the last return.'],
        'Every route through the method returns before this line, so it is unreachable.'),

    bugHunt('q_ee_stmt_struct_e1', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Elementary',
        ['int n = 5;',
         'if (n > 3);',
         '    System.out.println("big");'],
        1,
        ['Read the end of the if line carefully.',
         'What is the body of this if statement?',
         'The indented line looks guarded. Is it?'],
        'The semicolon ends the if with an empty body, so the println is a separate statement that always runs.'),

    bugHunt('q_ee_stmt_struct_e2', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Elementary',
        ['int i = 0;',
         'while (i < 3);',
         '{',
         '    i++;',
         '}'],
        1,
        ['What is the body of the while loop?',
         'A semicolon is a complete, empty statement.',
         'The block below runs separately - if the program ever reaches it.'],
        'The semicolon makes the loop body empty, so the loop spins forever without ever reaching the block that increments i.'),

    bugHunt('q_ee_assignment_e1', 'SELF_ASSIGNMENT', 'assignment_logic', 'Elementary',
        ['int width = 10;',
         'int height = 4;',
         'width = width;',
         'System.out.println(width * height);'],
        2,
        ['What does this line change?',
         'Read the two sides of the assignment.',
         'Some line here does nothing at all.'],
        'Assigning a variable to itself has no effect - the line was meant to compute something.'),

    bugHunt('q_ee_assignment_e2', 'SELF_ASSIGNMENT', 'assignment_logic', 'Elementary',
        ['String name = "Ada";',
         'String upper = name;',
         'upper = upper;',
         'System.out.println(upper);'],
        2,
        ['Which line was supposed to change upper?',
         'Compare the left and right of each assignment.',
         'The program prints "Ada" rather than "ADA".'],
        'upper = upper leaves it holding the original text; the line should have called toUpperCase.'),

    bugHunt('q_ee_arithmetic_e1', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Elementary',
        ['int total = 20;',
         'int people = 0;',
         'System.out.println(total / people);'],
        2,
        ['What is people set to?',
         'Integer division by zero is not infinity in Java.',
         'This throws at run time rather than failing to compile.'],
        'Dividing an integer by zero throws ArithmeticException; people has to be checked before the division.'),

    bugHunt('q_ee_arithmetic_e2', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Elementary',
        ['int a = 7;',
         'System.out.println(a % 0);'],
        1,
        ['Modulo is division underneath.',
         'What does the right-hand operand have to avoid being?',
         'The same rule as / applies to %.'],
        'The remainder operator divides too, so % 0 throws ArithmeticException exactly as / 0 does.'),

    bugHunt('q_ee_loop_term_e1', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Elementary',
        ['int remaining = 10;',
         'while (remaining > 0) {',
         '    System.out.println(remaining);',
         '    remaining = remaining - 0;',
         '}'],
        3,
        ['Does remaining actually change?',
         'Work out its value after one pass.',
         'The update line is there, but read what it subtracts.'],
        'Subtracting zero leaves remaining at 10 forever, so the condition never becomes false.'),

    bugHunt('q_ee_loop_term_e2', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Elementary',
        ['int attempts = 0;',
         'int limit = 3;',
         'while (attempts < limit) {',
         '    System.out.println("try");',
         '    limit++;',
         '}'],
        4,
        ['Which of the two variables does the loop change?',
         'Which one did it need to change?',
         'The gap between them grows every pass.'],
        'attempts never moves and limit runs away from it, so attempts < limit stays true for good.'),

    /* ═════════════════════ BugHunt · Expert ═════════════════════ */

    bugHunt('q_ee_loop_bound_x1', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Expert',
        ['public static boolean isSorted(int[] a) {',
         '    for (int i = 0; i < a.length; i++) {',
         '        if (a[i] > a[i + 1]) {',
         '            return false;',
         '        }',
         '    }',
         '    return true;',
         '}'],
        1,
        ['The body compares each element with the one after it.',
         'What does i + 1 reach on the final pass?',
         'The comparison is right; the range it runs over is not.'],
        'Because the body reads a[i + 1], the loop must stop at a.length - 1 - as written the last pass reads one past the end.'),

    bugHunt('q_ee_loop_bound_x2', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Expert',
        ['public static int sumWindow(int[] a, int size) {',
         '    int total = 0;',
         '    for (int i = 0; i + size <= a.length; i++) {',
         '        for (int j = i; j <= i + size; j++) {',
         '            total += a[j];',
         '        }',
         '    }',
         '    return total;',
         '}'],
        3,
        ['The outer loop guarantees a full window fits.',
         'How many elements does the inner loop actually add?',
         'A window of size n covers positions i to i + n - 1.'],
        'The inner loop runs to i + size inclusive, which is size + 1 elements and one past the window the outer loop checked for.'),

    bugHunt('q_ee_array_index_x1', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Expert',
        ['public static int[] reverse(int[] a) {',
         '    int[] out = new int[a.length];',
         '    for (int i = 0; i < a.length; i++) {',
         '        out[i] = a[a.length - i];',
         '    }',
         '    return out;',
         '}'],
        3,
        ['Work out the source index when i is 0.',
         'The first element written should come from the last position.',
         'The loop range is fine.'],
        'On the first pass this reads a[a.length], one past the end; reversing needs a[a.length - 1 - i].'),

    bugHunt('q_ee_array_index_x2', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Expert',
        ['public static void shiftLeft(int[] a) {',
         '    for (int i = 0; i < a.length - 1; i++) {',
         '        a[i] = a[i + 1];',
         '    }',
         '    a[a.length] = 0;',
         '}'],
        4,
        ['The loop itself stays in range.',
         'Where should the vacated slot be?',
         'length is a count, not a position.'],
        'The last slot is a[a.length - 1]; writing to a[a.length] is one past the end and throws.'),

    bugHunt('q_ee_loop_control_x1', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Expert',
        ['public static void everyOther(int[] a) {',
         '    for (int i = a.length - 1; i >= 0; i += 2) {',
         '        System.out.println(a[i]);',
         '    }',
         '}'],
        1,
        ['The loop starts at the end and the condition tests for reaching 0.',
         'Which way does the update move i?',
         'Start and condition agree with each other.'],
        'Walking backwards needs i -= 2; adding moves i away from 0, so the condition never fails and the first read past the end throws.'),

    bugHunt('q_ee_loop_control_x2', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Expert',
        ['public static int digits(int n) {',
         '    int count = 0;',
         '    while (n > 0) {',
         '        count++;',
         '        n = n * 10;',
         '    }',
         '    return count;',
         '}'],
        4,
        ['The loop ends when n reaches 0.',
         'Does multiplying get n closer to that?',
         'Counting digits means removing one each pass.'],
        'Multiplying grows n away from the bound; removing a digit is n / 10.'),

    bugHunt('q_ee_control_flow_x1', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Expert',
        ['public static int find(int[] a, int target) {',
         '    for (int i = 0; i < a.length; i++) {',
         '        if (a[i] == target) {',
         '            return i;',
         '            i++;',
         '        }',
         '    }',
         '    return -1;',
         '}'],
        4,
        ['What happens the instant the target is found?',
         'Which line inside the if can never run?',
         'The search logic is correct.'],
        'The return leaves the method, so the increment after it is unreachable and the compiler rejects it.'),

    bugHunt('q_ee_control_flow_x2', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Expert',
        ['public static String grade(int score) {',
         '    if (score >= 50) {',
         '        return "pass";',
         '    } else {',
         '        return "fail";',
         '    }',
         '    return "unknown";',
         '}'],
        6,
        ['Both branches of the if return.',
         'Is there any score that reaches the final line?',
         'An if/else with returns on both sides covers everything.'],
        'Every path already returns inside the if/else, so the trailing return is unreachable.'),

    bugHunt('q_ee_stmt_struct_x1', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Expert',
        ['public static void report(int value) {',
         '    if (value < 0);',
         '    {',
         '        System.out.println("negative");',
         '    }',
         '}'],
        1,
        ['The block below is indented as though it belongs to the if.',
         'Read the character at the end of the condition.',
         'A bare block is legal Java on its own.'],
        'The semicolon closes the if with an empty body, so the block runs for every value including positive ones.'),

    bugHunt('q_ee_stmt_struct_x2', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Expert',
        ['int total = 0;',
         'int i = 1;',
         'while (i <= 3);',
         '{',
         '    total += i;',
         '    i++;',
         '}',
         'System.out.println(total);'],
        2,
        ['Which statement is the loop body?',
         'Does the block below ever run?',
         'i is never touched by the loop as written.'],
        'The semicolon makes the loop body empty; i stays 1, the condition stays true, and the block is never reached.'),

    bugHunt('q_ee_assignment_x1', 'SELF_ASSIGNMENT', 'assignment_logic', 'Expert',
        ['public static void swap(int[] a, int i, int j) {',
         '    int temp = a[i];',
         '    a[i] = a[j];',
         '    a[j] = a[j];',
         '}'],
        3,
        ['What is temp holding, and is it ever used?',
         'Trace both slots after all three lines.',
         'The first two lines are right.'],
        'The third line assigns a slot to itself, so both entries end up holding the original a[j] and temp is wasted.'),

    bugHunt('q_ee_assignment_x2', 'SELF_ASSIGNMENT', 'assignment_logic', 'Expert',
        ['public class Counter {',
         '    private int count;',
         '    public void setCount(int count) {',
         '        count = count;',
         '    }',
         '}'],
        3,
        ['The parameter and the field share a name.',
         'Which of the two does an unqualified name refer to?',
         'The field is never touched.'],
        'Both sides name the parameter, so the field is never set; it needs this.count = count.'),

    bugHunt('q_ee_arithmetic_x1', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Expert',
        ['public static int rate(int hits, int attempts) {',
         '    if (attempts < 0) {',
         '        return 0;',
         '    }',
         '    return hits / attempts;',
         '}'],
        4,
        ['The guard above rejects negative counts.',
         'Which value does it still let through?',
         'Zero is not less than zero.'],
        'The guard catches negatives but not zero, so a zero attempt count reaches the division and throws.'),

    bugHunt('q_ee_arithmetic_x2', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Expert',
        ['int[] counts = {4, 0, 2};',
         'int total = 0;',
         'for (int i = 0; i < counts.length; i++) {',
         '    total += 100 / counts[i];',
         '}',
         'System.out.println(total);'],
        3,
        ['The loop range is correct.',
         'Read the values in the array.',
         'The second pass is the one that fails.'],
        'One entry is zero, and dividing by it throws on the second pass; each divisor has to be checked first.'),

    bugHunt('q_ee_loop_term_x1', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Expert',
        ['public static int countDigits(int n) {',
         '    int digits = 0;',
         '    while (n > 0) {',
         '        digits++;',
         '        n = n % 10;',
         '    }',
         '    return digits;',
         '}'],
        4,
        ['Trace n for the input 42.',
         'What does % 10 leave behind?',
         'Removing a digit and taking the last digit are different operations.'],
        'n % 10 keeps the last digit rather than dropping it, so after the first pass n never changes again.'),

    bugHunt('q_ee_loop_term_x2', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Expert',
        ['public static void drain(Queue<Integer> queue) {',
         '    while (!queue.isEmpty()) {',
         '        Integer head = queue.peek();',
         '        System.out.println(head);',
         '    }',
         '}'],
        2,
        ['What does the condition test?',
         'Does peek change the queue?',
         'The printing is fine.'],
        'peek reads the head without removing it, so the queue never empties; poll is what takes the element out.'),

    /* ═════════════════════ DragDrop · Elementary ═════════════════════ */

    dragDrop('q_ee_cond_logic_e1', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Elementary',
        ['int n = readNumber();',
         'if (n % 2 == 0) {',
         '    System.out.println("even");',
         '} else {',
         '    System.out.println("odd");',
         '}'],
        [2, 0, 4, 1, 5, 3],
        ['The value has to exist before it can be tested.',
         'Each println belongs inside one of the two branches.',
         'else closes the first block and opens the second.'],
        'Read the number, test it, and give each branch its own message before closing the statement.'),

    dragDrop('q_ee_cond_logic_e2', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Elementary',
        ['int temp = 30;',
         'if (temp > 25) {',
         '    System.out.println("hot");',
         '}'],
        [1, 3, 0, 2],
        ['Declare before you test.',
         'The message only prints when the condition holds.',
         'One closing brace ends the statement.'],
        'The declaration comes first, the guarded message sits inside the braces, and the block closes after it.'),

    /* ═════════════════════ DragDrop · Expert ═════════════════════ */

    dragDrop('q_ee_cond_logic_x1', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Expert',
        ['int score = getScore();',
         'if (score >= 80) {',
         '    grade = "A";',
         '} else if (score >= 50) {',
         '    grade = "B";',
         '} else {',
         '    grade = "F";',
         '}'],
        [3, 6, 0, 7, 2, 5, 1, 4],
        ['A chain has to test the highest boundary first.',
         'Each assignment belongs to the branch above it.',
         'The final else needs no condition.'],
        'Ordering the tests from highest to lowest is what makes each branch reachable; testing 50 before 80 would make the A branch dead.'),

    dragDrop('q_ee_cond_logic_x2', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Expert',
        ['String role = user.getRole();',
         'if (role == null) {',
         '    return "guest";',
         '}',
         'if (role.equals("admin")) {',
         '    return "full";',
         '}',
         'return "limited";'],
        [7, 2, 5, 0, 3, 6, 1, 4],
        ['One check has to happen before the value is used.',
         'Calling a method on null throws.',
         'The last line is the fall-through for everything else.'],
        'The null guard must come before role.equals, or a missing role throws instead of returning "guest".'),

    dragDrop('q_ee_switch_e1', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Elementary',
        ['switch (day) {',
         '    case 1:',
         '        System.out.println("Monday");',
         '        break;',
         '    default:',
         '        System.out.println("Other");',
         '}'],
        [4, 1, 6, 0, 3, 5, 2],
        ['A case label comes before the work it guards.',
         'break is what stops one case running into the next.',
         'default is the last label.'],
        'Each case names a value, does its work, then breaks; without the break the default would run as well.'),

    dragDrop('q_ee_switch_e2', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Elementary',
        ['switch (grade) {',
         '    case \'A\':',
         '        System.out.println("Excellent");',
         '        break;',
         '}'],
        [2, 0, 4, 1, 3],
        ['The switch opens on the value being tested.',
         'The label comes before the statement it guards.',
         'break ends the case.'],
        'A single case still needs its break, or execution falls through to whatever is added below it later.'),

    dragDrop('q_ee_switch_x1', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Expert',
        ['switch (command) {',
         '    case "start":',
         '    case "resume":',
         '        engine.run();',
         '        break;',
         '    case "stop":',
         '        engine.halt();',
         '        break;',
         '    default:',
         '        log("unknown");',
         '}'],
        [5, 0, 8, 2, 10, 1, 7, 3, 9, 4, 6],
        ['Two labels can share one body deliberately.',
         'Each body that produces an effect needs its own break.',
         'default comes last.'],
        'Stacked labels are intentional fall-through; the breaks after each body are what stop the unintentional kind.'),

    dragDrop('q_ee_switch_x2', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Expert',
        ['int days;',
         'switch (month) {',
         '    case 2:',
         '        days = 28;',
         '        break;',
         '    default:',
         '        days = 30;',
         '}',
         'System.out.println(days);'],
        [4, 8, 1, 6, 0, 7, 3, 5, 2],
        ['The variable has to be declared before the switch assigns it.',
         'Every path through the switch must give it a value.',
         'The print happens after the whole statement.'],
        'days is declared first and assigned on every path, so it is definitely assigned by the time it is printed.'),

    /* ═════════════════════ DragDrop · boolean_logic ═════════════════════ */

    dragDrop('q_ee_bool_logic_e1', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Elementary',
        ['int age = 20;',
         'boolean adult = age >= 18 && age < 65;',
         'System.out.println(adult);'],
        [2, 0, 1],
        ['The value must exist before the test uses it.',
         'The result has to be worked out before it is printed.',
         'Three lines, one order.'],
        'A range test needs both halves joined with && - with || every age would satisfy one side or the other.'),

    dragDrop('q_ee_bool_logic_e2', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Elementary',
        ['boolean loggedIn = true;',
         'boolean admin = false;',
         'if (loggedIn && admin) {',
         '    System.out.println("dashboard");',
         '}'],
        [3, 1, 4, 0, 2],
        ['Both flags are set before either is tested.',
         'The guarded line sits inside the braces.',
         'One closing brace ends the statement.'],
        'Both conditions have to hold, so they are joined with && and the body only runs when each is true.'),

    dragDrop('q_ee_bool_logic_x1', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Expert',
        ['boolean valid = input != null;',
         'boolean nonEmpty = valid && !input.isEmpty();',
         'if (nonEmpty) {',
         '    process(input);',
         '} else {',
         '    reject();',
         '}'],
        [6, 3, 0, 5, 1, 4, 2],
        ['One flag depends on the one before it.',
         'The null check has to be established before the method call.',
         'Each branch gets one statement.'],
        'valid is computed first so that && can short-circuit - without that order, isEmpty is called on a possible null.'),

    dragDrop('q_ee_bool_logic_x2', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Expert',
        ['int x = value;',
         'boolean inRange = x > 0 && x < 100;',
         'boolean special = x == 42;',
         'if (inRange || special) {',
         '    accept(x);',
         '}'],
        [4, 2, 5, 0, 3, 1],
        ['Both flags are worked out before the test that combines them.',
         'A range needs &&; alternatives need ||.',
         'The accept call is guarded.'],
        'The range uses && so it can be false, and only then does || with the special case widen it - || between two inequalities would always be true.'),

    /* ═════════════════════ CodeTrace · Elementary ═════════════════════ */

    codeTrace('q_ee_str_cmp_e1', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Elementary',
        ['String a = "code";',
         'String b = new String("code");',
         'System.out.println(a == b);'],
        'false',
        ['new String always makes a fresh object.',
         '== asks whether two references point at the same object.',
         'The text is identical; the objects are not.'],
        'a refers to the pooled literal and b to a new object, so == is false even though the text matches. equals would be true.'),

    codeTrace('q_ee_str_cmp_e2', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Elementary',
        ['String x = "Java";',
         'String y = "java";',
         'System.out.println(x.equals(y));'],
        'false',
        ['equals compares the characters.',
         'Are the characters the same?',
         'Java is case sensitive.'],
        'equals compares text exactly, and an upper-case J is not a lower-case j. equalsIgnoreCase would be true.'),

    codeTrace('q_ee_immutable_e1', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Elementary',
        ['String s = "  hi  ";',
         's.trim();',
         'System.out.println("[" + s + "]");'],
        '[  hi  ]',
        ['Strings cannot be changed once they exist.',
         'What does trim give back, and where does it go?',
         'The brackets show the spaces.'],
        'trim returns a new string and the result is discarded, so s still holds its original spaces.'),

    codeTrace('q_ee_immutable_e2', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Elementary',
        ['String w = "java";',
         'w.toUpperCase();',
         'System.out.println(w + "!");'],
        'java!',
        ['toUpperCase does not change the string it is called on.',
         'It hands back a new one.',
         'Nothing here catches that new string.'],
        'The upper-case string is created and thrown away; w is unchanged because strings are immutable.'),

    codeTrace('q_ee_loop_init_e1', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Elementary',
        ['int count = 0;',
         'for (int i = 5; i < 5; i++) {',
         '    count++;',
         '}',
         'System.out.println(count);'],
        '0',
        ['Check the condition before the first pass.',
         'Is 5 less than 5?',
         'A loop whose condition starts false runs zero times.'],
        'The counter starts at the bound, so the condition is false immediately and the body never runs.'),

    codeTrace('q_ee_loop_init_e2', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Elementary',
        ['int total = 0;',
         'for (int i = 1; i > 3; i++) {',
         '    total += i;',
         '}',
         'System.out.println(total);'],
        '0',
        ['Test the condition with the starting value.',
         'Is 1 greater than 3?',
         'The loop body is never entered.'],
        'The condition is false on the very first check, so total keeps its initial value.'),

    /* ═════════════════════ CodeTrace · Expert ═════════════════════ */

    codeTrace('q_ee_str_cmp_x1', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Expert',
        ['String a = "hello";',
         'String b = "hel";',
         'b = b + "lo";',
         'System.out.println(a == b);'],
        'false',
        ['Where is each string built?',
         'Concatenation at run time makes a new object.',
         'Only literals go in the shared pool.'],
        'The joined string is built at run time and is not pooled, so == compares two different objects and gives false.'),

    codeTrace('q_ee_str_cmp_x2', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Expert',
        ['String a = "test";',
         'String b = "test";',
         'System.out.println((a == b) + " " + a.equals(b));'],
        'true true',
        ['Both are written as literals.',
         'Identical literals share one pooled object.',
         'This is why == sometimes appears to work.'],
        'Both names point at the same pooled literal, so == happens to be true here - which is exactly what makes relying on it dangerous.'),

    codeTrace('q_ee_immutable_x1', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Expert',
        ['String s = "abc";',
         's.concat("def");',
         's = s.concat("ghi");',
         'System.out.println(s);'],
        'abcghi',
        ['Two calls, and only one result is kept.',
         'The first line changes nothing.',
         'The second starts from the original value.'],
        'The discarded concat is lost entirely, so the assigned one appends to "abc" rather than to "abcdef".'),

    codeTrace('q_ee_immutable_x2', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Expert',
        ['String path = "a/b/c";',
         'path.substring(2);',
         'String tail = path.substring(2);',
         'System.out.println(path + " " + tail);'],
        'a/b/c b/c',
        ['The same call appears twice.',
         'Only one of them stores its answer.',
         'path is never reassigned.'],
        'The first call is discarded and path is unchanged; the second is kept in tail, so the two print differently.'),

    codeTrace('q_ee_loop_init_x1', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Expert',
        ['int[] values = {2, 4, 6};',
         'int sum = 0;',
         'for (int i = values.length; i < values.length; i++) {',
         '    sum += values[i];',
         '}',
         'System.out.println(sum);'],
        '0',
        ['What does i start at?',
         'Compare that with the condition.',
         'No index is ever read, so nothing throws either.'],
        'Starting at the length makes the condition false at once, so the loop is skipped and sum stays 0 - it fails silently rather than throwing.'),

    codeTrace('q_ee_loop_init_x2', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Expert',
        ['int n = 3;',
         'int result = 1;',
         'for (int i = n; i > n; i--) {',
         '    result *= i;',
         '}',
         'System.out.println(result);'],
        '1',
        ['Substitute n into the start and the condition.',
         'Is 3 greater than 3?',
         'result keeps whatever it was initialised to.'],
        'The counter starts equal to the bound and the test is strict, so the body never runs and result stays at its identity value.')
];

/**
 * Everything that must hold before any of this reaches a student.
 *
 * Returns a list of problems, empty when the set is sound. `--apply` refuses
 * to write anything if this reports even one - the previous bank shipped 17
 * unplayable questions precisely because nothing checked content.
 */
function validate() {
    const problems = [];
    const seen = new Set();

    for (const q of QUESTIONS) {
        const where = `${q.id} (${q.gameType}/${q.difficulty})`;

        if (seen.has(q.id)) problems.push(`${where}: duplicate id`);
        seen.add(q.id);

        if (!GAME_TYPES.includes(q.gameType)) problems.push(`${where}: unknown gameType`);
        if (!DIFFICULTY_LEVELS.includes(q.difficulty)) problems.push(`${where}: unknown difficulty`);
        if (!CONCEPT_TAGS.includes(q.conceptTag)) problems.push(`${where}: unknown conceptTag`);
        if (!ERROR_TYPES.includes(q.errorType)) problems.push(`${where}: unknown errorType`);

        // A concept has a home format. Seeding one into the wrong game means
        // the engine can never serve it for that concept.
        const home = CONCEPT_GAME_MAPPING[q.conceptTag];
        if (home && home !== q.gameType) {
            problems.push(`${where}: ${q.conceptTag} belongs to ${home}, not ${q.gameType}`);
        }

        if (!Array.isArray(q.codeLines) || q.codeLines.length < 2) {
            problems.push(`${where}: needs at least two code lines`);
        }
        if (!Array.isArray(q.hints) || q.hints.length < 2) {
            problems.push(`${where}: needs at least two hints`);
        }
        if (!q.explanation || q.explanation.length < 30) {
            problems.push(`${where}: explanation is missing or too short`);
        }

        if (q.gameType === 'BugHunt') {
            const index = q.buggyLineIndex;
            if (!Number.isInteger(index) || index < 0 || index >= q.codeLines.length) {
                problems.push(`${where}: buggyLineIndex ${index} is outside the code`);
            }
            if (q.correctAnswer !== index) {
                problems.push(`${where}: correctAnswer does not match buggyLineIndex`);
            }
        }

        if (q.gameType === 'CodeTrace') {
            if (typeof q.correctAnswer !== 'string' || !q.correctAnswer.trim()) {
                problems.push(`${where}: correctAnswer must be the printed text`);
            }
        }

        if (q.gameType === 'DragDrop') {
            const answer = q.correctAnswer;
            const n = q.codeLines.length;

            // The two failure modes that shipped last time.
            if (!Array.isArray(answer) || answer.length !== n) {
                problems.push(`${where}: answer has ${answer?.length} entries for ${n} lines`);
            } else {
                const sorted = [...answer].sort((a, b) => a - b);
                const isPermutation = sorted.every((v, i) => v === i);
                if (!isPermutation) problems.push(`${where}: answer is not a permutation`);

                const identity = answer.every((v, i) => v === i);
                if (identity) {
                    problems.push(`${where}: answer is the identity - Submit would score 100 untouched`);
                }

                // And the answer really does rebuild the intended code.
                const rebuilt = answer.map((source) => q.codeLines[source]);
                if (rebuilt.join('\n') !== q._correctOrder.join('\n')) {
                    problems.push(`${where}: applying the answer does not produce the correct order`);
                }
            }
        }
    }

    return problems;
}

async function main() {
    const problems = validate();

    console.log(`\n${QUESTIONS.length} questions authored.`);
    const byCell = {};
    for (const q of QUESTIONS) {
        const key = `${q.gameType} ${q.difficulty}`;
        byCell[key] = (byCell[key] || 0) + 1;
    }
    for (const [cell, count] of Object.entries(byCell).sort()) {
        console.log(`  ${cell.padEnd(24)} ${count}`);
    }

    if (problems.length) {
        console.error(`\n${problems.length} problem(s):`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exitCode = 1;
        return;
    }
    console.log('\nvalidator: clean.');

    if (!process.argv.includes('--apply')) {
        console.log('DRY RUN - nothing written. Re-run with --apply.\n');
        return;
    }

    await mongoose.connect(process.env.MONGODB_URI);

    let written = 0;
    for (const question of QUESTIONS) {
        // _correctOrder is authoring scaffolding, not part of the document.
        const { _correctOrder, ...document } = question;
        await QuestionBank.updateOne({ id: document.id }, { $set: document }, { upsert: true });
        written += 1;
    }

    console.log(`\nUpserted ${written} questions.\n`);
    await mongoose.disconnect();
}

module.exports = { QUESTIONS, validate };

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
