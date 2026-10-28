# Progress

## Current state
- Working on: the public repo coldlight-labs/priority-matrix (fresh history, MIT). Work continues here; the earlier private repo is archived.
- Next: testers (Q114); the go-public card (license, fresh repo, likely under a GitHub organization); the encryption idea #78.
- Parked: adjustable quadrant line (i1), AI scoring. Discarded: multiple tags (i6).
- Last labels used: Q121, i167

## Log
### 2026-10-22
- Done: MVP plan agreed (Q1: a; i1, i2, i4, i5, i6 accepted; i3 changed to labels managed in the app; export button added).
- Discovered: the artifact runtime is not available locally, so the plan uses an in-memory adapter for dev and tests.
- Parked: multiple tags per task; adjustable quadrant line; AI scoring.
- Done (code session): Q2: local repo at ~/Documents/projects/priority-matrix. Scaffolded from the template; plan, progress and ADR 0001 saved under docs/.
- Discovered: typescript-eslint 8.72 supports TypeScript below 6.1 only, so TypeScript 7 cannot be used yet. TypeScript is Apache-2.0, not MIT. No TypeScript language file exists in the standards.
- Done: Q3: a (setup approved; i7 to i10 accepted). Added strict TypeScript, ESLint (blocks innerHTML), Prettier, Vitest, Vite, dependency-cruiser import rules with a test proving each boundary rule fires; hooks and CI switched to Node; AGENTS.md and docs/architecture.md filled in.

