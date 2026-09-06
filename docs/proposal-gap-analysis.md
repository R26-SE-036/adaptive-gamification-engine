# Adaptive Gamification Engine — what the proposal promised, and what exists

Written against `R26-SE-036_IT22203380_Aaron Charles J_v2.pdf` after testing every
endpoint on 7 September 2026. Everything below was measured on the running
service against MongoDB Atlas, not read off the code.

The short version: **the engine works, and the games are real.** Pair Challenge
was dropped by decision (see §2) and a fourth single-player game, CodeFix, was
added in its place.
The single largest gap is that the third game — Pair Challenge, the collaborative
one — does not exist in any form, and four requirements depend on it. The second
largest is that the machine-learning claim cannot currently be made, because the
model has never been fitted on a real student.

---

## 1. What actually works

I signed in as a real account and drove the whole loop. These all behave
correctly:

- **Authentication.** No token → 401. Rubbish token → 401. Valid token asking for
  someone else's data → 403. Identity is verified against Code Coach on every
  request, so signing out actually takes effect here.
- **Fetching a game.** All three implemented game types return a question, and
  the correct answer and explanation are stripped before it reaches the browser —
  I checked, they are genuinely absent, not just hidden.
- **Grading.** Bug Hunt (pick the broken line), Drag & Drop (order the lines) and
  Code Trace (type the output) all mark correctly. Code Trace ignores case and
  surrounding spaces, so `  TRUE ` is accepted for `true`.
- **Difficulty adaptation.** With no history the engine cold-starts. With history
  it calls the model, and one time in seven it deliberately serves a random
  difficulty instead, so the data can eventually answer "what would have happened
  at the other level".
- **Streaks and badges** are recorded, and the profile endpoint returns them.
- **Load.** 50 simultaneous requests: all 50 succeeded, median 680 ms, no errors
  and no timeouts. **NFR-02 passes.**
- **The ML service's own test suite**: 21 tests, all passing.

---

## 2. The big gap: there is no third game

The proposal's headline is *three* game modules. The third one is **Pair
Challenge** — two students in a live session with Driver and Navigator roles,
talking over WebSockets.

**It does not exist.** I searched the entire component for any trace of
WebSocket, Socket.IO, or pairing code. There is none — not a stub, not a
half-finished file, nothing.

What exists in its place is a third *single-player* game called **Code Trace**
(read the code, predict the output). Code Trace is a perfectly good game and it
works, but it is not in the proposal, and it is not collaborative.

Four requirements fall with it:

| # | What it asked for | Status |
|---|---|---|
| FR-03 | Pair Challenge with Driver/Navigator roles | **Missing entirely** |
| FR-05 | Record contribution balance and role-switching | **Missing entirely** |
| FR-13 | Live game-state sync over WebSocket | **Missing entirely** |
| Objective 4 | A collaboration-tracking subsystem feeding the decision engine | **Missing entirely** |

There is one leftover clue that it was once planned: `config/constants.js` still
lists `pair_session_started` as a valid event type. Nothing ever emits it.

**You have three options**, and they are genuinely different amounts of work:

1. **Build it.** Realistically the largest single piece of work left in this
   component — a WebSocket server, room management, role assignment and
   switching, shared state, and contribution measurement. Your teammate's
   PairPath component already does live pairing over Socket.IO, so there is a
   working pattern in the team to copy.
2. **Change the proposal** to say Code Trace instead of Pair Challenge, and drop
   FR-03, FR-05, FR-13 and Objective 4. Honest, and much cheaper — but it removes
   "collaboration data" from your seven inputs, which is one of the things the
   proposal uses to argue the engine is novel.
3. **Reuse PairPath.** Have the gamification engine read collaboration data from
   your teammate's component instead of measuring it itself. Keeps the
   collaboration input, avoids building a second WebSocket server — but it makes
   your component depend on his.

I have not chosen for you. This one is a supervisor conversation.

---

## 3. The second gap: the model has never seen a real student

The engine ships a trained Random Forest, and the difficulty endpoint really does
use it. But when I asked the service to retrain from the database, it refused —
correctly — and told me why:

