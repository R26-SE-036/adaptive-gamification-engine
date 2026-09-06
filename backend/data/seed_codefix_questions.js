/**
 * Seeds the CodeFix question bank: 3 per error type x 15 error types = 45.
 *
 *     node data/seed_codefix_questions.js
 *
 * Idempotent - questions are upserted by id, so re-running replaces rather than
 * duplicates.
 *
 * ============================== WHY CodeFix ==============================
 * The other three games ask the student to RECOGNISE (Bug Hunt: which line is
 * wrong), ORDER (Drag & Drop) or PREDICT (Code Trace). None asks them to write
 * Java. CodeFix shows the same broken code and asks for the corrected line.
 *
 * That is a harder task in the way that matters - a student can point at a
 * broken loop bound without being able to say what it should have been - and it
 * is what makes a real error count possible, because typing an answer means
 * checking it, and every check is graded and recorded (POST /game/check).
 *
 * ========================== HOW ANSWERS ARE MARKED =========================
 * `correctAnswer` is an ARRAY of accepted lines. Whitespace outside string
 * literals is insignificant, so `i<n` and `i < n` both pass; everything else is
 * significant. Several entries are listed wherever a fix has more than one
 * honest form - `i < arr.length` and `i <= arr.length - 1` are both right, and
 * a game that accepted only the author's phrasing would be marking style.
 *
 * See services/gradingService.js and its tests for the exact rule.
 *
 * ======================== A NOTE ON COVERAGE ========================
 * One question per error type at each of Easy, Medium and Hard, so every one of
 * the 14 concepts gains a second game type. That matters beyond this game:
 * CONCEPT_GAME_MAPPING currently fixes one type per concept, which is why the
 * next-game recommendation can only really choose a concept (see
 * services/recommendationService.js). This is the first half of undoing that.
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
 * @param {'Easy'|'Medium'|'Hard'} difficulty
 * @param {string[]} codeLines
 * @param {number} buggyLineIndex   the line the student must rewrite
 * @param {string[]} correctAnswer  every accepted form of the fixed line
 * @param {string[]} hints          revealed one per wrong attempt, in order
 * @param {string} explanation
 */
const q = (id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, correctAnswer, hints, explanation) => ({
    id, errorType, conceptTag, difficulty, gameType: 'CodeFix',
    codeLines, buggyLineIndex, correctAnswer, hints, explanation
});

