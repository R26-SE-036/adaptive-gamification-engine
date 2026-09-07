/**
 * Additional Bug Hunt and Code Trace questions, to fill single-question slots.
 *
 *     node data/seed_additional_questions.js
 *
 * Idempotent - upserted by id. Validates before writing.
 *
 * ========================== WHY THESE WERE NEEDED ==========================
 * 78 of the bank's 112 (concept, level, format) slots held exactly ONE
 * question. The game route picks at random from the matching slot, so a student
 * meeting the same slot twice was guaranteed the same question - not merely
 * likely to see it. Avoiding recent repeats (routes/gamification.js) helps only
 * where there is something else to serve.
 *
 * Three per slot is the target: enough that a student working through a level
 * sees each question at most once in a sitting.
 *
 * ============================ WHAT A GOOD ONE IS ============================
 * Every question here is a DIFFERENT presentation of its error type, not the
 * same snippet with the variables renamed. A student who has learned to spot
 * `i <= arr.length` should still have to think when the same mistake appears as
 * a downward loop, or inside a nested loop, or as `i < arr.length + 1`.
 *
 * Bug Hunt answers are a line index, and `correctAnswer` is derived from
 * `buggyLineIndex` rather than written twice - the two disagreeing is exactly
 * the class of defect that made 17 of the 20 Drag & Drop questions unplayable.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const QuestionBank = require('../models/QuestionBank');

/** The buggy line is named once; the answer is derived from it. */
function bugHunt(id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, hints, explanation) {
    return {
        id, errorType, conceptTag, difficulty, gameType: 'BugHunt',
        codeLines, buggyLineIndex, correctAnswer: buggyLineIndex, hints, explanation
    };
}

/** Code Trace: the student predicts what the program prints. */
function codeTrace(id, errorType, conceptTag, difficulty, codeLines, correctAnswer, hints, explanation) {
    return {
        id, errorType, conceptTag, difficulty, gameType: 'CodeTrace',
        codeLines, correctAnswer, hints, explanation
    };
}

