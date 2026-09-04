"""Tests for the difficulty model's training set.

The first three tests are regression tests for the bug that made this rewrite
necessary: the old pipeline derived two features from `difficultyLevel` and then
predicted `difficultyLevel`, so a depth-1 tree scored 100% and nothing in the
codebase would have noticed. `test_no_feature_determines_the_label` is the one
that would have caught it.

Run:  python -m pytest tests/ -q      (from ml-service/)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

import pandas as pd
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from training_data import (  # noqa: E402
    DIFFICULTY_ORDINAL,
    FEATURE_COLUMNS,
    HISTORY_FEATURES,
    SUCCESS_SCORE,
    build_rows,
    check_sufficiency,
    classify_source,
)

BASE = datetime(2026, 9, 1, 10, 0, 0)


def session(user, concept, offset_minutes, difficulty, score, **extra):
    return {
        "userId": user,
        "conceptTag": concept,
        "completedAt": BASE + timedelta(minutes=offset_minutes),
        "difficultyLevel": difficulty,
        "score": score,
        "attemptCount": extra.get("attemptCount", 1),
        "hintUsage": extra.get("hintUsage", 0),
        "timeTakenSeconds": extra.get("timeTakenSeconds", 60),
        **{k: v for k, v in extra.items()
           if k not in ("attemptCount", "hintUsage", "timeTakenSeconds")},
    }


# ── The regression tests ─────────────────────────────────────────────────────
def test_no_feature_determines_the_label():
    """No single feature may recover the outcome exactly.

    This is the check the old pipeline would have failed. `repeat_error_count`
    was set from `difficultyLevel` by an injective if/else and `difficultyLevel`
    was the target, so agreement was 100% and the 80/20 split could not see it.
    """
    rows = []
    for user_index in range(12):
        user = f"u{user_index}"
        for index in range(6):
            rows.append(
                session(
                    user,
                    "loops",
                    index * 10,
                    ["Easy", "Medium", "Hard"][index % 3],
                    # Scores that vary independently of difficulty.
                    [95, 40, 80, 20, 100, 55][(index + user_index) % 6],
                )
            )

    frame = build_rows(rows)
    assert len(frame) > 0

    for column in FEATURE_COLUMNS:
        agreement = (
            (frame[column] > frame[column].median()).astype(int) == frame["success"]
        ).mean()
        assert agreement < 0.95, (
            f"{column} recovers `success` {agreement:.1%} of the time. "
            "A feature that determines the label is leakage."
        )


def test_a_sessions_own_outcome_never_appears_in_its_own_features():
    """Features describe the past only.

    Two students play identically, then diverge on the final session. Their
    feature rows for that final session must be identical - only the labels may
    differ. If any of the session's own values leaked into its features, the
    rows would differ too.
    """
    shared = [
        ("early", 0, "Easy", 80),
        ("mid", 10, "Medium", 60),
    ]
    rows = []
    for user, final_score in (("passer", 100), ("failer", 0)):
        for _, offset, difficulty, score in shared:
            rows.append(session(user, "loops", offset, difficulty, score))
        rows.append(
            session(user, "loops", 20, "Hard", final_score,
                    attemptCount=9, hintUsage=9, timeTakenSeconds=999)
        )

    frame = build_rows(rows)
    finals = frame[frame["games_played"] == 2].sort_values("user_id")
    assert len(finals) == 2

    passer = finals[finals.user_id == "passer"].iloc[0]
    failer = finals[finals.user_id == "failer"].iloc[0]

    for column in FEATURE_COLUMNS:
        assert passer[column] == failer[column], (
            f"{column} differs between two students whose HISTORY is identical "
            "and who differ only in the session being predicted."
        )

    assert passer["success"] == 1
    assert failer["success"] == 0


def test_history_features_ignore_later_sessions():
    """A row's features must not see the future."""
    rows = [
        session("u1", "loops", 0, "Easy", 100),
        session("u1", "loops", 10, "Medium", 50),
        session("u1", "loops", 20, "Hard", 0),
    ]
    frame = build_rows(rows).sort_values("games_played").reset_index(drop=True)

    assert len(frame) == 2
    # The row for session 2 sees only session 1.
    assert frame.loc[0, "games_played"] == 1
    assert frame.loc[0, "avg_score"] == 100
    assert frame.loc[0, "recent_score"] == 100
    # The row for session 3 sees sessions 1 and 2, and nothing of itself.
    assert frame.loc[1, "games_played"] == 2
    assert frame.loc[1, "avg_score"] == 75
    assert frame.loc[1, "recent_score"] == 50


