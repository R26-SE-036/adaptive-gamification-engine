"""Fit the difficulty model on real game sessions, or refuse and say why.

The model answers ONE question:

    given what this student has done on this concept so far, how likely are
    they to succeed at a question of difficulty D?

The policy in app.py then asks it that question once per difficulty and picks
between the answers. See training_data.py for why the target changed and what
was wrong with fitting `difficultyLevel` directly.

Usage
    python retrain_from_db.py
    python retrain_from_db.py --report-only        # gate + provenance, no fit
    python retrain_from_db.py --allow-insufficient # fit anyway, stamp NOT_REPORTABLE

`--allow-insufficient` exists so the service can be demonstrated end to end
before a cohort has played anything. It writes `reportable: false` into the
model card and every prediction the service serves carries it. Do not quote a
metric from a model card that says false.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import brier_score_loss, classification_report, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

from training_data import (
    FEATURE_COLUMNS,
    SUCCESS_SCORE,
    build_rows,
    check_sufficiency,
    load_sessions_from_mongo,
    provenance_summary,
)

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "model.pkl")
CARD_PATH = os.path.join(HERE, "model_card.json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument("--allow-insufficient", action="store_true")
    parser.add_argument(
        "--include-simulated",
        action="store_true",
        help="Keep seeder and manual-test rows. Implies --allow-insufficient.",
    )
    args = parser.parse_args()

    print("Reading gameSessions from MongoDB Atlas...")
    sessions = load_sessions_from_mongo()
    print(f"  {len(sessions)} raw sessions")

    frame = build_rows(sessions)
    if not len(frame):
        print(
            "\nNo usable rows. Every training row needs at least one EARLIER session\n"
            "by the same student on the same concept, because that history is what\n"
            "describes them. A student's first game can be a label but never a\n"
            "feature source."
        )
        return 2

    all_provenance = provenance_summary(frame)
    print(f"  {len(frame)} rows with usable history")
    print(f"  by source: {all_provenance['by_source']}")

    if not args.include_simulated:
        frame = frame[frame["source"] == "real"].reset_index(drop=True)
        print(f"  {len(frame)} rows after dropping seeder and manual-test sessions")

    provenance = provenance_summary(frame)
    reasons = check_sufficiency(frame)

    print("\n--- Corpus ---")
    print(json.dumps(provenance, indent=2))

    reportable = not reasons and not args.include_simulated

    if reasons:
        print("\n--- This data cannot support a reportable model ---")
        for reason in reasons:
            print(f"  * {reason}")

        if args.report_only or not (args.allow_insufficient or args.include_simulated):
            print(
                "\nRefusing to fit. The honest position until a cohort has played:\n"
                "  the engine serves difficultyService.js's stated rule, which is a\n"
                "  documented heuristic and claims nothing about learning.\n"
                "\nTo fit anyway for a demo, pass --allow-insufficient. The model card\n"
                "and every served prediction will say reportable: false."
            )
            return 2

        print("\n--allow-insufficient given: fitting anyway, stamped NOT REPORTABLE.")

    if args.report_only:
        return 0

    # ── Split by student, never by row ────────────────────────────────────────
    # Rows from one student share their history almost entirely: consecutive
    # sessions differ by one observation. A random row split would put a
    # student's session 5 in training and session 6 in test and score itself on
    # what it had already seen.
    groups = frame["user_id"].to_numpy()
    X = frame[FEATURE_COLUMNS]
    y = frame["success"].to_numpy()

    held_out = frame["user_id"].nunique() >= 4
    if held_out:
        splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
        train_idx, test_idx = next(splitter.split(X, y, groups))
    else:
        print("\nToo few students to hold any out; scoring on the training rows.")
        print("That number is meaningless and the card records it as such.")
        train_idx = test_idx = np.arange(len(frame))

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=5,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(X.iloc[train_idx], y[train_idx])

    metrics = evaluate(model, X.iloc[test_idx], y[test_idx], held_out=held_out)

    print("\n--- Evaluation ---")
    print(json.dumps(metrics, indent=2))

    card = {
        "target": "success",
        "target_definition": f"score >= {SUCCESS_SCORE} on the session being predicted",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "reportable": reportable,
        "not_reportable_because": reasons or None,
        "features": FEATURE_COLUMNS,
        "provenance": provenance,
        "split": "GroupShuffleSplit by user_id, test_size=0.25",
        "metrics": metrics,
        "model": "RandomForestClassifier(n_estimators=200, max_depth=5, "
        "min_samples_leaf=5, class_weight=balanced)",
        "corpus_fingerprint": hashlib.sha256(
            pd.util.hash_pandas_object(frame[FEATURE_COLUMNS + ["success"]], index=False).values
        ).hexdigest()[:16],
    }

    joblib.dump(
        {"model": model, "feature_columns": FEATURE_COLUMNS, "card": card},
        MODEL_PATH,
    )
    with open(CARD_PATH, "w", encoding="utf-8") as handle:
        json.dump(card, handle, indent=2)

    print(f"\nWrote {MODEL_PATH}")
    print(f"Wrote {CARD_PATH}")
    if not reportable:
        print("\nreportable: false - do not quote these metrics anywhere.")
    return 0


def evaluate(model, X_test, y_test, held_out: bool) -> dict:
    """Threshold-free scores, because the policy consumes a probability.

    Accuracy is not reported. The policy never asks "will they succeed", it asks
    "how likely", and an accuracy figure at an arbitrary 0.5 cut says nothing
    about whether 0.72 means 0.72. Brier and AUC do.
    """
    probabilities = model.predict_proba(X_test)[:, 1]

    metrics: dict = {
        "held_out": held_out,
        "n": int(len(y_test)),
        "positive_rate": round(float(np.mean(y_test)), 4),
        "brier_score": round(float(brier_score_loss(y_test, probabilities)), 4),
        "baseline_brier_predicting_base_rate": round(
            float(brier_score_loss(y_test, np.full_like(probabilities, np.mean(y_test)))), 4
        ),
    }

    if len(np.unique(y_test)) > 1:
        metrics["roc_auc"] = round(float(roc_auc_score(y_test, probabilities)), 4)
        metrics["classification_report_at_0.5"] = classification_report(
            y_test, (probabilities >= 0.5).astype(int), output_dict=True, zero_division=0
        )
    else:
        metrics["roc_auc"] = None
        metrics["note"] = "test rows share one outcome; AUC undefined"

    return metrics


if __name__ == "__main__":
    sys.exit(main())
