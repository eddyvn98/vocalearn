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

Passwords use salted scrypt. Sessions use cryptographically random bearer values; only their hashes are stored server-side. Cookies are HttpOnly, SameSite=Strict, and Secure in production. Sync queries are scoped by authenticated user ID. Same-origin JSON write checks, request size bounds and basic failed-login rate limiting are included. Only approved static directories can be served; `server/`, `docs/` and `data/` are not web roots.

The browser caches the last account identity to reopen downloaded data offline. This is not offline cryptographic identity verification. Data is not encrypted at rest by the app. Server accounts are isolated, but someone with access to the same browser profile may inspect its local storage. Use a trusted OS/browser profile.

Server validation does not yet independently regrade every answer or enforce every due-time/learning-state transition submitted by a modified client. The personal-study workflow assumes the app's normal client; this is not suitable for competitive grading, exams or an adversarial multi-tenant service.

## Deliberate shortcuts that are NOT specification fulfillment

- The spec calls for a separate media store; this version embeds bounded data URIs in events. Compression, deduplicated blob storage and efficient media transfer are pending.
- Initial clock anchoring estimates device/server offset, bounds effective times and freezes an accepted event's time. Full monotonic elapsed-time anchors, clock-reset handling and all multi-device time scenarios are pending.
- Full event replay and some repeated filtering are linear/quadratic for portions of the workload. No database-size or concurrent-user load target has been verified.
- Tabs share a per-user session snapshot. BroadcastChannel/Web Locks are used for event operations, but robust session ownership and conflict-free editing across concurrent tabs require additional tests/implementation.
- Expired auth sessions, account recovery, automatic schema migrations, admin controls, email verification and production abuse protection are not complete.
- Login is an explicit email/password implementation choice because no identity provider had been chosen in the specification. It is not an implied external-provider integration.

## Before deployment

Serve HTTPS on one stable origin. Configure `APP_ORIGIN` to the exact external origin and set `NODE_ENV=production`; never suppress the HTTPS requirement. The development server binds loopback by default. Choose a registration policy, external monitoring and backup/restore procedure. Do not publish the SQLite file or `.env`.

For a personal account, create it while registration is permitted, then restart with `ALLOW_SIGNUP=false`. There is no password-reset email flow in this slice. Preserve access credentials and maintain secure OS backups.

The GitHub publishing scripts do not provision a server, register a domain, configure DNS, deploy an app or publish GitHub Pages.


## Phase-2 AI queue and sentence pool

AI is optional and explicitly configured. `AI_PROVIDER_URL` points to a self-hosted HTTP service that accepts `{kind, snapshot, count}` and returns JSON; `AI_PROVIDER_TOKEN` is optional. If the URL is absent, the server exposes AI as unavailable and never sends card content to another service.

Each AI job snapshots the word/content revision and is deduplicated by task, word and request key. A result whose word was edited or deleted while the job ran is marked stale and cannot be applied. Temporary failures are retried after 5, 30 and 120 seconds, then remain failed until an explicit retry. Autofill output is shown as a proposal and only becomes normal card content after an explicit acceptance action.

Generated cloze sentences become append-only `sentence` events so they sync through the same offline journal as study data. They carry a word-content version, exact gap offsets and sentence-specific accepted answers. `sentenceUsage` is committed locally with the final answer, while `deleteSentence` tombstones a bad sentence without rewriting old review snapshots. The question builder prefers valid unused/least-recently-used pool entries and falls back to the author's fixed sentence when no current AI sentence is available.
