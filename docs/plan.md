# Priority Matrix: MVP plan

Status: agreed 2026-10-22. Build starts in a separate code session.

## 1. Problem
One place to capture every task across all of the owner's endeavors, each scored on urgency and importance (0 to 100), so "what should I work on right now?" is answered at a glance.

## 2. Bad news first
- Data lives in the claude.ai artifact database. The app only works inside claude.ai until a migration (see ADR 0001).
- The artifact runtime (`claude.use("db")`, `claude.use("downloads")`) is not available in local development. Local preview and tests use an in-memory adapter, so the real database adapter is only exercised after publishing.
- AI scoring is out of scope for the MVP. It would add a new trust boundary (task text sent to a model).

## 3. Project shape
- Type: single-user web app. Tier: **Tool**.
- Stack: TypeScript (strict mode), Vite (build and dev preview), Vitest (tests). No UI framework. Matrix drawn as inline SVG.
- Deploy target: private claude.ai artifact, built output published with the Artifact tool (multi-file publish, no single-file bundling plugin needed).

## 4. Pre-build clearance
- Users: The owner only.
- Data: task text, domain label, two scores, timestamps, status. No personal data by design, though free text may mention people or companies. The artifact is private.
- Access: the page uses the artifact `db` and `downloads` capabilities, granted by the viewer at first use. No tokens or secrets.
- Approvals: none beyond the owner.
- Deploy target: claude.ai artifact.

## 5. Agreed decisions (closing summary)
- Q1: a. Private claude.ai artifact with its built-in database. Recorded in ADR 0001.
- i1: accepted. Quadrant line at 50 on each axis; 50 counts as high (urgent / important).
- i2: accepted. Next up = DO task with the highest urgency + importance; ties go to higher importance.
- i3: changed. Domain labels are data, managed in the app (create, rename, archive). Seeded with the owner's own list. Archiving a label keeps its tasks. (Seed list replaced on 2026-10-23, then by general names in #74; see progress.md.)
- i4: accepted. Dependencies: TypeScript, Vite, Vitest. Confirm exact versions, maintenance and MIT license at setup, then pin and commit the lockfile.
- i5: accepted. This plan plus `progress.md` are the handover to the code session.
- i6: accepted. One domain label per task. Multiple tags to be reassessed later.
- Export button: added to the MVP. Downloads all tasks and labels as JSON and CSV.

## 6. Architecture

### System map
```
[Browser page] --claude.use("db")--> [claude.ai artifact database]
       |
       +--claude.use("downloads")--> [Viewer's device: export files]
```

### Module map (modular monolith, dependencies point inward)
```
src/
  core/              Task, Label types; quadrant rule; next-up rule; validation. No browser, storage or framework imports.
  features/
    capture/         Quick-capture box, score sliders, label picker
    labels/          Label manager (create, rename, archive)
    tasks-list/      List grouped by quadrant, Next up highlight
    matrix/          SVG scatter plot with four quadrants
    export/          Builds JSON and CSV from repository data
  adapters/
    storage/         TaskRepository + LabelRepository interfaces' implementations:
                     memory (dev, tests) and artifact-db (production)
    downloads/       Wraps claude.use("downloads")
  app/               Entry point: picks adapters, wires features
```
Import rules (blocking from day one): `core` imports nothing internal; `features/*` import `core` and repository interfaces only, never each other and never `adapters`; only `app` imports `adapters`.

### Patterns
- Repository per aggregate (Task, Label) behind interfaces owned by `core`.
- Adapter for the artifact database and downloads.
- Schema validation at the boundary (capture input and data loaded from the database), typed objects inside.

### Trust boundaries
| Boundary | Threat | Check |
|---|---|---|
| User input to app | Oversized or malformed text, out-of-range scores, unknown label | Validate in `core`: text 1 to 500 chars, scores integers 0 to 100, label must exist and be active. Render text with `textContent`, never `innerHTML`. |
| Artifact database to app | Corrupt or old-shape documents | Validate every loaded document; skip and log invalid ones, never crash. Store a `schemaVersion` field. |
| App to artifact database | Others writing if the artifact is ever shared | `db` rules: `tasks` and `labels` readable at `view`, writable by `owner` only. Revisit before sharing. |
| App to viewer device (export) | Formula injection when CSV opens in Excel | Prefix cells starting with `=`, `+`, `-`, `@` with a single quote. |

## 7. Steps (one board card each)
1. **Project setup** (30 min): repo, board, TypeScript strict, lint, import rules, Vitest, CI. Needs approval for repo and board creation.
2. **Core rules plus tests** (45 min): types, validation, quadrant rule, next-up rule.
3. **Storage and export** (60 to 90 min): repository interfaces, memory adapter, artifact-db adapter, JSON and CSV export, tests on the memory adapter and export.
4. **Capture, label manager, grouped list** (90 min).
5. **Matrix view, Next up highlight, publish** (60 min): first artifact publish with `db` and `downloads` capabilities.

## 8. Verification
- Step 2: tests pass for scores 49, 50, 51; ties in Next up; empty DO quadrant (no Next up shown).
- Step 3: tests pass for save, load, archive label, export output (including a cell starting with `=`).
- Step 4: in local preview, add a task, create and archive a label, reload: data present (memory adapter persists for the session only).
- Step 5: after publishing, add a task on laptop, open on phone, task present. Export downloads both files. One `ArtifactData` list of `tasks` and `labels` confirms the stored shape.

## 9. Later (not in MVP)
- Today list with completion celebration
- Ideas and Graveyard tabs
- AI scoring suggestions (new trust boundary): parked, not urgent (2026-10-26)
- Due dates that raise urgency automatically
- ~~Multiple tags per task (i6)~~: discarded, not needed (2026-10-26)
- Adjustable quadrant line (i1): parked (2026-10-26)

## 10. Open points
- None blocking. Last labels used: Q1, i6.
