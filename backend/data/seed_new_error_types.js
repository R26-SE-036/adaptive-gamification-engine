/**
 * Questions for the eleven mistakes Code Coach learned to find in its 30-type
 * upgrade.
 *
 *     node data/seed_new_error_types.js            # validate only
 *     node data/seed_new_error_types.js --apply
 *
 * ============================ WHY THESE EXIST ============================
 * Code Coach now reports eleven more mistakes - a loop that stops one element
 * early, a running total reset inside its loop, an else-if that can never run
 * and eight more. Each maps onto one of the fourteen concepts that already
 * exist, so the engine could always serve a game for them; but every question
 * in the bank was written about one of the older mistakes, so a student sent
 * here for "running total reset inside the loop" practised loop initialisation
 * through a different bug.
 *
 * Each new mistake gets one question at every level in its concept's home
 * format (CONCEPT_GAME_MAPPING), so it is reachable wherever the student is on
 * the ladder, and one CodeFix at Intermediate.
 *
 *     mistake                          concept               home format
 *     LOOP_SKIPS_LAST_ELEMENT          loop_boundaries       BugHunt
 *     INDEX_PLUS_ONE_OUT_OF_BOUNDS     array_indexing        BugHunt
 *     WRONG_LOOP_VARIABLE_IN_INDEX     array_indexing        BugHunt
 *     NESTED_LOOP_WRONG_COUNTER        loop_control          BugHunt
 *     LOOP_COUNTER_CHANGED_IN_BODY     loop_control          BugHunt
 *     EARLY_RETURN_IN_LOOP             control_flow          BugHunt
 *     MISLEADING_INDENTATION_NO_BRACES statement_structure   BugHunt
 *     ACCUMULATOR_RESET_INSIDE_LOOP    loop_initialization   CodeTrace
 *     WRONG_EXTREME_INITIAL_VALUE      loop_initialization   CodeTrace
 *     UNREACHABLE_ELSE_IF_ORDER        conditional_logic     DragDrop
 *     NON_SHORT_CIRCUIT_OPERATOR       boolean_logic         DragDrop
 *
 * The two DragDrop mistakes are about ORDER, which is what that format asks
 * for: tests that return must run from the highest boundary down, and a check
 * must come before the use it protects - which is exactly what && does inside
 * one condition and & does not.
 *
 * Levels follow seed_elementary_expert.js: Elementary is a barer snippet,
 * Expert puts the mistake in code doing something real, next to correct
 * lines that look like it.
 * =========================================================================
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('../config/dns').applyDnsOverride();

const QuestionBank = require('../models/QuestionBank');
const { normaliseJavaLine } = require('../services/gradingService');
const {
    CONCEPT_TAGS,
    DIFFICULTY_LEVELS,
    ERROR_TYPES,
    GAME_TYPES,
    CONCEPT_GAME_MAPPING
} = require('../config/constants');

function bugHunt(id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, hints, explanation) {
    return { id, errorType, conceptTag, difficulty, gameType: 'BugHunt', codeLines, buggyLineIndex,
        correctAnswer: buggyLineIndex, hints, explanation };
}

function codeTrace(id, errorType, conceptTag, difficulty, codeLines, correctAnswer, hints, explanation) {
    return { id, errorType, conceptTag, difficulty, gameType: 'CodeTrace', codeLines, correctAnswer, hints, explanation };
}

/** `correctOrder` is the finished code, `shuffle` how it is shown; both stored fields are derived. */
function dragDrop(id, errorType, conceptTag, difficulty, correctOrder, shuffle, hints, explanation) {
    return { id, errorType, conceptTag, difficulty, gameType: 'DragDrop',
        codeLines: shuffle.map((source) => correctOrder[source]),
        correctAnswer: correctOrder.map((_, position) => shuffle.indexOf(position)),
        hints, explanation, _correctOrder: correctOrder };
}

/** Type the corrected line: `correctAnswer` lists every accepted form. */
function codeFix(id, errorType, conceptTag, difficulty, codeLines, buggyLineIndex, correctAnswer, hints, explanation) {
    return { id, errorType, conceptTag, difficulty, gameType: 'CodeFix', codeLines, buggyLineIndex, correctAnswer,
        hints, explanation };
}

