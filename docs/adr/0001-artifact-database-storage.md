# 0001: Store data in the claude.ai artifact database

- Status: superseded by 0003 (2026-10-27). The move to the VPS is complete and the owner deleted the claude.ai artifact (#80). The artifact build (`npm run build`) still works for anyone who wants it.
- Date: 2026-10-22

## Context
The tool must keep tasks between sessions and across the owner's phone and laptop, with no hosting to run.

## Options considered
- a. Private claude.ai artifact with its built-in database. Syncs across devices, no hosting, no secrets.
- b. Static site on GitHub Pages with browser storage. Independent of claude.ai, but data is stuck in one browser.
- c. Notion or Google Sheets backend. Data visible in a familiar tool, but needs API tokens and roughly double the build effort.

## Decision
Option a.

## Consequences
- The app runs only inside claude.ai.
- All storage access goes through repository interfaces in `core`, implemented in `adapters/storage`, so a migration means one new adapter plus a one-time import of the exported JSON (estimated 1 to 3 hours).
- An export button (JSON and CSV) is part of the MVP as the exit path.
- Local development and tests use an in-memory adapter because the artifact runtime is not available locally.
