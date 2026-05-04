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

    # Import train-related functions to retrain model 
    # For a real system we would append to old data, but here we just retrain
    try:
        from train import generate_synthetic_data
        from sklearn.ensemble import RandomForestClassifier
        
        # In a real environment, combine previous db data, but for now just train on new data + maybe some synthetic fallback
        X = new_data_df[features]
        y = new_data_df['difficulty_level']
        
        new_model = RandomForestClassifier(n_estimators=100, random_state=42)
        new_model.fit(X, y)
        
        joblib.dump(new_model, MODEL_PATH)
        global model
        model = new_model
        
        return jsonify({"message": "Model retrained successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
