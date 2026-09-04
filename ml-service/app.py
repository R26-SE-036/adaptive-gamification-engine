"""The difficulty service.

/predict no longer classifies difficulty. It scores each candidate difficulty
for this student and lets a stated policy choose between them:

    for D in Easy, Medium, Hard:
        p[D] = P(success | this student's history, D)
    choose the hardest D whose p[D] >= TARGET_SUCCESS_FLOOR

Splitting it this way is the point. The model answers a question that has a
right answer observable in the data - did the student succeed - and the
value judgement about how hard a game *should* feel is a constant in this file
that anyone can read and argue with. The old endpoint fused the two into a
classifier trained to reproduce a rule, and neither half could be inspected.

See training_data.py for what was wrong with the previous target.
"""

import json
import os
import subprocess
import sys

import joblib
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS

from training_data import DIFFICULTY_ORDINAL, HISTORY_FEATURES

app = Flask(__name__)
CORS(app)

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(HERE, "model.pkl")

# The success rate a student should be running at. Below this a game is
# discouraging; well above it there is nothing left to learn. 0.70 sits in the
# band the mastery-learning literature settles on, and it is a judgement call
# rather than a measurement - which is exactly why it lives here, named, in one
# place, instead of inside a model's weights.
TARGET_SUCCESS_FLOOR = float(os.environ.get("TARGET_SUCCESS_FLOOR", "0.70"))

DIFFICULTIES = sorted(DIFFICULTY_ORDINAL, key=DIFFICULTY_ORDINAL.get)


def load_bundle():
    """The trained bundle, or None.

    retrain_from_db.py writes {"model", "feature_columns", "card"}. A bare
    estimator is the pre-rewrite artifact, which was fitted on different
    features against a different target: loading it would predict confidently
    and wrongly, so it is refused by name.
    """
    if not os.path.exists(MODEL_PATH):
        return None

    loaded = joblib.load(MODEL_PATH)
    if not isinstance(loaded, dict) or "model" not in loaded:
        print(
            "model.pkl is in the pre-rewrite format: a difficulty classifier fitted "
            "on leaked features. Refusing to serve it. Run retrain_from_db.py.",
            file=sys.stderr,
        )
        return None

    card = loaded.get("card", {})
    if not card.get("reportable", False):
        print(
            "Loaded a model whose card says reportable: false. It will serve, and "
            "every response says so. Do not quote its metrics.",
            file=sys.stderr,
        )
    return loaded


bundle = load_bundle()


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "model_loaded": bundle is not None,
            "reportable": bool(bundle and bundle["card"].get("reportable")),
            "target_success_floor": TARGET_SUCCESS_FLOOR,
        }
    )


@app.route("/model-card", methods=["GET"])
def model_card():
    if not bundle:
        return jsonify({"error": "No usable model is loaded."}), 503
    return jsonify(bundle["card"])


@app.route("/predict", methods=["POST"])
def predict():
    """Score every difficulty for one student, and apply the policy."""
    if not bundle:
        return (
            jsonify(
                {
                    "error": "No usable model is loaded.",
                    "detail": "Run retrain_from_db.py. Until it can fit, the backend's "
                    "stated heuristic is the correct thing to serve.",
                }
            ),
            503,
        )

    data = request.get_json(silent=True) or {}

    if "conceptTag" not in data:
        return jsonify({"error": "conceptTag is required"}), 400

    missing = [name for name in HISTORY_FEATURES if name not in data]
    if missing:
        return jsonify({"error": f"Missing history features: {', '.join(missing)}"}), 400

    # A student with no history on this concept has nothing for the model to
    # read. Saying so lets the caller apply its cold-start rule rather than
    # having this service invent an average student and call it a prediction.
    if float(data["games_played"]) < 1:
        return (
            jsonify(
                {
                    "error": "No history for this student on this concept.",
                    "detail": "games_played is 0. The model describes a student by what "
                    "they have already done; with nothing done there is nothing to "
                    "describe. Use the caller's cold-start difficulty.",
                    "cold_start": True,
                }
            ),
            422,
        )

    try:
        rows = pd.DataFrame(
            [
                {
                    **{name: float(data[name]) for name in HISTORY_FEATURES},
                    "difficulty_ordinal": DIFFICULTY_ORDINAL[difficulty],
                }
                for difficulty in DIFFICULTIES
            ]
        )[bundle["feature_columns"]]

        probabilities = bundle["model"].predict_proba(rows)[:, 1]
    except (TypeError, ValueError) as error:
        return jsonify({"error": f"Could not score the request: {error}"}), 400

    predicted = {
        difficulty: round(float(probability), 4)
        for difficulty, probability in zip(DIFFICULTIES, probabilities)
    }

    chosen, reason = apply_policy(predicted)

    return jsonify(
        {
            "difficulty": chosen,
            "confidence": predicted[chosen],
            "predicted_success": predicted,
            "policy": {
                "rule": "hardest difficulty with predicted success >= floor, "
                "else the easiest available",
                "target_success_floor": TARGET_SUCCESS_FLOOR,
                "reason": reason,
            },
            "conceptTag": data["conceptTag"],
            "model_version": bundle["card"].get("trained_at"),
            "reportable": bool(bundle["card"].get("reportable")),
        }
    )


