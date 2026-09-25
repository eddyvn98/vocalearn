# Test report: VocaLearn 0.1.0

Date: 2026-09-25. Scope: source in this archive. Environment: Linux, Node **22.16.0**, Chromium via Python Playwright for static layout inspection.

## Executed and passed

`npm run verify`:

- Syntax checks and below-300-line policy: **31 JavaScript source/test/tool modules**.
- **45 automated tests passed; 0 failed; 0 skipped.**
- **32 domain/model tests**, including formula examples, half-up rounding, overdue intervals, learning/relearning delays, assistance caps, typo handling, sentence-specific answers, error-book evidence, per-field merges, category membership and tombstones.
- **13 actual HTTP API tests** on an ephemeral localhost server: authentication/cookies, unauthenticated access, wrong password, origin/media-type rejection, idempotent event append, transactional batch rollback, category cycles, account isolation, device mismatch, bounded timestamps, event ID/content mismatch, static-file boundaries and logout.

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

- Full browser end-to-end tests were blocked by the environment: navigating Chromium to the live local app returned `ERR_BLOCKED_BY_ADMINISTRATOR`. The restriction was not bypassed. Node's API tests are not a substitute for full browser tests.
- Real IndexedDB persistence/reload transactions, first offline launch, installed PWA lifecycle, audio play/retry, browser Back, multi-tab contention and multi-device browser sync are therefore **not browser-verified** here.
- No accessibility certification; no full WCAG A/AA audit, screen-reader test, iPhone/iPad test or virtual-keyboard test.
- No GitHub repository, push, workflow run or deployment took place. The publishing scripts require the owner's authenticated CLI. PowerShell script was not executed; shell script was syntax-checked only.
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
