# Adaptive Gamification - backend API.
#
# Build from the backend directory:
#   docker build -t gamification-api .
#   docker run --rm -p 3002:3002 \
#     -e MONGODB_URI=... -e CODE_COACH_URL=... -e ML_SERVICE_URL=... gamification-api
#
# This service issues and verifies no tokens of its own. Every request is
# checked against Code Coach, so CODE_COACH_URL must be set and reachable or
# nothing authenticates. There is deliberately no JWT_SECRET.

FROM node:22-alpine

WORKDIR /app

# Manifests first so `npm ci` caches across source changes. `ci` rather than
# `install` because it installs exactly what package-lock.json pins.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config ./config
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY server.js ./

# data/ is deliberately NOT copied. It holds the question-bank seeds and the
# local dev seeder, which are run by hand against a database, not by the
# running service - and simulate_students.js generates fabricated sessions that
# have no business anywhere near a deployed image.

# Drop root. node:alpine ships an unprivileged `node` user for exactly this.
USER node

# 3002, not 3000: PairPath's frontend owns 3000 and its API owns 3001.
ENV PORT=3002
EXPOSE 3002

CMD ["node", "server.js"]
