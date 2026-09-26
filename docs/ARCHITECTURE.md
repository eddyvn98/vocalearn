# Architecture decision 001: small, dependency-light vertical slice

Date: 2026-09-25. Product source: specification v0.5. This document records implementation choices, not amendments to the specification.

## Chosen now

Browser ES modules + CSS, Node's HTTP server, `node:sqlite`, native IndexedDB and a service worker. The same pure JavaScript domain modules run on client/server/tests. No third-party runtime dependencies. This avoids needing package downloads to run the first version and keeps the file structure easy for an agent to inspect.

Node 22.16 was the actual test runtime; `DatabaseSync` may be experimental on Node 22. Browser APIs and offline behavior still need testing on the specification's OS/browser matrix.

## Data flow

1. On first online use, register/sign in and create a study set.
2. Store per-user event history and metadata in IndexedDB. Each device has a random identifier.
3. Edit/answer actions receive stable event IDs. A final answer and the session snapshot are saved in one IndexedDB transaction.
4. Pending events are posted to `/api/sync` in size-bounded batches. The server validates schema, same-account references and duplicate IDs, then commits the whole batch in one SQLite transaction.
5. Server-assigned sequence numbers drive field merges. Local pending operations remain in the journal. Field conflicts are recorded rather than losing every other field on the card.
6. Review state is replayed from a root revision. Competing results at one parent use the conservative grade. A changed parent invalidates dependent schedule transitions; the original logs remain.
7. The service worker caches static app/core files only, not API responses. It does not forcibly activate a new worker during an existing session.

This is an event-journal design, not a full CRDT implementation.

## Authentication and boundaries

Passwords use salted scrypt. Sessions use cryptographically random bearer values; only their hashes are stored server-side. Cookies are HttpOnly, SameSite=Strict, and Secure in production. Sync queries are scoped by authenticated user ID. Same-origin write checks, configurable request bounds and login/reset throttling are included. Only approved static directories can be served; `server/`, `docs/` and `data/` are not web roots.

Password recovery uses short-lived random tokens stored only as SHA-256 digests. Production recovery is gated behind an explicitly configured HTTPS webhook provider; development may use a return-token mode for tests only. Resetting a password revokes prior sessions. Active sessions and per-account journal growth have configurable caps.

The browser caches the last account identity to reopen downloaded data offline. This is not offline cryptographic identity verification. Data is not encrypted at rest by the app. Server accounts are isolated, but someone with access to the same browser profile may inspect its local storage. Use a trusted OS/browser profile.

Server validation does not yet independently regrade every possible future game/language rule. The personal-study workflow assumes the app's normal client; this is not suitable for competitive grading, exams or an adversarial multi-tenant service.

## Database and operations

SQLite schema changes are applied through ordered, idempotent migrations recorded in `schema_migrations`. Startup stops if the expected schema version cannot be established. Backup tooling uses SQLite `VACUUM INTO`; restore verification runs `PRAGMA integrity_check` and refuses to overwrite the target.

Requests receive an `X-Request-Id`. Structured production logs include method, pathname, status and duration but omit query strings, request bodies, cookies and authorization headers. Liveness is exposed at `/api/health`; readiness/database checks are exposed at `/api/ready`.

See `docs/OPERATIONS.md` for environment validation, recovery-provider requirements, backup/restore drill and deployment limits.

## Deliberate shortcuts that are NOT specification fulfillment

- Media is content-addressed and bounded, but image compression and Microsoft 365 Place in Cell compatibility are still incomplete.
- Initial clock anchoring estimates device/server offset, bounds effective times and freezes an accepted event's time. Full monotonic elapsed-time anchors, clock-reset handling and all multi-device time scenarios remain subjects for acceptance testing.
- Full event replay and some repeated filtering are linear/quadratic for portions of the workload. A 50,000-event account cap bounds the current deployment, but no claim of safe performance at that cap is made without load testing.
- Tabs share a per-user session snapshot. BroadcastChannel/Web Locks are used for event operations, but deliberate same-question contention still requires more browser evidence.
- Admin controls and email verification are not implemented. Recovery delivery depends on an external webhook provider selected by the deployer.
- In-memory throttling is appropriate only for the current single-process deployment. Multi-instance hosting needs a shared limiter/store.
- Login is an explicit email/password implementation choice because no identity provider had been chosen in the specification. It is not an implied external-provider integration.

## Before deployment

Serve HTTPS on one stable origin. Configure `APP_ORIGIN` to the exact external origin and set `NODE_ENV=production`; startup rejects insecure production configuration. The development server binds loopback by default.

For a personal account, create it while registration is permitted, then restart with `ALLOW_SIGNUP=false`. For public registration, configure and test the password-reset webhook provider first. Run `npm run backup` before schema-changing deployments and periodically perform `npm run restore:verify` into a fresh path.

The GitHub publishing scripts do not provision a server, register a domain, configure DNS, deploy an app or publish GitHub Pages.