def apply_policy(predicted: dict[str, float]) -> tuple[str, str]:
    """Pick a difficulty from the per-difficulty success probabilities."""
    for difficulty in reversed(DIFFICULTIES):
        if predicted[difficulty] >= TARGET_SUCCESS_FLOOR:
            return difficulty, (
                f"{difficulty} is the hardest level with predicted success "
                f"{predicted[difficulty]:.2f} >= {TARGET_SUCCESS_FLOOR:.2f}"
            )

    easiest = DIFFICULTIES[0]
    return easiest, (
        f"no level reaches the {TARGET_SUCCESS_FLOOR:.2f} floor "
        f"(best was {max(predicted.values()):.2f}), so the easiest is served"
    )


@app.route("/retrain", methods=["POST"])
def retrain():
    """Re-run the offline trainer against the database.

    This used to accept `training_data` rows, WITH LABELS, in the request body
    and fit on them directly. That put the label under the caller's control,
    which is the same failure the offline trainer had - anything that can send
    a request could decide what the model believes. Retraining now goes through
    retrain_from_db.py, so the sufficiency gate and the provenance filter apply
    to every path that can write model.pkl.
    """
    secret = os.environ.get("RETRAIN_SECRET")
    if not (secret and request.headers.get("X-Retrain-Secret") == secret):
        return jsonify({"error": "Forbidden: invalid or missing X-Retrain-Secret"}), 403

    result = subprocess.run(
        [sys.executable, os.path.join(HERE, "retrain_from_db.py")],
        capture_output=True,
        text=True,
        timeout=600,
    )

    if result.returncode != 0:
        # Exit 2 is the gate refusing, which is a legitimate outcome and not a
        # server fault - the caller asked for something the data cannot support.
        status = 409 if result.returncode == 2 else 500
        return (
            jsonify(
                {
                    "error": "Retraining did not produce a model.",
                    "exit_code": result.returncode,
                    "output": result.stdout[-4000:],
                    "stderr": result.stderr[-2000:],
                }
            ),
            status,
        )

    global bundle
    bundle = load_bundle()

    return jsonify(
        {
            "message": "Model retrained.",
            "reportable": bool(bundle and bundle["card"].get("reportable")),
            "output": result.stdout[-4000:],
        }
    )


if __name__ == "__main__":
    # 5000 is this service's original port and what the team's .env files
    # already point at; it collides with nothing else in the platform
    # (Code Coach 8000, Study Guider 8010, PairPath ml-service 8020).
    # Configurable via PORT - on macOS, 5000 is taken by AirPlay Receiver.
    #
    # debug defaults OFF. It used to be hardcoded True, which turns on the
    # Werkzeug interactive debugger - and that debugger executes arbitrary
    # Python typed into any traceback page it serves. On a service with no
    # authentication of its own, anything able to reach the port would have had
    # a shell. Opt in explicitly for local work with FLASK_DEBUG=1.
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(port=int(os.environ.get("PORT", 5000)), debug=debug)
