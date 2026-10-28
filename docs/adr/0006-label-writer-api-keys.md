# 0006. Separate label-writer API keys

- Status: accepted
- Date: 2026-10-29
- Related: Extends ADR 0003 while keeping task-writer and read-only scopes separate.

## Context

Hermes needs to create a label after a per-call user approval, without using the
account's full key or the task-writer key. A label-specific credential must not
read tasks or labels, edit tasks, rename or otherwise manage existing labels,
or administer accounts. Existing account links and scoped credentials must keep
working.

## Decision

Add an optional `labelWriterKeys` list to each account record. Each key is 256
random bits; only its SHA-256 hash, id, creation time, and revocation time are
stored. Keep accounts-file version 1 and accept older records without the
optional list. Provide account commands to create and revoke these keys; show a
new secret only once.

The server allows the role only on
`POST /api/labels/:id/create-if-name-free`. It accepts a label name, validates
the name and active-name uniqueness with the core rules, assigns the default
free palette color, enforces the existing label limit, and stores the label in
the account's serialized update. The response contains only `{ "ok": true }`.
Duplicate active names, reused ids, invalid input (including control
characters), and a full catalog are refused without a write. Other roles retain
their existing access; in particular, task-writer keys cannot create labels.

Hermes receives a separate create-only MCP server and credential. It checks the
existing catalog before proposing a name, requires per-call approval of that
exact name, makes one request, and verifies success via the read-only catalog
tool. The MCP server is `trust: untrusted`.

## Alternatives considered

- Reuse the full account or task-writer key: rejected because both grant
  unrelated capabilities or do not grant label writes.
- Give the new key access to `/api/data`: rejected because label creation needs
  no account data; the existing read-only key remains responsible for reads.
- Allow rename, recolor, archive, or restore: rejected for this scope because
  those actions affect existing tasks or labels; they remain manual in Matrix.

## Consequences

- Hermes can create a label only after a separate approval. The Matrix UI and
  other users retain their current behavior and permissions.
- The new role adds an optional account-file field, so the current server reads
  old files. During rollback to older code, label-writer keys are unavailable;
  an older account command that rewrites `accounts.json` may discard the new
  metadata, requiring key reissue after rollback.
- A timeout can leave the result uncertain. Hermes must query the label
  catalog before any retry.
- No key is created, configured in Hermes, or deployed by this code change.

## Trust-boundary threat check

| Threat | Control |
|---|---|
| Spoofing | Separate 256-bit bearer key; only its hash is stored; the account is derived from the matched key. |
| Tampering | HTTPS; bounded JSON body; core label-name validation; unique id and active-name checks run in the server's serialized account update. |
| Repudiation | Existing request log records account id, route, status, and duration without recording the key or label name; Hermes requires an individual approval. |
| Information disclosure | Label-writer credentials cannot call read routes; success responses contain no label or account data; logs omit names and keys. |
| Denial of service | Existing per-address and per-account rate limits, request-size cap, label count limit, and serialized updates apply. |
| Elevation of privilege | Explicit role-to-route authorization permits this role only on label creation; it cannot read data, write tasks, edit labels, or administer accounts. |
