# 0004. Separate read-only API keys

- Status: accepted
- Date: 2026-10-28

## Context
External assistants may need to look up an account's tasks to prepare suggestions, while the existing account key grants full task and label access, including writes. Sharing that key would grant more authority than lookup needs. The feature is account-scoped, additive, and must not change existing browser links.

## Decision
Allow an administrator to create a separate 256-bit bearer key for an active account. Store only its SHA-256 hash and metadata in `accounts.json`. The HTTP handler grants it access only to routes explicitly marked read-only; currently that is `GET /api/data`, which returns every task and label in the account. Give each read-only key an id so it can be revoked separately. Keep account keys and their behavior unchanged. The key is shown once by the administrator CLI. This decision adds API capability only; client configuration and deployment are separate steps.

## Alternatives considered
- Share the account's existing key: rejected because it grants every task and label write operation.
- Add a task-only or field-filtered endpoint: deferred; the current lookup requirement needs the account's task context, and narrowing the response can be a separate change if a concrete client needs it.
- Add a third-party authorization service: rejected because it adds deployment and dependency complexity for one scoped credential.

## Consequences
- External clients can read an account without being able to change it, and an individual read-only key can be revoked without disrupting the browser.
- `GET /api/data` exposes all tasks and labels for that account to anyone holding the read-only key; the endpoint does not filter personal or sensitive task text.
- Key creation and revocation require administrator access to the VPS. The key is printed once and must be handled as a secret.
- Legacy account records remain valid without a `readOnlyKeys` field. No client, key, or production configuration is created by this feature.
