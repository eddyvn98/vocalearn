# VocaLearn

[Huong dan tieng Viet](HUONG_DAN.md)

A runnable **first implementation**, based on `docs/spec-v0.5.docx` and the approved vocabulary-app UI. Version **0.1.0**. This is not a completed or production-certified implementation of the 37-page specification.

**GitHub status:** active development is on `eddyvn98/vocalearn`, branch `feature/core-hardening-mvp`. GitHub Actions runs Verify, Browser regression and Deployed smoke workflows on this branch.

## Run locally

Requirements: Node.js **22.13 or newer**. Tested here on **22.16.0**. The SQLite API may emit an experimental warning on Node 22.

```sh
npm start
```

Open `http://localhost:3000`. Register a local account with a password of at least 12 characters, create an English-to-Vietnamese or English-to-English study set, and add cards. The sample-content button adds explicitly chosen examples; the app does not silently seed a new account.

There are **no third-party runtime packages** and no build step for normal startup. `npm ci` is optional for the empty dependency tree. No AI provider key is required.

```sh
npm run verify      # syntax, modules below 300 lines, domain/API tests
npm run build:sw    # regenerate the offline app-shell file list after edits
```

The development server binds to `127.0.0.1:3000`. Persistent server data lives in `data/vocalearn.sqlite`; browser data lives in IndexedDB. Keep using the same origin: `localhost` and `127.0.0.1` have different cookies and browser databases.

## What exists

- Approved light UI: Today, library/error-book views, study setup, focused study, results, card editor, study sets, topics, settings and sync details.
- Six game families: flashcards, quiz, matching, typing, dictation (arrange/type), and sentence completion (choose/type). Audio exercises require an uploaded audio file, not an assumed offline system voice.
- Pure domain modules for grading, daily review intervals, new/relearning steps, conservative competing review results, error-book evidence and topic membership.
- Per-user IndexedDB event journal, saved in-progress session and service-worker app shell. Events and session outcome are committed together locally.
- Email/password authentication, HttpOnly session cookie, SQLite append-only journal and authenticated per-account sync endpoint.
- Card editing, image/audio attachments, category hierarchy and multiple topic membership. Explicit delete/restore and field-conflict history.
- Excel import/export is implemented in pure JavaScript with OpenXML/ZIP, including column mapping, row validation, sense-aware duplicate handling and embedded-image support. JSON transfer remains a separate utility and is not a full journal backup.

See [Implementation status](docs/STATUS.md) for specific boundaries. Presence of a button or implementation is not proof that all acceptance cases passed.

## Publish a private GitHub repository

Install Git and the GitHub CLI on your own computer, then authenticate. Do not paste tokens or passwords into ChatGPT.

```sh
gh auth login
sh scripts/publish-github.sh vocalearn
```

On Windows PowerShell:

```powershell
gh auth login
powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1 -Name vocalearn
```

The script shows the locally authenticated owner and asks for confirmation. It creates a **new private repository**, adds an `origin`, commits the project if needed and pushes `main`. It stops on an existing origin or existing repository; it never force-pushes or modifies a different project. Review staged files before approving. It will refuse to operate inside an unrelated existing Git working tree.

The authenticated GitHub account resolved in ChatGPT was `eddyvn98`; the script checks your local login separately rather than assuming it is the same account. GitHub CLI documentation: https://cli.github.com/manual/gh_repo_create

## Configure / deploy later

Default startup does not automatically load `.env`. To override settings:

```sh
cp .env.example .env
node --env-file=.env server/main.js
```

Do not expose the development HTTP server to the internet. Public deployment requires an HTTPS reverse proxy, `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example` and a suitable registration policy. First create the intended account, then restart with `ALLOW_SIGNUP=false` for a personal deployment. Read [architecture and security limits](docs/ARCHITECTURE.md) before deployment.

The event journal and embedded media currently suit small personal datasets; there is no large-scale performance guarantee. Back up the server database safely (SQLite-aware backup or stopped server), not just the JSON export. Browser storage is not encrypted by this application. Logging out does not wipe previously downloaded offline data from the browser: use a trusted OS/browser profile and clear site data on a shared device.

## Structure

```text
core/                deterministic grading, scheduling, replay, validation
public/              browser modules, responsive styles, service worker
server/              Node HTTP, authentication and SQLite journal
scripts/             checks, offline manifest, private GitHub publishing
tests/              domain + real HTTP API integration tests
docs/               original spec, reference demo, status and test report
```

- [Original v0.5 specification](docs/spec-v0.5.docx)
- [Approved HTML reference](docs/reference/approved-demo.html) (demonstration, not the actual app)
- [Architecture](docs/ARCHITECTURE.md)
- [Status / next implementation steps](docs/STATUS.md)
- [Test report](docs/TEST_REPORT.md)
- [Rolling development progress](docs/PROGRESS.md)
- [Agent instructions](AGENTS.md)

The supplied specification and this code are private project materials. No open-source license has been selected on the owner's behalf.
