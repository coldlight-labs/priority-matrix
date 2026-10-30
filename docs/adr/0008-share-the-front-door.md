# 0008. Share the front door with a second app

- Status: accepted
- Date: 2026-10-30

## Context
The owner runs a second app on the same VPS. Only one program can hold ports 80 and 443, and this app's Caddy already does. The second app needs HTTPS on its own address.

## Decision
This Caddy also serves the second app. Its address and upstream (container name and port) come from `deploy/.env` (`EXTRA_SITE_ADDRESS`, `EXTRA_SITE_UPSTREAM`), so no name or domain enters the repo. Caddy joins an external Docker network, `edge`, which the second app's web container also joins. This app's server is not on `edge`, so the second app cannot reach it.

## Alternatives considered
- A separate front-door Caddy in front of both apps: rejected for now. A second proxy hop puts the front door's address last in `X-Forwarded-For`, which the server reads for its per-address limits, so every client would share one limit and an agent's API access could be locked out.
- The second app's site block in its own repo, loaded by this Caddy from a folder on the VPS: rejected. A mistake there could stop this Caddy from starting, and the block would skip this repo's checks.

## Consequences
- `docker network create edge` must exist before `update.sh`, on the VPS and for a local test.
- A change to the second app's headers is a pull request here.
- If this Caddy is down, both apps are down.
