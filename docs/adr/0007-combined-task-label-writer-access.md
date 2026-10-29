# 0007. Extend task-writer access to checked task and label changes

- Status: accepted
- Date: 2026-10-29
- Supersedes: the task-writer scope in ADR 0005 and the separate-key recommendation in ADR 0006. The legacy label-writer role remains supported for existing keys.

## Context

Hermes profiles need to create and edit tasks, change task status, and manage
labels while retaining server-side authorization and checked writes. Maintaining
one key per operation adds secret-management work. Sharing a single writer key
between profiles would prevent revoking one profile independently.

## Decision

Keep the existing `task-writer` key role and extend its allowed API routes. A
task-writer can create tasks with an unused id, checked-update an existing task
(including status), create a label, and checked-update an existing label's name,
color, or archived state. Label updates compare every loaded label field with
the server's current copy, preserve storage-owned metadata, validate the label,
and reject duplicate active names. Existing label creation remains atomic and
enforces id uniqueness, active-name uniqueness, and the account label limit.

Task-writer keys still cannot read account data, use unrestricted task or label
upserts, administer accounts, or permanently delete tasks. Reversible task
status changes remain available through the checked task-update route. The
existing create-only `label-writer` role continues to work for compatibility,
but new Hermes integrations use one task-writer key per profile. Each profile
receives a separate key so either can be revoked independently.

Hermes keeps its read-only key for lookup and configures write-capable MCP tools
as untrusted, requiring individual approval. The Matrix API remains the final
authorization and concurrency boundary; a Hermes approval does not bypass it.

## Alternatives considered

- Add a separate status-writer and label-manager role: rejected because it
  multiplies credentials without materially improving the account-level trust
  boundary for these approved personal automation clients.
- Share one writer key across both profiles: rejected because key revocation
  would affect both agents and attribution would be lost.
- Keep a separate label-writer key per profile: rejected for new integrations
  because the task-writer scope already has checked write semantics and can
  safely include validated label operations.
- Allow permanent task deletion: rejected; the reversible Graveyard status is
  sufficient.

## Consequences

- Each profile needs one task-writer secret plus its existing read-only key.
- Existing task-writer keys gain label create/edit permissions after this server
  version is deployed. This is an intentional privilege expansion; Hermes still
  requires per-call user approval, and the API limits the key to validated task
  and label operations.
- Existing label-writer keys retain create-only behavior. Revoke them only after
  a profile has switched and verified its task-writer key.
- The Matrix browser app, its full-access link, and other users' UI workflows do
  not change. Approved Hermes writes affect the same shared account and are
  visible to all account users.
- Existing account records remain readable without migration. Rollback to an
  older server removes the new task-writer permissions; account data is
  unchanged. Older account-management binaries may drop optional key metadata
  if they rewrite the account file, so use the documented backup and rollback
  procedure.

## Trust-boundary threat check

| Threat | Control |
|---|---|
| Spoofing | Independent 256-bit task-writer key per Hermes profile; only hashes are stored; keys are separately revocable. |
| Tampering | HTTPS, strict parsers, unique ids, current active-label checks, complete loaded-label comparison, and serialized account updates. |
| Repudiation | Existing request logs retain account, route, status, and duration without keys or task/label content; Hermes requires individual approval. |
| Information disclosure | Writer keys cannot read account data; responses omit task and label content; logs omit secrets and content. |
| Denial of service | Existing body limits, request limits, label/task caps, and serialized update queue apply. |
| Elevation of privilege | Explicit route permissions limit task-writer to checked task writes and validated label operations; no reads, admin, unrestricted upserts, or permanent deletion. |