const QUESTIONS = [
    /* ═══════════════ BugHunt ═══════════════ */

    /* ── OFF_BY_ONE_LOOP_BOUNDARY / loop_boundaries ─────────────────────── */
    bugHunt('q_off_by_one_06', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Beginner',
        ['int[] marks = {70, 80, 90};',
         'for (int i = 0; i < marks.length + 1; i++) {',
         '    System.out.println(marks[i]);',
         '}'],
        1,
        ['Count the iterations this loop performs.',
         'The array has 3 elements but the loop runs 4 times.',
         'Adding one to length is the same mistake as using <=.'],
        'length + 1 runs one iteration too many. It is the off-by-one written a different way, which is what makes it easy to miss.'),

    bugHunt('q_off_by_one_07', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Intermediate',
        ['for (int row = 0; row < grid.length; row++) {',
         '    for (int col = 0; col <= grid[row].length; col++) {',
         '        System.out.print(grid[row][col]);',
         '    }',
         '}'],
        1,
        ['The outer loop is correct. Look at the inner one.',
         'The inner bound uses <= against a length.',
         'It reads one column past the end of every row.'],
        'The outer loop being right draws the eye away from the inner one, which reads past the end on every single row.'),

    bugHunt('q_off_by_one_08', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Advanced',
        ['public static int sumTail(int[] a) {',
         '    int total = 0;',
         '    for (int i = 1; i <= a.length; i++) {',
         '        total += a[i];',
         '    }',
         '    return total;',
         '}'],
        2,
        ['Starting at 1 is deliberate here - a tail sum skips the first element.',
         'That makes the START correct. Check the other end.',
         'i <= a.length reads a[a.length] on the final iteration.'],
        'The unusual start value is a distraction: beginning at 1 is intended, and the bug is the upper bound, which reads one past the end.'),

    bugHunt('q_off_by_one_09', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Advanced',
        ['public static void reverse(int[] a) {',
         '    for (int i = 0; i <= a.length / 2; i++) {',
         '        int tmp = a[i];',
         '        a[i] = a[a.length - 1 - i];',
         '        a[a.length - 1 - i] = tmp;',
         '    }',
         '}'],
        1,
        ['Trace an array of length 4. Which pairs get swapped?',
         'At i == length/2 the two indices have crossed over.',
         'Swapping a pair twice puts it back where it started.'],
        'With <=, the loop swaps one pair too many - and for even lengths that swaps a pair back, so the array is left unreversed in the middle.'),

    /* ── INCORRECT_CONDITIONAL_OPERATOR is DragDrop; skip ────────────────── */

    /* ── ARRAY_LENGTH_INDEX_MISUSE / array_indexing ─────────────────────── */
    bugHunt('q_arr_len_06', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Beginner',
        ['String[] days = {"Mon", "Tue", "Wed"};',
         'int last = days.length;',
         'System.out.println(days[last]);'],
        1,
        ['length counts elements; indices start at zero.',
         'A three-element array has indices 0, 1 and 2.',
         'The variable named "last" holds 3, which is not a valid index.'],
        'Naming the variable "last" makes the next line read as correct. length is a count, not the final index.'),

    bugHunt('q_arr_len_07', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Intermediate',
        ['int[] values = new int[10];',
         'for (int i = 0; i < values.length; i++) {',
         '    values[i] = i;',
         '}',
         'System.out.println(values[values.length]);'],
        4,
        ['The loop is correct. The line after it is not.',
         'values.length is 10, and the highest valid index is 9.',
         'Reading the last element needs length - 1.'],
        'A correct loop directly above makes the final line look like it follows the same convention. It does not.'),

    bugHunt('q_arr_len_08', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Advanced',
        ['public static int[] middle(int[] a) {',
         '    int[] out = new int[a.length - 2];',
         '    for (int i = 1; i < a.length - 1; i++) {',
         '        out[i] = a[i];',
         '    }',
         '    return out;',
         '}'],
        3,
        ['The allocation and the loop bounds are both right.',
         'The source index and the destination index are not the same thing here.',
         'out has length - 2 slots, but i starts at 1 and is used for both.'],
        'The loop reads a[i] correctly but writes out[i], which runs past the end of a smaller array. Copying between differently-sized arrays needs two indices.'),

    bugHunt('q_arr_len_09', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Advanced',
        ['public static boolean contains(int[] a, int target) {',
         '    int i = 0;',
         '    while (i <= a.length && a[i] != target) {',
         '        i++;',
         '    }',
         '    return i < a.length;',
         '}'],
        2,
        ['The condition reads a[i] and checks the bound in the same expression.',
         'Order matters: && evaluates left to right.',
         'With <=, the bound check passes when i == a.length and then a[i] throws.'],
        'The guard and the access are in the right order, but the bound is wrong by one - so on a miss the loop reads a[a.length] before it can stop.'),

    /* ── LOOP_UPDATE_WRONG_DIRECTION / loop_control ─────────────────────── */
    bugHunt('q_loop_dir_06', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Beginner',
        ['int count = 5;',
         'while (count > 0) {',
         '    System.out.println(count);',
         '    count = count + 1;',
         '}'],
        3,
        ['The condition waits for count to reach 0.',
         'Does the body move count toward 0 or away from it?',
         'Adding one takes it further from the exit.'],
        'The loop is a countdown but the body counts up, so the condition never becomes false.'),

    bugHunt('q_loop_dir_07', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Intermediate',
        ['for (int i = 10; i > 0; i--) {',
         '    for (int j = 0; j > 5; j++) {',
         '        System.out.println(i + "," + j);',
         '    }',
         '}'],
        1,
        ['The outer loop is a correct countdown.',
         'The inner loop starts at 0 and asks whether it is greater than 5.',
         'That condition is false immediately, so the body never runs.'],
        'The inner condition points the wrong way for its start value, so the inner body never executes and nothing is printed.'),

    bugHunt('q_loop_dir_08', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Advanced',
        ['int lo = 0;',
         'int hi = arr.length - 1;',
         'while (lo < hi) {',
         '    swap(arr, lo, hi);',
         '    lo++;',
         '    hi++;',
         '}'],
        5,
        ['The two pointers are supposed to meet in the middle.',
         'lo moves up correctly. What should hi do?',
         'Both moving up means they never meet.'],
        'A two-pointer loop needs the pointers to converge. Moving both upward means lo < hi stays true until hi runs off the end.'),

    bugHunt('q_loop_dir_09', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Advanced',
        ['int n = 100;',
         'int steps = 0;',
         'while (n != 1) {',
         '    n = n * 2;',
         '    steps++;',
         '}',
         'System.out.println(steps);'],
        3,
        ['The loop stops when n reaches exactly 1.',
         'Doubling moves n away from 1, not toward it.',
         'Halving would converge; doubling cannot.'],
        'The exit condition is an equality against 1, and the update moves n in the direction that can never reach it.'),

    /* ── UNREACHABLE_CODE_AFTER_RETURN / control_flow ───────────────────── */
    bugHunt('q_unreach_06', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Beginner',
        ['public static int half(int n) {',
         '    return n / 2;',
         '    System.out.println("halved");',
         '}'],
        2,
        ['What can run after a return statement?',
         'Nothing below a return in the same block executes.',
         'Java refuses to compile unreachable code.'],
        'The println can never run. Java treats unreachable code as a compile error rather than a warning.'),

    bugHunt('q_unreach_07', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Intermediate',
        ['public static String check(int n) {',
         '    if (n > 0) {',
         '        return "positive";',
         '        n = 0;',
         '    }',
         '    return "other";',
         '}'],
        3,
        ['Look inside the if block.',
         'The assignment follows a return in the same block.',
         'It can never execute.'],
        'The return exits the method, so the assignment below it inside the same block is unreachable.'),

    bugHunt('q_unreach_08', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Advanced',
        ['public static int findFirst(int[] a) {',
         '    for (int i = 0; i < a.length; i++) {',
         '        if (a[i] > 0) {',
         '            return i;',
         '        }',
         '        return -1;',
         '    }',
         '    return -1;',
         '}'],
        5,
        ['How many elements does this loop actually examine?',
         'The return at the end of the loop body runs on the first iteration.',
         'It belongs after the loop, not inside it.'],
        'The not-found return is inside the loop, so the method gives up after examining a[0]. It compiles and returns a plausible number, which is why this survives testing on single-element arrays.'),

    bugHunt('q_unreach_09', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Advanced',
        ['public static void report(int n) {',
         '    if (n < 0) {',
         '        throw new IllegalArgumentException("negative");',
         '        log("rejected");',
         '    }',
         '    log("accepted");',
         '}'],
        3,
        ['A throw ends the method as surely as a return does.',
         'The log call sits directly after it.',
         'It can never run.'],
        'Unreachable code is not only about return - throw, break and continue all end the current path, and anything after them in the same block is dead.'),

    /* ── EMPTY_CONDITIONAL_BODY / statement_structure ───────────────────── */
    bugHunt('q_empty_if_06', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Beginner',
        ['int n = 5;',
         'if (n > 3);',
         '{',
         '    System.out.println("big");',
         '}'],
        1,
        ['Look carefully at the end of the if line.',
         'A semicolon there is the entire body of the if.',
         'The block below runs regardless of n.'],
        'The stray semicolon makes the if do nothing, and the block that follows is an ordinary block that always executes.'),

    bugHunt('q_empty_if_07', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Intermediate',
        ['for (int i = 0; i < 5; i++);',
         '{',
         '    System.out.println(i);',
         '}'],
        0,
        ['The loop finishes before the block is reached.',
         'A semicolon after the header makes the loop body empty.',
         'i is also out of scope below the loop.'],
        'The loop spins five times doing nothing, and then the block runs once - except it cannot, because i does not exist outside the loop.'),

    bugHunt('q_empty_if_08', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Advanced',
        ['while (queue.hasNext());',
         '{',
         '    process(queue.next());',
         '}'],
        0,
        ['The condition does not change inside an empty body.',
         'hasNext() keeps returning the same answer forever.',
         'The block below is never reached.'],
        'An empty body plus a condition nothing advances is an infinite loop, and the code that was meant to be the body never runs.'),

    bugHunt('q_empty_if_09', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Advanced',
        ['if (user.isAdmin())',
         '    grantAccess();',
         '    logAccess();',
         'System.out.println("done");'],
        2,
        ['Indentation is not what groups statements in Java.',
         'Without braces, only the first statement belongs to the if.',
         'logAccess() runs for every user.'],
        'The indentation says both calls are guarded; the syntax says only the first is. logAccess() runs unconditionally, which here means logging access that was never granted.'),

    /* ── SELF_ASSIGNMENT / assignment_logic ─────────────────────────────── */
    bugHunt('q_self_assign_06', 'SELF_ASSIGNMENT', 'assignment_logic', 'Beginner',
        ['int count = 3;',
         'count = count;',
         'System.out.println(count);'],
        1,
        ['What does this line change?',
         'Assigning a variable to itself has no effect.',
         'The line was meant to modify the value.'],
        'A self-assignment compiles and runs and does nothing, so whatever change was intended is silently missing.'),

    bugHunt('q_self_assign_07', 'SELF_ASSIGNMENT', 'assignment_logic', 'Intermediate',
        ['public void setLimit(int limit) {',
         '    limit = limit;',
         '}'],
        1,
        ['Which limit is on each side of the assignment?',
         'The parameter shadows the field of the same name.',
         'Both sides refer to the parameter.'],
        'The field is never written. this.limit would disambiguate, and without it the setter does nothing at all.'),

    bugHunt('q_self_assign_08', 'SELF_ASSIGNMENT', 'assignment_logic', 'Advanced',
        ['int a = 1;',
         'int b = 2;',
         'int temp = a;',
         'a = b;',
         'b = b;'],
        4,
        ['This is a swap. Did both values actually move?',
         'temp holds the original a and is never read.',
         'The last line assigns b to itself.'],
        'The swap saves a into temp and then never uses it, so a is lost and b is unchanged - the classic broken swap.'),

    bugHunt('q_self_assign_09', 'SELF_ASSIGNMENT', 'assignment_logic', 'Advanced',
        ['public void copyFrom(Point other) {',
         '    this.x = other.x;',
         '    this.y = this.y;',
         '}'],
        2,
        ['Compare the two lines. Only one reads from other.',
         'The second assigns the field to itself.',
         'It should read other.y.'],
        'Half the copy is missing, and the symmetry with the correct line above is exactly what makes the eye skip over it.'),

    /* ── DIVISION_BY_ZERO_LITERAL / arithmetic_operations ───────────────── */
    bugHunt('q_div_zero_06', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Beginner',
        ['int total = 50;',
         'int parts = 0;',
         'int each = total / parts;',
         'System.out.println(each);'],
        2,
        ['What is the value of parts on the line above?',
         'Integer division by zero throws at runtime.',
         'The divisor must be non-zero.'],
        'The zero is in a variable rather than written on the dividing line, which is the only thing that makes this harder than the literal form.'),

    bugHunt('q_div_zero_07', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Intermediate',
        ['int sum = 0;',
         'int n = list.size();',
         'for (int v : list) { sum += v; }',
         'System.out.println(sum / n);'],
        3,
        ['What is n when the list is empty?',
         'An empty list makes n zero.',
         'The division needs a guard.'],
        'Averaging an empty collection divides by zero. The guard has to be there even when the caller "always" passes a non-empty list.'),

    bugHunt('q_div_zero_08', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Advanced',
        ['public static int scale(int value, int factor) {',
         '    return value / (factor - factor);',
         '}'],
        1,
        ['Evaluate factor - factor for any input.',
         'That expression is always zero.',
         'There is no literal 0 on the line, which is what hides it.'],
        'factor - factor is zero for every input, so the method throws for every call - and no literal zero appears anywhere to give it away.'),

    bugHunt('q_div_zero_09', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Advanced',
        ['public static int remainder(int a, int b) {',
         '    if (b != 0) {',
         '        return a % b;',
         '    }',
         '    return a % 0;',
         '}'],
        4,
        ['The guarded branch is correct.',
         'What does the fallback do when b is zero?',
         'Modulo by zero throws exactly as division does.'],
        'The guard is right and the fallback undoes it: % 0 throws ArithmeticException just as / 0 does, so the zero case still fails.'),

    /* ── WHILE_VARIABLE_NOT_UPDATED / loop_termination ──────────────────── */
    bugHunt('q_while_upd_06', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Beginner',
        ['int i = 0;',
         'while (i < 3) {',
         '    System.out.println("hello");',
         '}'],
        1,
        ['Does anything inside the loop change i?',
         'The condition tests i, and i never moves.',
         'The loop can never end.'],
        'Nothing updates i, so i < 3 stays true forever. The condition is fine; the body is missing the update.'),

    bugHunt('q_while_upd_07', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Intermediate',
        ['int left = 5;',
         'while (left > 0) {',
         '    doWork();',
         '    int left2 = left - 1;',
         '}'],
        3,
        ['Which variable does the condition test?',
         'The decrement lands in a new variable each iteration.',
         'left itself never changes.'],
        'A new local is created and discarded every iteration, so the variable the condition depends on is never touched.'),

    bugHunt('q_while_upd_08', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Advanced',
        ['String line = reader.readLine();',
         'while (line != null) {',
         '    process(line);',
         '    reader.readLine();',
         '}'],
        3,
        ['The next line is read but not stored anywhere.',
         'line keeps its first value forever.',
         'The result of readLine() has to be assigned.'],
        'The read happens - the stream even advances - but the result is discarded, so line never becomes null and the first line is processed forever.'),

    bugHunt('q_while_upd_09', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Advanced',
        ['int attempts = 0;',
         'boolean ok = false;',
         'while (!ok && attempts < 3) {',
         '    ok = tryOnce();',
         '    attempts = attempts;',
         '}'],
        4,
        ['One of the two conditions can become false. Which?',
         'ok is updated correctly by tryOnce().',
         'attempts is assigned to itself.'],
        'If tryOnce() keeps failing, ok stays false and attempts never grows - so the retry limit does nothing and the loop runs forever.'),

    /* ═══════════════ CodeTrace ═══════════════ */

    /* ── STRING_EQUALITY_WITH_OPERATOR / string_comparison ──────────────── */
    codeTrace('q_str_eq_06', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Beginner',
        ['String a = "hi";',
         'String b = "hi";',
         'System.out.println(a.equals(b));'],
        'true',
        ['.equals() compares the characters.',
         'Both strings hold the same text.',
         'Content comparison of identical text is true.'],
        '.equals() compares content, so identical text gives true regardless of how the strings were created.'),

    codeTrace('q_str_eq_07', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Intermediate',
        ['String a = "code";',
         'String b = "co" + "de";',
         'System.out.println(a == b);'],
        'true',
        ['Both operands of the + are compile-time constants.',
         'The compiler folds them into a single literal.',
         'Folded literals are pooled, exactly like a written one.'],
        'The concatenation happens at compile time, so b is the pooled literal "code" - the same object as a. Change either side to a variable and this becomes false.'),

    codeTrace('q_str_eq_08', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Advanced',
        ['String a = "code";',
         'String part = "co";',
         'String b = part + "de";',
         'System.out.println(a == b);'],
        'false',
        ['Compare this with the version where both halves are literals.',
         'part is a variable, so the concatenation happens at runtime.',
         'A runtime concatenation produces a new object.'],
        'One word changed from the previous case and the answer flips: a runtime concatenation builds a new String rather than reusing the pooled literal.'),

    codeTrace('q_str_eq_09', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Advanced',
        ['String a = new String("x").intern();',
         'String b = "x";',
         'System.out.println(a == b);'],
        'true',
        ['intern() asks for the pooled instance of the text.',
         'b is already the pooled literal.',
         'Both references end up pointing at the same object.'],
        'intern() returns the pool entry, so == is true here - which is exactly why relying on == for strings is fragile: the answer depends on how the value was built, not on what it is.'),

    /* ── IGNORED_STRING_METHOD_RESULT / immutable_strings ───────────────── */
    codeTrace('q_immutable_06', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Beginner',
        ['String s = "Hello";',
         's.toUpperCase();',
         'System.out.println(s);'],
        'Hello',
        ['Strings cannot be changed in place.',
         'toUpperCase() returns a new String.',
         'Nothing assigns the result back to s.'],
        'The uppercase version is created and thrown away. s is unchanged, which is what String immutability means in practice.'),

    codeTrace('q_immutable_07', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Intermediate',
        ['String s = "  hi  ";',
         's = s.trim();',
         's.concat("!");',
         'System.out.println("[" + s + "]");'],
        '[hi]',
        ['The trim is assigned back; the concat is not.',
         'Only one of the two calls has any effect.',
         'The brackets show whether the spaces survived.'],
        'One line does it right and the next does it wrong, which is the comparison this question is about: the result must be assigned, every time.'),

    codeTrace('q_immutable_08', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Advanced',
        ['StringBuilder sb = new StringBuilder("ab");',
         'sb.append("c");',
         'String s = "ab";',
         's.concat("c");',
         'System.out.println(sb + "/" + s);'],
        'abc/ab',
        ['StringBuilder is mutable; String is not.',
         'append() changes the builder in place.',
         'concat() returns a new String that nothing keeps.'],
        'The two lines look alike and behave differently. StringBuilder exists precisely because String cannot be modified in place.'),

    codeTrace('q_immutable_09', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Advanced',
        ['String s = "a,b,c";',
         's.replace(",", "-");',
         'String t = s.replace(",", "-");',
         'System.out.println(s + " " + t);'],
        'a,b,c a-b-c',
        ['The same call appears twice, once assigned and once not.',
         's is printed first, then t.',
         'Only the assigned one took effect.'],
        'Identical calls, different outcomes: the discarded one leaves s alone and the assigned one gives t the replacement.'),

    /* ── CONSTANT_FALSE_LOOP_CONDITION / loop_initialization ────────────── */
    codeTrace('q_const_false_06', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Beginner',
        ['int total = 0;',
         'for (int i = 0; false; i++) {',
         '    total += 10;',
         '}',
         'System.out.println(total);'],
        '0',
        ['How many times does the body run?',
         'A literal false means the condition is never satisfied.',
         'total keeps its initial value.'],
        'The condition is a constant false, so the body is dead code and total is still 0.'),

    codeTrace('q_const_false_07', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Intermediate',
        ['int i = 10;',
         'int count = 0;',
         'while (i < 5) {',
         '    count++;',
         '    i++;',
         '}',
         'System.out.println(count);'],
        '0',
        ['Is the condition true when the loop is first reached?',
         'i starts at 10, which is already above the limit.',
         'The body never executes.'],
        'The loop is well formed but its variable starts past the limit, so it never runs. The bug is the initialisation, not the condition.'),

    codeTrace('q_const_false_08', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Advanced',
        ['int size = 4;',
         'int seen = 0;',
         'for (int i = size; i < size; i++) {',
         '    seen++;',
         '}',
         'System.out.println(seen);'],
        '0',
        ['Compare the start value with the limit.',
         'i == size on the very first test, so i < size is false.',
         'It looks like a normal traversal and never executes.'],
        'Starting at size makes the condition false immediately. The shape is a standard loop, which is what makes it read as correct.'),

    codeTrace('q_const_false_09', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Advanced',
        ['int found = -1;',
         'int checks = 0;',
         'for (int i = 0; i < 5 && found >= 0; i++) {',
         '    checks++;',
         '    if (i == 3) found = i;',
         '}',
         'System.out.println(checks + "/" + found);'],
        '0/-1',
        ['found starts at -1. Is the second half of the condition true then?',
         'The loop demands that the value already be found in order to look for it.',
         'Neither counter moves.'],
        'The guard is inverted: it should continue WHILE not found. As written the loop never starts, so checks stays 0 and found stays -1.')
];

