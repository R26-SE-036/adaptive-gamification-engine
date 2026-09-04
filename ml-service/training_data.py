"""Build the difficulty model's training set from game sessions.

============================ WHY THIS FILE EXISTS ============================
`retrain_from_db.py` and `evaluate_models.py` each contained this block:

    if session['difficultyLevel'] == 'Hard':   repeat_count = 0; games = 4
    elif session['difficultyLevel'] == 'Medium': repeat_count = 2; games = 2
    else:                                       repeat_count = 4; games = 1

and then fitted a classifier with `difficultyLevel` as the target. Two of the
six features were a deterministic, injective function of the label, so
`repeat_error_count` alone recovered it exactly and a depth-1 tree scored 100%.
The 80/20 split did not catch it: the leak is not memorised rows, it is a
function that holds just as well in the test half.

Three things were wrong, in increasing order of seriousness.

1. LEAKAGE. Described above. Removing those two features would not have been
   enough either - the other four came from `simulate_students.js`, which also
   branches on the question's difficulty to choose their ranges, so the whole
   vector was a noisy function of the label.

2. WRONG TARGET. At serve time the service is asked "what difficulty should
   this student get NEXT". The trainer fitted "what difficulty was the question
   they ALREADY played". `difficultyLevel` is a property of the question, set by
   whoever authored questions_seed.json. Nothing about the student is in it.

3. TRAIN/SERVE SKEW, with a live behavioural bug. difficultyService.js sets
   `games_played` to the real number of past sessions - 0 for a newcomer, rising
   with use. In training, games_played=1 meant Easy and 4 meant Hard. So the
   model pushed a student toward Hard the more they played, largely regardless
   of how they did.

============================== WHAT REPLACES IT ==============================
The question is reframed so the label cannot be known from the features:

    P(success | this student's history so far, a candidate difficulty)

Each training row is one session, described only by the sessions that happened
STRICTLY BEFORE it for the same student and concept, plus the difficulty that
session was served at. The label is how that session turned out. The label is
therefore observed after every feature it is paired with, which is what makes
leakage impossible by construction rather than by inspection.

Difficulty moves from being the output to being an INPUT. That is the right
place for it: it is the thing the engine chooses, so the model's job is to say
what happens if we choose each value, and the policy picks between them.

A CONFOUND WE CANNOT REMOVE, ONLY NARROW
Every observed outcome is at the difficulty the old policy chose, so the data
says nothing about difficulties it never served to that kind of student. This is
the standard bandit-feedback problem and no amount of modelling fixes it - only
exploration does. difficultyService.js therefore serves a random difficulty a
small fraction of the time and stamps the session `wasExploratory`, so the
corpus eventually contains outcomes the policy would not have chosen. Until
enough of those exist, the model is interpolating inside the old rule's
footprint, and `model_card.json` records the exploratory share so the write-up
can say by how much.
=============================================================================
"""

from __future__ import annotations

import os
from collections import Counter

import pandas as pd

# ── The feature vector ────────────────────────────────────────────────────────
# History features describe the student BEFORE the session being predicted.
# `difficulty_ordinal` describes the session itself and is the decision variable.
HISTORY_FEATURES = [
    "games_played",
    "avg_score",
    "avg_attempts",
    "avg_hint_usage",
    "avg_time_seconds",
    "recent_score",
    "success_rate",
]
FEATURE_COLUMNS = HISTORY_FEATURES + ["difficulty_ordinal"]

DIFFICULTY_ORDINAL = {"Easy": 0, "Medium": 1, "Hard": 2}
ORDINAL_DIFFICULTY = {v: k for k, v in DIFFICULTY_ORDINAL.items()}

# A session counts as a success at or above this score. Chosen to match the
# platform's pass mark rather than picked here; it is the same 70 the quiz
# gate in Study Guider uses. Configurable because the right band is an
# empirical question once real data exists.
SUCCESS_SCORE = int(os.environ.get("SUCCESS_SCORE", "70"))

# `repeat_error_count` is deliberately NOT a feature.
#
# Code Coach can tell us how many unresolved struggles a student has RIGHT NOW,
# but not how many they had at the moment of a session last week - it stores
# current trigger state, not a time series of it. Including it would mean the
# serve path supplies a real value while the training path can only invent one,
# which is the exact class of defect this file exists to remove. It stays in the
# policy layer instead, as a stated rule that claims to have learned nothing.


# ── Provenance ───────────────────────────────────────────────────────────────
# Rows written by the local seeder or by manual API testing must not train a
# model whose accuracy anyone intends to report. Sessions written from now on
# carry `dataSource`; older rows predate the field, so their user ids are
# matched instead. Anything unrecognised is treated as real, because a false
# "real" is visible in the gate below while a false "simulated" silently
# discards data.
SIMULATED_USER_IDS = {
    "alpha_student",
    "beta_student",
    "gamma_student",
    "delta_student",
    "epsilon_student",
}
TEST_USER_PREFIXES = ("test-user", "test_user", "demo-user", "demo_user")


def classify_source(session: dict) -> str:
    """'real', 'simulated' or 'test' for one raw session document."""
    declared = session.get("dataSource")
    if declared in ("simulated", "test", "real"):
        return declared

    user_id = str(session.get("userId") or "")
    if user_id in SIMULATED_USER_IDS:
        return "simulated"
    if user_id.startswith(TEST_USER_PREFIXES):
        return "test"
    return "real"