```
81 raw sessions
53 rows with usable history
by source: {'test': 23, 'simulated': 30}
0 rows after dropping seeder and manual-test sessions
```

**Zero real rows.** Every session in the database is either from the local
simulator or from someone poking the API by hand. The model currently in the
repo was fitted on 52 such rows, and its own model card says so:

```
reportable: false
not_reportable_because:
  * only 52 usable rows, need 150
  * only 6 distinct students, need 15
  * fewer than 20 outcomes at: Hard, Medium
```

This is the system behaving **well**, not badly — the honesty gate is doing
exactly its job, and it refuses to fit rather than quietly producing a number you
might have put in a results table. But it does mean:

- **NFR-03 (85% decision accuracy) cannot currently be claimed.** Not "we scored
  below 85" — there is no valid measurement at all.
- Any accuracy figure you quote today would be a model predicting the output of
  the simulator that generated its own training data.

**What to do:** get a cohort to play. The gate wants 150 sessions from 15 distinct
students, with at least 20 outcomes at each difficulty. Until then the defensible
position — which the code already takes — is that the engine serves a documented
heuristic and the model is future work.

---

## 4. Requirement-by-requirement

| # | Requirement | Status | Note |
|---|---|---|---|
| FR-01 | Drag & Drop game | **Done** | 20 questions |
| FR-02 | Bug Hunt game | **Done** | 40 questions |
| FR-03 | Pair Challenge game | **Missing** | See §2 |
| FR-04 | Capture 7 data points per session | **Done** *(Phase 2)* | Error count is now measured server-side, not a 0/1 flag |
| FR-05 | Collaboration data | **Missing** | Needs FR-03 |
| FR-06 | Performance history per student | **Done** | Append-only, drives adaptation |
| FR-07 | Evaluate rules after every session | **Done** *(fixed today)* | Was only evaluated when the *next* game was fetched |
| FR-08 | Assign difficulty level | **Done** *(Phase 3)* | Five levels, and the dual-threshold rule |
| FR-09 | Assign next game type by weakness | **Done** *(Phase 4)* | Format is now a real decision, not a lookup |
| FR-10 | Hints and support recommendations | **Done** *(Phase 5)* | Hints are server-side and counted; support is a named action with evidence |
| FR-11 | Session summary with rationale | **Done** *(fixed today)* | The rationale was the placeholder |
| FR-12 | Send summary to Progress Tracker | **Partly** | Happens from the *browser*, not this service — see below |
| FR-13 | WebSocket state sync | **Missing** | Needs FR-03 |
| FR-14 | Educators view decision logs | **Dropped** | Requires a non-student role; the platform is deliberately student-only — see §4a |
| FR-15 | Configure thresholds without code changes | **Partly** | Some are env vars; several are still hardcoded |

| # | Requirement | Status |
|---|---|---|
| NFR-01 | Decision in under 200 ms | **Fails — 639 ms** (see §5) |
| NFR-02 | 50 concurrent sessions | **Passes** — 50/50 succeeded, no degradation |
| NFR-03 | 85% decision accuracy | **Cannot be claimed** (see §3) |
| NFR-04 | SUS above 68 | Not testable without users |
| NFR-05 | Access control + TLS | **Partly** — access control is solid and now simply "your own data only"; TLS is terminated at the edge proxy, not here |
| NFR-06 | No personal data in public APIs | **Passes** — only opaque user ids |
| NFR-07 | Containerised for horizontal scaling | **Partly** — containerised; scaling never tested |

### 4a. FR-14 is dropped, deliberately

The platform has **no roles**. Every account is a student, and there is no
concept of an educator, lecturer or administrator anywhere in it.

There used to be the shape of one. Code Coach stamped `"role": "student"` on
every user, signed it into the JWT, and the gamification engine checked it:

```js
const isPrivilegedRole = role === 'admin' || role === 'supervisor' || role === 'lecturer';
```

That branch had never been true and never could be — nothing could create an
account with any other value — while reading as though privileged access were a
supported feature. All of it is now gone: the field, the claim, the check, the
type in the web app's session, the API contract, and the vestigial `role` key on
the twelve existing user documents.

