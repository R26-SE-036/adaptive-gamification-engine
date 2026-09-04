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
COPY app.py model.pkl ./

# Fails the build rather than shipping an image whose /predict answers
# 500 "Model not trained yet" - the exact failure this service had in practice.
RUN python -c "import joblib, sys; m = joblib.load('model.pkl'); \
    print('model loaded:', type(m).__name__, 'max_depth=', getattr(m, 'max_depth', None))"

ENV PORT=5000
EXPOSE 5000

# gunicorn, not app.run(): that path is Flask's development server, and it also
# reads FLASK_DEBUG. Two workers is enough for a single predict() over a
# 128 KB forest; the timeout is generous because the first request pays the
# scikit-learn import.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 60 app:app"]