# ── Row construction ─────────────────────────────────────────────────────────
def test_first_session_produces_no_row():
    """A student's first game has no history, so it cannot be described."""
    assert len(build_rows([session("u1", "loops", 0, "Easy", 100)])) == 0


def test_sessions_are_ordered_by_time_not_insertion():
    rows = [
        session("u1", "loops", 30, "Hard", 0),
        session("u1", "loops", 0, "Easy", 100),
    ]
    frame = build_rows(rows)
    assert len(frame) == 1
    assert frame.iloc[0]["recent_score"] == 100  # the earlier one is the history
    assert frame.iloc[0]["success"] == 0  # the later one is the label


def test_history_does_not_cross_concepts_or_students():
    rows = [
        session("u1", "loops", 0, "Easy", 100),
        session("u1", "arrays", 10, "Easy", 100),
        session("u2", "loops", 20, "Easy", 100),
    ]
    assert len(build_rows(rows)) == 0


def test_difficulty_is_an_input_not_the_label():
    rows = [
        session("u1", "loops", 0, "Easy", 90),
        session("u1", "loops", 10, "Hard", 90),
    ]
    frame = build_rows(rows)
    assert "difficulty_ordinal" in FEATURE_COLUMNS
    assert "difficulty_ordinal" not in HISTORY_FEATURES
    assert frame.iloc[0]["difficulty_ordinal"] == DIFFICULTY_ORDINAL["Hard"]
    assert "success" not in FEATURE_COLUMNS


def test_success_threshold():
    rows = [
        session("u1", "loops", 0, "Easy", 100),
        session("u1", "loops", 10, "Easy", SUCCESS_SCORE),
        session("u1", "loops", 20, "Easy", SUCCESS_SCORE - 1),
    ]
    frame = build_rows(rows).sort_values("games_played").reset_index(drop=True)
    assert list(frame["success"]) == [1, 0]


def test_rows_with_unusable_fields_are_skipped():
    rows = [
        session("u1", "loops", 0, "Easy", 100),
        {**session("u1", "loops", 10, "Easy", 50), "completedAt": None},
        {**session("u1", "loops", 20, "Easy", 50), "difficultyLevel": "Impossible"},
        session("u1", "loops", 30, "Medium", 50),
    ]
    frame = build_rows(rows)
    assert len(frame) == 1
    assert frame.iloc[0]["games_played"] == 1


# ── Provenance ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "doc,expected",
    [
        ({"dataSource": "simulated", "userId": "someone"}, "simulated"),
        ({"dataSource": "real", "userId": "alpha_student"}, "real"),
        ({"userId": "alpha_student"}, "simulated"),
        ({"userId": "test-user-123"}, "test"),
        ({"userId": "user_ed27a9f92f1b"}, "real"),
        ({}, "real"),
    ],
)
def test_classify_source(doc, expected):
    assert classify_source(doc) == expected


def test_exploratory_flag_is_carried_onto_the_row():
    rows = [
        session("u1", "loops", 0, "Easy", 100),
        session("u1", "loops", 10, "Hard", 50, wasExploratory=True),
    ]
    assert bool(build_rows(rows).iloc[0]["was_exploratory"]) is True


# ── The gate ─────────────────────────────────────────────────────────────────
def _sufficient_frame():
    rows = []
    for user_index in range(20):
        for index in range(12):
            rows.append(
                session(
                    f"u{user_index}",
                    "loops",
                    index * 10,
                    ["Easy", "Medium", "Hard"][index % 3],
                    100 if (user_index + index) % 3 else 10,
                )
            )
    return build_rows(rows)


def test_gate_passes_on_ample_varied_data():
    assert check_sufficiency(_sufficient_frame()) == []


def test_gate_rejects_an_empty_frame():
    assert check_sufficiency(pd.DataFrame(columns=list(FEATURE_COLUMNS) + ["success"])) != []


def test_gate_rejects_a_single_outcome():
    frame = _sufficient_frame()
    frame["success"] = 1
    reasons = check_sufficiency(frame)
    assert any("same outcome" in reason for reason in reasons)


def test_gate_rejects_a_single_difficulty():
    """The effect of difficulty is the entire model. One level cannot show it."""
    frame = _sufficient_frame()
    frame["difficulty_ordinal"] = DIFFICULTY_ORDINAL["Medium"]
    reasons = check_sufficiency(frame)
    assert any("one difficulty" in reason for reason in reasons)


def test_gate_rejects_too_few_students():
    rows = [
        session("u1", "loops", index * 10, ["Easy", "Medium", "Hard"][index % 3],
                100 if index % 2 else 10)
        for index in range(200)
    ]
    reasons = check_sufficiency(build_rows(rows))
    assert any("distinct students" in reason for reason in reasons)