**This is a scope decision, not an oversight.** Supporting educators properly
means a second kind of account, a way to create one, an interface built for it,
and an access-control story to defend — a whole second product surface. FR-14
should be removed from the proposal rather than left as an unmet requirement.

### Three of these need explaining in plain English

**"Error count" was not a count — fixed in Phase 2.** The proposal treats error
count as a major input, with rules like *"IF score < 50 AND errorCount > 5 THEN
decrease difficulty"*. It used to be set to `0` if the final answer was right and
`1` if it was wrong, so it could never exceed 1 and **that rule could never
fire.**

The reason it was binary is that the API only ever saw the FINAL answer. The new
CodeFix game changes that: the student types a corrected line and asks the server
whether it is right (`POST /game/check`), which grades the attempt **without
ending the session** and records it. `/game/submit` then counts those rows.

Measured live — the client claimed `attemptCount: 1` and the server recorded:

```
errorCount = 3   errorCountMeasured = true   attemptCount = 4
```

Both numbers are now measurements rather than things the client asserts about
itself. Sessions carry `errorCountMeasured` so a rule reading `errorCount > n`
can tell a real count from the old floor — the three original games still answer
once and still fall back to the 0/1 value.

**Difficulty now has all five levels — fixed in Phase 3.** It was Easy, Medium
and Hard, moving on a single session, so one unlucky round could drop a student a
whole level.

The ladder is Beginner, Elementary, Intermediate, Advanced, Expert, and the
dual-threshold rule (`services/progressionService.js`) moves a student only after
**two consecutive sessions** at or above 80% (advance) or at or below 40%
(regress) — and only sessions at their *current* level count, so a promotion
cannot carry its own evidence forward and promote again.

The rule and the model do different jobs. The rule decides whether the student
moves; the model then chooses within the range between where they were and where
the rule put them. So **the model can decline a move the rule wants and can never
make one the rule did not**, which is what actually delivers the stability FR-08
asks for.

Question coverage went from 120 to 150, and every one of the 70 (concept, level)
pairs now has at least one question. **Elementary and Expert are CodeFix-only**,
because they were authored as part of that game — a request for Bug Hunt at
Elementary falls back to another format. Filling them means authoring at the
other three game types.

**FR-12 works, but not from this component.** The proposal says *the system*
shall send a summary to the Progress Tracker after every session. What actually
happens is that the **web page** posts the result to Code Coach after the game
finishes. So the data arrives — but if a student closes the tab at the wrong
moment, or if anyone ever writes a second client, the Progress Tracker silently
never hears about it. The engine itself has no code that talks to the Progress
Tracker at all. Moving that call server-side would be a small change and would
make the requirement true as written.

### Hints were free, and support did not exist

Two halves of FR-10, both fixed in Phase 5.

**Hints were shipped inside the question payload.** Every one was therefore
free: a student could read all three in the browser's network tab and still be
recorded as having used none — while the score, 100 minus 15 per hint, was
computed from a count the *client* sent about itself. The one number meant to
measure how much scaffolding a student needed was the one number they could
choose.

They now come one at a time from `POST /game/hint`, which records each. Verified
in the browser: the question arrives with `hintCount: 3` and no `hints` array,
two hints were taken, and submitting with `hintUsage: 0` in the payload still
scored 70 rather than 100 — the server charged for what it had handed over.

Sessions carry `hintUsageMeasured` for the same reason `errorCountMeasured`
exists: a real count and a client's claim must not look alike to a rule reading
them.

One consequence worth noting. `/game/check` used to reveal the next hint
automatically on a wrong attempt. That was right while hints were free; it is
wrong now that each costs 15 points, so checking reports only how many hints
remain. **A student is never billed for a hint they did not ask for.**

**Support did not exist at all.** The submit response carried one fixed
sentence — *"Good effort on X. Try one more guided practice round with hints."* —
for every failing round on every concept, whether the student had missed once or
six times running.

`services/supportService.js` now returns a named action with the evidence it
fired on:

| action | when |
|---|---|
| `review_lesson` | three failures in a row, or unresolved findings in their own code |
| `extra_practice` | the difficulty rule just dropped them a level |
| `slow_down` | passing, but on more than 1.5 hints a round |
| `keep_going` | nothing is wrong |

