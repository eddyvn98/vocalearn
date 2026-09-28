# Production operations

This runbook covers the file-backed SQLite deployment used by the current VocaLearn server. Stop the application process before a manual restore. Backups include both the SQLite database and the content-addressed media directory.

## Schema migrations

The server keeps a SQLite `PRAGMA user_version`. Startup runs only forward, idempotent migrations and refuses a database whose schema version is newer than this build. Existing unversioned VocaLearn databases are adopted without deleting rows.

Before deploying a build that changes the schema:

1. Create a backup.
2. Deploy one application instance first.
3. Confirm `/api/health` and the smoke workflow.
4. Only then replace the remaining instance if you run more than one.

Never downgrade code against a newer schema without a documented reverse migration.

## Verify

With the app stopped or against a copy:

```sh
npm run db:verify -- --db ./data/vocalearn.sqlite
```

This runs SQLite `PRAGMA integrity_check` and reports the schema version.

## Backup

Choose a new destination directory that does not already exist:

```sh
npm run db:backup -- --to ./backups/2026-09-28
```

By default the command reads `DB_PATH` and `MEDIA_PATH`, falling back to `data/vocalearn.sqlite` and the adjacent `media` directory. The database snapshot uses SQLite `VACUUM INTO`, then is integrity-checked. Media files are copied into the same backup directory.

For a live production service, prefer a maintenance window or a scheduled platform volume snapshot in addition to this application-level backup.

## Restore drill

Restore only to new paths; the command intentionally refuses to overwrite an existing database or media directory.

```sh
npm run db:restore -- --from ./backups/2026-09-28 \
  --db ./restore-test/vocalearn.sqlite \
  --media ./restore-test/media
npm run db:verify -- --db ./restore-test/vocalearn.sqlite
```

Start a disposable app against the restored paths and run the deployed smoke check before treating a backup procedure as verified.

## Secrets and files

Keep `.env`, SQLite files, media data, backup directories and provider tokens outside Git. Production requires an HTTPS `APP_ORIGIN`. Rotate `AI_PROVIDER_TOKEN` independently from user sessions. Do not put API keys in card events or AI job results.

## Recovery boundaries

Password-reset email delivery remains separately gated on a verified mail domain/provider. Database/media backup recovery does not recover a forgotten user password. Browser IndexedDB is a local cache/journal and is not a substitute for the server backup.
