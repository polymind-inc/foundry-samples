# Multi-stage build: compile the bundle inside Docker so the runtime image
# contains only the self-contained artifact.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN npm run build

# The container contract: listen on 0.0.0.0:${PORT:-8088} and answer GET /readiness.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/main.mjs ./main.mjs
COPY --from=build /app/dist/main.mjs.map ./main.mjs.map

# Foundry probes this port; binding elsewhere makes every invocation fail with session_not_ready.
EXPOSE 8088

CMD ["node", "main.mjs"]
