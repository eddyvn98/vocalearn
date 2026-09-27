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
| `9b26301` | Browser E2E | Added duplicate-submit and retry-after-reload coverage. |
| `6ec5a63` | Settings | Exposed maximum review interval. |
| `13dbc45`…`f3b5cf1` | Topic scope | Added include/exclude descendant scope with regression coverage. |
| `a817cd1`…`60dc4c6` | Topics | Added drag reparent/reorder, stable ordering and validation. |
| `4b51b7c` | Results | Added session transition breakdown. |
| `9dc0e85`…`45a280a` | Card content | Added level, variants and tags to editor and Excel round-trip. |
| `c4611b8`…`81dff8d` | Question safety | Block ambiguous auto-graded prompts with regression coverage. |
| `81815a8` | Multi-device | Exercised competing same-opportunity due review with conservative merge. |

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
- Fake-clock 1/10-minute learning progression; retry reload is now covered in browser E2E, CI evidence pending.
- Full game/face setup persistence and configurable mix.
- Arbitrary per-set custom field definitions.
- Separate bounded/versioned media blob storage.

## Documentation rule

When behavior changes:
- update `docs/STATUS.md` for implementation coverage;
- update `docs/TEST_REPORT.md` only for evidence actually executed;
- append meaningful milestones/CI findings here;
- do not mark AT/UX items passed from UI appearance alone.


## 2026-09-27 implementation batch

Implemented without waiting for CI between commits:

- Browser duplicate-action protection and retry state restoration after reload.
- Two-profile and multi-tab offline/sync browser scenarios.
- Exact-versus-descendant topic scope.
- Topic drag reparenting and sibling ordering with cycle protection.
- Result-screen started/graduated/error-book transition metrics.
- Maximum SRS interval setting in the UI.
- Level, variants and tags in manual editing and Excel round-trip.
- Ambiguous identical prompts are blocked from auto-graded questions.
- Multi-device same-opportunity review test now exercises conservative merge.

CI is intentionally treated as a parallel feedback loop; failures are fixed as evidence arrives rather than blocking the next independent implementation item.

## 2026-09-27 timed-browser hardening

- Added an injectable trusted server clock for deterministic browser acceptance without real 1/10-minute waits.
- Extended Chromium E2E to exercise the complete 1/10/10-minute learning progression.
- Fixed two test-harness visibility/modal issues found by CI: Advanced settings must be expanded before editing maximum interval, and sync-info must close before navigation.
- Commit `5e19db9`: Verify and deployed smoke passed; browser regression exposed the modal-transition harness issue rather than an application runtime failure.
- Latest browser rerun is gated on `ed8af1d`; do not mark timed browser acceptance passed until that run is green.


### 2026-09-27 hardening checkpoint

Batch includes browser audio/IME/responsive acceptance plus media quota, deduplication, validation and missing-file repair tests. Run the full CI checkpoint before production integration; do not mark Railway production verified until the merged main SHA reaches a terminal SUCCESS deployment and the production smoke/browser checks pass.
