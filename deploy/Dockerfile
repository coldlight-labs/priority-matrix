# Images for the self-hosted app (ADR 0003, #66). One build stage, two small final images:
#   server: the API (dist-server/), run as Node's unprivileged "node" user
#   web:    Caddy with the site files (dist-site/) and deploy/Caddyfile
# Base images are pinned to exact versions; update them on purpose, in a pull request.

FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:site && npm run build:server

FROM node:24.22.1-alpine3.24 AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist-server ./
# A new data volume takes this folder's owner, so the "node" user can write to it.
RUN mkdir /data && chown node:node /data && chmod 700 /data
USER node
EXPOSE 8080
CMD ["node", "main.js"]

FROM caddy:2.11.7-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist-site /srv