function validate() {
    const problems = [];
    const ids = new Set();

    for (const q of QUESTIONS) {
        if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
        ids.add(q.id);

        if (!q.errorType || !q.conceptTag || !q.difficulty) problems.push(`${q.id}: missing metadata`);
        if ((q.hints || []).length < 3) problems.push(`${q.id}: fewer than 3 hints`);
        if (!q.explanation) problems.push(`${q.id}: no explanation`);
        if (!Array.isArray(q.codeLines) || q.codeLines.length === 0) {
            problems.push(`${q.id}: no code`);
            continue;
        }

        if (q.gameType === 'BugHunt') {
            if (!Number.isInteger(q.buggyLineIndex) ||
                q.buggyLineIndex < 0 ||
                q.buggyLineIndex >= q.codeLines.length) {
                problems.push(`${q.id}: buggyLineIndex out of range`);
            } else if (q.correctAnswer !== q.buggyLineIndex) {
                problems.push(`${q.id}: correctAnswer disagrees with buggyLineIndex`);
            }
        }

        if (q.gameType === 'CodeTrace' && typeof q.correctAnswer !== 'string') {
            problems.push(`${q.id}: the printed output must be a string`);
        }
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
        await QuestionBank.updateOne({ id: question.id }, { $set: question }, { upsert: true });
    }

    const counts = await QuestionBank.aggregate([
        { $group: { _id: '$gameType', n: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);

    console.log(`Upserted ${QUESTIONS.length} questions.`);
    console.log('  bank now: ' + counts.map((c) => `${c._id}=${c.n}`).join('  '));

    await mongoose.disconnect();
};

module.exports = { QUESTIONS, validate };

if (require.main === module) {
    seed().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
