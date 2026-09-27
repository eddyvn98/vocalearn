# Test report: VocaLearn 0.1.0

Date: 2026-09-27. Scope: current `main` through Phase-3 software/web release. Environment includes Linux, Node **22.16.0** and Chromium via Python Playwright for live browser acceptance.

## Executed and passed

`npm run verify`:

- Syntax checks and below-300-line policy: **31 JavaScript source/test/tool modules**.
- **114 automated tests passed; 0 failed** on the current hardening branch before the generated-manifest check.

Raw output: `test-evidence/automated-tests.txt`. These are not a claim that all specification acceptance cases passed.

Additional checks:

- `sh -n scripts/publish-github.sh` passed shell syntax inspection.
- Service-worker generation is deterministic for the same assets. Its cache ID includes an asset-content hash, so edits produce a new cache version. Generated worker syntax was checked with Node.
- The original `spec-v0.5.docx` was copied, not rewritten; a text/table Markdown extraction is included for coding agents.

## Static UI checks executed

The actual view functions were rendered with fixture data and real project styles. Chromium rendered them using `page.set_content`; **no live app navigation or module interactions were exercised**.

| View | Viewport | Result |
|---|---|---|
| Today | 1440 x 1000 | No page-level horizontal overflow |
| Today | 390 x 844 | No horizontal overflow; settings control remains visible |
| Study (typing) | 1440 x 1000 | No page-level horizontal overflow |
| Study (typing) | 320 x 780 | No page-level horizontal overflow |
| Library | 390 x 844 | No page-level horizontal overflow |

Machine-readable results: `test-evidence/layout-results.json`. Screenshots were visually inspected, but these fixtures do not validate all screens/states or virtual keyboard behavior.

## Not executed / not proven

- Installed PWA lifecycle, browser Back and deliberately competing same-question submissions across tabs are **not yet browser-verified**. Offline reload/reconnect, multi-tab propagation, isolated-profile sync and the full timed new-learning chain are covered by the automated browser acceptance slice.
- No accessibility certification; no full WCAG A/AA audit, screen-reader test, iPhone/iPad test or virtual-keyboard test.
- Dockerfile is an optional template; Docker was not available to build it.
- No independent penetration test, large-dataset load test, backup restore drill or production environment test.

## Manual/browser acceptance run to perform next

1. Start the server on a supported development machine. Register account A, create a set and add sample cards explicitly.
2. Start free typing. Type a one-character wrong answer, submit, reload, resume and correct it. Verify the retained failed attempt, capped grade and one final result.
3. Start new learning. Advance a controlled clock through the specified 1/10-minute waits; reload during a wait. Verify no reset or early graduation.
4. Complete a session, inspect API sync and reload. Verify pending events are acknowledged once, then disconnect the server/network and repeat an offline answer.
5. Reconnect and sign into account A from a second browser profile. Verify per-field edits, a competing same-parent answer and a late parent correction. Check event counts and the final schedule, not only UI labels.
6. Verify account B cannot fetch A's events. Check logout, expired-session UI and the explicit local-data privacy limitation.
7. Test matching without dragging, cloze answer `went` versus `go`, missing audio, successful audio end and interrupted playback. Test hints and time-based grades.
8. Test 320/390/768/1024/1440 CSS px, keyboard-only operation, IME composition, zoom, real mobile keyboard and a screen reader.

Record outcomes against every applicable AT/UX code before promoting the version to MVP status.

## Acceptance-gap hardening update

GitHub Actions now launches the live app against a disposable server/database and runs the same browser regression on:
- Ubuntu Chromium at 1280x900
- Windows Chromium at 1280x900
- macOS WebKit at 1280x900
- Ubuntu WebKit at 390x844

The live-browser suite verifies account/set creation, dialog focus restoration, IME-safe Enter handling, all six MVP game families (Lật thẻ, Trắc nghiệm, Ghép cặp, Gõ từ, Chính tả xếp chữ, Điền câu), audio-resource loading, pause/resume across reload, real XLSX download, and page-level responsive overflow. A dedicated Ubuntu Chromium slice additionally exports a card with an embedded image, imports it into another set, restores the import preview after reload, retries the same workbook without duplicating the card, and exercises both keep-local and take-spreadsheet field-conflict choices. The latest branch run passes that Excel slice together with the existing matrix.

The Node verification suite now contains 114 tests, including deterministic opportunity identity, same-device scheduled-answer deduplication, multi-device same-opportunity merge semantics, initial/anchored clock bounds, child-before-parent replay, and deterministic/idempotent Excel import planning. The browser suite also covers the complete 1/10/10-minute chain, offline reload/reconnect, same-account multi-tab propagation and sync into an isolated browser profile. This still does **not** certify real Safari on iPhone/iPad, a physical mobile virtual keyboard, screen readers, measured WCAG contrast, installed/first-launch PWA behavior, browser Back, or deliberate same-question tab contention.


## Production-readiness branch update (2026-09-26)

The production-readiness branch adds automated coverage for schema migration/adoption, unsafe production configuration rejection, rate limiting, request-size bounds, password reset with session revocation, account journal/session caps, structured-log redaction expectations, readiness checks and SQLite backup/restore verification.

