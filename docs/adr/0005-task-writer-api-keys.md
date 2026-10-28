# 0005. Separate task-writer API keys

- Status: accepted
- Date: 2026-10-28

## Context

Hermes needs to propose approved task changes without using the browser's full account key. A leaked writer key must not expose an account's task data, change labels, administer accounts, overwrite an existing task during creation, or permanently delete tasks. Existing account links and read-only keys must keep working.

## Decision

Add an optional `taskWriterKeys` list to each account record. Each key is 256 random bits; store only its SHA-256 hash, an id, creation time and revocation time. Keep accounts-file version 1 and accept legacy records with no task-writer list. Provide administrator commands to create and revoke these keys; show the secret only once, and never put it in logs.

The HTTP handler grants task-writer credentials access only to:

- `POST /api/tasks/:id/create-if-absent`: validate the task, require a currently active label, and refuse an id that is already stored.
- `POST /api/tasks/:id/save-if-unchanged`: validate the loaded and updated tasks, require that the task already exists, refuse a stale copy, and allow only an existing or active label.

The key cannot retrieve account data, use the upsert endpoint, write labels, administer accounts, or use the permanent-delete endpoint. The account id always comes from the matched key. Existing full keys and read-only keys retain their current route access. Revocation is checked on each request.

## Alternatives considered

- Reuse the full account key: rejected because it grants label writes, account administration through the CLI context, upserts and permanent task deletion.
- Let the task-writer key call `GET /api/data`: rejected because the separate read-only key already owns that capability.
- Let task creation use the existing `PUT` upsert route: rejected because a repeated or guessed id could overwrite a task.
- Allow permanent deletion: rejected because a move to the existing reversible Graveyard status is sufficient for this stage.

## Consequences

- The new authority is account-scoped and narrower than the browser key. The separate read-only credential remains necessary for lookup.
- A create collision returns a conflict without changing stored data. A stale update returns the existing conflict response.
- The task-writer hash and metadata are optional account fields, so new code reads legacy records. An older server will not recognize task-writer keys; those keys are unavailable during rollback. If an older account command rewrites the account file, it may discard this optional field. Reissue writer keys after restoring the new code if that occurs. Existing account links and read-only credentials remain valid.
- No writer key is created, configured in Hermes, or deployed by this code change.

## Trust-boundary threat check

| Threat | Control |
|---|---|
| Spoofing | 256-bit random bearer key; only its SHA-256 hash is stored; constant-time hash comparison; account derived from the matched key. |
| Tampering | TLS remains the transport; request size, task schema, path id, active label and stale-version checks are enforced in the server handler. |
| Repudiation | The existing request log records account id, route, status and duration, but not key or task text. |
| Information disclosure | Writer credentials cannot read `/api/data`; responses and logs do not include task text or key values. |
| Denial of service | Existing address/account rate limits and request-body limits apply. |
| Elevation of privilege | Per-route access checks deny reads, label writes, upserts, account operations and permanent deletion to this role. |
