"""Compare candidate algorithms on the difficulty task, for the write-up.

This file used to contain its own copy of the feature-engineering block from
`retrain_from_db.py`, leak and all - including the line that set
`repeat_error_count` from `difficultyLevel` and then predicted `difficultyLevel`.
Because it prints "student session records for research evaluation", its numbers
were the ones headed for the dissertation, and they were measuring an if/else.

Duplication is what let that happen: the leak was fixed in neither file because
it had to be fixed in both. Row construction now lives in `training_data.py` and
is imported by the trainer and by this script, so the two cannot disagree again.

Usage
    python evaluate_models.py
    python evaluate_models.py --include-simulated   # stamped NOT REPORTABLE
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from training_data import (
    FEATURE_COLUMNS,
    build_rows,
    check_sufficiency,
    load_sessions_from_mongo,
    provenance_summary,
)

# A baseline that ignores every feature and predicts the overall success rate.
# Any candidate that cannot beat it has learned nothing, and reporting a table
# without it is how a model that learned nothing still looks like a result.
CANDIDATES = {
    "baseline_base_rate": DummyClassifier(strategy="prior"),
    "logistic_regression": make_pipeline(
        StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced")
    ),
    "decision_tree": DecisionTreeClassifier(
        max_depth=4, min_samples_leaf=5, class_weight="balanced", random_state=42
    ),
    "random_forest": RandomForestClassifier(
        n_estimators=200, max_depth=5, min_samples_leaf=5,
        class_weight="balanced", random_state=42,
    ),
    "svm_rbf": make_pipeline(
        StandardScaler(), SVC(probability=True, class_weight="balanced", random_state=42)
    ),
    "knn": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5)),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--include-simulated", action="store_true")
    args = parser.parse_args()

    sessions = load_sessions_from_mongo()
    frame = build_rows(sessions)

    if not args.include_simulated:
        frame = frame[frame["source"] == "real"].reset_index(drop=True)

    if not len(frame):
        print("No usable rows after filtering. Nothing to evaluate.")
        return 2

    print("--- Corpus ---")
    print(json.dumps(provenance_summary(frame), indent=2))

    reasons = check_sufficiency(frame)
    if reasons:
        print("\n--- NOT REPORTABLE ---")
        for reason in reasons:
            print(f"  * {reason}")
        print(
            "\nThe table below still prints, because seeing the pipeline run is\n"
            "useful. The numbers in it are not results and must not be quoted."
        )

    if frame["user_id"].nunique() < 4:
        print("\nToo few students to hold any out. Refusing to print a comparison table:")
        print("scores on data a model was fitted to are not a comparison.")
        return 2

    groups = frame["user_id"].to_numpy()
    X, y = frame[FEATURE_COLUMNS], frame["success"].to_numpy()

    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_idx, test_idx = next(splitter.split(X, y, groups))
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    print(f"\nTrain {len(X_train)} rows / Test {len(X_test)} rows, split by student.")
    print(f"Test students: {sorted(set(groups[test_idx]))}\n")

    rows = []
    for name, estimator in CANDIDATES.items():
        estimator.fit(X_train, y_train)
        probabilities = estimator.predict_proba(X_test)[:, 1]
        rows.append(
            {
                "model": name,
                "brier": round(float(brier_score_loss(y_test, probabilities)), 4),
                "roc_auc": (
                    round(float(roc_auc_score(y_test, probabilities)), 4)
                    if len(np.unique(y_test)) > 1
                    else None
                ),
            }
        )

    table = pd.DataFrame(rows).sort_values("brier")
    print(table.to_string(index=False))
    print("\nLower Brier is better; it scores the probability, not a 0.5 cut.")
    print("A candidate that does not beat baseline_base_rate has learned nothing.")

    if reasons:
        print("\nReminder: NOT REPORTABLE. See the reasons above.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
