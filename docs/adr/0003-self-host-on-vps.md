# 0003: Host the app on the owner's VPS, one secret link per account

- Status: accepted (Q90: a, 2026-10-27)
- Date: 2026-10-27
- Supersedes: 0001 (move complete 2026-10-27; the claude.ai artifact was deleted, #80)
- Amended: the app moved to matrix.example.com so the main domain stays free for other sites (Q102: a, #71). Where this record says example.com for the app, read matrix.example.com.

## Context
The owner wants the app on their own domain (example.com, on a VPS already paid for), reachable from their phone and laptop, and wants to give two or three other people their own copy. Each person's tasks must be invisible to the others. There must be no login page; sharing a link is enough.

The claude.ai artifact (ADR 0001) cannot do this: every viewer needs a claude.ai account, the page lives on claude.ai, and its database is one shared store per artifact.

## Decision
- **One small server in this repo** (`server/`, Node.js 24, the same runtime the tooling uses). It serves an HTTP API for tasks, labels and the checked saves, and imports `src/core` so the server enforces the same rules as the app. No web framework.
- **Caddy in front** serves the built app and forwards `/api` to the server. It obtains and renews the HTTPS certificate for example.com on its own.
- **Both run with Docker Compose** from a `deploy/` folder in the repo, so the server setup is code, reviewed in pull requests.
- **One secret link per account, no login.** A link looks like `https://example.com/#key=<key>`. The key is 32 random bytes (256 bits). The part after `#` is never sent with page requests, so it does not reach server or proxy logs. The app keeps the key in that browser and sends it as a bearer token on every API call. The server stores only a SHA-256 hash of each key, compares in constant time, and maps it to an account id it generated itself.
- **Separate data per account.** Each account's tasks and labels live in their own JSON file under the data folder. The file path comes from the server's account id, never from anything a request contains, so one key cannot reach another account's file.
- **Accounts are managed only over SSH**, with a command on the VPS (`create`, `list`, `revoke`). It prints a new link once. There is no admin page on the web.
- **Checked saves move to the server.** The single server process serializes writes per account, so "save if unchanged", "delete if unchanged" and "save label if the name is free" are each one step on the server. This replaces the artifact database leases (#34, #56) for this deployment.
- **Sync between devices by polling.** Each account has a revision number that goes up on every write; the app asks for changes every 5 seconds while visible.
- **Storage is plain JSON files**, written to a temporary file and renamed, so a crash never leaves half a file. The data is small (hundreds of tasks per person). SQLite, built into Node 24 as `node:sqlite`, is the next step if that ever stops being true; not used now because its status in Node 24 should be checked first and plain files need nothing new.
- **Nightly backup** of the data folder, kept 30 days, with a tested restore.
- **The app picks its storage by where it runs:** inside claude.ai, the artifact database (kept working until the move is done); on example.com, the new HTTP adapter; anywhere else, in-memory (local preview).

## Alternatives considered
- **Static site on the VPS with a hosted database (for example Supabase):** less server code, but the data lives with a third party, API keys must be managed, and per-person separation depends on getting row-level security right in someone else's system.
- **Stay on claude.ai:** no work, but fails both goals (own domain, people without claude.ai accounts).
- **A login page with passwords:** the owner asked for none; passwords also bring reset flows and password storage. Secret links give each person access with nothing to remember, at the cost that the link is the credential (see Consequences).
- **Keys in the query string (`?key=`):** query strings are sent to the server and end up in logs and browser history; the `#` fragment is not sent.
- **SQLite now:** fine, but nothing today needs it.

## Consequences
- The owner becomes the host: OS updates, the firewall, SSH access and backups are theirs to keep up, with step-by-step instructions in `docs/hosting.md`.
- **The link is the credential.** Anyone holding a link has full access to that account until it is revoked. Links should be sent privately, never posted. Revoking is one command; the person then needs a new link.
- A cleared browser loses the stored key; the person opens their link again.
- The server is always on. The VPS is already paid for, so this adds no cost, but it overrides the global rule "scale to zero, no always-on servers" (recorded in `AGENTS.md`).
- Pointing example.com at the VPS is a manual DNS change in the DNS provider's panel, the one console change outside the repo (recorded in `docs/progress.md`).
- Testers' task text may mention people. The project follows the privacy principles as good practice: testers get a short note on what is stored, where, and how to have it deleted (revoke plus delete the file).
- Export changes on the server: the claude.ai `downloads` capability is not there, so the app uses a normal browser download.
- The storage interfaces in `core` (ADR 0001) mean the app itself barely changes: one new adapter.

## Threat check (STRIDE) for the new boundary: internet to the app server, 2026-10-27

| Threat | Question | Controls in the plan |
|---|---|---|
| Spoofing | Can someone act as another account? | 256-bit random keys; only hashes stored; constant-time compare; account from the key only, never from the request; revoke command |
| Tampering | Can data be changed in transit or at rest? | HTTPS only (Caddy, HSTS); every stored document checked with the `core` parsers before writing; checked saves refuse stale writes; files written whole and renamed |
| Repudiation | Do we need proof of who did what? | Small append-only log of account changes and failed key attempts (account id, time, action; no keys, no task text) |
| Information disclosure | Could data leak? | Key in the URL fragment, not the query; `Referrer-Policy: no-referrer`; no task text or keys in logs; generic error messages; file paths never built from input; data folder outside the web root |
| Denial of service | Can it be flooded or filled? | Request body limit 64 KB; per-account limits (5,000 tasks, 200 labels); rate limit per IP and per key; Caddy timeouts |
| Elevation of privilege | Can a request reach more than its account? | No admin endpoints over HTTP (SSH only); every API call authorized server-side; the server runs as a non-root user in its container with only the data folder writable |

Gaps that need the owner on the VPS (in `docs/hosting.md`): SSH with keys only, a firewall allowing only ports 22, 80 and 443, and automatic security updates.
