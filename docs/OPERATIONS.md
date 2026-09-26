# VocaLearn operations guide

This guide covers the current single-node SQLite deployment model. It does not claim high availability or multi-region support.

## Production startup

Use Node 22.13+ behind an HTTPS reverse proxy. Set `NODE_ENV=production` and an exact HTTPS `APP_ORIGIN`. Production startup rejects an in-memory database, an insecure origin, development reset-token mode, and incomplete webhook recovery configuration.

For a personal deployment, create the intended account first and run with `ALLOW_SIGNUP=false`. Public signup requires `PASSWORD_RESET_MODE=webhook` so users have an account-recovery path.

The password-reset webhook receives JSON with `type`, `email`, `resetUrl` and `expiresAt`. Configure `PASSWORD_RESET_PROVIDER_URL` and a long `PASSWORD_RESET_PROVIDER_TOKEN`; the provider must deliver the supplied same-origin reset URL to that email address. VocaLearn never logs passwords, session cookies, reset tokens, card bodies or sync payloads in its structured request log.

`PASSWORD_RESET_MODE=return-token` exists only for local tests/development and is rejected in production.

## Health and readiness

- `GET /api/health`: process liveness and app version.
- `GET /api/ready`: verifies the database is queryable and reports the applied schema version and configured sync/account limits.

Container/runtime health checks should use `/api/ready`. External monitoring should alert on non-2xx responses and repeated structured `http_error` or `password_reset_delivery_failed` log events.

## Migrations

The server runs ordered, idempotent SQLite migrations at startup and records them in `schema_migrations`. Existing pre-migration databases are adopted with `CREATE TABLE IF NOT EXISTS` statements before the version is recorded. Migrations run in an immediate transaction and startup stops on failure; there is no silent destructive fallback.

Back up the database before deploying code that introduces a new schema version. Never edit `schema_migrations` by hand to skip a failed migration.

## Backup and restore drill

Create a consistent SQLite backup while the app is running:

```sh
npm run backup -- ./backups/vocalearn-2026-09-25.sqlite
```

The command uses SQLite `VACUUM INTO`, then runs `PRAGMA integrity_check` and reports the schema version. It refuses to overwrite an existing target.

Verify that a backup restores into a fresh path:

```sh
npm run restore:verify -- ./backups/vocalearn-2026-09-25.sqlite ./restore-drill/vocalearn.sqlite
```

The restore command refuses to overwrite an existing database and verifies integrity after copying. Run a restore drill after migration changes and periodically for real backups. A card/Excel export is not a server backup because it does not contain the review journal, accounts or sessions.

## Abuse and resource limits

The single-process server rate-limits login/register attempts by IP and normalized email, and password-reset attempts by IP/email. Defaults are documented in `.env.example`. These counters are intentionally in memory; a future multi-instance deployment needs a shared rate-limit store before traffic is distributed across instances.

Default request size is 8 MiB, a sync batch is limited to 200 events, an account is capped at 50,000 journal events, and at most 20 active sessions are retained per account. Media also keeps the per-file and per-account limits from `core/media.js`. Oversized HTTP bodies return 413, excess auth/reset requests return 429 with `Retry-After`, event-cap violations reject the batch atomically, and old sessions are retired before creating sessions beyond the configured cap.

Do not raise request, sync or media limits without load-testing the resulting SQLite transaction time, memory use and offline replay behavior.

## Logs and secrets

Requests receive an `X-Request-Id`. The production logger writes one-line JSON records with request ID, method, pathname, status, duration and authenticated random user ID when known. Query strings are not logged, so reset tokens in reset links are not written to request logs. Request bodies, cookies, authorization headers and media/card contents are not logged.

Keep `.env`, database files and backup files outside the public web root. Rotate the password-reset provider token if it is exposed. Reverse-proxy access logs should also be configured not to persist query strings for `/reset-password`.

## Deployment boundary

This work hardens a small single-node personal/team deployment. It is not evidence of penetration testing, large-dataset capacity, HA failover, real-device accessibility certification or multi-instance consistency. Those need separate verification before making broader production claims.