const QUESTIONS = [
    /* ── OFF_BY_ONE_LOOP_BOUNDARY / loop_boundaries ─────────────────────── */
    q('qf_off_by_one_01', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Easy',
        ['public class Main {',
         '    public static void printArray(int[] arr) {',
         '        for (int i = 0; i <= arr.length; i++) {',
         '            System.out.println(arr[i]);',
         '        }',
         '    }',
         '}'],
        2,
        ['for (int i = 0; i < arr.length; i++) {',
         'for (int i = 0; i <= arr.length - 1; i++) {'],
        ['The last valid index of an array is length - 1.',
         'With <=, the loop runs one time too many.',
         'Change <= to < , keeping everything else the same.'],
        'i <= arr.length reads arr[arr.length], which is out of bounds. The last valid index is arr.length - 1.'),

    q('qf_off_by_one_02', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Medium',
        ['int[] values = {4, 8, 15, 16, 23};',
         'int total = 0;',
         'for (int i = 1; i < values.length; i++) {',
         '    total += values[i];',
         '}',
         'System.out.println(total);'],
        2,
        ['for (int i = 0; i < values.length; i++) {'],
        ['Which element never gets added to the total?',
         'Array indices start at 0, not 1.',
         'The loop should start at 0.'],
        'Starting at i = 1 silently skips values[0], so the total is 4 short. This one does not crash, which makes it harder to spot.'),

    q('qf_off_by_one_03', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Hard',
        ['public static int lastIndexOf(int[] arr, int target) {',
         '    for (int i = arr.length; i >= 0; i--) {',
         '        if (arr[i] == target) {',
         '            return i;',
         '        }',
         '    }',
         '    return -1;',
         '}'],
        1,
        ['for (int i = arr.length - 1; i >= 0; i--) {'],
        ['The loop counts down. Where should a downward loop start?',
         'arr[arr.length] does not exist.',
         'Start one below the length.'],
        'A downward loop must start at arr.length - 1. Starting at arr.length reads past the end on the very first iteration.'),

    /* ── INCORRECT_CONDITIONAL_OPERATOR / conditional_logic ─────────────── */
    q('qf_cond_op_01', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Easy',
        ['int score = 55;',
         'if (score = 60) {',
         '    System.out.println("Pass");',
         '}'],
        1,
        ['if (score == 60) {'],
        ['= assigns a value. What compares two values?',
         'This line changes score instead of testing it.',
         'Use == for comparison.'],
        'A single = assigns rather than compares. In Java this is a compile error for an int; in a boolean context it would silently assign.'),

    q('qf_cond_op_02', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Medium',
        ['int age = 18;',
         'boolean allowed;',
         'if (age > 18) {',
         '    allowed = true;',
         '} else {',
         '    allowed = false;',
         '}'],
        2,
        ['if (age >= 18) {'],
        ['Should someone who is exactly 18 be allowed?',
         '> excludes the boundary value.',
         'Use >= so that 18 itself passes.'],
        'With >, an age of exactly 18 falls to the else branch. The boundary case is the whole question here.'),

    q('qf_cond_op_03', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Hard',
        ['public static boolean inRange(int n) {',
         '    if (n > 0 || n < 100) {',
         '        return true;',
         '    }',
         '    return false;',
         '}'],
        1,
        ['if (n > 0 && n < 100) {'],
        ['Try n = 500. Which half of the condition is true?',
         'With ||, only one side has to hold.',
         'Both bounds must hold at once.'],
        'With ||, every integer passes: 500 fails n < 100 but satisfies n > 0. A range check needs &&.'),

    /* ── ARRAY_LENGTH_INDEX_MISUSE / array_indexing ─────────────────────── */
    q('qf_arr_len_01', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Easy',
        ['int[] nums = {10, 20, 30};',
         'System.out.println(nums[nums.length]);'],
        1,
        ['System.out.println(nums[nums.length - 1]);'],
        ['How many elements are there, and what is the last index?',
         'length is 3, but the valid indices are 0, 1, 2.',
         'Subtract one from length.'],
        'nums[3] does not exist. The last element of a length-3 array is at index 2.'),

    q('qf_arr_len_02', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Medium',
        ['String[] names = {"Ana", "Ben", "Cara"};',
         'for (int i = 0; i < names.length; i++) {',
         '    System.out.println(names[i + 1]);',
         '}'],
        2,
        ['System.out.println(names[i]);'],
        ['On the last iteration, what is i + 1?',
         'i reaches length - 1, so i + 1 reaches length.',
         'Print the element at i itself.'],
        'i + 1 runs past the end on the final iteration, and skips the first name on the way.'),

    q('qf_arr_len_03', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Hard',
        ['public static int[] copyOf(int[] source) {',
         '    int[] result = new int[source.length - 1];',
         '    for (int i = 0; i < source.length; i++) {',
         '        result[i] = source[i];',
         '    }',
         '    return result;',
         '}'],
        1,
        ['int[] result = new int[source.length];'],
        ['The loop copies every element. How many will it write?',
         'The destination is one slot too small.',
         'Allocate exactly source.length.'],
        'The array is allocated one element short, so the final copy writes out of bounds. The loop is right; the allocation is wrong.'),

    /* ── STRING_EQUALITY_WITH_OPERATOR / string_comparison ──────────────── */
    q('qf_str_eq_01', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Easy',
        ['String answer = scanner.nextLine();',
         'if (answer == "yes") {',
         '    System.out.println("Confirmed");',
         '}'],
        1,
        ['if (answer.equals("yes")) {',
         'if ("yes".equals(answer)) {'],
        ['== compares references, not the characters.',
         'Two Strings holding the same text can still be different objects.',
         'Use .equals() instead.'],
        '== asks whether the two references point at the same object. A String read at runtime is a different object even when the text matches.'),

    q('qf_str_eq_02', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Medium',
        ['String a = new String("code");',
         'String b = new String("code");',
         'boolean same = (a == b);',
         'System.out.println(same);'],
        2,
        ['boolean same = a.equals(b);',
         'boolean same = (a.equals(b));'],
        ['new String() always creates a fresh object.',
         'a and b hold identical text in two different objects.',
         'Compare contents with .equals().'],
        'new String() defeats the string pool, so a and b are distinct objects and == is false despite identical text.'),

    q('qf_str_eq_03', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Hard',
        ['public static boolean isCommand(String input) {',
         '    return input != "quit";',
         '}'],
        1,
        ['return !input.equals("quit");',
         'return !"quit".equals(input);'],
        ['The bug is the comparison, not the negation.',
         '!= on Strings compares references too.',
         'Negate an .equals() call.'],
        '!= has the same defect as ==. Negating a reference comparison gives a method that is almost always true regardless of the text.'),

    /* ── LOOP_UPDATE_WRONG_DIRECTION / loop_control ─────────────────────── */
    q('qf_loop_dir_01', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Easy',
        ['for (int i = 0; i < 5; i--) {',
         '    System.out.println(i);',
         '}'],
        0,
        ['for (int i = 0; i < 5; i++) {'],
        ['Does i ever get closer to 5?',
         'i-- moves away from the stopping condition.',
         'Count up, not down.'],
        'i starts at 0 and decreases, so i < 5 is always true and the loop never ends.'),

    q('qf_loop_dir_02', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Medium',
        ['int countdown = 10;',
         'while (countdown > 0) {',
         '    System.out.println(countdown);',
         '    countdown++;',
         '}'],
        3,
        ['countdown--;',
         'countdown -= 1;',
         'countdown = countdown - 1;'],
        ['The condition waits for countdown to reach 0.',
         'Increasing it moves the wrong way.',
         'Decrement instead.'],
        'The loop is a countdown but the variable counts up, so it never reaches 0.'),

    q('qf_loop_dir_03', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Hard',
        ['for (int i = 10; i >= 0; i += 2) {',
         '    System.out.println(i);',
         '}'],
        0,
        ['for (int i = 10; i >= 0; i -= 2) {'],
        ['The condition stops when i drops below 0.',
         'i += 2 pushes i further from the exit.',
         'Step downward by 2.'],
        'The condition counts down but the step counts up, so i >= 0 never fails.'),

    /* ── UNREACHABLE_CODE_AFTER_RETURN / control_flow ───────────────────── */
    q('qf_unreach_01', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Easy',
        ['public static int doubled(int n) {',
         '    return n * 2;',
         '    System.out.println("done");',
         '}'],
        2,
        ['}'],
        ['What runs after a return statement?',
         'Nothing below a return can execute.',
         'The line should be removed - close the method instead.'],
        'Code after return is unreachable and Java refuses to compile it. Removing the line is the fix.'),

    q('qf_unreach_02', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Medium',
        ['public static String grade(int mark) {',
         '    if (mark >= 50) {',
         '        return "Pass";',
         '        mark = 0;',
         '    }',
         '    return "Fail";',
         '}'],
        3,
        ['}'],
        ['The assignment sits directly after a return.',
         'It can never run.',
         'Delete it and close the if block.'],
        'mark = 0 follows a return inside the same block, so it is unreachable.'),

    q('qf_unreach_03', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Hard',
        ['public static int firstNegative(int[] arr) {',
         '    for (int i = 0; i < arr.length; i++) {',
         '        return arr[i] < 0 ? i : -1;',
         '    }',
         '    return -1;',
         '}'],
        2,
        ['if (arr[i] < 0) { return i; }',
         'if (arr[i] < 0) return i;'],
        ['How many iterations does this loop actually complete?',
         'Returning on every path ends the loop after one element.',
         'Only return when the element is actually negative.'],
        'Returning unconditionally makes the loop run exactly once, so only arr[0] is ever examined. The trailing return -1 handles the not-found case.'),

    /* ── MISSING_BREAK_IN_SWITCH / switch_statements ────────────────────── */
    q('qf_switch_01', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Easy',
        ['switch (day) {',
         '    case 1:',
         '        System.out.println("Monday");',
         '    case 2:',
         '        System.out.println("Tuesday");',
         '        break;',
         '}'],
        2,
        ['System.out.println("Monday"); break;'],
        ['With day = 1, what gets printed?',
         'Without break, execution falls into the next case.',
         'End the case with break.'],
        'Case 1 falls through to case 2, so day = 1 prints both Monday and Tuesday.'),

    q('qf_switch_02', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Medium',
        ['switch (grade) {',
         '    case "A":',
         '        points = 4;',
         '    case "B":',
         '        points = 3;',
         '        break;',
         '    default:',
         '        points = 0;',
         '}'],
        2,
        ['points = 4; break;'],
        ['An "A" sets points twice. Which value survives?',
         'Fall-through overwrites the first assignment.',
         'Break after setting 4.'],
        'An "A" sets points to 4 and then immediately to 3, because case "A" falls through into case "B".'),

    q('qf_switch_03', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Hard',
        ['switch (command) {',
         '    case "save":',
         '        save();',
         '    case "quit":',
         '        quit();',
         '        break;',
         '    default:',
         '        help();',
         '}'],
        2,
        ['save(); break;'],
        ['What happens when the user types "save"?',
         'The program saves and then quits.',
         'Break after save().'],
        'Saving falls through into quit(), so every save also exits the program. Fall-through bugs are worst when the next case has a side effect.'),

    /* ── EMPTY_CONDITIONAL_BODY / statement_structure ───────────────────── */
    q('qf_empty_if_01', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Easy',
        ['if (count > 10);',
         '{',
         '    System.out.println("Too many");',
         '}'],
        0,
        ['if (count > 10)',
         'if (count > 10) {'],
        ['Look carefully at the end of the if line.',
         'A semicolon there ends the if statement immediately.',
         'Remove the semicolon.'],
        'The stray semicolon is the entire body of the if. The block below always runs, whatever count is.'),

    q('qf_empty_if_02', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Medium',
        ['for (int i = 0; i < 3; i++);',
         '{',
         '    System.out.println(i);',
         '}'],
        0,
        ['for (int i = 0; i < 3; i++)',
         'for (int i = 0; i < 3; i++) {'],
        ['The loop finishes before the block is reached.',
         'A semicolon after the header makes an empty loop body.',
         'Remove the semicolon.'],
        'The loop spins three times doing nothing, then the block runs once - and i is out of scope by then.'),

    q('qf_empty_if_03', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Hard',
        ['if (user != null)',
         '    log("found");',
         '    process(user);'],
        2,
        ['{ log("found"); process(user); }'],
        ['Indentation is not what groups statements in Java.',
         'Only the first statement belongs to the if.',
         'Wrap both statements in braces.'],
        'Without braces the if governs only log(). process(user) always runs, which is a NullPointerException when user is null.'),

    /* ── SELF_ASSIGNMENT / assignment_logic ─────────────────────────────── */
    q('qf_self_assign_01', 'SELF_ASSIGNMENT', 'assignment_logic', 'Easy',
        ['int total = 5;',
         'total = total;',
         'System.out.println(total);'],
        1,
        ['total = total + 5;',
         'total += 5;'],
        ['What does this line change?',
         'Assigning a variable to itself does nothing.',
         'The value has to actually change.'],
        'total = total is a no-op. The line was meant to modify the value.'),

    q('qf_self_assign_02', 'SELF_ASSIGNMENT', 'assignment_logic', 'Medium',
        ['public void setName(String name) {',
         '    name = name;',
         '}'],
        1,
        ['this.name = name;'],
        ['Which name is on each side?',
         'The parameter shadows the field.',
         'Qualify the field with this.'],
        'Both sides refer to the parameter, so the field is never written. this.name disambiguates.'),

    q('qf_self_assign_03', 'SELF_ASSIGNMENT', 'assignment_logic', 'Hard',
        ['int a = 1;',
         'int b = 2;',
         'int temp = a;',
         'a = b;',
         'b = b;'],
        4,
        ['b = temp;'],
        ['This is a swap. Did both values move?',
         'The last line loses the original a.',
         'The saved value is in temp.'],
        'The swap saves a into temp and then never uses it, so a is lost and b is unchanged.'),

    /* ── ALWAYS_TRUE_OR_CONDITION / boolean_logic ───────────────────────── */
    q('qf_bool_or_01', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Easy',
        ['if (x == 1 || x == 1) {',
         '    System.out.println("one");',
         '}'],
        0,
        ['if (x == 1) {'],
        ['Both sides of the || are identical.',
         'The duplicate adds nothing.',
         'Keep a single test.'],
        'A duplicated condition is redundant. Either the second test was meant to be different, or it should go.'),

    q('qf_bool_or_02', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Medium',
        ['boolean valid = (day >= 1) || (day <= 31);',
         'System.out.println(valid);'],
        0,
        ['boolean valid = (day >= 1) && (day <= 31);'],
        ['Try day = 500.',
         'Any number satisfies at least one side.',
         'Both bounds must hold.'],
        'With ||, valid is true for every integer. A range test needs &&.'),

    q('qf_bool_or_03', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Hard',
        ['public static boolean isWeekend(String d) {',
         '    return d.equals("Sat") || d != "Sun";',
         '}'],
        1,
        ['return d.equals("Sat") || d.equals("Sun");'],
        ['What does the second half return for "Mon"?',
         '!= on a String is nearly always true.',
         'Both halves should be .equals() tests.'],
        'd != "Sun" is a reference comparison that is true for almost every input, so the method reports every day as a weekend.'),

    /* ── IGNORED_STRING_METHOD_RESULT / immutable_strings ───────────────── */
    q('qf_immut_01', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Easy',
        ['String name = "  ana  ";',
         'name.trim();',
         'System.out.println("[" + name + "]");'],
        1,
        ['name = name.trim();'],
        ['Strings cannot be changed in place.',
         'trim() returns a new String.',
         'Assign the result back.'],
        'String is immutable, so trim() returns a new value and leaves name untouched. The result has to be assigned.'),

    q('qf_immut_02', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Medium',
        ['String code = "abc";',
         'code.toUpperCase();',
         'code.concat("-1");',
         'System.out.println(code);'],
        1,
        ['code = code.toUpperCase();'],
        ['Neither call changes code.',
         'Every String method returns a new String.',
         'Assign the result of toUpperCase back to code.'],
        'Both calls are discarded. This question fixes the first; the same mistake is on the next line.'),

    q('qf_immut_03', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Hard',
        ['public static String clean(String input) {',
         '    input.replace(" ", "");',
         '    return input;',
         '}'],
        1,
        ['input = input.replace(" ", "");',
         'return input.replace(" ", "");'],
        ['The method returns its argument unchanged.',
         'replace() produces a new String.',
         'Either assign it back or return it directly.'],
        'The replacement is computed and thrown away, so clean() is an expensive way of returning its input.'),

    /* ── DIVISION_BY_ZERO_LITERAL / arithmetic_operations ───────────────── */
    q('qf_div_zero_01', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Easy',
        ['int total = 100;',
         'int average = total / 0;',
         'System.out.println(average);'],
        1,
        ['int average = total / 1;'],
        ['Integer division by zero throws at runtime.',
         'The divisor must not be 0.',
         'Divide by a non-zero value.'],
        'total / 0 throws ArithmeticException. Integer division has no infinity to fall back on.'),

    q('qf_div_zero_02', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Medium',
        ['int sum = 0;',
         'int count = 0;',
         'for (int n : values) { sum += n; count++; }',
         'System.out.println(sum / count);'],
        3,
        ['if (count > 0) { System.out.println(sum / count); }',
         'System.out.println(count > 0 ? sum / count : 0);'],
        ['What if values is empty?',
         'count stays 0 and the division throws.',
         'Guard the division.'],
        'An empty input leaves count at 0. The average has to be guarded, not assumed.'),

    q('qf_div_zero_03', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Hard',
        ['public static int rate(int hits, int attempts) {',
         '    return (hits * 100) / (attempts - attempts);',
         '}'],
        1,
        ['return (hits * 100) / attempts;'],
        ['Work out attempts - attempts for any value.',
         'That expression is always 0.',
         'Divide by attempts itself.'],
        'attempts - attempts is zero for every input, so the method always throws. Subtle because there is no literal 0 on the line.'),

    /* ── CONSTANT_FALSE_LOOP_CONDITION / loop_initialization ────────────── */
    q('qf_const_false_01', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Easy',
        ['for (int i = 0; false; i++) {',
         '    System.out.println(i);',
         '}'],
        0,
        ['for (int i = 0; i < 10; i++) {'],
        ['How many times does this body run?',
         'A literal false means the body never executes.',
         'Give it a real condition.'],
        'The condition is a constant false, so the loop body is dead code.'),

    q('qf_const_false_02', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Medium',
        ['int i = 10;',
         'while (i < 5) {',
         '    System.out.println(i);',
         '    i++;',
         '}'],
        0,
        ['int i = 0;'],
        ['Is the condition true when the loop is first reached?',
         'i starts above the limit already.',
         'Start below 5.'],
        'i is initialised to 10, so i < 5 is false immediately and the loop never runs. The bug is the initialisation, not the condition.'),

    q('qf_const_false_03', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Hard',
        ['int size = list.size();',
         'for (int i = size; i < size; i++) {',
         '    process(list.get(i));',
         '}'],
        1,
        ['for (int i = 0; i < size; i++) {'],
        ['Compare the start value with the limit.',
         'i == size on the first test, so i < size is false.',
         'Start from 0.'],
        'Starting at size makes the condition false immediately. The loop looks like a normal traversal but never executes.'),

    /* ── DUPLICATE_IF_ELSE_CONDITION / conditional_logic ────────────────── */
    q('qf_dup_cond_01', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Easy',
        ['if (n > 0) {',
         '    System.out.println("positive");',
         '} else if (n > 0) {',
         '    System.out.println("negative");',
         '}'],
        2,
        ['} else if (n < 0) {'],
        ['Both branches test the same thing.',
         'The second can never be reached.',
         'The else-if should test the opposite.'],
        'The duplicated condition makes the second branch unreachable, so "negative" is never printed.'),

    q('qf_dup_cond_02', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Medium',
        ['if (score >= 75) {',
         '    grade = "A";',
         '} else if (score >= 75) {',
         '    grade = "B";',
         '} else {',
         '    grade = "C";',
         '}'],
        2,
        ['} else if (score >= 50) {'],
        ['What score would ever produce "B"?',
         'The second test repeats the first.',
         'It should use a lower threshold.'],
        'A grade of "B" is unreachable. Ladder conditions must descend.'),

    q('qf_dup_cond_03', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Hard',
        ['if (type.equals("admin")) {',
         '    allow();',
         '} else if (!type.equals("admin")) {',
         '    deny();',
         '} else {',
         '    log("unknown");',
         '}'],
        4,
        ['}'],
        ['The first two branches already cover every case.',
         'The else can never be reached.',
         'Remove the dead else branch.'],
        'A condition and its exact negation are exhaustive, so the else is dead code. Removing it is the honest fix.'),

    /* ── WHILE_VARIABLE_NOT_UPDATED / loop_termination ──────────────────── */
    q('qf_while_var_01', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Easy',
        ['int i = 0;',
         'while (i < 5) {',
         '    System.out.println(i);',
         '}'],
        2,
        ['System.out.println(i); i++;'],
        ['Does anything inside the loop change i?',
         'The condition can never become false.',
         'Increment i in the body.'],
        'Nothing updates i, so i < 5 stays true forever.'),

    q('qf_while_var_02', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Medium',
        ['int remaining = 10;',
         'while (remaining > 0) {',
         '    process();',
         '    int remaining2 = remaining - 1;',
         '}'],
        3,
        ['remaining = remaining - 1;',
         'remaining--;',
         'remaining -= 1;'],
        ['Which variable does the condition test?',
         'The new variable is discarded each iteration.',
         'Update remaining itself.'],
        'The decrement lands in a fresh local variable, so the one the condition tests never changes.'),

    q('qf_while_var_03', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Hard',
        ['String line = reader.readLine();',
         'while (line != null) {',
         '    System.out.println(line);',
         '    reader.readLine();',
         '}'],
        3,
        ['line = reader.readLine();'],
        ['The next line is read but not stored.',
         'line keeps its first value forever.',
         'Assign the result to line.'],
        'The result of readLine() is discarded inside the loop, so line never becomes null and the first line prints forever.')
];

const seed = async () => {
    await mongoose.connect(process.env.MONGODB_URI);

    let written = 0;
    for (const question of QUESTIONS) {
        await QuestionBank.updateOne({ id: question.id }, { $set: question }, { upsert: true });
        written += 1;
    }

    const total = await QuestionBank.countDocuments({ gameType: 'CodeFix' });
    const concepts = await QuestionBank.distinct('conceptTag', { gameType: 'CodeFix' });

    console.log(`Upserted ${written} CodeFix questions.`);
    console.log(`Bank now holds ${total} CodeFix questions across ${concepts.length} concepts.`);

    await mongoose.disconnect();
};

seed().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