const QUESTIONS = [
    /* ══════════ LOOP_SKIPS_LAST_ELEMENT · loop_boundaries · BugHunt ══════════ */

    bugHunt('q_ne_skip_last_b1', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Beginner',
        ['int[] marks = {70, 85, 90};',
         'int total = 0;',
         'for (int i = 0; i < marks.length - 1; i++) {',
         '    total += marks[i];',
         '}',
         'System.out.println(total);'],
        2,
        ['How many marks are there, and how many does the loop add?',
         'The last valid index is marks.length - 1. Is it ever reached?',
         'Look at where the loop stops.'],
        'i < marks.length - 1 stops before the last index, so 90 is never added. i < marks.length visits every element.'),

    bugHunt('q_ne_skip_last_e1', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Elementary',
        ['String[] names = {"Ana", "Ben", "Cal"};',
         'for (int i = 0; i < names.length - 1; i++) {',
         '    System.out.println(names[i]);',
         '}'],
        1,
        ['Three names - how many lines are printed?',
         'Which index does Cal sit at?',
         'Compare that index with the condition.'],
        'Cal is at index 2, and i < names.length - 1 stops the loop at i = 1, so Cal is never printed.'),

    bugHunt('q_ne_skip_last_i1', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Intermediate',
        ['int[] temps = {31, 29, 35, 33};',
         'int hotDays = 0;',
         'for (int i = 0; i < temps.length - 1; i++) {',
         '    if (temps[i] > 30) {',
         '        hotDays++;',
         '    }',
         '}',
         'System.out.println(hotDays + " hot days");'],
        2,
        ['Count the hot days by hand first.',
         'Does the loop ever look at 33?',
         'The body only reads temps[i], never a neighbour.'],
        'The body uses only temps[i], so there is no reason to stop early: the last day is skipped and 3 hot days are reported as 2.'),

    bugHunt('q_ne_skip_last_a1', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Advanced',
        ['int[] a = {4, 8, 15, 16};',
         'int rises = 0;',
         'for (int i = 0; i < a.length - 1; i++) {',
         '    if (a[i + 1] > a[i]) rises++;',
         '}',
         'int sum = 0;',
         'for (int i = 0; i < a.length - 1; i++) {',
         '    sum += a[i];',
         '}',
         'System.out.println(rises + " " + sum);'],
        6,
        ['The two loops have the same header. Do they need the same header?',
         'Which loop reads a[i + 1]?',
         'Stopping one early is right only when the body looks one ahead.'],
        'The first loop compares neighbours, so it must stop at length - 1. The second only adds a[i], so the same bound makes it skip 16.'),

    bugHunt('q_ne_skip_last_x1', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Expert',
        ['static int countVowels(String word) {',
         '    int count = 0;',
         '    for (int i = 0; i < word.length() - 1; i++) {',
         '        char c = Character.toLowerCase(word.charAt(i));',
         '        if ("aeiou".indexOf(c) >= 0) {',
         '            count++;',
         '        }',
         '    }',
         '    return count;',
         '}'],
        2,
        ['Try it with "banana". How many vowels should it find?',
         'Which character is never read?',
         'A String has valid positions 0 to length() - 1.'],
        'length() - 1 as a strict bound skips the last character, so "banana" counts 2 vowels instead of 3. Words that do not end in a vowel hide the bug.'),

    /* ══════════ INDEX_PLUS_ONE_OUT_OF_BOUNDS · array_indexing · BugHunt ══════════ */

    bugHunt('q_ne_plus_one_b1', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Beginner',
        ['int[] steps = {3, 5, 9};',
         'for (int i = 0; i < steps.length; i++) {',
         '    int gap = steps[i + 1] - steps[i];',
         '    System.out.println(gap);',
         '}'],
        1,
        ['Each gap needs two neighbouring values.',
         'On the last pass, what is i + 1?',
         'The body is right; the loop has to stop one pass sooner.'],
        'Three values have only two gaps. On the last pass i + 1 is 3, past the end, so the loop must run while i < steps.length - 1.'),

    bugHunt('q_ne_plus_one_e1', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Elementary',
        ['int[] v = {1, 2, 3, 4};',
         'for (int i = 0; i <= v.length - 1; i++) {',
         '    System.out.println(v[i] + v[i + 1]);',
         '}'],
        1,
        ['i <= v.length - 1 is the same as i < v.length.',
         'What does v[i + 1] read when i is 3?',
         'The body reads one ahead, so the loop must stop one sooner.'],
        'The bound lets i reach the last index, and v[i + 1] then reads v[4], which does not exist.'),

    bugHunt('q_ne_plus_one_i1', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Intermediate',
        ['char[] word = {\'l\', \'o\', \'o\', \'p\'};',
         'boolean doubled = false;',
         'for (int i = 0; i < word.length; i++) {',
         '    if (word[i] == word[i + 1]) {',
         '        doubled = true;',
         '    }',
         '}',
         'System.out.println(doubled);'],
        2,
        ['The double o is found at i = 1. Does the loop stop there?',
         'What happens on the pass where i is 3?',
         'Comparing neighbours means one fewer comparison than letters.'],
        'Finding the pair does not end the loop; at i = 3 the comparison reads word[4] and throws. The loop should run while i < word.length - 1.'),

    bugHunt('q_ne_plus_one_a1', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Advanced',
        ['int[] prices = {10, 12, 11, 15};',
         'int rises = 0;',
         'for (int i = 0; i < prices.length; i++) {',
         '    if (prices[i] > prices[i - 1]) {',
         '        rises++;',
         '    }',
         '}',
         'System.out.println(rises);'],
        2,
        ['This time the body looks one BEHIND.',
         'What is i - 1 on the first pass?',
         'The first price has nothing before it to compare with.'],
        'prices[i - 1] on the first pass is prices[-1], which throws. Looking back means starting at i = 1.'),

    bugHunt('q_ne_plus_one_x1', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Expert',
        ['static boolean isSorted(int[] a) {',
         '    for (int i = 0; i < a.length; i++) {',
         '        if (a[i] > a[i + 1]) {',
         '            return false;',
         '        }',
         '    }',
         '    return true;',
         '}'],
        1,
        ['Try an unsorted array, then a sorted one.',
         'An unsorted array returns early. A sorted one reaches the last pass.',
         'How many neighbouring pairs does an array of n have?'],
        'Unsorted input returns false before the end, which hides the bug; sorted input reaches i = a.length - 1 and reads a[a.length]. The loop should run while i < a.length - 1.'),

    /* ══════════ WRONG_LOOP_VARIABLE_IN_INDEX · array_indexing · BugHunt ══════════ */

    bugHunt('q_ne_wrong_var_b1', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Beginner',
        ['int[][] grid = {{1, 2}, {3, 4}};',
         'int sum = 0;',
         'for (int r = 0; r < grid.length; r++) {',
         '    for (int c = 0; c < grid[r].length; c++) {',
         '        sum += grid[r][r];',
         '    }',
         '}',
         'System.out.println(sum);'],
        4,
        ['The inner loop counts columns with c.',
         'Is c used anywhere in the body?',
         'Which cell does grid[r][r] read on every pass?'],
        'grid[r][r] reads the same cell on every column, so the sum is 1+1+4+4 instead of 1+2+3+4. The column index must be c.'),

    bugHunt('q_ne_wrong_var_e1', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Elementary',
        ['int[] a = {5, 1, 4};',
         'int[] b = {2, 7, 3};',
         'for (int i = 0; i < a.length; i++) {',
         '    for (int j = 0; j < b.length; j++) {',
         '        System.out.println(a[i] + b[i]);',
         '    }',
         '}'],
        4,
        ['The inner loop walks through b with j.',
         'Which counter indexes b in the body?',
         'Each a[i] should be paired with every b[j].'],
        'b[i] pairs each a only with the b in the same position, three times over. Using b[j] pairs it with every element of b.'),

    bugHunt('q_ne_wrong_var_i1', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Intermediate',
        ['int[] nums = {4, 7, 4, 9};',
         'int pairs = 0;',
         'for (int i = 0; i < nums.length; i++) {',
         '    for (int j = i + 1; j < nums.length; j++) {',
         '        if (nums[i] == nums[i]) {',
         '            pairs++;',
         '        }',
         '    }',
         '}',
         'System.out.println(pairs);'],
        4,
        ['A value always equals itself.',
         'The inner loop starts j after i for a reason - is j used?',
         'One side of the comparison should use the inner counter.'],
        'nums[i] == nums[i] is always true, so every pair is counted (6) instead of only equal ones (1). The comparison must be nums[i] == nums[j].'),

    bugHunt('q_ne_wrong_var_a1', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Advanced',
        ['String[] words = {"cat", "dog", "cow"};',
         'for (int i = 0; i < words.length; i++) {',
         '    int count = 0;',
         '    for (int j = 0; j < words[i].length(); j++) {',
         '        if (words[i].charAt(i) == \'o\') {',
         '            count++;',
         '        }',
         '    }',
         '    System.out.println(words[i] + ": " + count);',
         '}'],
        4,
        ['words[i] is right: it picks the word.',
         'Which character of the word is checked on each pass of j?',
         'Nothing throws, but "dog" reports 3 and "cow" reports none.'],
        'charAt(i) checks one fixed position of each word, three times. The inner loop walks the letters, so it must be charAt(j).'),

    bugHunt('q_ne_wrong_var_x1', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Expert',
        ['static int[][] transpose(int[][] m) {',
         '    int[][] t = new int[m[0].length][m.length];',
         '    for (int r = 0; r < m.length; r++) {',
         '        for (int c = 0; c < m[0].length; c++) {',
         '            t[c][r] = m[r][r];',
         '        }',
         '    }',
         '    return t;',
         '}'],
        4,
        ['t[c][r] is the swapped position, which is right.',
         'Which cell of m is copied there?',
         'A transpose moves m[r][c] to t[c][r].'],
        'm[r][r] copies the diagonal into every column, and throws on a matrix with more rows than columns. The source cell is m[r][c].'),

    /* ══════════ NESTED_LOOP_WRONG_COUNTER · loop_control · BugHunt ══════════ */

    bugHunt('q_ne_nested_b1', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Beginner',
        ['for (int i = 1; i <= 3; i++) {',
         '    for (int j = 1; j <= 3; i++) {',
         '        System.out.print(i * j + " ");',
         '    }',
         '    System.out.println();',
         '}'],
        1,
        ['Which variable does the inner loop declare?',
         'Which variable does it increase?',
         'If j never changes, can j <= 3 ever become false?'],
        'The inner loop declares j but increases i, so j stays 1 and the inner loop never ends. Its update must be j++.'),

    bugHunt('q_ne_nested_e1', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Elementary',
        ['for (int row = 0; row < 3; row++) {',
         '    for (int col = 0; row < 4; col++) {',
         '        System.out.print("*");',
         '    }',
         '}'],
        1,
        ['The inner loop counts with col.',
         'Which variable does its condition test?',
         'Does anything in the inner loop change row?'],
        'The inner condition tests row, which the inner loop never changes, so it prints stars forever. It must test col < 4.'),

    bugHunt('q_ne_nested_i1', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Intermediate',
        ['int[][] seats = new int[3][4];',
         'for (int r = 0; r < seats.length; r++) {',
         '    for (int c = 0; c < seats[r].length; r++) {',
         '        seats[r][c] = r * 10 + c;',
         '    }',
         '}',
         'System.out.println(seats[2][3]);'],
        2,
        ['Follow c through the inner loop. Does it ever change?',
         'What does the inner loop do to r instead?',
         'Which index runs out first?'],
        'The inner update moves r, so c stays 0 and r runs past the last row: seats[3] throws. The inner update must be c++.'),

    bugHunt('q_ne_nested_a1', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Advanced',
        ['int[] a = {3, 1, 2};',
         'for (int pass = 0; pass < a.length - 1; pass++) {',
         '    for (int k = 0; k < a.length - 1 - pass; pass++) {',
         '        if (a[k] > a[k + 1]) {',
         '            int t = a[k]; a[k] = a[k + 1]; a[k + 1] = t;',
         '        }',
         '    }',
         '}',
         'System.out.println(java.util.Arrays.toString(a));'],
        2,
        ['This is a bubble sort. The swap is correct.',
         'Which counter should move along the array inside a pass?',
         'Two loops, two counters - each header should change its own.'],
        'The inner header updates pass instead of k, so k stays 0 and only the first pair is ever compared: the array ends as [1, 3, 2]. The inner update must be k++.'),

    bugHunt('q_ne_nested_x1', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Expert',
        ['static int countPairs(int[] a, int target) {',
         '    int count = 0;',
         '    for (int i = 0; i < a.length; i++) {',
         '        for (int j = i + 1; i < a.length; j++) {',
         '            if (a[i] + a[j] == target) {',
         '                count++;',
         '            }',
         '        }',
         '    }',
         '    return count;',
         '}'],
        3,
        ['Starting j at i + 1 is right: each pair is counted once.',
         'Read the inner condition slowly.',
         'What stops the inner loop when j reaches the end?'],
        'The inner condition tests i, which the inner loop never changes, so j runs past the end and a[j] throws. It must be j < a.length.'),

    /* ══════════ LOOP_COUNTER_CHANGED_IN_BODY · loop_control · BugHunt ══════════ */

    bugHunt('q_ne_counter_b1', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Beginner',
        ['int[] scores = {5, 8, 3, 9};',
         'int total = 0;',
         'for (int i = 0; i < scores.length; i++) {',
         '    total += scores[i];',
         '    i++;',
         '}',
         'System.out.println(total);'],
        4,
        ['How many times should the loop add a score?',
         'How much does i grow on each pass?',
         'The header already moves i on.'],
        'i grows twice per pass - once in the body and once in the header - so only scores[0] and scores[2] are added: 8 instead of 25.'),

    bugHunt('q_ne_counter_e1', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Elementary',
        ['for (int i = 0; i < 5; i++) {',
         '    System.out.println(i);',
         '    i = i + 1;',
         '}'],
        2,
        ['Which numbers does this print?',
         'Where else is i changed?',
         'Only the header should step the counter.'],
        'The body adds 1 and the header adds another, so only 0, 2 and 4 are printed.'),

    bugHunt('q_ne_counter_i1', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Intermediate',
        ['String s = "a1b2c3";',
         'int digits = 0;',
         'for (int i = 0; i < s.length(); i++) {',
         '    if (Character.isDigit(s.charAt(i))) {',
         '        digits++;',
         '    }',
         '    i++;',
         '}',
         'System.out.println(digits);'],
        6,
        ['Which characters does the loop actually look at?',
         'List the values i takes.',
         'The digits sit at the odd positions.'],
        'The extra i++ makes the loop read only positions 0, 2 and 4 - the letters - so it reports 0 digits instead of 3.'),

    bugHunt('q_ne_counter_a1', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Advanced',
        ['int[] data = {2, 4, 6, 8, 10};',
         'int atEvenIndex = 0;',
         'for (int i = 0; i < data.length; i += 2) {',
         '    atEvenIndex += data[i];',
         '}',
         'int sum = 0;',
         'for (int i = 0; i < data.length; i++) {',
         '    sum += data[i++];',
         '}',
         'System.out.println(atEvenIndex + " " + sum);'],
        7,
        ['Stepping by 2 is fine when the header says so.',
         'Which loop is meant to visit every element?',
         'i++ inside an index still changes i.'],
        'The first loop skips on purpose, in its header. In the second, data[i++] moves i as well as the header does, so sum misses every other element.'),

    bugHunt('q_ne_counter_x1', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Expert',
        ['static String removeSpaces(String s) {',
         '    StringBuilder out = new StringBuilder();',
         '    for (int i = 0; i < s.length(); i++) {',
         '        if (s.charAt(i) == \' \') {',
         '            i++;',
         '        }',
         '        out.append(s.charAt(i));',
         '    }',
         '    return out.toString();',
         '}'],
        4,
        ['It works for "a b". Try "a  b" and "ab ".',
         'Skipping a space by moving i assumes the next character is not a space.',
         'What should happen to a space instead of jumping over it?'],
        'i++ jumps to the next character without checking it, so a second space is kept and a trailing space reads past the end. A space should simply not be appended (continue).'),

    /* ══════════ EARLY_RETURN_IN_LOOP · control_flow · BugHunt ══════════ */

    bugHunt('q_ne_early_return_b1', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Beginner',
        ['static boolean contains(int[] a, int key) {',
         '    for (int x : a) {',
         '        if (x == key) {',
         '            return true;',
         '        } else {',
         '            return false;',
         '        }',
         '    }',
         '    return false;',
         '}'],
        5,
        ['Try contains({4, 8, 15}, 15).',
         'How many elements are checked before the method returns?',
         'When can you be sure the key is NOT there?'],
        'The else returns on the first element, so only a[0] is ever checked. "Not found" is only known after the loop, which the last return already handles.'),

    bugHunt('q_ne_early_return_e1', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Elementary',
        ['int[] a = {4, 8, 15};',
         'boolean found = false;',
         'for (int x : a) {',
         '    if (x == 15) found = true;',
         '    break;',
         '}',
         'System.out.println(found);'],
        4,
        ['How many passes does this loop make?',
         'Which statement is not inside the if?',
         'Leave the loop only once 15 has been found.'],
        'break runs on every pass, so the loop stops after the first element and prints false. It belongs inside the if.'),

    bugHunt('q_ne_early_return_i1', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Intermediate',
        ['static int indexOf(String[] names, String target) {',
         '    for (int i = 0; i < names.length; i++) {',
         '        if (names[i].equals(target)) {',
         '            return i;',
         '        }',
         '        return -1;',
         '    }',
         '    return -1;',
         '}'],
        5,
        ['There are two return -1 lines. Are both needed?',
         'Which one runs on the first pass that misses?',
         'Not found means: checked every name.'],
        'The return -1 inside the loop ends the search after one miss, so any name after the first is never found. Only the one after the loop is right.'),

    bugHunt('q_ne_early_return_a1', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Advanced',
        ['static boolean allPositive(int[] a) {',
         '    for (int x : a) {',
         '        if (x <= 0) {',
         '            return false;',
         '        } else {',
         '            return true;',
         '        }',
         '    }',
         '    return true;',
         '}'],
        5,
        ['Try {3, -1, 4}.',
         'One bad value is enough to answer false. Is one good value enough to answer true?',
         'True needs every element checked.'],
        'One positive first element returns true without looking at the rest, so {3, -1, 4} counts as all positive. The else must go; the return after the loop answers true.'),

    bugHunt('q_ne_early_return_x1', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Expert',
        ['static String findUser(String[] users, String prefix) {',
         '    if (prefix.isEmpty()) {',
         '        return null;',
         '    }',
         '    for (String u : users) {',
         '        if (u.startsWith(prefix)) {',
         '            return u;',
         '        } else if (u.isEmpty()) {',
         '            continue;',
         '        } else {',
         '            return null;',
         '        }',
         '    }',
         '    return null;',
         '}'],
        10,
        ['Three lines return null. Which ones are about the whole list?',
         'Skipping empty names is fine.',
         'What happens to the second user if the first does not match?'],
        'The final else gives up at the first non-matching user, so only users[0] can ever be found. The guard before the loop and the return after it are right.'),

    /* ══════════ MISLEADING_INDENTATION_NO_BRACES · statement_structure · BugHunt ══════════ */

    bugHunt('q_ne_indent_b1', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Beginner',
        ['int score = 40;',
         'if (score >= 50)',
         '    System.out.println("Passed");',
         '    System.out.println("Certificate sent");'],
        3,
        ['A score of 40 should print nothing.',
         'Without braces, how many statements does the if control?',
         'Indentation does not change what Java runs.'],
        'Without braces only the first line belongs to the if. The certificate line is indented to look guarded, but it always runs.'),

    bugHunt('q_ne_indent_e1', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Elementary',
        ['int count = 0;',
         'for (int i = 0; i < 3; i++)',
         '    System.out.println("tick");',
         '    count++;',
         'System.out.println(count);'],
        3,
        ['How many times is "tick" printed?',
         'And how many times is count increased?',
         'A for without braces repeats one statement.'],
        'Only the println is repeated. count++ runs once after the loop, so 1 is printed instead of 3.'),

    bugHunt('q_ne_indent_i1', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Intermediate',
        ['int balance = 20;',
         'int price = 30;',
         'if (balance >= price)',
         '    balance -= price;',
         'else',
         '    System.out.println("Not enough money");',
         '    price = 0;',
         'System.out.println(balance + " " + price);'],
        6,
        ['An else without braces controls one statement too.',
         'Would price be reset if the purchase went through?',
         'Line up each statement with the branch Java gives it.'],
        'price = 0 looks like part of the else, but it runs after the whole if/else whatever happens. Braces around the else would make it belong there.'),

    bugHunt('q_ne_indent_a1', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Advanced',
        ['int n = 5;',
         'int steps = 0;',
         'while (n > 1)',
         '    n = n / 2;',
         '    steps++;',
         'System.out.println(steps);'],
        4,
        ['How many times does n get halved?',
         'How many times does steps grow?',
         'A while without braces repeats one statement.'],
        'The loop repeats only n = n / 2. steps++ runs once afterwards, so 1 is printed instead of 2.'),

    bugHunt('q_ne_indent_x1', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Expert',
        ['static void withdraw(int[] account, int amount) {',
         '    if (amount <= 0) {',
         '        return;',
         '    }',
         '    if (account[0] >= amount)',
         '        account[0] -= amount;',
         '        System.out.println("Withdrew " + amount);',
         '    System.out.println("Balance: " + account[0]);',
         '}'],
        6,
        ['The first if has braces; the second does not.',
         'What is printed when the balance is too low?',
         'Which line is indented as if it were guarded?'],
        'The "Withdrew" message runs even when nothing was taken out, because only the subtraction belongs to the braceless if.'),

    /* ══════════ ACCUMULATOR_RESET_INSIDE_LOOP · loop_initialization · CodeTrace ══════════ */

    codeTrace('q_ne_acc_reset_b1', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Beginner',
        ['int[] a = {2, 3, 4};',
         'int sum = 0;',
         'for (int i = 0; i < a.length; i++) {',
         '    sum = 0;',
         '    sum += a[i];',
         '}',
         'System.out.println(sum);'],
        '4',
        ['What does sum hold at the start of every pass?',
         'Only one pass matters in the end.',
         'Which value is added on the last pass?'],
        'sum is set back to 0 on every pass, so it ends holding only the last element. The reset belongs before the loop.'),

    codeTrace('q_ne_acc_reset_e1', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Elementary',
        ['int count = 0;',
         'for (int i = 1; i <= 5; i++) {',
         '    count = 0;',
         '    count++;',
         '}',
         'System.out.println(count);'],
        '1',
        ['The loop runs five times.',
         'What is count just before count++ each time?',
         'Look at the last pass only.'],
        'Each pass resets count to 0 and adds 1, so it never gets past 1.'),

    codeTrace('q_ne_acc_reset_i1', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Intermediate',
        ['String[] parts = {"co", "de", "rs"};',
         'String word = "";',
         'for (String p : parts) {',
         '    word = "";',
         '    word += p;',
         '}',
         'System.out.println(word);'],
        'rs',
        ['Text can be built up like a number.',
         'What is word at the start of each pass?',
         'Which part is added last?'],
        'Clearing word inside the loop throws away what was built, so only the last part survives. Building "coders" needs the reset before the loop.'),

    codeTrace('q_ne_acc_reset_a1', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Advanced',
        ['int[] f = {2, 3, 4};',
         'int product = 1;',
         'for (int i = 0; i < f.length; i++) {',
         '    product = 1;',
         '    product *= f[i];',
         '}',
         'System.out.println(product * 10);'],
        '40',
        ['A product starts at 1, not 0 - that part is right.',
         'Where is it started?',
         'Trace product through the last pass, then multiply by 10.'],
        'Resetting product to 1 inside the loop keeps only the last factor, 4, so 40 is printed instead of 240.'),

    codeTrace('q_ne_acc_reset_x1', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Expert',
        ['int[][] sales = {{1, 2}, {3, 4}, {5, 6}};',
         'int grand = 0;',
         'for (int r = 0; r < sales.length; r++) {',
         '    grand = 0;',
         '    for (int c = 0; c < sales[r].length; c++) {',
         '        grand += sales[r][c];',
         '    }',
         '}',
         'System.out.println(grand);'],
        '11',
        ['A reset per row is right for a ROW total.',
         'Is grand a row total or a total of everything?',
         'Which row is left when the loops end?'],
        'Resetting grand at the start of each row turns the grand total into the last row\'s total, 5 + 6. It should be set to 0 once, before the outer loop.'),

    /* ══════════ WRONG_EXTREME_INITIAL_VALUE · loop_initialization · CodeTrace ══════════ */

    codeTrace('q_ne_extreme_b1', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Beginner',
        ['int[] t = {7, 3, 9};',
         'int min = 0;',
         'for (int x : t) {',
         '    if (x < min) {',
         '        min = x;',
         '    }',
         '}',
         'System.out.println(min);'],
        '0',
        ['Is any value in t smaller than 0?',
         'Does min ever change?',
         'Where does min start?'],
        'Starting at 0, no positive value is ever smaller, so the smallest element 3 is never found. min should start at t[0].'),

    codeTrace('q_ne_extreme_e1', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Elementary',
        ['int[] d = {-4, -9, -2};',
         'int max = 0;',
         'for (int x : d) {',
         '    if (x > max) max = x;',
         '}',
         'System.out.println(max);'],
        '0',
        ['Every value here is negative.',
         'Is any of them greater than the starting value?',
         'The answer is not one of the numbers in the array.'],
        'With all values below 0, the starting 0 beats them all and max reports a number that is not in the array. Start from d[0].'),

    codeTrace('q_ne_extreme_i1', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Intermediate',
        ['double[] prices = {4.5, 2.25, 8.0};',
         'double cheapest = 0.0;',
         'for (double p : prices) {',
         '    if (p < cheapest) cheapest = p;',
         '}',
         'System.out.println(cheapest);'],
        '0.0',
        ['A double prints with a decimal point.',
         'Is any price below the starting value?',
         'What does cheapest still hold after the loop?'],
        'No price is below 0.0, so cheapest never changes and prints 0.0. Starting from prices[0] (or a very large value) finds 2.25.'),

    codeTrace('q_ne_extreme_a1', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Advanced',
        ['int[] temps = {-3, -7, -1, -5};',
         'int best = 0;',
         'int bestDay = -1;',
         'for (int i = 0; i < temps.length; i++) {',
         '    if (temps[i] > best) {',
         '        best = temps[i];',
         '        bestDay = i;',
         '    }',
         '}',
         'System.out.println(bestDay);'],
        '-1',
        ['bestDay only changes when a new best is found.',
         'Is any temperature above 0?',
         'What did bestDay start as?'],
        'Every temperature is below the starting best of 0, so no day is ever chosen and -1 is printed. Starting from temps[0] picks day 2.'),

    codeTrace('q_ne_extreme_x1', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Expert',
        ['int[] scores = {12, 40, 7, 25};',
         'int highest = Integer.MIN_VALUE;',
         'int lowest = 0;',
         'for (int s : scores) {',
         '    if (s > highest) highest = s;',
         '    if (s < lowest) lowest = s;',
         '}',
         'System.out.println(highest - lowest);'],
        '40',
        ['One of the two starting values is safe and one is not.',
         'Can any score beat a lowest of 0?',
         'Work out highest and lowest separately, then subtract.'],
        'highest starts at the smallest int, so any score beats it: 40. lowest starts at 0, which no score is below, so the range prints as 40 instead of 33.'),

    /* ══════════ UNREACHABLE_ELSE_IF_ORDER · conditional_logic · DragDrop ══════════ */

    dragDrop('q_ne_else_if_b1', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Beginner',
        ['static String fine(int speed) {',
         '    if (speed > 80) return "big fine";',
         '    if (speed > 60) return "small fine";',
         '    return "no fine";',
         '}'],
        [3, 2, 0, 4, 1],
        ['Each test returns, so the first one that is true wins.',
         'A speed of 90 is also greater than 60.',
         'Test the higher limit first.'],
        'With speed > 60 first, a speed of 90 returns "small fine" and the big fine can never be given. The highest limit has to be tested first.'),

    dragDrop('q_ne_else_if_e1', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Elementary',
        ['static char grade(int mark) {',
         '    if (mark >= 75) return \'A\';',
         '    if (mark >= 65) return \'B\';',
         '    if (mark >= 50) return \'C\';',
         '    return \'F\';',
         '}'],
        [2, 5, 3, 0, 4, 1],
        ['A mark of 80 passes all three tests.',
         'Which grade should 80 get?',
         'Order the tests from the highest boundary down.'],
        'Tested from the highest boundary down, each mark stops at its own grade. Put mark >= 50 first and every pass becomes a C - the A and B lines become unreachable.'),

    dragDrop('q_ne_else_if_i1', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Intermediate',
        ['static String band(double bmi) {',
         '    if (bmi < 18.5) return "under";',
         '    if (bmi < 25) return "normal";',
         '    if (bmi < 30) return "over";',
         '    return "obese";',
         '}'],
        [3, 0, 4, 1, 5, 2],
        ['These tests use <, not >=.',
         'A bmi of 17 is also below 25 and below 30.',
         'With < the smallest boundary goes first.'],
        'For less-than tests the order flips: the smallest boundary first. Testing bmi < 30 first would label everyone under 30 as "over".'),

    dragDrop('q_ne_else_if_a1', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Advanced',
        ['static String medal(int points) {',
         '    if (points >= 90) return "gold";',
         '    if (points >= 75) return "silver";',
         '    if (points >= 60) return "bronze";',
         '    if (points >= 40) return "merit";',
         '    return "none";',
         '}'],
        [4, 6, 1, 3, 0, 5, 2],
        ['Four boundaries - each one has to be reachable.',
         'Which test does 95 pass first if they are out of order?',
         'Highest boundary first, then each lower one.'],
        'Every test catches everything above it too, so they must run from 90 down. Any other order leaves at least one medal unreachable.'),

    dragDrop('q_ne_else_if_x1', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Expert',
        ['static boolean isLeap(int year) {',
         '    if (year % 400 == 0) return true;',
         '    if (year % 100 == 0) return false;',
         '    if (year % 4 == 0) return true;',
         '    return false;',
         '}'],
        [4, 2, 5, 0, 3, 1],
        ['2000 is a leap year; 1900 is not; 2024 is.',
         '2000 is divisible by 400, 100 and 4.',
         'The most specific rule has to be tested first.'],
        '2000 is divisible by 4, 100 and 400, so the most specific test must come first. With % 4 first, 1900 would be a leap year; with % 100 before % 400, 2000 would not be.'),

    /* ══════════ NON_SHORT_CIRCUIT_OPERATOR · boolean_logic · DragDrop ══════════ */

    dragDrop('q_ne_short_circuit_b1', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Beginner',
        ['static int length(String s) {',
         '    if (s == null) return 0;',
         '    return s.length();',
         '}'],
        [2, 0, 3, 1],
        ['Calling a method on null throws.',
         'Which line uses s?',
         'Check first, then use.'],
        'The null check has to run before s.length(). In one condition, s != null && s.length() > 0 does the same: && stops before the call when s is null, while & would make the call anyway.'),

    dragDrop('q_ne_short_circuit_e1', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Elementary',
        ['static boolean startsWithA(String s) {',
         '    if (s == null) return false;',
         '    if (s.isEmpty()) return false;',
         '    return s.charAt(0) == \'A\';',
         '}'],
        [3, 1, 4, 0, 2],
        ['charAt(0) needs at least one character.',
         'isEmpty() needs s not to be null.',
         'Each check protects the line after it.'],
        'null first, then empty, then charAt(0) - each check makes the next safe. That is what s != null && !s.isEmpty() && s.charAt(0) == \'A\' does left to right; with & every part runs and null throws.'),

    dragDrop('q_ne_short_circuit_i1', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Intermediate',
        ['static double average(int[] a) {',
         '    if (a == null) return 0;',
         '    if (a.length == 0) return 0;',
         '    return (double) sum(a) / a.length;',
         '}'],
        [2, 4, 0, 3, 1],
        ['a.length on a null array throws.',
         'Dividing by a.length needs it not to be 0.',
         'Order the checks so each one is safe to run.'],
        'The null check makes a.length safe, and the length check makes the division safe. Written as one condition, a != null && a.length > 0 relies on && stopping early; & would read a.length on null.'),

    dragDrop('q_ne_short_circuit_a1', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Advanced',
        ['static char lastInitial(String[] names) {',
         '    if (names == null) return \'?\';',
         '    if (names.length == 0) return \'?\';',
         '    String last = names[names.length - 1];',
         '    if (last == null) return \'?\';',
         '    if (last.isEmpty()) return \'?\';',
         '    return last.charAt(0);',
         '}'],
        [5, 2, 7, 0, 4, 1, 6, 3],
        ['There are two things that can be null here.',
         'last can only be read once names is known to have an element.',
         'Each line must be safe given only the lines above it.'],
        'Every check guards the next step: names exists, names has an element, last exists, last has a character. Swapping any two would call something on null or read an index that is not there.'),

    dragDrop('q_ne_short_circuit_x1', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Expert',
        ['static String cityOf(Student s) {',
         '    if (s == null) return "unknown";',
         '    Address home = s.getAddress();',
         '    if (home == null) return "unknown";',
         '    String city = home.getCity();',
         '    if (city == null) return "unknown";',
         '    if (city.isBlank()) return "unknown";',
         '    return city.trim();',
         '}'],
        [6, 3, 8, 1, 5, 0, 7, 2, 4],
        ['Follow the chain: student, then address, then city.',
         'Each value is fetched from the one before it.',
         'A value can be checked only after it exists, and must be checked before it is used.'],
        'Each step reads from the last, so each null check sits between fetching a value and using it. In one line that is s != null && s.getAddress() != null && ... - && is what keeps the later calls from running on null.'),

    /* ══════════ CodeFix · Intermediate · one per mistake ══════════ */

    codeFix('q_ne_fix_skip_last', 'LOOP_SKIPS_LAST_ELEMENT', 'loop_boundaries', 'Intermediate',
        ['int[] a = {2, 4, 6};',
         'int sum = 0;',
         'for (int i = 0; i < a.length - 1; i++) {',
         '    sum += a[i];',
         '}',
         'System.out.println(sum);'],
        2,
        ['for (int i = 0; i < a.length; i++) {', 'for (int i = 0; i <= a.length - 1; i++) {'],
        ['Which element is never added?', 'The body only uses a[i].', 'Let the loop reach the last index.'],
        'Nothing in the body looks ahead, so the loop must visit every index up to a.length - 1.'),

    codeFix('q_ne_fix_plus_one', 'INDEX_PLUS_ONE_OUT_OF_BOUNDS', 'array_indexing', 'Intermediate',
        ['int[] h = {3, 7, 5};',
         'for (int i = 0; i < h.length; i++) {',
         '    System.out.println(h[i + 1] - h[i]);',
         '}'],
        1,
        ['for (int i = 0; i < h.length - 1; i++) {', 'for (int i = 0; i + 1 < h.length; i++) {',
         'for (int i = 0; i <= h.length - 2; i++) {'],
        ['The body reads one ahead.', 'On the last pass, h[i + 1] does not exist.', 'Stop the loop one pass sooner.'],
        'Reading h[i + 1] needs i + 1 to be a valid index, so i must stay below h.length - 1.'),

    codeFix('q_ne_fix_wrong_var', 'WRONG_LOOP_VARIABLE_IN_INDEX', 'array_indexing', 'Intermediate',
        ['int[][] m = {{1, 2}, {3, 4}};',
         'for (int r = 0; r < m.length; r++) {',
         '    for (int c = 0; c < m[r].length; c++) {',
         '        System.out.print(m[r][r] + " ");',
         '    }',
         '}'],
        3,
        ['System.out.print(m[r][c] + " ");'],
        ['The inner loop counts columns.', 'Is c used in the body?', 'The second index picks the column.'],
        'm[r][r] prints the same cell for every column; the column index has to be the inner counter c.'),

    codeFix('q_ne_fix_nested', 'NESTED_LOOP_WRONG_COUNTER', 'loop_control', 'Intermediate',
        ['for (int i = 0; i < 3; i++) {',
         '    for (int j = 0; j < 3; i++) {',
         '        System.out.print(i + j);',
         '    }',
         '}'],
        1,
        ['for (int j = 0; j < 3; j++) {', 'for (int j = 0; j < 3; ++j) {', 'for (int j = 0; j < 3; j += 1) {'],
        ['The inner loop declares j.', 'Which variable does its update change?', 'Each loop should step its own counter.'],
        'The inner header has to update j; updating i leaves j at 0 and the inner loop never ends.'),

    codeFix('q_ne_fix_counter', 'LOOP_COUNTER_CHANGED_IN_BODY', 'loop_control', 'Intermediate',
        ['int[] v = {1, 2, 3, 4};',
         'int total = 0;',
         'for (int i = 0; i < v.length; i++) {',
         '    total += v[i++];',
         '}',
         'System.out.println(total);'],
        3,
        ['total += v[i];', 'total = total + v[i];'],
        ['How many elements are added?', 'i++ inside the brackets still changes i.', 'Leave stepping i to the header.'],
        'v[i++] moves the counter on top of the header\'s i++, so every other element is skipped.'),

    codeFix('q_ne_fix_acc_reset', 'ACCUMULATOR_RESET_INSIDE_LOOP', 'loop_initialization', 'Intermediate',
        ['int[] a = {5, 10, 15};',
         'int sum = 0;',
         'for (int i = 0; i < a.length; i++) {',
         '    sum = a[i];',
         '}',
         'System.out.println(sum);'],
        3,
        ['sum += a[i];', 'sum = sum + a[i];'],
        ['What does sum hold after the loop?', 'Each pass replaces the value instead of adding to it.', 'Add to the running total.'],
        'sum = a[i] throws the running total away on every pass, leaving only 15. Adding keeps what came before.'),

    codeFix('q_ne_fix_extreme', 'WRONG_EXTREME_INITIAL_VALUE', 'loop_initialization', 'Intermediate',
        ['int[] t = {12, 8, 15};',
         'int min = 0;',
         'for (int x : t) {',
         '    if (x < min) min = x;',
         '}',
         'System.out.println(min);'],
        1,
        ['int min = t[0];', 'int min = Integer.MAX_VALUE;'],
        ['Is any value below 0?', 'The starting value must not beat the real answer.', 'Start from an element, or from the largest int.'],
        'Starting at 0 means no positive value is ever smaller. Starting from t[0] or Integer.MAX_VALUE lets the real minimum win.'),

    codeFix('q_ne_fix_early_return', 'EARLY_RETURN_IN_LOOP', 'control_flow', 'Intermediate',
        ['static boolean hasNegative(int[] a) {',
         '    for (int x : a) {',
         '        if (x < 0) return true; else return false;',
         '    }',
         '    return false;',
         '}'],
        2,
        ['if (x < 0) return true;', 'if (x < 0) { return true; }'],
        ['How many elements are checked?', 'One positive value does not prove there are no negatives.', 'The return after the loop already answers false.'],
        'The else returns on the first element. Only a hit should leave the loop; "none found" is known after it.'),

    codeFix('q_ne_fix_else_if', 'UNREACHABLE_ELSE_IF_ORDER', 'conditional_logic', 'Intermediate',
        ['static String grade(int mark) {',
         '    if (mark >= 50) return "C";',
         '    else if (mark >= 75) return "A";',
         '    return "F";',
         '}'],
        1,
        ['if (mark >= 50 && mark < 75) return "C";', 'if (mark < 75 && mark >= 50) return "C";'],
        ['Can the A branch ever run?', 'A mark of 80 already passed the first test.', 'Make the C test stop below 75.'],
        'mark >= 50 catches every A as well, so the second branch is dead. Limiting the C test to 50-74 makes it reachable.'),

    codeFix('q_ne_fix_indent', 'MISLEADING_INDENTATION_NO_BRACES', 'statement_structure', 'Intermediate',
        ['int score = 40;',
         'if (score >= 50)',
         '    System.out.println("Passed");',
         '    System.out.println("Certificate sent");'],
        3,
        ['if (score >= 50) System.out.println("Certificate sent");',
         'if (score >= 50) { System.out.println("Certificate sent"); }'],
        ['A score of 40 should print nothing.', 'Only one line belongs to the braceless if.', 'Give the second line the same condition.'],
        'The certificate line runs whatever the score. It needs its own guard, or both lines need braces.'),

    codeFix('q_ne_fix_short_circuit', 'NON_SHORT_CIRCUIT_OPERATOR', 'boolean_logic', 'Intermediate',
        ['String s = null;',
         'if (s != null & s.length() > 3) {',
         '    System.out.println("long");',
         '}'],
        1,
        ['if (s != null && s.length() > 3) {'],
        ['s is null here.', '& evaluates both sides, always.', 'Which operator stops when the left side is false?'],
        'With & the right side runs even though s is null, so s.length() throws. && skips it once s != null is false.')
];

