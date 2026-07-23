# p2000.typeguru.nl backend (justscale). Runs via tsx + the justscale register
# hook (the framework uses a custom compiler; there is no plain tsc build).
# Build from the repo root:  docker build -f backend/Dockerfile .
FROM node:24-slim

RUN corepack enable
WORKDIR /repo

# Manifests + patch first (layer cache). The pnpm patch for @justscale/postgres
# (temporal-field default) is applied on install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches ./patches
COPY backend/package.json ./backend/package.json
COPY agent/package.json ./agent/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

# App source + the frontend it serves.
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /repo/backend
ENV NODE_ENV=production PORT=3000
EXPOSE 3000

# main.ts applies pending migrations, then serves.
CMD ["node", "--import", "@justscale/typescript/register", "--import", "tsx", "src/main.ts"]
