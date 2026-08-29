const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const QuestionBank = require('../models/QuestionBank');

const questionsData = [
    // 1. OFF_BY_ONE_LOOP_BOUNDARY (loop_boundaries -> BugHunt)
    {
        id: "q_loop_01",
        errorType: "OFF_BY_ONE_LOOP_BOUNDARY",
        conceptTag: "loop_boundaries",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void printArray(int[] arr) {",
            "        for (int i = 0; i <= arr.length; i++) {",
            "            System.out.println(arr[i]);",
            "        }",
            "    }",
            "}"
        ],
        buggyLineIndex: 2,
        correctAnswer: 2,
        hints: [
            "Think about what the last valid index of an array should be.",
            "An array with length n usually has valid indexes from 0 up to n - 1.",
            "Check whether this loop condition should stop before the array length instead of including the length value."
        ],
        explanation: "Loop uses <= arr.length which causes an ArrayIndexOutOfBoundsException on the last iteration."
    },
    {
        id: "q_loop_02",
        errorType: "OFF_BY_ONE_LOOP_BOUNDARY",
        conceptTag: "loop_boundaries",
        difficulty: "Medium",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static int sumElements(int[] numbers) {",
            "        int total = 0;",
            "        for (int i = 0; i <= numbers.length; i++) {",
            "            total += numbers[i];",
            "        }",
            "        return total;",
            "    }",
            "}"
        ],
        buggyLineIndex: 3,
        correctAnswer: 3,
        hints: [
            "Check the loop boundary condition.",
            "Using <= numbers.length attempts to access index equal to array length.",
            "Change <= to < to stay within valid array bounds."
        ],
        explanation: "Loop accesses index numbers.length which is out of bounds."
    },
    {
        id: "q_loop_03",
        errorType: "OFF_BY_ONE_LOOP_BOUNDARY",
        conceptTag: "loop_boundaries",
        difficulty: "Hard",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void reversePrint(int[] arr) {",
            "        for (int i = arr.length; i >= 0; i--) {",
            "            System.out.println(arr[i]);",
            "        }",
            "    }",
            "}"
        ],
        buggyLineIndex: 2,
        correctAnswer: 2,
        hints: [
            "Check the starting index of the loop.",
            "arr.length is not a valid index in Java.",
            "The starting index for reverse loop should be arr.length - 1."
        ],
        explanation: "The reverse loop starts at i = arr.length which causes an out-of-bounds error."
    },

    // 2. INCORRECT_CONDITIONAL_OPERATOR (conditional_logic -> DragDrop)
    {
        id: "q_cond_01",
        errorType: "INCORRECT_CONDITIONAL_OPERATOR",
        conceptTag: "conditional_logic",
        difficulty: "Easy",
        gameType: "DragDrop",
        codeLines: [
            "public class Main {",
            "    public static void checkStatus(boolean ready) {",
            "        if (ready == true) {",
            "            System.out.println(\"System is ready\");",
            "        }",
            "    }",
            "}"
        ],
        correctAnswer: [0, 1, 2, 3, 4, 5, 6],
        hints: [
            "A condition should normally check a value rather than change it.",
            "Look at the operator inside this condition.",
            "Check whether the condition uses assignment where a comparison was intended."
        ],
        explanation: "Ensure the conditional evaluation statement uses proper boolean logic."
    },
    {
        id: "q_cond_02",
        errorType: "INCORRECT_CONDITIONAL_OPERATOR",
        conceptTag: "conditional_logic",
        difficulty: "Medium",
        gameType: "DragDrop",
        codeLines: [
            "public class Main {",
            "    public static void evaluateGrade(int score) {",
            "        if (score >= 90) {",
            "            System.out.println(\"Grade A\");",
            "        } else if (score >= 75) {",
            "            System.out.println(\"Grade B\");",
            "        }",
            "    }",
            "}"
        ],
        correctAnswer: [0, 1, 2, 3, 4, 5, 6, 7],
        hints: [
            "Order the if / else-if branches logically.",
            "The highest threshold should be evaluated first.",
            "Arrange the conditional structure properly."
        ],
        explanation: "Conditional chain must evaluate higher scores prior to lower cutoffs."
    },

    // 3. ARRAY_LENGTH_INDEX_MISUSE (array_indexing -> BugHunt)
    {
        id: "q_arr_01",
        errorType: "ARRAY_LENGTH_INDEX_MISUSE",
        conceptTag: "array_indexing",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static int getLastItem(int[] items) {",
            "        return items[items.length];",
            "    }",
            "}"
        ],
        buggyLineIndex: 2,
        correctAnswer: 2,
        hints: [
            "Array length tells you how many items exist, not the last valid position.",
            "Compare the number of elements with the final usable index.",
            "Check whether the array length is being used directly as an index."
        ],
        explanation: "Accessing items[items.length] is an off-by-one index misuse; use items[items.length - 1]."
    },

    // 4. STRING_EQUALITY_WITH_OPERATOR (string_comparison -> CodeTrace)
    {
        id: "q_str_01",
        errorType: "STRING_EQUALITY_WITH_OPERATOR",
        conceptTag: "string_comparison",
        difficulty: "Easy",
        gameType: "CodeTrace",
        codeLines: [
            "String s1 = new String(\"hello\");",
            "String s2 = new String(\"hello\");",
            "boolean result = s1.equals(s2);",
            "System.out.println(result);"
        ],
        correctAnswer: "true",
        hints: [
            "Strings are objects in Java.",
            ".equals() compares actual content, whereas == compares object memory references.",
            "What will .equals() evaluate to for two matching string contents?"
        ],
        explanation: "Using .equals() evaluates string text equality correctly to true."
    },

    // 5. LOOP_UPDATE_WRONG_DIRECTION (loop_control -> BugHunt)
    {
        id: "q_loop_dir_01",
        errorType: "LOOP_UPDATE_WRONG_DIRECTION",
        conceptTag: "loop_control",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void countUp() {",
            "        for (int i = 0; i < 10; i--) {",
            "            System.out.println(i);",
            "        }",
            "    }",
            "}"
        ],
        buggyLineIndex: 2,
        correctAnswer: 2,
        hints: [
            "A loop only finishes when its counter makes the condition false.",
            "Follow the counter value and see whether it moves toward or away from the bound.",
            "Check whether the update step moves the counter in the correct direction (i++ instead of i--)."
        ],
        explanation: "Decrementing i when checking i < 10 creates an infinite loop moving away from 10."
    },

    // 6. UNREACHABLE_CODE_AFTER_RETURN (control_flow -> BugHunt)
    {
        id: "q_unreach_01",
        errorType: "UNREACHABLE_CODE_AFTER_RETURN",
        conceptTag: "control_flow",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static int calculate() {",
            "        int a = 5;",
            "        return a * 2;",
            "        System.out.println(\"Done\");",
            "    }",
            "}"
        ],
        buggyLineIndex: 4,
        correctAnswer: 4,
        hints: [
            "A return statement immediately ends the method.",
            "Nothing after return in the same block can run.",
            "Line 5 comes after return and can never be reached."
        ],
        explanation: "Statement after return statement is unreachable."
    },

    // 7. MISSING_BREAK_IN_SWITCH (switch_statements -> DragDrop)
    {
        id: "q_switch_01",
        errorType: "MISSING_BREAK_IN_SWITCH",
        conceptTag: "switch_statements",
        difficulty: "Easy",
        gameType: "DragDrop",
        codeLines: [
            "switch (day) {",
            "    case 1: System.out.println(\"Mon\"); break;",
            "    case 2: System.out.println(\"Tue\"); break;",
            "    default: System.out.println(\"Other\"); break;",
            "}"
        ],
        correctAnswer: [0, 1, 2, 3, 4],
        hints: [
            "In a switch statement, cases require break statements.",
            "Without break, execution falls through to subsequent cases.",
            "Arrange switch cases with proper break termination."
        ],
        explanation: "Switch case statements should include break to prevent fall-through."
    },

    // 8. EMPTY_CONDITIONAL_BODY (statement_structure -> BugHunt)
    {
        id: "q_empty_if_01",
        errorType: "EMPTY_CONDITIONAL_BODY",
        conceptTag: "statement_structure",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void check(int x) {",
            "        if (x > 10);",
            "        {",
            "            System.out.println(\"X is greater\");",
            "        }",
            "    }",
            "}"
        ],
        buggyLineIndex: 2,
        correctAnswer: 2,
        hints: [
            "A semicolon right after an if condition terminates the statement.",
            "Look at what the condition actually controls.",
            "The semicolon on line 3 makes the if body empty."
        ],
        explanation: "Semicolon immediately after if condition creates an empty conditional body."
    },

    // 9. SELF_ASSIGNMENT (assignment_logic -> BugHunt)
    {
        id: "q_self_assign_01",
        errorType: "SELF_ASSIGNMENT",
        conceptTag: "assignment_logic",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void setAge(int userAge) {",
            "        int age = 0;",
            "        age = age;",
            "    }",
            "}"
        ],
        buggyLineIndex: 3,
        correctAnswer: 3,
        hints: [
            "An assignment stores the right-hand value into the left variable.",
            "Compare both sides of line 4.",
            "Assigning age to age changes nothing; userAge was likely intended."
        ],
        explanation: "Line 4 assigns variable to itself (age = age) instead of userAge."
    },

    // 10. ALWAYS_TRUE_OR_CONDITION (boolean_logic -> DragDrop)
    {
        id: "q_bool_or_01",
        errorType: "ALWAYS_TRUE_OR_CONDITION",
        conceptTag: "boolean_logic",
        difficulty: "Easy",
        gameType: "DragDrop",
        codeLines: [
            "public class Main {",
            "    public static boolean isValid(int x) {",
            "        return (x != 5 && x != 10);",
            "    }",
            "}"
        ],
        correctAnswer: [0, 1, 2, 3, 4],
        hints: [
            "An OR condition with != can easily become tautological.",
            "Checking x != 5 || x != 10 is true for every number.",
            "Combine range checks with && instead of ||."
        ],
        explanation: "Using && ensures the value is checked correctly against both boundaries."
    },

    // 11. IGNORED_STRING_METHOD_RESULT (immutable_strings -> CodeTrace)
    {
        id: "q_immutable_01",
        errorType: "IGNORED_STRING_METHOD_RESULT",
        conceptTag: "immutable_strings",
        difficulty: "Easy",
        gameType: "CodeTrace",
        codeLines: [
            "String name = \"alice\";",
            "name.toUpperCase();",
            "System.out.println(name);"
        ],
        correctAnswer: "alice",
        hints: [
            "Strings in Java are immutable.",
            "Methods like toUpperCase() return a NEW String without modifying the original.",
            "Since the result wasn't assigned back to 'name', what will 'name' print?"
        ],
        explanation: "Strings are immutable; name remains 'alice' because toUpperCase() result was ignored."
    },

    // 12. DIVISION_BY_ZERO_LITERAL (arithmetic_operations -> BugHunt)
    {
        id: "q_div_zero_01",
        errorType: "DIVISION_BY_ZERO_LITERAL",
        conceptTag: "arithmetic_operations",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static int divide() {",
            "        int total = 100;",
            "        return total / 0;",
            "    }",
            "}"
        ],
        buggyLineIndex: 3,
        correctAnswer: 3,
        hints: [
            "Dividing an integer by zero stops the program.",
            "Look at the right side of the division operator.",
            "Line 4 divides by literal 0."
        ],
        explanation: "Integer division by zero throws ArithmeticException."
    },

    // 13. CONSTANT_FALSE_LOOP_CONDITION (loop_initialization -> CodeTrace)
    {
        id: "q_loop_init_01",
        errorType: "CONSTANT_FALSE_LOOP_CONDITION",
        conceptTag: "loop_initialization",
        difficulty: "Easy",
        gameType: "CodeTrace",
        codeLines: [
            "int count = 10;",
            "int sum = 0;",
            "while (count < 5) {",
            "    sum += count;",
            "    count++;",
            "}",
            "System.out.println(sum);"
        ],
        correctAnswer: "0",
        hints: [
            "A while condition is checked BEFORE the loop runs.",
            "Plug in count = 10 into (count < 5).",
            "How many times will the loop body execute?"
        ],
        explanation: "Condition count < 5 is initially false when count = 10, so loop body never executes and sum remains 0."
    },

    // 14. DUPLICATE_IF_ELSE_CONDITION (conditional_logic -> DragDrop)
    {
        id: "q_dup_if_01",
        errorType: "DUPLICATE_IF_ELSE_CONDITION",
        conceptTag: "conditional_logic",
        difficulty: "Medium",
        gameType: "DragDrop",
        codeLines: [
            "if (score > 80) {",
            "    System.out.println(\"High\");",
            "} else if (score > 50) {",
            "    System.out.println(\"Medium\");",
            "} else {",
            "    System.out.println(\"Low\");",
            "}"
        ],
        correctAnswer: [0, 1, 2, 3, 4, 5, 6],
        hints: [
            "In an if-else chain, each branch should test a unique condition.",
            "Avoid duplicating conditions in subsequent else-if branches.",
            "Structure conditional chains logically."
        ],
        explanation: "Ensure distinct conditional evaluation across if/else-if branches."
    },

    // 15. WHILE_VARIABLE_NOT_UPDATED (loop_termination -> BugHunt)
    {
        id: "q_while_upd_01",
        errorType: "WHILE_VARIABLE_NOT_UPDATED",
        conceptTag: "loop_termination",
        difficulty: "Easy",
        gameType: "BugHunt",
        codeLines: [
            "public class Main {",
            "    public static void printNumbers() {",
            "        int i = 0;",
            "        while (i < 5) {",
            "            System.out.println(i);",
            "        }",
            "    }",
            "}"
        ],
        buggyLineIndex: 3,
        correctAnswer: 3,
        hints: [
            "A while loop needs to update its loop counter variable inside the body.",
            "Check if 'i' is modified inside the loop.",
            "Without updating 'i', (i < 5) remains true forever."
        ],
        explanation: "The variable 'i' is never incremented inside the while loop, causing an infinite loop."
    }
];

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB Atlas. Seeding all 15 error types...');
        
        await QuestionBank.deleteMany({});
        console.log('Cleared existing QuestionBank collection.');
        
        await QuestionBank.insertMany(questionsData);
        console.log(`Successfully seeded ${questionsData.length} questions for all 15 error types into MongoDB Atlas!`);
        
        process.exit(0);
    })
    .catch(err => {
        console.error('Seeding failed:', err);
        process.exit(1);
    });