These new tests are source coverage only until the branch's full `npm run verify` workflow completes. Do not count this section as green CI evidence by itself. Public hosting additionally requires a configured password-recovery provider, a real deployment backup/restore drill, monitoring and workload-specific capacity checks.


## Current production/browser update (2026-09-26)

- Main CI is green on Ubuntu Chromium, Ubuntu WebKit mobile viewport, Windows Chromium and macOS WebKit.
- A deployed Railway production acceptance run has passed health/readiness, auth, card/media persistence, six game families, session summary/error-book, sync, offline reload, multi-tab, Excel export/import and password-reset request behavior.
- The password-reset provider integration now has a direct Resend mode in source. Production delivery is still disabled until a verified Resend sending domain is configured (issue #29).
- These results still do not certify physical Safari/iPhone/iPad, real mobile virtual keyboard, screen-reader operation, full WCAG AA, background notification delivery, penetration testing or workload capacity.

## Reminder ownership update (2026-09-26)

The verification suite now includes AT-31 reminder planning cases: primary device + granted permission selects a browser notification, denied permission falls back to in-app, secondary devices remain in-app only, the synced day marker suppresses a second primary reminder, and local in-app reminders do not repeat on the same device. The browser regression also checks that the primary-device control is present. Background notification delivery with the PWA closed still requires physical-device evidence.

## AT-32 daily-new overflow update (2026-09-26)

The verification suite now has 114 tests. AT-32 has a deterministic account-zone case showing an 18/15 merged total, preserving all 18 learning states, blocking additional new-card starts for that account day, and unlocking on the next account day. The live browser regression checks that Today exposes the account-wide daily-new counter. A final real two-device offline/reconnect drill remains separate physical acceptance evidence.


## Phase-2 release gate (2026-09-27)

The Phase-2 release candidate was evaluated from merged feature commit `17dd49e0839e5f5a19b49919e538fa9c4f0f5148`.

Verified evidence:

- **Verify** — GitHub Actions run `36315084208`: **SUCCESS**. This ran `npm run verify` and the generated service-worker manifest check on the merged main SHA.
- **Browser regression** — run `36315084206`: **SUCCESS** across Ubuntu Chromium, Windows Chromium, macOS WebKit and Ubuntu WebKit/mobile viewport. The Ubuntu Chromium acceptance slice includes:
  - Phase-2 Chinese profile/two-step typing;
  - AI editor protected-suggestion flow;
  - sentence-pool/Cloze acceptance;
  - deterministic IPA/Pinyin/Hán-Việt lookup editor acceptance.
- **Railway** — deployment `31340611-c8eb-400c-bf19-877c76779cbf` reached terminal **SUCCESS** after the main checks cleared.
- **Production smoke** — run `36315084159`, attempt 2: **SUCCESS**. The rerun first verified the deployed `/api/health.commit` exactly matched `17dd49e0839e5f5a19b49919e538fa9c4f0f5148`, then passed the real production browser smoke against Railway.
- Lookup acceptance found and fixed a provenance-schema integration defect before release: lookup adapters originally exposed an `id` while persisted card validation required `source`. The adapters now persist explicit `source`, `version`, `license`, `confirmed` and `needsCheck` metadata.
- Phase-3-only full Japanese UI, handwriting and speech remain gated and are not counted as Phase-2 release evidence.

This evidence closes the software/web release gate for the implemented Phase-2 scope. Physical-device-only evidence (real iPhone/iPad Safari, virtual keyboard, screen reader, installed-PWA/background notification behavior and real two-device drills) remains separate and is not inferred from desktop/browser automation.


## Phase-3 software release evidence (2026-09-27)

Feature merge commit: `52be1fc6ce25c23347162e08039e7516b823d4bd`.

Observed evidence before the final documentation gate:
- **Verify** — run `36323372848`: **SUCCESS**.
- **Browser regression** — run `36323372829`: **SUCCESS**. The Ubuntu Chromium Phase-3 slice passes advanced statistics, Japanese, handwriting and speech acceptance.
- **Railway** — deployment `686619d1-fada-4921-a981-eb5f415bc072`: terminal **SUCCESS** for the same feature commit.
- **Production web smoke** — run `36323372832`: **SUCCESS** on the feature merge.

Phase-3 acceptance covered by the browser/domain suites:
- Japanese: 食べる / ありがとう / コーヒー, kana/katakana behavior, IME-safe Enter, persistence and furigana-backed UI behavior.
- Handwriting: versioned stroke resources, multi-character progression, direction/position correction, one whole-word result and safe missing-resource fallback.
- Speech: technical mic/model failure consumes zero valid attempts; a valid miss followed by a valid success grades Hard; transcript feedback is shown; no pronunciation-quality score or implicit cloud-audio upload is introduced.
- Statistics: the released UI presents the already-defined Phase-3 metrics with browser acceptance.

Physical-device-only claims remain outside automated certification. Issue #84 tracks real device/browser local-ASR, pen and palm-rejection evidence; unsupported combinations remain gated.