Verified live — the escalation is what changes, not the wording:

```
1 failure  -> keep_going     Worth one more round of statement structure
2 failures -> keep_going     Worth one more round of statement structure
3 failures -> review_lesson  Read the statement structure lesson before the next round
```

Three, not two: two failures in a row is a bad afternoon and the difficulty rule
already answers it by dropping a level. Three is a pattern that another round is
unlikely to fix. `keep_going` is deliberately not shown in the interface —
telling a student who is fine that they are fine would train them to skip the
panel on the round where it matters.

### The structural limitation, and how it was removed

FR-09 asks for the game type to be chosen from diagnosed weaknesses, with rules
like *"IF logicErrors > debugErrors THEN assign Drag & Drop"*.

For most of this project that was not implementable, and the reason was in the
**data**, not the code. `CONCEPT_GAME_MAPPING` fixed exactly one game type per
concept and the question bank followed it:

```
concepts with more than one game type: 0 of 14     (before Phase 2)
concepts with more than one game type: 14 of 14    (after)
```

Choosing a concept chose the format. A rule "assigning Drag & Drop for logic
errors" would have been theatre — picking a concept that happens to map to Drag
& Drop, or naming a game the bank could not serve.

**Phase 2 fixed the data** (CodeFix authored for every error type) and **Phase 4
fixed the code**. `services/gameTypeService.js` now chooses the format from how
the student has actually done in each format the bank can serve for that concept.

The ordering idea is that the four games differ in what they ask a student to
**do**, and those demands are ordered:

| | asks the student to | demand |
|---|---|---|
| Bug Hunt | recognise — point at the wrong line | lowest |
| Drag & Drop | arrange — put pieces in order | middle |
| Code Trace | predict — say what it does | middle |
| CodeFix | **produce** — write the fix | highest |

**Recognise before produce.** A student who cannot yet spot a broken loop bound
is not helped by being asked to write the corrected one. Failing at a format
steps down the ladder; being comfortable at one steps up. Verified live on a
concept the student had never played:

```
never played              -> BugHunt   [G1_start_low]
two strong BugHunt rounds -> CodeFix   [G3_step_up]
two failed CodeFix rounds -> BugHunt   [G2_step_down]
```

That is a pedagogical claim rather than a measurement, which is exactly why it
is a named table in one file rather than something fitted — the same division of
labour as difficulty, where the model says how likely success is and a rule says
what should happen about it.

**One honest limit.** Each concept currently offers precisely two formats —
CodeFix and one other — so in practice this chooses between "recognise" and
"produce". The ladder is written for four because the bank can grow into it.

So game type is not an independent decision at all. Choosing a concept chooses
the type. A rule that "assigns Drag & Drop for logic errors" would either be
picking a concept that happens to map to Drag & Drop, or naming a game the bank
cannot serve.

The implementation now recommends the **concept**, and reports the game type that
follows from it. That is the decision the data can actually support. Making game
type a real choice means authoring the same concept at several formats — roughly
tripling the question bank.

---

## 5. Why the 200 ms requirement fails

The decision itself is fast. The waiting is all network:

| Step | Time |
|---|---|
| The Random Forest making its prediction | **7 ms** |
| Reading the student's history from MongoDB Atlas | 123 ms |
| Asking Code Coach for the student's struggle count | 556 ms |
| **Total** | **639 ms** |

The model is not the problem — it is under 1% of the time. Two calls to services
in other data centres are.

I made one real improvement: those two calls were being made **one after the
other**, when they do not depend on each other. Running them at the same time
took the median from **734 ms to 639 ms**. That is a genuine saving and it is
committed, but it cannot get to 200 ms, because the slowest single call is 556 ms
on its own.

**This is a deployment problem, not a code problem.** Both numbers are dominated
by the round trip from a laptop in Sri Lanka to databases hosted overseas. When
the services and the database sit in the same region — which is what the
docker-compose deployment does — this should drop by roughly an order of
magnitude. **It should be re-measured there before anyone writes it up as a
failure**, and re-measured honestly if it still fails.

