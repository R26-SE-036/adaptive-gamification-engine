/**
 * Seeds 75 questions into QuestionBank: 5 questions per error type × 15 error types.
 * Run: node data/seed_75_questions.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const QuestionBank = require('../models/QuestionBank');
const { CONCEPT_GAME_MAPPING } = require('../config/constants');

function bugHunt(id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: CONCEPT_GAME_MAPPING[conceptTag] || 'BugHunt',
        codeLines,
        buggyLineIndex,
        correctAnswer: buggyLineIndex,
        hints,
        explanation
    };
}

function dragDrop(id, errorType, conceptTag, difficulty, codeLines, correctAnswer, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: CONCEPT_GAME_MAPPING[conceptTag] || 'DragDrop',
        codeLines,
        correctAnswer,
        hints,
        explanation
    };
}

function codeTrace(id, errorType, conceptTag, difficulty, codeLines, correctAnswer, hints, explanation) {
    return {
        id,
        errorType,
        conceptTag,
        difficulty,
        gameType: CONCEPT_GAME_MAPPING[conceptTag] || 'CodeTrace',
        codeLines,
        correctAnswer,
        hints,
        explanation
    };
}

const questionsData = [
    // ── 1. OFF_BY_ONE_LOOP_BOUNDARY (5) ──────────────────────────────────────
    bugHunt('q_off_by_one_01', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Easy',
        ['public class Main {', '    public static void printArray(int[] arr) {', '        for (int i = 0; i <= arr.length; i++) {', '            System.out.println(arr[i]);', '        }', '    }', '}'],
        2, ['Think about the last valid index of an array.', 'Valid indices run from 0 to length - 1.', 'Should the loop use < or <= with arr.length?'],
        'Loop uses <= arr.length which causes ArrayIndexOutOfBoundsException on the last iteration.'),
    bugHunt('q_off_by_one_02', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int[] data = {1, 2, 3, 4, 5};', '        int sum = 0;', '        for (int i = 0; i <= data.length; i++) {', '            sum += data[i];', '        }', '    }', '}'],
        4, ['Check the loop boundary condition.', 'Using <= length attempts to access index equal to array length.', 'Change <= to < to stay within valid bounds.'],
        'Using <= data.length causes out-of-bounds access. Use < data.length instead.'),
    bugHunt('q_off_by_one_03', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        String[] names = {"Alice", "Bob", "Charlie"};', '        for (int j = 1; j <= names.length; j++) {', '            System.out.println(names[j]);', '        }', '    }', '}'],
        3, ['Starting at index 1 skips the first element.', 'The upper bound also uses <= length.', 'Both the start index and bound may be off by one.'],
        'Loop starts at 1 and uses <= names.length, skipping index 0 and accessing out of bounds.'),
    bugHunt('q_off_by_one_04', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Medium',
        ['public class Main {', '    public static int sumElements(int[] numbers) {', '        int total = 0;', '        for (int i = 0; i <= numbers.length; i++) {', '            total += numbers[i];', '        }', '        return total;', '    }', '}'],
        3, ['Check the loop boundary condition.', 'Using <= numbers.length accesses index equal to array length.', 'Change <= to < to stay within valid array bounds.'],
        'Loop accesses index numbers.length which is out of bounds.'),
    bugHunt('q_off_by_one_05', 'OFF_BY_ONE_LOOP_BOUNDARY', 'loop_boundaries', 'Hard',
        ['public class Main {', '    public static void reversePrint(int[] arr) {', '        for (int i = arr.length; i >= 0; i--) {', '            System.out.println(arr[i]);', '        }', '    }', '}'],
        2, ['Check the starting index of the reverse loop.', 'arr.length is not a valid index in Java.', 'The starting index should be arr.length - 1.'],
        'Reverse loop starts at i = arr.length which causes an out-of-bounds error.'),

    // ── 2. INCORRECT_CONDITIONAL_OPERATOR (5) ────────────────────────────────
    dragDrop('q_cond_op_01', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Easy',
        ['        if (score = 100) {', 'public class Main {', '    public static void check(int score) {', '        }', '    }', '}'],
        [1, 2, 0, 3, 4, 5], ['A condition should compare, not assign.', 'Look at the operator inside the if condition.', 'Use == for comparison, not = for assignment.'],
        'if (score = 100) uses assignment instead of comparison; use == instead.'),
    dragDrop('q_cond_op_02', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Easy',
        ['        if (age >= 18) {', 'public class Main {', '    public static void verify(int age) {', '            System.out.println("Adult");', '        }', '    }', '}'],
        [1, 2, 0, 3, 4, 5, 6], ['Order the class, method, condition, and body correctly.', 'The if condition should come before its body.', 'Ensure braces enclose the method properly.'],
        'Arrange conditional structure with proper comparison operator and block order.'),
    dragDrop('q_cond_op_03', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Medium',
        ['        if (temp > 30) {', 'public class Main {', '    public static void report(int temp) {', '            System.out.println("Hot");', '        } else {', '            System.out.println("Cool");', '        }', '    }', '}'],
        [1, 2, 0, 3, 4, 5, 6, 7, 8, 9], ['Place the if-else chain in logical order.', 'The condition temp > 30 should precede its branches.', 'Ensure else follows the if block.'],
        'Conditional chain must use correct comparison operators in proper structure.'),
    dragDrop('q_cond_op_04', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Medium',
        ['        if (x != 0) {', 'public class Main {', '    public static void divide(int x, int y) {', '            System.out.println(y / x);', '        }', '    }', '}'],
        [1, 2, 0, 3, 4, 5, 6], ['Check that the condition guards against invalid operations.', 'x != 0 prevents division by zero.', 'Order class, method, guard, and body correctly.'],
        'Guard condition x != 0 uses correct != operator to prevent division by zero.'),
    dragDrop('q_cond_op_05', 'INCORRECT_CONDITIONAL_OPERATOR', 'conditional_logic', 'Hard',
        ['        if (score >= 90) {', 'public class Main {', '    public static void grade(int score) {', '            System.out.println("A");', '        } else if (score >= 75) {', '            System.out.println("B");', '        } else {', '            System.out.println("C");', '        }', '    }', '}'],
        [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11], ['Highest threshold should be evaluated first.', 'Use >= for inclusive boundary checks.', 'Order if-else-if chain from highest to lowest score.'],
        'Grade chain uses >= correctly; highest cutoff evaluated first.'),

    // ── 3. ARRAY_LENGTH_INDEX_MISUSE (5) ─────────────────────────────────────
    bugHunt('q_arr_len_01', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Easy',
        ['public class Main {', '    public static int getLastItem(int[] items) {', '        return items[items.length];', '    }', '}'],
        2, ['Array length tells you count, not the last valid position.', 'Compare element count with the final usable index.', 'Use items.length - 1 for the last element.'],
        'Accessing items[items.length] is off-by-one; use items[items.length - 1].'),
    bugHunt('q_arr_len_02', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int[] nums = {5, 10, 15, 20};', '        int lastValue = nums[nums.length];', '        System.out.println(lastValue);', '    }', '}'],
        3, ['nums.length gives total count, not last index.', 'Last valid index is length - 1.', 'Check the index expression on line 4.'],
        'nums.length gives count; last element is at nums.length - 1.'),
    bugHunt('q_arr_len_03', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        char[] letters = {\'A\', \'B\', \'C\'};', '        char c = letters[letters.length];', '    }', '}'],
        3, ['Maximum valid index is length minus one.', 'Using length directly as index is invalid.', 'Check line 4 index expression.'],
        'The maximum index of an array is its length minus one.'),
    bugHunt('q_arr_len_04', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Medium',
        ['public class Main {', '    public static String getMiddle(String[] arr) {', '        int mid = arr.length / 2;', '        return arr[arr.length];', '    }', '}'],
        3, ['mid is calculated correctly but return uses wrong index.', 'arr.length is never a valid index.', 'Should return arr[mid] not arr[arr.length].'],
        'Return statement uses arr.length as index instead of the computed mid index.'),
    bugHunt('q_arr_len_05', 'ARRAY_LENGTH_INDEX_MISUSE', 'array_indexing', 'Hard',
        ['public class Main {', '    public static void copyLast(int[] src, int[] dest) {', '        dest[0] = src[src.length];', '    }', '}'],
        2, ['Copying the last element requires length - 1.', 'src.length as index is always out of bounds.', 'Use src[src.length - 1] to access the last element.'],
        'src[src.length] is invalid; last element is at src[src.length - 1].'),

    // ── 4. STRING_EQUALITY_WITH_OPERATOR (5) ─────────────────────────────────
    codeTrace('q_str_eq_01', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Easy',
        ['String s1 = new String("hello");', 'String s2 = new String("hello");', 'boolean result = (s1 == s2);', 'System.out.println(result);'],
        'false', ['== compares object references, not content.', 's1 and s2 are different String objects.', 'What does == return for two distinct objects?'],
        '== compares references; s1 and s2 are different objects so result is false.'),
    codeTrace('q_str_eq_02', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Easy',
        ['String s1 = new String("hello");', 'String s2 = new String("hello");', 'boolean result = s1.equals(s2);', 'System.out.println(result);'],
        'true', ['.equals() compares actual string content.', 'Both strings contain "hello".', 'What will .equals() evaluate to?'],
        'Using .equals() compares string content correctly, returning true.'),
    codeTrace('q_str_eq_03', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Medium',
        ['String a = "java";', 'String b = "java";', 'System.out.println(a == b);'],
        'true', ['String literals may be interned in the pool.', 'Both "java" literals refer to the same pool object.', '== returns true for identical references.'],
        'String literal pool means a and b reference the same object; == is true.'),
    codeTrace('q_str_eq_04', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Medium',
        ['String x = new String("test");', 'String y = "test";', 'System.out.println(x == y);'],
        'false', ['x is a new heap object; y is a pool literal.', '== checks reference equality.', 'Different references yield false.'],
        'new String("test") creates a heap object; == with pool literal is false.'),
    codeTrace('q_str_eq_05', 'STRING_EQUALITY_WITH_OPERATOR', 'string_comparison', 'Hard',
        ['String p = new String("code");', 'String q = new String("code");', 'System.out.println(p.equals(q));'],
        'true', ['.equals() compares character content.', 'Both strings have identical characters.', 'Content match yields true regardless of reference.'],
        '.equals() compares content; both strings are "code" so output is true.'),

    // ── 5. LOOP_UPDATE_WRONG_DIRECTION (5) ───────────────────────────────────
    bugHunt('q_loop_dir_01', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Easy',
        ['public class Main {', '    public static void countUp() {', '        for (int i = 0; i < 10; i--) {', '            System.out.println(i);', '        }', '    }', '}'],
        2, ['Follow the counter value each iteration.', 'i-- moves away from 10 when checking i < 10.', 'The update should be i++ not i--.'],
        'Decrementing i when checking i < 10 creates an infinite loop.'),
    bugHunt('q_loop_dir_02', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        for (int i = 5; i > 0; i++) {', '            System.out.println(i);', '        }', '    }', '}'],
        2, ['Loop condition is i > 0, so i must decrease.', 'i++ makes i grow, never reaching 0.', 'Use i-- to count down toward zero.'],
        'Incrementing i while checking i > 0 causes an infinite loop.'),
    bugHunt('q_loop_dir_03', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        int n = 10;', '        while (n > 0) {', '            n++;', '            System.out.println(n);', '        }', '    }', '}'],
        4, ['while (n > 0) requires n to decrease.', 'n++ increases n every iteration.', 'n will never reach 0; use n-- instead.'],
        'Incrementing n inside while (n > 0) prevents the loop from terminating.'),
    bugHunt('q_loop_dir_04', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        for (int j = 0; j < 5; j = j - 2) {', '            System.out.println(j);', '        }', '    }', '}'],
        2, ['j starts at 0 and subtracts 2 each time.', 'j becomes -2, -4, ... never reaching 5.', 'Update moves away from the bound j < 5.'],
        'j = j - 2 makes j negative; loop never satisfies j < 5 properly for counting up.'),
    bugHunt('q_loop_dir_05', 'LOOP_UPDATE_WRONG_DIRECTION', 'loop_control', 'Hard',
        ['public class Main {', '    public static void runCode() {', '        for (int k = 100; k >= 0; k += 5) {', '            System.out.println(k);', '        }', '    }', '}'],
        2, ['Condition k >= 0 requires k to decrease.', 'k += 5 increases k toward infinity.', 'Use k -= 5 or k-- to count down.'],
        'k += 5 while checking k >= 0 creates an infinite loop going upward.'),

    // ── 6. UNREACHABLE_CODE_AFTER_RETURN (5) ─────────────────────────────────
    bugHunt('q_unreach_01', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Easy',
        ['public class Main {', '    public static int calculate() {', '        int a = 5;', '        return a * 2;', '        System.out.println("Done");', '    }', '}'],
        4, ['return immediately ends the method.', 'Nothing after return in the same block can run.', 'Line 5 comes after return and is unreachable.'],
        'Statement after return is unreachable.'),
    bugHunt('q_unreach_02', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Easy',
        ['public class Main {', '    public static void greet() {', '        return;', '        System.out.println("Hello");', '    }', '}'],
        3, ['return; exits the method immediately.', 'Code after return on line 4 never executes.', 'The println is unreachable.'],
        'println after return is unreachable dead code.'),
    bugHunt('q_unreach_03', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Medium',
        ['public class Main {', '    public static boolean isPositive(int x) {', '        if (x > 0) {', '            return true;', '        }', '        return false;', '        x = 0;', '    }', '}'],
        6, ['Method already returns on line 6.', 'Assignment on line 7 can never execute.', 'Code after final return is unreachable.'],
        'x = 0 after return false is unreachable.'),
    bugHunt('q_unreach_04', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Medium',
        ['public class Main {', '    public static int max(int a, int b) {', '        if (a > b) return a;', '        return b;', '        return 0;', '    }', '}'],
        4, ['Both branches already return a value.', 'Third return on line 5 is never reached.', 'Remove unreachable return 0.'],
        'return 0 after return b is unreachable.'),
    bugHunt('q_unreach_05', 'UNREACHABLE_CODE_AFTER_RETURN', 'control_flow', 'Hard',
        ['public class Main {', '    public static String label(int n) {', '        switch (n) {', '            case 1: return "one";', '            default: return "other";', '        }', '        return "unknown";', '    }', '}'],
        6, ['switch covers all paths with returns.', 'return after switch block is unreachable.', 'Every case already returns a value.'],
        'return "unknown" after switch with exhaustive returns is unreachable.'),

    // ── 7. MISSING_BREAK_IN_SWITCH (5) ───────────────────────────────────────
    dragDrop('q_switch_01', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Easy',
        ['switch (day) {', '    case 1: System.out.println("Mon"); break;', '    case 2: System.out.println("Tue"); break;', '    default: System.out.println("Other"); break;', '}'],
        [0, 1, 2, 3, 4], ['Each case needs break to prevent fall-through.', 'Without break, execution continues to next case.', 'Arrange cases with proper break termination.'],
        'Switch cases should include break to prevent fall-through.'),
    dragDrop('q_switch_02', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Easy',
        ['switch (grade) {', '    case \'A\': System.out.println("Excellent"); break;', '    case \'B\': System.out.println("Good"); break;', '    case \'C\': System.out.println("Fair"); break;', '    default: System.out.println("Fail"); break;', '}'],
        [0, 1, 2, 3, 4, 5, 6], ['Each grade case must end with break.', 'Fall-through would print multiple messages.', 'Order switch with breaks after each case body.'],
        'All switch cases include break statements to prevent fall-through.'),
    dragDrop('q_switch_03', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Medium',
        ['switch (month) {', '    case 1: case 3: case 5: System.out.println("31 days"); break;', '    case 2: System.out.println("28 days"); break;', '    default: System.out.println("30 days"); break;', '}'],
        [0, 1, 2, 3, 4, 5], ['Grouped cases share one body and one break.', 'case 2 and default need their own breaks.', 'Ensure each branch terminates with break.'],
        'Switch with grouped cases still requires break after shared body.'),
    dragDrop('q_switch_04', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Medium',
        ['switch (op) {', '    case "+": result = a + b; break;', '    case "-": result = a - b; break;', '    case "*": result = a * b; break;', '    default: result = 0; break;', '}'],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], ['Each operator case computes then breaks.', 'Without break, multiple operations would run.', 'Order operator cases with break after assignment.'],
        'Calculator switch requires break after each operation to avoid fall-through.'),
    dragDrop('q_switch_05', 'MISSING_BREAK_IN_SWITCH', 'switch_statements', 'Hard',
        ['switch (status) {', '    case 0: log("Pending"); break;', '    case 1: log("Active"); break;', '    case 2: log("Done"); break;', '    case 3: log("Cancelled"); break;', '    default: log("Unknown"); break;', '}'],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ['Four explicit cases plus default each need break.', 'Missing break causes unintended status logging.', 'Complete switch structure with breaks.'],
        'Status switch with four cases and default all require break statements.'),

    // ── 8. EMPTY_CONDITIONAL_BODY (5) ────────────────────────────────────────
    bugHunt('q_empty_if_01', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Easy',
        ['public class Main {', '    public static void check(int x) {', '        if (x > 10);', '        {', '            System.out.println("X is greater");', '        }', '    }', '}'],
        2, ['Semicolon after if condition terminates the if statement.', 'The block on lines 4-6 is NOT controlled by if.', 'Remove semicolon after if (x > 10).'],
        'Semicolon after if condition creates an empty conditional body.'),
    bugHunt('q_empty_if_02', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int val = 5;', '        if (val < 0);', '            val = 0;', '    }', '}'],
        3, ['Semicolon on line 4 ends the if immediately.', 'val = 0 always runs regardless of condition.', 'The if body is empty due to the semicolon.'],
        'if (val < 0); has empty body; val = 0 runs unconditionally.'),
    bugHunt('q_empty_if_03', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        boolean flag = true;', '        if (flag);', '        {', '            flag = false;', '        }', '    }', '}'],
        3, ['Semicolon after if (flag) makes body empty.', 'Block with flag = false is independent.', 'Line 4 semicolon is the bug.'],
        'Semicolon after if (flag) means flag = false block always executes.'),
    bugHunt('q_empty_if_04', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Medium',
        ['public class Main {', '    public static void warn(int n) {', '        if (n < 0);', '        System.out.println("Warning: negative value");', '    }', '}'],
        3, ['Warning prints for every call, not just negative n.', 'Semicolon after if (n < 0) creates empty body.', 'Line 3 is the buggy line.'],
        'Empty if body causes warning to print unconditionally.'),
    bugHunt('q_empty_if_05', 'EMPTY_CONDITIONAL_BODY', 'statement_structure', 'Hard',
        ['public class Main {', '    public static void runCode() {', '        int count = 0;', '        if (count > 0);', '        {', '            count++;', '            System.out.println(count);', '        }', '    }', '}'],
        3, ['if (count > 0); ends the if with no body.', 'count++ block runs even when count is 0.', 'Semicolon on line 4 is the error.'],
        'Empty conditional body causes increment block to run unconditionally.'),

    // ── 9. SELF_ASSIGNMENT (5) ─────────────────────────────────────────────
    bugHunt('q_self_assign_01', 'SELF_ASSIGNMENT', 'assignment_logic', 'Easy',
        ['public class Main {', '    public static void setAge(int userAge) {', '        int age = 0;', '        age = age;', '    }', '}'],
        3, ['Assigning age to age changes nothing.', 'userAge parameter was likely intended.', 'Line 4 assigns variable to itself.'],
        'age = age is self-assignment; should be age = userAge.'),
    bugHunt('q_self_assign_02', 'SELF_ASSIGNMENT', 'assignment_logic', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int total = 100;', '        total = total;', '        System.out.println(total);', '    }', '}'],
        3, ['total = total has no effect.', 'No new value is assigned from another variable.', 'Self-assignment on line 4 is the bug.'],
        'total = total is a no-op self-assignment.'),
    bugHunt('q_self_assign_03', 'SELF_ASSIGNMENT', 'assignment_logic', 'Medium',
        ['public class Main {', '    public static void update(int newVal) {', '        int value = 10;', '        value = value;', '        System.out.println(value);', '    }', '}'],
        3, ['newVal parameter is ignored.', 'value = value leaves value at 10.', 'Should assign value = newVal.'],
        'Self-assignment ignores newVal parameter; value stays 10.'),
    bugHunt('q_self_assign_04', 'SELF_ASSIGNMENT', 'assignment_logic', 'Medium',
        ['public class Main {', '    public static void swap(int a, int b) {', '        a = a;', '        b = b;', '    }', '}'],
        2, ['a = a does not swap anything.', 'Both lines are self-assignments.', 'Line 3 is the first useless assignment.'],
        'a = a and b = b are self-assignments; swap logic is missing.'),
    bugHunt('q_self_assign_05', 'SELF_ASSIGNMENT', 'assignment_logic', 'Hard',
        ['public class Main {', '    public static void applyDiscount(double price, double rate) {', '        double discount = 0;', '        discount = discount;', '        double finalPrice = price - discount;', '    }', '}'],
        3, ['discount should be computed from price and rate.', 'discount = discount leaves discount at 0.', 'Line 4 is self-assignment instead of calculation.'],
        'discount = discount ignores price and rate; should compute actual discount.'),

    // ── 10. ALWAYS_TRUE_OR_CONDITION (5) ─────────────────────────────────────
    dragDrop('q_bool_or_01', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Easy',
        ['public class Main {', '    public static boolean isValid(int x) {', '        return (x != 5 || x != 10);', '    }', '}'],
        [0, 1, 2, 3, 4], ['x != 5 || x != 10 is true for every number.', 'If x is 5, then x != 10 is true.', 'Use && to require both conditions.'],
        'OR of two != checks is always true; use && for valid range check.'),
    dragDrop('q_bool_or_02', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Easy',
        ['public class Main {', '    public static boolean inRange(int n) {', '        return (n < 0 || n > 100);', '    }', '}'],
        [0, 1, 2, 3, 4], ['This returns true for values OUTSIDE 0-100.', 'Logic may be inverted or use wrong operator.', 'Use && with corrected bounds for in-range check.'],
        'n < 0 || n > 100 detects out-of-range; in-range needs && with negation.'),
    dragDrop('q_bool_or_03', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Medium',
        ['public class Main {', '    public static boolean check(int a, int b) {', '        return (a != b || b != a);', '    }', '}'],
        [0, 1, 2, 3, 4], ['a != b and b != a are logically equivalent.', 'OR of equivalent conditions is tautological.', 'Restructure to a meaningful single comparison.'],
        'a != b || b != a is redundant and always equivalent to a != b.'),
    dragDrop('q_bool_or_04', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Medium',
        ['public class Main {', '    public static boolean isEmpty(String s) {', '        return (s == null || s.length() >= 0);', '    }', '}'],
        [0, 1, 2, 3, 4], ['s.length() >= 0 is always true for non-null strings.', 'Combined with ||, non-null strings always match.', 'Use && with s.length() == 0 for empty check.'],
        's.length() >= 0 is always true; makes isEmpty always true for non-null strings.'),
    dragDrop('q_bool_or_05', 'ALWAYS_TRUE_OR_CONDITION', 'boolean_logic', 'Hard',
        ['public class Main {', '    public static boolean outsideRange(int x) {', '        return (x < 1 || x > 0);', '    }', '}'],
        [0, 1, 2, 3, 4], ['Every integer is either < 1 or > 0.', 'x < 1 || x > 0 covers all integers.', 'This condition is always true (tautology).'],
        'x < 1 || x > 0 is a tautology true for every integer.'),

    // ── 11. IGNORED_STRING_METHOD_RESULT (5) ────────────────────────────────
    codeTrace('q_immutable_01', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Easy',
        ['String name = "alice";', 'name.toUpperCase();', 'System.out.println(name);'],
        'alice', ['Strings are immutable in Java.', 'toUpperCase() returns a NEW String.', 'Original name is unchanged since result was ignored.'],
        'name remains "alice" because toUpperCase() result was not assigned.'),
    codeTrace('q_immutable_02', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Easy',
        ['String word = "hello";', 'word.concat(" world");', 'System.out.println(word);'],
        'hello', ['concat() returns a new String.', 'word is not modified in place.', 'Without assignment, word stays "hello".'],
        'concat result ignored; word still prints "hello".'),
    codeTrace('q_immutable_03', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Medium',
        ['String s = "  test  ";', 's.trim();', 'System.out.println(s.length());'],
        '8', ['trim() returns trimmed copy; s is unchanged.', 's still has spaces: "  test  " (length 8).', 'length() returns 8 for the original string.'],
        'trim() result ignored; s retains spaces so length is 8.'),
    codeTrace('q_immutable_04', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Medium',
        ['String msg = "Java";', 'msg.replace("J", "j");', 'System.out.println(msg);'],
        'Java', ['replace() returns new String without modifying original.', 'msg was never reassigned.', 'Output is still "Java".'],
        'replace() result ignored; msg unchanged so prints "Java".'),
    codeTrace('q_immutable_05', 'IGNORED_STRING_METHOD_RESULT', 'immutable_strings', 'Hard',
        ['StringBuilder sb = new StringBuilder("hi");', 'String result = sb.toString();', 'result.toUpperCase();', 'System.out.println(result);'],
        'hi', ['result is a String snapshot of sb.', 'toUpperCase() on result returns new String.', 'result variable still holds "hi".'],
        'toUpperCase() on result not assigned back; prints original "hi".'),

    // ── 12. DIVISION_BY_ZERO_LITERAL (5) ─────────────────────────────────────
    bugHunt('q_div_zero_01', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Easy',
        ['public class Main {', '    public static int divide() {', '        int total = 100;', '        return total / 0;', '    }', '}'],
        3, ['Integer division by zero throws ArithmeticException.', 'Look at the divisor on line 4.', 'Dividing by literal 0 is invalid.'],
        'Integer division by zero throws ArithmeticException.'),
    bugHunt('q_div_zero_02', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int x = 50;', '        int y = x / 0;', '        System.out.println(y);', '    }', '}'],
        3, ['Divisor is literal 0.', 'This throws at runtime.', 'Line 4 divides by zero.'],
        'x / 0 causes ArithmeticException at runtime.'),
    bugHunt('q_div_zero_03', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Medium',
        ['public class Main {', '    public static double average(int sum) {', '        int count = 0;', '        return sum / count;', '    }', '}'],
        3, ['count is 0, causing division by zero.', 'Even though count is a variable, value is 0.', 'Line 4 divides sum by zero.'],
        'count is 0, making sum / count a division by zero error.'),
    bugHunt('q_div_zero_04', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        int a = 10;', '        int b = 0;', '        int c = a % b;', '    }', '}'],
        4, ['Modulo by zero also throws ArithmeticException.', 'b is 0 on line 4.', 'Line 5 computes a % 0.'],
        'Modulo by zero (a % 0) throws ArithmeticException.'),
    bugHunt('q_div_zero_05', 'DIVISION_BY_ZERO_LITERAL', 'arithmetic_operations', 'Hard',
        ['public class Main {', '    public static int compute(int[] arr) {', '        int len = arr.length - arr.length;', '        return arr[0] / len;', '    }', '}'],
        3, ['len = arr.length - arr.length equals 0.', 'Division on line 4 uses len as divisor.', 'Line 4 divides by zero when len is 0.'],
        'len is always 0, causing division by zero on line 4.'),

    // ── 13. CONSTANT_FALSE_LOOP_CONDITION (5) ────────────────────────────────
    codeTrace('q_false_loop_01', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Easy',
        ['int count = 10;', 'int sum = 0;', 'while (count < 5) {', '    sum += count;', '    count++;', '}', 'System.out.println(sum);'],
        '0', ['while condition checked before first iteration.', 'count = 10, is 10 < 5 false?', 'Loop body never executes; sum stays 0.'],
        'count < 5 is false when count = 10; loop never runs; sum is 0.'),
    codeTrace('q_false_loop_02', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Easy',
        ['int i = 5;', 'int total = 0;', 'while (i < 5) {', '    total += i;', '    i++;', '}', 'System.out.println(total);'],
        '0', ['i starts at 5.', 'Is 5 < 5 true?', 'Loop never executes; total remains 0.'],
        'i < 5 is false when i = 5; loop body never runs.'),
    codeTrace('q_false_loop_03', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Medium',
        ['int n = 0;', 'int product = 1;', 'while (n > 0) {', '    product *= n;', '    n--;', '}', 'System.out.println(product);'],
        '1', ['n starts at 0.', 'Is 0 > 0 true?', 'Loop skipped; product stays initial value 1.'],
        'n > 0 is false when n = 0; product remains 1.'),
    codeTrace('q_false_loop_04', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Medium',
        ['int x = 100;', 'int result = 0;', 'for (int j = x; j < 50; j++) {', '    result += j;', '}', 'System.out.println(result);'],
        '0', ['for init sets j = 100.', 'Is 100 < 50 true?', 'Loop never executes; result stays 0.'],
        'j starts at 100; j < 50 is false immediately; result is 0.'),
    codeTrace('q_false_loop_05', 'CONSTANT_FALSE_LOOP_CONDITION', 'loop_initialization', 'Hard',
        ['int start = 20;', 'int end = 10;', 'int sum = 0;', 'while (start <= end) {', '    sum += start;', '    start++;', '}', 'System.out.println(sum);'],
        '0', ['start = 20, end = 10.', 'Is 20 <= 10 true?', 'Loop condition false from the start; sum is 0.'],
        'start <= end is false when start=20 and end=10; sum remains 0.'),

    // ── 14. DUPLICATE_IF_ELSE_CONDITION (5) ──────────────────────────────────
    dragDrop('q_dup_if_01', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Easy',
        ['if (score > 80) {', '    System.out.println("High");', '} else if (score > 50) {', '    System.out.println("Medium");', '} else {', '    System.out.println("Low");', '}'],
        [0, 1, 2, 3, 4, 5, 6], ['Each branch should test a unique condition.', 'Avoid duplicating conditions in else-if.', 'Order from highest to lowest threshold.'],
        'Distinct conditions in if-else-if chain avoid duplicate branches.'),
    dragDrop('q_dup_if_02', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Easy',
        ['if (age >= 18) {', '    System.out.println("Adult");', '} else if (age >= 13) {', '    System.out.println("Teen");', '} else {', '    System.out.println("Child");', '}'],
        [0, 1, 2, 3, 4, 5, 6], ['Three distinct age ranges.', 'No duplicate conditions.', 'Structure: adult, teen, child.'],
        'Age brackets use unique non-overlapping conditions.'),
    dragDrop('q_dup_if_03', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Medium',
        ['if (temp > 30) {', '    System.out.println("Hot");', '} else if (temp > 20) {', '    System.out.println("Warm");', '} else if (temp > 10) {', '    System.out.println("Cool");', '} else {', '    System.out.println("Cold");', '}'],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ['Four temperature ranges, each unique.', 'Order from hottest to coldest.', 'No duplicate threshold checks.'],
        'Temperature chain uses distinct descending thresholds.'),
    dragDrop('q_dup_if_04', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Medium',
        ['if (x > 0) {', '    System.out.println("Positive");', '} else if (x < 0) {', '    System.out.println("Negative");', '} else {', '    System.out.println("Zero");', '}'],
        [0, 1, 2, 3, 4, 5, 6], ['Three mutually exclusive cases.', 'x > 0, x < 0, and else for zero.', 'No overlapping conditions.'],
        'Sign check uses three distinct non-overlapping conditions.'),
    dragDrop('q_dup_if_05', 'DUPLICATE_IF_ELSE_CONDITION', 'conditional_logic', 'Hard',
        ['if (grade == \'A\') {', '    System.out.println("Excellent");', '} else if (grade == \'B\') {', '    System.out.println("Good");', '} else if (grade == \'C\') {', '    System.out.println("Average");', '} else {', '    System.out.println("Needs improvement");', '}'],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ['Each letter grade checked once.', 'No duplicate grade == conditions.', 'Four cases plus default else.'],
        'Letter grade chain with unique == checks for A, B, C and else.'),

    // ── 15. WHILE_VARIABLE_NOT_UPDATED (5) ───────────────────────────────────
    bugHunt('q_while_upd_01', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Easy',
        ['public class Main {', '    public static void printNumbers() {', '        int i = 0;', '        while (i < 5) {', '            System.out.println(i);', '        }', '    }', '}'],
        3, ['while loop must update counter inside body.', 'i is never modified inside the loop.', 'Without i++, i < 5 stays true forever.'],
        'Variable i is never incremented, causing an infinite loop.'),
    bugHunt('q_while_upd_02', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Easy',
        ['public class Main {', '    public static void runCode() {', '        int count = 1;', '        while (count <= 10) {', '            System.out.println(count);', '        }', '    }', '}'],
        3, ['count never changes inside the loop.', 'count <= 10 remains true forever.', 'Need count++ inside loop body.'],
        'count is never updated inside while loop; infinite loop results.'),
    bugHunt('q_while_upd_03', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        int n = 100;', '        while (n > 0) {', '            System.out.println(n);', '        }', '    }', '}'],
        3, ['n starts at 100 and never decreases.', 'while (n > 0) never becomes false.', 'Missing n-- inside loop body.'],
        'n is never decremented; while (n > 0) runs forever.'),
    bugHunt('q_while_upd_04', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Medium',
        ['public class Main {', '    public static void runCode() {', '        int idx = 0;', '        int[] arr = {1, 2, 3};', '        while (idx < arr.length) {', '            System.out.println(arr[idx]);', '        }', '    }', '}'],
        4, ['idx never advances to next array element.', 'Always prints arr[0] infinitely.', 'Need idx++ inside loop.'],
        'idx not incremented; loop never progresses through array.'),
    bugHunt('q_while_upd_05', 'WHILE_VARIABLE_NOT_UPDATED', 'loop_termination', 'Hard',
        ['public class Main {', '    public static void runCode() {', '        boolean running = true;', '        int step = 0;', '        while (running) {', '            System.out.println(step);', '        }', '    }', '}'],
        4, ['running is never set to false.', 'step is never incremented.', 'Loop body lacks termination logic.'],
        'running stays true and step never updates; infinite loop.')
];

// Validate count: 15 error types × 5 questions = 75
const byError = {};
for (const q of questionsData) {
    byError[q.errorType] = (byError[q.errorType] || 0) + 1;
}
const counts = Object.values(byError);
if (questionsData.length !== 75 || counts.some((c) => c !== 5)) {
    console.error('Validation failed. Expected 75 questions (5 per error type).');
    console.error('Counts:', byError);
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Seeding 75 questions (5 per error type)...');

        await QuestionBank.deleteMany({});
        console.log('Cleared existing QuestionBank collection.');

        await QuestionBank.insertMany(questionsData);
        console.log(`Successfully seeded ${questionsData.length} questions into QuestionBank.`);

        console.log('\nQuestions per error type:');
        for (const [type, count] of Object.entries(byError).sort()) {
            console.log(`  ${type}: ${count}`);
        }

        process.exit(0);
    })
    .catch((err) => {
        console.error('Seeding failed:', err);
        process.exit(1);
    });
