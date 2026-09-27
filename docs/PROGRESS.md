# Development progress

Rolling implementation log for branch `feature/core-hardening-mvp`. Update this file whenever a meaningful feature, hardening change or CI finding lands.

## Current focus

**Goal before manual testing: finish every implementation and automated-verification item that can be completed in CI/local automation, leaving only real-device/human acceptance checks.**

Current sequence:
1. Close remaining automated browser lifecycle gaps.
2. Close remaining sync/replay and multi-device edge cases.
3. Close remaining UI/spec implementation gaps.
4. Complete automated AT/UX traceability where behavior can be machine-verified.
5. Finish production-readiness code/config/docs that do not require external credentials or real-device exercises.
6. Stop only when the remaining backlog consists of real-device, screen-reader, mobile-keyboard, operational drill, or other human/manual acceptance evidence.

## Latest completed work

| Commit | Area | Result |
|---|---|---|
| `52225ba` | Browser E2E | Added live Chromium lifecycle test. |
| `b8ef45c` | Browser E2E | Corrected reload navigation expectation. |
| `c69b226` | Sync safety | Reject learning events against deleted cards. |
| `c3b57bc` | Regression | Tombstone review tests. |
| `29a9769` | Clock reconciliation | Refresh trusted device anchors and flag clamped time. |
| `8dbab1e` | Regression | Clock reconciliation tests. |
| `205c4a2` | Sync protocol | Return refreshed clock anchor to the client. |
| `73bb510` | Multi-device replay | Deterministic device/event tie-break. |
| `c68711e` | Regression | Tie-break regression test. |
| `fdefab2` | Offline build | Regenerated service-worker cache manifest after source changes. |
| `7ed7293` | Browser E2E | Added second-profile offline/reconnect merge and multi-tab IndexedDB broadcast coverage. |

## CI tracking

As of 2026-09-27:

- Node tests reached **57/57 passing**.
- An intermediate Verify run failed only on the generated service-worker diff after source changes; the generated manifest was then committed.
- Browser regression and deployed smoke run on every push to the hardening branch.
- A feature is not considered complete merely because source exists; relevant regression coverage and the next clean CI run are required.

## Remaining P0 checks

- Late-parent/descendant behavior already has AT-19 domain coverage; add adversarial server/browser coverage where useful.
- Same opportunity answered on two devices with different grades.
- Duplicate final answer through real UI/retry path.
- Multi-tab local transaction contention.
- Two browser profiles: offline edits, reconnect and merged state (browser coverage added; CI evidence pending).
- Fake-clock 1/10-minute learning progression and reload during wait/retry.

## Documentation rule

When behavior changes:
- update `docs/STATUS.md` for implementation coverage;
- update `docs/TEST_REPORT.md` only for evidence actually executed;
- append meaningful milestones/CI findings here;
- do not mark AT/UX items passed from UI appearance alone.