---

## 6. Bugs found and fixed today

1. **A placeholder was being shipped to students.** Every completed game returned
   `nextRecommendedGame: 'Optional: further recommendation logic'` — literally
   that string. This was FR-09 and half of FR-11, unimplemented, for the life of
   the project. Now a real rule set (`services/recommendationService.js`) with a
   stated reason on every decision.
2. **The session summary contradicted the session record.** The summary echoed
   back the game type the *client* sent, while everything else in the handler
   deliberately uses the type stored on the question. Fixed.
3. **Two remote calls ran in sequence** that did not depend on each other. Fixed;
   734 ms → 639 ms.
4. **The ML container could never retrain.** It had no environment variables at
   all in docker-compose — so it could not reach the database, and
   `RETRAIN_SECRET` was unset, which made `POST /retrain` answer 403 to everyone
   including whoever was meant to use it. Fixed.
5. **Two `.env` files described one component.** Merged into one.
6. **Dead rules.** My first draft of the recommendation engine had two rules that
   could never fire, for the `CONCEPT_GAME_MAPPING` reason in §4. Removed rather
   than shipped.
7. **The session simulator could never have worked.** It read a 47-question JSON
   snapshot whose ids were `q001`, `q002`… while the deployed bank holds 75
   questions with ids like `q_off_by_one_02`. Every id it sent was one the
   grader had never heard of, so `POST /game/submit` answered `404 Question not
   found` for all 47 — it could not write a single session. It now reads the
   bank from the database, so re-seeding the questions cannot leave it behind.
   Its wrong answers were also always the number `2`, which is not a valid
   wrong answer for a Drag & Drop question (an array) or a Code Trace one (a
   string); they are now shaped to match each question's answer.

## 7. Files removed

Nothing here was in use:

- **`frontend/`** (20 files) — superseded by `codeguru-web`.
- **`data/seed_all_15_errors.js`** — an older seeder producing 18 questions with
  a different id scheme (`q_arr_01`) than the live bank (`q_arr_len_01`).
- **`data/seed_questions.js`** and **`data/questions_seed.json`** — an older
  seeder again, 47 questions with `q001` ids. Neither of these two ever produced
  the bank that is actually deployed; `seed_75_questions.js` did, and it stays.
- **`data/inspect_db.js`** — a debug script that inspected collections belonging
  to Code Coach (`users`, `remediationTriggers`, `conceptMastery`), left over
  from when the services shared one database.
- **`ml-service/.env`, `.env.example`, `.gitignore`** — folded into the backend's.
- Two stray `.pytest_cache` directories.

`data/simulate_students.js` was **kept**. It marks everything it writes as
`dataSource: 'simulated'` and the trainer drops those rows, so it cannot
contaminate a result — and it is the only way to get a non-empty database for UI
work.

## 8. Restructuring

`ml-service/` is now `backend/ml/`. The machine learning *is* backend work, and
the trainer already had to reach up into `backend/.env` for its database
connection, so the old layout had them as siblings while the code treated one as
a child of the other.

It is still **two containers**, deliberately. They are two different runtimes —
Python/Flask and Node/Express — and on a single-host deployment an extra
container costs about 120 MB of memory and nothing at all in money. Container
count is not what drives the bill; instance size is. Keeping them separate means
each keeps its own restart policy, its own logs and its own health check, and a
crash in one does not take down the other.

---

## 9. What I would do next, in order

1. **Decide the Pair Challenge question** (§2). Everything else is small by
   comparison, and the answer changes what the component is.
2. **Get a cohort to play** (§3). Nothing about the ML claim can be resolved
   without it, and it is the long pole — you cannot compress "150 sessions from
   15 students" at the end.
3. **Re-measure NFR-01 in the deployed environment** (§5) before writing it up.
4. **Move the FR-12 call server-side** — small change, makes the requirement true.
5. **Decide 3 levels or 5** (§4), and either write the questions or amend the
   proposal.
6. **Store the adaptation decisions** so FR-14 becomes possible. Right now the
   engine decides, acts, and forgets — `source`, `confidence` and `reason` all
   exist at the moment of the decision and none of them are written down.
