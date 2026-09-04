from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# CORRECTION 2: Add flask-cors
CORS(app)

MODEL_PATH = os.path.join(os.path.dirname(__file__), 'model.pkl')

def load_model():
    if os.path.exists(MODEL_PATH):
        return joblib.load(MODEL_PATH)
    return None

model = load_model()

@app.route('/predict', methods=['POST'])
def predict():
    if not model:
        return jsonify({"error": "Model not trained yet"}), 500
        
    data = request.json
    if not data:
        return jsonify({"error": "No input data provided"}), 400
        
    # CORRECTION 1: add conceptTag as a required field in the request body
    if 'conceptTag' not in data:
        return jsonify({"error": "conceptTag is required in the request body"}), 400

    required_features = ['avg_score', 'avg_attempts', 'avg_hint_usage', 'avg_time_seconds', 'repeat_error_count', 'games_played']
    missing_features = [feat for feat in required_features if feat not in data]
    if missing_features:
        return jsonify({"error": f"Missing features: {', '.join(missing_features)}"}), 400

    # Extract features for prediction
    features = {feat: [data[feat]] for feat in required_features}
    df_features = pd.DataFrame(features)
    
    try:
        prediction = model.predict(df_features)[0]
        # In a real setup, we might also get probability/confidence
        probabilities = model.predict_proba(df_features)[0]
        confidence = float(max(probabilities))
        
        return jsonify({
            "difficulty": prediction,
            "confidence": confidence,
            "conceptTag": data["conceptTag"]
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/retrain', methods=['POST'])
def retrain():
    # CORRECTION 3: Add a simple secret key check
    req_secret = request.headers.get('X-Retrain-Secret')
    env_secret = os.environ.get('RETRAIN_SECRET')
    
    if not (req_secret and env_secret and req_secret == env_secret):
        return jsonify({"error": "Forbidden: Invalid or missing X-Retrain-Secret"}), 403

    # Expects new training rows from MongoDB
    data = request.json
    if not data or 'training_data' not in data:
        return jsonify({"error": "No training_data provided"}), 400
        
    new_data_df = pd.DataFrame(data['training_data'])
    
    # Needs complete feature set + difficulty_level
    features = ['avg_score', 'avg_attempts', 'avg_hint_usage', 'avg_time_seconds', 'repeat_error_count', 'games_played']
    if 'difficulty_level' not in new_data_df.columns:
         return jsonify({"error": "training_data must include difficulty_level labels"}), 400
         
    for feat in features:
        if feat not in new_data_df.columns:
            return jsonify({"error": f"training_data missing feature {feat}"}), 400

    # Retrain on the rows supplied in the request body. This replaces the model
    # rather than appending to the previous training set - the caller is expected
    # to send the full corpus it wants the model fitted on.
    #
    # There used to be a `from train import generate_synthetic_data` here. train.py
    # was deleted when retraining moved onto real game sessions (retrain_from_db.py
    # says so outright: "The fake synthetic data generation script (train.py) can
    # now be safely deleted"), but the import stayed behind - so every call to this
    # endpoint died with ModuleNotFoundError before it reached the model. The name
    # was never used in this function even when the module existed.
    try:
        from sklearn.ensemble import RandomForestClassifier

        X = new_data_df[features]
        y = new_data_df['difficulty_level']

        # max_depth=4 matches retrain_from_db.py. Without it this endpoint quietly
        # produced a differently-regularised model than the offline trainer, so
        # which path last wrote model.pkl changed the model's behaviour.
        new_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=4)
        new_model.fit(X, y)
        
        joblib.dump(new_model, MODEL_PATH)
        global model
        model = new_model
        
        return jsonify({"message": "Model retrained successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # 5000 is this service's original port and what the team's .env files
    # already point at; it collides with nothing else in the platform
    # (Code Coach 8000, Study Guider 8010, PairPath ml-service 8020).
    # Configurable via PORT for anyone who needs to move it - on macOS, 5000 is
    # taken by AirPlay Receiver.
    #
    # debug defaults OFF. It used to be hardcoded True, which turns on the
    # Werkzeug interactive debugger - and that debugger executes arbitrary
    # Python typed into any traceback page it serves. On a service that has no
    # authentication of its own, anything able to reach the port would have had
    # a shell. Opt in explicitly for local work with FLASK_DEBUG=1.
    debug = os.environ.get('FLASK_DEBUG', '').lower() in ('1', 'true', 'yes')
    app.run(port=int(os.environ.get('PORT', 5000)), debug=debug)
