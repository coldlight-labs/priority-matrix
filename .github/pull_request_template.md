## What and why
<!-- One or two lines. -->

Closes #

## How to verify
<!-- Commands to run and the expected result. -->

## Structure and security changes
Architecture impact: none | local | structural

- [ ] Structural change approved in the plan, and `docs/architecture.md` updated (or none)
- [ ] Import rules pass with no new exceptions
- [ ] New or changed trust boundary has a threat check (or none)
- [ ] New dependency or external service approved and listed (or none)
- [ ] Dependency audit passes

## Definition of done
Tick when verified and say how. Otherwise write "not verified: <why>" or "n/a: <why>" next to the item.

- [ ] Format, lint, type check and build pass with no warnings
- [ ] Tests pass; new behavior tested; bug fixes have a test that failed first
- [ ] No checks weakened, skipped or ignored
- [ ] Happy path tested end to end in: <environment>
- [ ] Errors handled at the boundary
- [ ] Side-effecting operations are idempotent
- [ ] External inputs validated
- [ ] No secrets or personal data in code, logs or responses
- [ ] Minimum permissions
- [ ] New dependencies approved, pinned and license-checked (or none added)
- [ ] Schema changes backward compatible and reversible (or none)
- [ ] docs/progress.md updated; ADRs written for decisions

## Risks and follow-ups
