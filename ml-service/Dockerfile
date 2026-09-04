# Adaptive Gamification - ML service (difficulty prediction).
#
# Build from the ml-service directory:
#   docker build -t gamification-ml .
#   docker run --rm -p 5000:5000 gamification-ml
#
# This service has NO authentication and permissive CORS, by design: the
# backend is expected to sit in front of it. Deploy it to a private subnet with
# a security group that admits only gamification-api. It must never be given a
# public listener.

FROM python:3.12-slim

# Dependencies first so the layer caches across code changes.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

WORKDIR /app

# model.pkl is COPIED IN, not trained here. Training at image-build time would
# make every build depend on MongoDB Atlas being reachable and would silently
# produce a different model per build. retrain_from_db.py is run deliberately,
# offline, and its output is committed - which is also why the .gitignore
# carries an explicit `!model.pkl` negation.
# training_data.py is imported by app.py (for the feature names and the
# difficulty ordinals) and by retrain_from_db.py, which /retrain shells out
# to. Leaving either out builds an image that dies on import.
COPY app.py training_data.py retrain_from_db.py model.pkl ./

# Fails the build rather than shipping an image whose /predict answers 503 -
# the exact failure this service had in practice. The bundle shape is checked
# too: a bare estimator is the pre-rewrite artifact, fitted on leaked features
# against a different target, and app.py refuses to serve it at runtime. Better
# to find that here than in a container that starts and then answers 503.
RUN python -c "import joblib; b = joblib.load('model.pkl'); \
    assert isinstance(b, dict) and 'model' in b and 'feature_columns' in b, \
    'model.pkl is not a trained bundle - run retrain_from_db.py'; \
    print('model loaded:', type(b['model']).__name__, \
    '| features:', len(b['feature_columns']), \
    '| reportable:', b.get('card', {}).get('reportable'))"

ENV PORT=5000
EXPOSE 5000

# gunicorn, not app.run(): that path is Flask's development server, and it also
# reads FLASK_DEBUG. Two workers is enough for a single predict() over a
# 128 KB forest; the timeout is generous because the first request pays the
# scikit-learn import.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 60 app:app"]