### 2026-10-23
- Done: Q4: a. Repo (private) and board created; issues #1 to #5 created and added to the board.
- Discovered: branch protection not applied (private repo, free plan). github-setup.sh fails to link the board because it passes "@me" as owner; linked by hand with `--owner <owner>`. Merged the two planned core import rules into one stricter rule (core imports only core).
- Parked: i9, draft languages/typescript.md in engineering-standards; fix the board-link bug in github-setup.sh. Privacy law in AGENTS.md (privacy principles) is an assumption to confirm.
- Done: Q5: a (Auto-fix on for pull requests; fixes still wait for push approval). Q6: a, pull request #6 approved; The owner merged it by hand because the global deny rule blocked `gh pr merge`.
- Done: Q7: a. In global ~/.claude/settings.json, `gh pr merge` moved from deny to ask. Merge flow: review list in chat, approval in chat, one app permission click, then Claude merges.
- Done: Q9: a (#2 plan approved; i11 to i17 accepted). Built core: Result type, Label rules (name 1 to 40 chars, unique among active labels ignoring case; create, rename, idempotent archive), Task rules (text 1 to 500 trimmed, scores whole 0 to 100, active label), stored-document checks for both, quadrant rule, next-up rule, public index.ts. IDs and clock are passed in.
- Discovered: tests inside src/core broke the "core imports only core" rule (they import Vitest), so tests live in test/ mirroring src/ instead of adding an exception. Added src/core/schema.ts (shared stored-document helpers and SCHEMA_VERSION), not in the plan's file list.
- Done: Q10: a, pull request #9 merged by Claude after one approval click.
- Done: Q11: a (#3 plan approved; i18 to i23 accepted). Built ports in core, seed labels with fixed ids, memory and artifact-db repositories, downloads FileSaver, JSON and CSV export.
- Discovered: runtime contract 0.2.89 is the source for db and downloads types (copied minimally into src/adapters/runtime.ts). The db rejects with plain {code, message} objects; tests use Errors carrying a code, the same shape. Added a UTF-8 BOM to the CSV so Excel shows accents correctly (not in the plan).
- Done: Q12: a, pull request #10 merged.
- Done: Q13: a (#4 plan approved; i24 to i29 accepted; happy-dom 21.0.4 added). Built capture form, label manager (two-click archive), quadrant list with done toggle, app wiring, styles. Checked in the built-in browser: quadrants, markup as text, empty-text error, done/reopen, add/duplicate/rename/archive label, phone width with no sideways scroll, light and dark, no console errors.
- Discovered: happy-dom lacks output.htmlFor, so the code sets the for attribute instead. Artifact pages cannot show confirm(), so archive uses a second click. The published page gets its own HTML skeleton (doctype, head), so step 5 must check that the Vite build output fits the Artifact tool's page contract.
- Done: Q15: a. i28 changed: archived labels can be restored (Restore button in the Archived list; refused when an active label has the same name). Checked in the browser.
- Done: Q14: a, pull request #11 merged.
- Done: architecture review #12. Q16: b. Added blocking rule core-only-through-index (#13); fixed doc drift; moved two findings into #5 (storage-missing warning inside claude.ai, build output reduced to page content).
- Done: Q17: a, pull request #14 merged (architecture review).
- Done: Q18 to Q20 (#5 plan approved with changes): dots use label colors; 50-swatch palette chosen manually, contrast-tested in both themes (i35); seed labels replaced by the owner's own list (general names since #74). Built storage-missing warning, Next up card, matrix view, export button, tools/artifact-page build step. Published the artifact with db (owner writes) and downloads; seeded 9 labels with ArtifactData; confirmed an Editor-level write is refused.
- Discovered: Vitest empties CSS imports by default (enabled for styles.css so the palette test reads theme colors). happy-dom ignores style.fill on SVG, so dots use the fill attribute. The built-in browser is not signed in to claude.ai, so live checks need the owner.
- Done: Q21: a, extended by the owner: tasks can be edited inline (text, scores, label) through one Edit form instead of a separate label dropdown. editTask in core lets a task keep a label archived since. Republished (version 2).
- Confirmed: label names are already duplicates regardless of upper/lower case ("house" refused next to "House"), as the owner asked; no change needed.
- Done: #5 live checks passed (the owner, 2026-10-23).
- Decided: Q22: a. Date-based urgency (card #15): optional date with kind (due, review, appointment) and optional local time; urgency = 100 x 2^(-days_left / 7), overdue 100, no date 0; calculated on display (i36, i37); local date and time, not an instant (i38); existing tasks migrated by the inverse formula (i39); export gains date columns (i40); ADR 0002 to be written (i41). Label names get a capital first letter; live "home" becomes "Home" (card #16).
- Decided: Q24: a. Card #15 uses a "Follow-up date (not a firm deadline)" tickbox instead of a date kind (i42); follow-up dots get white diagonal stripes in the label color; same urgency formula for both, overdue follow-up = 100 (i43). Q23: a, merge #5.
- Done: #5 merged (pull request #17), MVP complete. Q25: a (#16 plan).
- Done (#16): label names get a capital first letter on create and rename; live "home" renamed to "Home" (pinned update); republished as version 3.
- Decided: Q26: a. Archived an unused live duplicate label (pinned update, restorable). i44: the label manager re-reads labels from storage before create, rename and restore, so a stale page or second device cannot store a duplicate name; full live sync stays parked (i18). Republished as version 4.
- Discovered: live labels held a seeded label and an unused lowercase duplicate of it. The page that created the duplicate was opened before the labels were seeded and does not reload labels (no live sync, i18), so its duplicate check could not see the seeded one.
- Done: Q27: a, pull request #18 merged (#16).
- Done: Q28: a (#15 plan approved; i45 to i48 accepted, version 1 tasks upgraded on read). Built date, time and follow-up fields; urgency calculated on every render; striped follow-up dots; 15-minute refresh; CSV date columns; ADR 0002.
- Discovered: the plan's migration table was off by a day for two tasks. The upgrade picks the day whose end is nearest to the original urgency, so the 4 live tasks got dates from Sat 24 to Fri 30 Oct. Schema version split per document type (labels 1, tasks 2). A refresh would have wiped an open Edit form, so the list holds redraws until the form closes. The Next up ring was cut off at urgency 100, so the plot area moved in from the edges.
- Done: Q29: a, pull request #19 merged (#15).

### 2026-10-24
- Done: architecture review (after #5, #16, #15). Findings: stale page can overwrite a task changed on another device; about 90 lines of form code duplicated between capture and Edit; tasks-list is 470 lines; core exports about 10 names only core and tests use; doc drift. Import rules pass with no exceptions; all dependencies used. Q30: a: cards #20 (bug) and #21 (refactor). Not chosen: shared `src/ui` module.
- Done: Q31: a (#20 plan; i49 to i51 accepted). Task list re-reads tasks before an edit or done/reopen save and refuses with StorageError "conflict" when the task changed elsewhere; the page then shows the latest tasks. Republished as version 6.
- Discovered: a same-second save on two devices can still race; the page's database has no conditional write, so a full fix needs live sync (i18).
- Decided: Q33: a. Quadrants renamed Do now, Make time, Fit in, Someday (card #22). Q34: A. Tapped dot shows a card with a bar in the label color, title, label, quadrant, date and time left; no numbers.
- Done: Q35: a (#22 plan; i55 to i57 accepted). Names and the date line live in core; the selected dot grows with an outline. Branched from 20-stale-task-saves because #20 is not merged yet. Republished as version 7 (includes #20).
- Added: card #23 Light and dark mode toggle (the owner's request; the page always follows the computer's dark setting).
- Done: Q36: a (#23). Header button switches light and dark; starts from the device setting; choice kept in this browser's storage (per device), with a fallback when storage is blocked. Code in src/app/theme.ts. Republished as version 8.
- Done: Q37: a, pull request #25 merged (#22). Q38: a, pull request #26 merged (#23). Q32: a, pull request #24 merged (#20).
- Done: Q39: a (#21 plan; i58 to i60 accepted). Core's index lists 21 fewer names (ok and fail were also unused, missed in the first count). Edit form moved to tasks-list/edit-form.ts (index.ts 465 to 311 lines). architecture.md: review date, export row, module map and review log updated.
- Done: Q40: a, pull request #27 merged (#21). All review cards done.

### 2026-10-25
- Done: Q41: a (#28 plan, live sync only; i61 to i63 accepted). Storage interface gains watch(onChange, onStopped): artifact-db uses one onSnapshot subscription per collection with the same document checks as list; memory reports this page's saves; unavailable does nothing. The app watches once after the first load and only redraws on updates; a stopped subscription shows "Live updates stopped. Reload to see changes from other devices." The #20 stale-save check and #16 label re-read stay as safety nets.
- Known limit: same-second saves on two devices can still race (Q41 option b, a short lock per save, not chosen).
- Done: Q42: a, pull request #29 merged (#28).
- Done: architecture review 2 (after #22, #23, #28). Q43: a. Cards #30 (bug: cached live deliveries could briefly blank lists) and #31 (docs drift). Shared ui module not chosen; duplicated form code stays.
- Done: Q44: a (#30 plan). artifact-db watch skips deliveries marked fromCache; the page keeps what it shows until the server confirms. runtime.ts gains snapshot metadata.
- Done: Q45: a, pull request #32 merged (#30). Published as version 11 (version 10 briefly missed its new script file; fixed within a minute).
- Done: Q47: a (#31 plan). architecture.md: review date and counter, theme storage added to data stores and trust boundaries, redraws on live updates, open questions, review log, module table's broken last row.
- Done: Q48: a, pull request #33 merged (#31).
- Done: Q49: a (#34 plan; i64 to i66 accepted). TaskRepository gains saveIfUnchanged; artifact-db takes a 10-second lease on locks/<task id>, re-reads the one task, compares, then saves; memory compares in one step; unavailable refuses. The tasks list no longer re-reads every task before a save, only after a conflict.
- Discovered: #22 had dropped #20's four stale-save tests (its branch started before #20 merged). Restored in their own commit; they pass unchanged.
- Done: Q50: a, pull request #35 merged (#34).
- Done: Q51: a, Q52: a. github-setup.sh board link fixed in engineering-standards (pass --owner and the repo name alone; show gh's error; i67). A pull request in the owner's engineering-standards repo open for the owner to merge; full run waits for the next new project.
- Done: Q53: a (#36). Privacy law confirmed: personal use, outside the local privacy law; privacy good practice followed.
- Done: Q54: a, pull request #37 merged (#36). Q55: a, Q56: a. languages/typescript.md added to engineering-standards. The owner asked Claude to merge engineering-standards pull requests 1 and 2 (chat instruction overriding the global no-merge rule for those two); both merged.
- Done: Q57: a, Q58: a (#38 plan; i68 to i72 accepted). Task schema version 3 adds `today` (a picked local date); up to 5 open picks a day; picks end at midnight; done picks stay on the card. Today card lives in tasks-list/today.ts (no new module). Marking done asks "Mark as done?" everywhere; reopening does not.
- Done: Q59: a, pull request #39 merged (#38). Published as version 13.
- Done: Q60: b (#40). Export CSV saves one CSV file; a separate Full backup (JSON) button keeps the complete backup and moving-out format (ADR 0001). The owner asked for CSV only; JSON kept because the CSV lacks label colors, archived labels without tasks and label ids.
- Done: Q61: a, pull request #41 merged (#40). Published as version 14.
- Done: Q62: a, Q63: a (#42 plan; i73 to i76 accepted). Task schema version 4 adds idea and dropped statuses; dropping or making an idea clears today's pick. New module features/shelf (Ideas and Graveyard lists); tabs in app/tabs.ts, remembered per device; Drop button on board tasks; "Just an idea" in capture. Review counter set to 3.
- Done: Q64: a, pull request #43 merged (#42). Published as version 15.
- Feedback (the owner): bigger caption and a dot menu; duller matrix than the labels; label colors hard to tell apart. Mocked up three looks; The owner chose C (vivid quadrants, 15 new colors plus shapes). Cards #45 and #46 created; i77 to i80 proposed.
- Done: architecture review 3. Q65: a. #44 adds src/ui (labelDot, labelHex, errorLine) with import rules ui-imports-only-core and ui-only-through-index (fixtures prove both); the four dot copies and two error-line copies now use it. Counter reset.
- Done: Q66: a, pull request #47 merged (#44).
- Done: Q67: a (#45 plan; i81, i82 accepted; i83 changed). 15 colors, each with a fixed shape; neighbors on the color wheel differ in shape (test). Label schema version 2; old color ids still read and moved to their family, or the first free color when taken (Home and Family were both green-1 live). Vivid quadrants (16% light, 20% dark tint), names in the quadrant color (at least 4.9:1), solid center lines.
- Changed i83: on the stronger tints some colors fall below 3:1 against the tint itself, so every dot keeps a 1.5px outline in the card color; the build checks each color against the four backgrounds and that the outline rule exists.
- Done: Q69: a. Live v16 still looked dull (the quadrant colors were never changed). Option B: bright fill-only tokens (--quad-fill-*) at a 28% tint in both themes; --q-* text colors unchanged so headings keep 4.5:1. Names mix 70% quadrant color with ink (at least 5.09:1); a palette test checks every theme. Live as version 17.
- Done: Q70: a (push and merge #45 approved).
- Started #46 (branch 46-dot-menu). Q71: a (popup menu at the dot). i84 caption label 1.25rem semibold in its label color (large text, 3:1); i85 right-click, long press (500 ms, touch only) or ContextMenu / Shift+F10; Escape returns focus to the dot; i86 Mark done (asks first), Pick for today / Remove from today, Edit (opens the list form), Drop; i87 matrix reports through `onAction`, app calls the list's new `markDone`, `toggleToday`, `edit`, `drop`.
- Live: the long press failed on a plain triangle near the right edge (worked on a ringed triangle and a square). Cause: presses only count on the drawn shape, and phones do not snap presses to the nearest target as they do taps. Q73: b: the press picks the nearest open dot within 22 viewBox units (about 40px across on a phone); no Actions button.
- Done: Q72: a (phone check passed; push and merge #46 approved). i93 (chooser for crowded spots) and i94 (no zoom for now) accepted; i93 gets its own card.
- Started #50. Q75: a. Dots closer than 14 viewBox units (they touch) list their tasks in the popup, in priority order (`compareTasks` now exported from core); a tap then selects the pick, a hold or right-click opens its menu. Keyboard selects at once (i98). Presses no longer focus a dot (focus would select before the list could show); the click after a hold is ignored.
- Done: Q76: a (phone check passed; push and merge #50 approved). Architecture review 4 next.
- Done: architecture review 4 (after #45, #46, #50). Q77: a. #52 moves the SVG drawing helpers to `src/features/matrix/draw.ts` (index.ts 560 -> 308 lines); public interface unchanged (`toPoint` re-exported); 501 tests before and after, no test changed. Q78: a.
- Done: Q79: a (push and merge #52 approved).
- Decided (i109): multiple tags discarded; adjustable quadrant line and AI scoring parked; behind-the-scenes items after #54.
- Started #54. Q81: a. Graveyard rows get "Delete for good", asked in the row ("Delete for good? This can't be undone."); TaskRepository gains deleteIfUnchanged (lease, re-read, compare, delete; a task already gone counts as deleted); app drops the task from state.
- Done: Q82: a (live check passed; push and merge #54 approved).
- Done: Q83: a, Q84: a. #56: LabelRepository gains saveChecked (lease on locks/label-names, read labels, run the core name rule, save if it passes). Create, rename and restore use it; a busy lease shows "Labels are being changed on another device. Try again in a few seconds." under the field. Recolor and archive keep the plain save. The i44 failed-read test now fails saveChecked instead of list (same intent).
- Done: Q85: a (live check passed; push and merge #56 approved).
- Done: Q86: a, Q87: a. #58 moves the date, time and follow-up controls (with the needs-a-date rule) to `src/ui/date-fields.ts` and the importance slider to `src/ui/score-slider.ts`; capture and the Edit form keep their own layout, captions and ids. 524 tests before, the same 524 plus 6 new after.
- Done: Q88: a (push and merge #58 approved).
- Done: architecture review 5 (asked early). Q89: a: self-host on the VPS at example.com, one secret link per account, separate data per account. ADR 0003 (proposed) with the threat check; step plan in docs/hosting.md.
- Done: Q90: a. ADR 0003 accepted; AGENTS.md records the always-on server and manual DNS overrides. Push and merge #60 approved; step 1 (Server) to plan next.
- Done: Q91: a, Q92: a (@types/node 24.19.2 added, dev only, pinned). #62 builds server/ (accounts and keys, one file per account, handler with limits, Node web server and disk, account command) and vite.server.config.ts (dist-server/main.js and cli.js). Import rules: server-imports-only-core, server-no-packages (Node types allowed), nothing-imports-server, each proven by a fixture. End-to-end test against a real local server found and fixed an oversized body cutting the connection before the 413.
- Not verified: a smoke run of the built dist-server files from the shell was refused twice by the command check (it started a background server and handled a key); first real run is in step 3.
- Done: Q93: a (push and merge #62 approved). Step 2 (app on the server) to plan next.
- Done: Q94: a. #64: server storage adapter (bearer key, 15 s timeout, answers checked with core's parsers, polling every 5 s while visible, stops on a refused key), key from #key= kept on the device and cleared from the address, no-key and revoked screens, browser download for Export, `npm run build:site` (dist-site/), Labels panel opens when there are none. The owner asked for default labels: new accounts start with Work, Home, Personal, Health, Money (`create <name> --empty` for none).
- Checked in the preview against the local server (`npm run dev:server` with two made-up test accounts in dev/dev-accounts.json, `npm run dev:site`): no-key screen, key cleared from the address, add and duplicate label, add, done, drop and delete tasks, the second account sees none of the first's data, a change shows on a second page of the same account, no console errors, no keys in the server log. The built server files ran for the first time here.
- Done: Q95: a (push and merge #64 approved). Step 3 (deploy) to plan next.
- Done: Q96: a. #66 deploy/: Dockerfile (pinned node 24.19.0 and caddy 2.11.6), compose.yaml, Caddyfile, update.sh; runbook in docs/hosting.md. Built and ran the whole setup locally in Docker: HTTPS, security headers, API refuses no key, 413 for big bodies, www redirect, account command in the container, data folder owned by the node user, read-only app folder.
- Found in the local Docker run and fixed with a test: a caller cutting an upload short crashed the server (unhandled "aborted"); now logged as request_aborted and the server keeps running.
- Slip: a throwaway local test account's link was printed in the session output (wrong redirect). It existed only in a local container; it was revoked and the local volumes deleted.
- Not verified: the page under the content security policy in a real browser (the local test certificate was refused by the browser pane); checked by inspection (no inline scripts or styles); to confirm on the VPS in runbook step 7.
- The owner asked for a public-quality README (to make the repo public later): next card after #66, including a check for personal details before going public.

## 2026-10-27 (runbook on the VPS)
- Done: Q97: a. #66 merged (PR #67). README card created as #68.
- Found while running runbook step 2: the VPS signs in through Tailscale SSH (RunSSH true); the admin user has no authorized_keys; OpenSSH listened on port 22 through ssh.socket, with conflicting settings (PermitRootLogin and PasswordAuthentication yes in some files).
- Q99: a: Tailscale only. The owner wrote /etc/ssh/sshd_config.d/00-priority-matrix.conf (keys only, no root) and turned off ssh.socket and ssh.service; Tailscale sign-in confirmed from a second terminal.
- Runbook bug fixed in #69: the settings file was named 99-, which loses to earlier files (SSH keeps the first value). Step 3 now allows tailscale0 instead of OpenSSH; the provider's panel's browser terminal is the fallback.
- Done: The owner ran runbook steps 3 to 8; DNS for example.com and www points at the VPS (A record set by hand in the provider's panel, TTL 300; was the VPS provider's parking address). The owner's account created.
- Verified from outside: site 200, API 401 without a key, www 301 and http 308 to https, Let's Encrypt certificate, all security headers, port 22 closed. Verified in a browser: the page under the content security policy, no console errors, fonts loaded (closes the #66 "not verified" item).
- Done: Q100: a. #69 merged (PR #70).
- Q102: a, Q103: a: the app moves to matrix.example.com so the main domain stays free for a portfolio (#71). Main domain and www redirect to the app with a temporary 302 (a permanent one would be remembered by browsers after a portfolio goes live). A record for matrix, not a CNAME, so the app stays on the VPS if the main domain moves. The owner clears example.com website data on their devices after the move (the old key sits in that origin's storage). ADR 0003 amended with a note.
- Verified locally in Docker with stand-in .localhost names: app 200 with security headers, API 401, 413 for big bodies, main and www 302 to the app keeping path and query. Not tested here: the #key= part surviving the redirect (browsers keep it by the HTTP standard); The owner sees it when he opens an old link.
- Done: Q104: a. #71 merged (PR #72) and deployed by the owner. Verified from outside: matrix.example.com 200 with its own Let's Encrypt certificate and all security headers, API 401, main domain and www 302 to the app keeping path and query, port 22 closed; in a browser, the part after # survives the redirect.
- #68 README: written to the approved plan (Q101: a). Screenshots in docs/images/ (light and dark, shown by the reader's theme) from the local dev server with made-up demo tasks, never real data. No personal names in the README; the live address and the claude.ai link are left out until the go-public decisions.

## 2026-10-27 (personal details)
- Done: Q105: a. #68 README merged (PR #73).
- Q107: a: remove personal details from the repo (#74), then step 4 (#75). The owner's name, domain, VPS provider, server and admin names, private label names, country and the artifact link replaced with neutral ones (the owner, example.com, the VPS provider, <vps-host>). Deploy addresses moved to the VPS-only deploy/.env (example in deploy/.env.example); compose stops with a clear message without it. The local preview's first-run labels are general names now. A blocking check (tools/check-private-words.sh) runs in pre-commit, CI and npm run check; its word list is git-ignored locally and comes from the PRIVATE_WORDS secret in CI.
- Not fixable in files: git history (the owner's email on 97 commits, names in 45 commit messages), and 28 pull requests and 6 issues on GitHub. Recommended (i162): go public as a new repo with one fresh commit. New commits here use the GitHub no-reply address (i163). The GitHub username is in the repo links (i164). Tests keep the Australia/Sydney time zone for daylight-saving cases (i165).
- Q110: a. #75 parked: the owner starts fresh on the server (claude.ai data not needed). Branch 75-import-backup pushed, not merged; issue closed as not planned; card in Parked.
- Q112: a. Backups stay on the VPS: nightly app-data backups (#77), plus the provider's weekly whole-VPS backups (two kept) as the disaster layer. No copy on the owner's Mac: backups hold testers' data too. No off-site copy for now; losing the provider account is not covered.
- #77: deploy/backup.sh streams /data from the running server into /var/backups/priority-matrix (root only, 30 days); deploy/restore.sh checks the file, asks, takes a safety backup, stops the server, replaces /data as the node user, starts it. Nightly systemd timer in deploy/systemd, installed by update.sh. Verified in local Docker: backup, change, restore brings the old state back; a broken file and a cancel change nothing; files keep the node owner; no Docker access fails clearly; 30-day pruning deletes only old backups. Not verified here: the systemd timer (no systemd on the Mac); checked on the VPS by update.sh's "Next backup" line.
- The owner asked whether account data can be encrypted so even the host cannot read it: possible (end-to-end encryption with a key from each link); written up as a separate card for a later decision.
- Done: Q113: a. #77 merged (PR #79). On the VPS: update.sh installed the nightly timer, and the owner's restore drill passed (backup, add "Restore test", restore, task gone).
- The owner set the PRIVATE_WORDS secret, so CI runs the personal-details check too.
- The owner deleted the claude.ai artifact: that version is retired (#80). ADR 0001 is superseded by 0003; the artifact build and adapter stay in the code.
- #80: pre-commit import rules now check server/ as well as src/ (CI already did, i160).
- Go-public notes: a GitHub email can belong to one account only; recommended a free GitHub organization (own name, private membership) holding a fresh repo with no old history.
- Done: Q115: a. #80 merged (PR #81). Architecture review 6 recorded: options A (remove the claude.ai build), B (automatic update pull requests), C (product tier and an uptime alert).
- Demo video (Q116: a): an 82-second, 1080p MP4 recorded by a script driving a real browser on the local test server with made-up data, captions drawn in the page, generated ambient music. Kept in the local-only .playwright-mcp folder (excluded in .git/info/exclude), not committed.
- #82: .github/dependabot.yml: weekly pull requests for npm, the Docker base images (deploy/) and GitHub Actions; minor and patch grouped; TypeScript majors and Node majors ignored. Not verifiable locally: GitHub checks the file after the merge.

## 2026-10-27 (going public)
- Done: Q117: a. #82 merged; Dependabot accepted by GitHub. Org coldlight-labs checked from outside: no public members, empty profile. Icon: aurora (Q118); video ends with a Coldlight Labs slide in Bricolage Grotesque (Q119).
- Q120: b. The owner's GitHub account pushes to the public repo; its username shows on pushes and pull requests there. Q121: MIT license, copyright Coldlight Labs.
- i167 accepted: the public repo coldlight-labs/priority-matrix is the working repo from now on. It starts from one fresh commit (no earlier history, so the owner's email and name in old commits stay private). The earlier private repo is to be archived; the VPS switches to the public repo over HTTPS (runbook "Switching to the public repo").
- Checks run on the snapshot before publishing: private words, email addresses, IP addresses, local paths, usernames, secret scan, private files, image metadata, full npm run check.

## 2026-10-28 (task-writer API, #9)
- Started #9 on branch `9-task-writer-api-key` in the public repository. The scoped key can create unused task ids and checked-update existing tasks; it cannot read data, write labels, upsert tasks, administer accounts or permanently delete tasks. Keys are independently revocable and only their hashes are stored.
- Verified locally: format, lint, types, import rules, 618 tests (including a local HTTP server), and all three builds pass. Existing Vite config-loader warnings remain.
- Privacy: manually reviewed the change for personal details; the personal-word scan could not run because this environment has neither its local word list nor the CI secret. Run it in the authorized repo environment before publishing. The code adds no dependencies.
- No client key was created or configured, and no VPS deployment has been performed. Push requires the owner's approval.