# ── Row construction ─────────────────────────────────────────────────────────
def build_rows(sessions: list[dict]) -> pd.DataFrame:
    """One row per session that has at least one earlier session to describe it.

    The first session a student plays on a concept has no history, so it can be
    a label but never a feature source. It is dropped rather than given
    stand-in values - a fabricated history is how the previous pipeline started.
    """
    ordered: dict[tuple[str, str], list[dict]] = {}
    for session in sessions:
        user_id = session.get("userId")
        concept = session.get("conceptTag")
        completed = session.get("completedAt")
        difficulty = session.get("difficultyLevel")

        if not user_id or not concept or completed is None:
            continue
        if difficulty not in DIFFICULTY_ORDINAL:
            continue

        ordered.setdefault((user_id, concept), []).append(session)

    rows = []
    for (user_id, concept), group in ordered.items():
        group.sort(key=lambda s: s["completedAt"])

        for index in range(1, len(group)):
            history = group[:index]
            current = group[index]

            scores = [float(s.get("score") or 0) for s in history]
            successes = [1 if score >= SUCCESS_SCORE else 0 for score in scores]

            rows.append(
                {
                    "user_id": user_id,
                    "concept_tag": concept,
                    "completed_at": current["completedAt"],
                    "source": classify_source(current),
                    "was_exploratory": bool(current.get("wasExploratory", False)),
                    # ── history, strictly before `current` ──
                    "games_played": len(history),
                    "avg_score": sum(scores) / len(scores),
                    "avg_attempts": _mean(history, "attemptCount", 1),
                    "avg_hint_usage": _mean(history, "hintUsage", 0),
                    "avg_time_seconds": _mean(history, "timeTakenSeconds", 0),
                    "recent_score": scores[-1],
                    "success_rate": sum(successes) / len(successes),
                    # ── the decision variable ──
                    "difficulty_ordinal": DIFFICULTY_ORDINAL[current["difficultyLevel"]],
                    # ── the label, observed after every feature above ──
                    "success": 1 if float(current.get("score") or 0) >= SUCCESS_SCORE else 0,
                }
            )

    return pd.DataFrame(rows)


def _mean(sessions: list[dict], field: str, default: float) -> float:
    values = [float(s.get(field) if s.get(field) is not None else default) for s in sessions]
    return sum(values) / len(values) if values else float(default)


# ── The sufficiency gate ─────────────────────────────────────────────────────
# Mirrors the one on Code Coach's prerequisite derivation. A model fitted below
# these thresholds is describing a handful of people, and the number it reports
# would not survive one more student joining.
MIN_ROWS = 150
MIN_DISTINCT_USERS = 15
MIN_MINORITY_CLASS_RATIO = 0.15
MIN_DIFFICULTY_LEVELS_OBSERVED = 2
MIN_ROWS_PER_DIFFICULTY = 20


def check_sufficiency(frame: pd.DataFrame) -> list[str]:
    """Reasons this data must not train a reportable model. Empty means proceed."""
    reasons = []

    if len(frame) < MIN_ROWS:
        reasons.append(f"only {len(frame)} usable rows, need {MIN_ROWS}")

    users = frame["user_id"].nunique() if len(frame) else 0
    if users < MIN_DISTINCT_USERS:
        reasons.append(f"only {users} distinct students, need {MIN_DISTINCT_USERS}")

    if len(frame):
        counts = frame["success"].value_counts()
        if len(counts) < 2:
            reasons.append("every row has the same outcome, so there is nothing to separate")
        else:
            minority = counts.min() / len(frame)
            if minority < MIN_MINORITY_CLASS_RATIO:
                reasons.append(
                    f"the rarer outcome is {minority:.1%} of rows, "
                    f"below the {MIN_MINORITY_CLASS_RATIO:.0%} needed to learn it"
                )

        by_difficulty = frame["difficulty_ordinal"].value_counts()
        if len(by_difficulty) < MIN_DIFFICULTY_LEVELS_OBSERVED:
            reasons.append(
                "outcomes were observed at only one difficulty, so the effect of "
                "difficulty - the entire point of the model - is unidentifiable"
            )
        else:
            thin = [
                ORDINAL_DIFFICULTY[level]
                for level, count in by_difficulty.items()
                if count < MIN_ROWS_PER_DIFFICULTY
            ]
            if thin:
                reasons.append(
                    f"fewer than {MIN_ROWS_PER_DIFFICULTY} outcomes at: {', '.join(sorted(thin))}"
                )

    return reasons


def provenance_summary(frame: pd.DataFrame) -> dict:
    """What the corpus is made of. Goes verbatim into the model card."""
    if not len(frame):
        return {"rows": 0, "by_source": {}, "exploratory_rows": 0, "exploratory_share": 0.0}

    exploratory = int(frame["was_exploratory"].sum())
    return {
        "rows": len(frame),
        "by_source": {k: int(v) for k, v in Counter(frame["source"]).items()},
        "distinct_users": int(frame["user_id"].nunique()),
        "distinct_concepts": int(frame["concept_tag"].nunique()),
        "exploratory_rows": exploratory,
        "exploratory_share": round(exploratory / len(frame), 4),
        "success_rate": round(float(frame["success"].mean()), 4),
        "by_difficulty": {
            ORDINAL_DIFFICULTY[level]: int(count)
            for level, count in frame["difficulty_ordinal"].value_counts().items()
        },
    }


def load_sessions_from_mongo() -> list[dict]:
    """Every game session, raw. Connection details come from backend/.env."""
    import certifi
    from dotenv import load_dotenv
    from pymongo import MongoClient

    backend_env = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", ".env"
    )
    load_dotenv(backend_env)

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise SystemExit("MONGODB_URI is not set. Check backend/.env.")

    client = MongoClient(uri, tlsCAFile=certifi.where(), serverSelectionTimeoutMS=15000)
    database = client[os.environ.get("MONGODB_DB_NAME", "code-guru")]
    return list(database["gameSessions"].find({}))