/** Everything that must hold before any of this reaches a student; `--apply` refuses otherwise. */
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

        // CodeFix is played for every concept; the other three only in the concept's home format.
        const home = CONCEPT_GAME_MAPPING[q.conceptTag];
        if (q.gameType !== 'CodeFix' && home && home !== q.gameType) {
            problems.push(`${where}: ${q.conceptTag} belongs to ${home}, not ${q.gameType}`);
        }

        if (!Array.isArray(q.codeLines) || q.codeLines.length < 2) problems.push(`${where}: needs at least two code lines`);
        if (!Array.isArray(q.hints) || q.hints.length < 2) problems.push(`${where}: needs at least two hints`);
        if (!q.explanation || q.explanation.length < 30) problems.push(`${where}: explanation is missing or too short`);

        if (q.gameType === 'BugHunt' || q.gameType === 'CodeFix') {
            const index = q.buggyLineIndex;
            if (!Number.isInteger(index) || index < 0 || index >= q.codeLines.length) {
                problems.push(`${where}: buggyLineIndex ${index} is outside the code`);
            }
        }
        if (q.gameType === 'BugHunt' && q.correctAnswer !== q.buggyLineIndex) {
            problems.push(`${where}: correctAnswer does not match buggyLineIndex`);
        }

        if (q.gameType === 'CodeFix') {
            const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
            const buggy = normaliseJavaLine(q.codeLines[q.buggyLineIndex] || '');
            if (!answers.length) problems.push(`${where}: no accepted fix`);
            // Typing the broken line back in must not count as fixing it.
            if (answers.some((answer) => normaliseJavaLine(answer) === buggy)) {
                problems.push(`${where}: the buggy line is listed as a fix`);
            }
        }

        if (q.gameType === 'CodeTrace' && (typeof q.correctAnswer !== 'string' || !q.correctAnswer.trim())) {
            problems.push(`${where}: correctAnswer must be the printed text`);
        }

        if (q.gameType === 'DragDrop') {
            const answer = q.correctAnswer;
            const n = q.codeLines.length;
            if (!Array.isArray(answer) || answer.length !== n) {
                problems.push(`${where}: answer has ${answer?.length} entries for ${n} lines`);
            } else {
                const isPermutation = [...answer].sort((a, b) => a - b).every((v, i) => v === i);
                if (!isPermutation) problems.push(`${where}: answer is not a permutation`);
                if (answer.every((v, i) => v === i)) {
                    problems.push(`${where}: answer is the identity - Submit would score 100 untouched`);
                }
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
    for (const [cell, count] of Object.entries(byCell).sort()) console.log(`  ${cell.padEnd(24)} ${count}`);

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
