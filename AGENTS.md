# Project: Priority Matrix

Project-specific rules. They add to the global engineering principles and override them where they conflict. Keep this file short.

## About
- Purpose: capture every task across all endeavors, scored on urgency and importance (0 to 100), so "what should I work on right now?" is answered at a glance.
- Project type: web app with a few separate accounts, self-hosted on the owner's VPS at matrix.example.com (ADR 0003, #71; runbook in `docs/hosting.md`). The claude.ai artifact version was retired on 2026-10-27 (#80); its build still works.
- Tier: tool
- Repo: https://github.com/coldlight-labs/priority-matrix (public, MIT; the earlier private repo is archived)
- `main` is protected: changes go through pull requests, and the CI job "checks" must pass on an up-to-date branch (#5). Issue numbers below #84 in older docs refer to the archived private repo.
- Board: the owner's private GitHub project board

## Stack and commands
- Language and runtime: TypeScript 6.0 (strict), Node 24 for tooling; runs in the browser
- Package manager: npm (versions pinned exactly, `package-lock.json` committed)
- Install: `npm ci`
- Format: `npm run format` (check: `npm run format:check`)
- Lint: `npm run lint`
- Type check: `npm run typecheck`
- Import rules: `npm run imports` (blocking; rules in `.dependency-cruiser.cjs`, proven by `test/import-rules.test.ts`)
- Personal details: `npm run private-words` (blocking in pre-commit and CI; words in the git-ignored `.private-words`, mirrored in the `PRIVATE_WORDS` secret; never commit names, domains, server names or private labels, #74)
- Test: `npm test`
- Run locally: `npm run dev` (in-memory storage only; the artifact runtime is not available locally)
- Build: `npm run build` (claude.ai artifact, `dist/`, published with the Artifact tool); `npm run build:site` (site for the VPS, `dist-site/`); `npm run build:server` (`dist-server/`)
- Local server test: `npm run dev:server` and `npm run dev:site` (two made-up test accounts in `dev/`)
- Deploy: `deploy/update.sh` on the VPS, with the site addresses in the VPS-only `deploy/.env`; runbook in `docs/hosting.md`
- Backups: nightly by a systemd timer that `update.sh` installs; by hand `sudo deploy/backup.sh`; restore `sudo deploy/restore.sh <file>` (#77)
- Everything at once: `npm run check`
- Updates: Dependabot opens weekly pull requests for npm packages, the Docker base images and the GitHub Actions (`.github/dependabot.yml`, #82); review and merge them like any other pull request, then run `deploy/update.sh` on the VPS

## Compliance scope
- Personal data handled: none by design; free-text tasks may mention people or companies
- Applicable privacy law: none; personal use by an individual is outside the local privacy law (Q53: a). Follow the privacy principles as good practice, and revisit before sharing the page or using it for a business.
- Data region: one file per account on the owner's VPS, plus nightly backups there (#77). Testers' text may mention people: follow privacy good practice and tell testers what is stored and how to have it deleted.

## Infrastructure
- Uses global defaults: no. Hosting is the owner's VPS: Docker Compose with Caddy and the Node server, set up from `deploy/` (ADR 0003).

## Architecture
- Shape, trust boundaries, data stores and module map: `docs/architecture.md` (read it before planning).
- Architecture review: every 3 merged features.

## Overrides of global rules
- Merging pull requests (global: never allowed). Here Claude may merge a pull request when all three hold: CI passes, Claude has posted in chat an explicit review list of what the owner must check (structure, trust boundaries, decisions to accept), and the owner approves that list in chat. Approval covers that pull request only. The merge command (`gh pr merge`, with `--match-head-commit` set to the reviewed commit) is an "ask" rule in the owner's global Claude Code settings, so the app also asks them to allow it once. Reason: The owner's decision, 2026-10-23, to save a step while keeping the review.
- Scale to zero, no always-on servers (global infra rule). Here the server runs all the time on the VPS the owner already pays for, so it adds no cost. Reason: Q89: a, Q90: a, 2026-10-27.
- Infrastructure as code, no console changes (global). Exception: the DNS record for example.com is set by hand in the DNS provider's panel and recorded in `docs/progress.md`. Everything on the VPS comes from `deploy/`.

## Conventions decided for this project
- Render user text with `textContent` or DOM nodes; `innerHTML`, `outerHTML` and `insertAdjacentHTML` are blocked by ESLint.
- TypeScript pinned to 6.0.x until typescript-eslint supports 7.
