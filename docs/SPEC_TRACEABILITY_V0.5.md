# Specification v0.5 traceability and progress

Date: 2026-09-26. Product source of truth: `docs/spec-v0.5.docx`.

This document is an implementation/verification index. It does not amend the specification and does not turn source code alone into a passed acceptance case.

## Status rules

- **Pass**: the applicable Phase-1 behavior exists and there is direct automated/domain/browser evidence for the acceptance result.
- **Partial**: meaningful implementation/evidence exists, but part of the exact acceptance scenario is not yet demonstrated.
- **Pending**: applicable to Phase 1 but there is not enough implementation/evidence to accept it.
- **N/A (Phase 1)**: the case belongs to a later release phase that is intentionally not exposed as a Phase-1 capability.

Physical-device requirements are not upgraded to Pass from desktop emulation alone.

## Planning estimate

| Scope | Estimated progress | Interpretation |
|---|---:|---|
| Phase 1 / MVP functional implementation | **~88%** | Core offline PWA, accounts/sync, card model, topics, Excel, six MVP game families, SRS, error book, session recovery, production hardening, AT-27 topic transfer and guided cloze authoring are implemented. |
| Phase 1 / MVP acceptance evidence | **~81%** | Automated domain/API/browser coverage is strong. Real-device accessibility, installed-PWA/background behavior and a real two-device AT-32 drill remain. |
| Full specification v0.5, phases 1-3 | **~60%** | Phase-2/3 AI, Chinese, speech/ASR, handwriting, Japanese and advanced statistics are intentionally not released yet. |

These percentages are planning estimates, not release certification.

## UI coverage

| UI | Status | Current evidence / remaining gap |
|---|---|---|
| UI-01 Account/bootstrap | Partial | Email/password auth, offline reopen, recovery source support and production integration exist. Public Resend delivery remains deferred in issue #29; email verification is not implemented. |
| UI-02 Study sets | Pass for Phase 1 | English→Vietnamese and English→English sets, bilingual/monolingual meaning mode and target-word masking are implemented and tested. |
| UI-03 Today | Pass for Phase 1 | Due/new/learning/waiting/error counts, scope, resume, next-step timing and account-wide daily-new usage are present. |
| UI-04 Study setup | Pass for Phase 1 | Mode/game/face setup, explicit answer face, mix selection, readiness counts and blocked reasons are browser-tested. |
| UI-05 Focused study | Pass for MVP games | Flash, quiz, matching, typing, spelling/dictation and cloze families run in browser CI. |
| UI-06 New/relearning | Pass for Phase 1 | The 1/10/10-minute chain, persisted due times, required-game sequence and reload/resume are covered. |
| UI-07 Session result | Pass for Phase 1 | Scheduled reviews, new started/graduated, free practice, error-book transitions and pending learning steps are separated. |
| UI-08 Library | Pass for Phase 1 | Search/filter/status, scoped selection and bulk operations are present. |
| UI-09 Card editor | Pass for Phase 1 | Core/advanced/custom fields, media, identity handling, delete/restore, unsaved-change protection and guided sentence/cloze authoring with preview are implemented. PR #34 adds the cloze authoring acceptance flow. |
| UI-10 Topics | Pass for Phase 1 | Hierarchy, multi-membership, recursive scope, counts, reorder, subtopics, bulk assignment and explicit source→target card transfer are implemented. PR #33 covers AT-27 transfer semantics. |
| UI-11 Excel | Pass for current Phase-1 scope | Import/export, embedded images, preview, row validation, conflict choices, retry/idempotence and corrupt-file recovery have automated/browser evidence. |
| UI-12 Error book | Pass for Phase 1 | Episode/history counts, clean evidence, recall/spacing conditions and practice entry are implemented and tested. |
| UI-13 Settings/reminders | Partial | Timezone, daily-new limit, SRS factors and synced primary reminder ownership work. Real background/PWA notification delivery still needs physical-device evidence. |
| UI-14 Resources/sync | Partial | IndexedDB journal, authenticated sync, conflict history, schedule-adjustment evidence, bounded media store and offline resource status exist. Installed-PWA/storage-exhaustion and some physical-device evidence remain. |
| UI-15 AI/Chinese G2 | N/A (Phase 1) | Phase 2, intentionally not released. |
| UI-16 Advanced statistics G3 | N/A (Phase 1) | Phase 3, intentionally not released. |

## AT-01..AT-32 acceptance trace

| AT | Status | Requirement summary | Evidence / remaining gap |
|---|---|---|---|
| AT-01 | **Pass** | Offline card with only `apple` saves as waiting, has no due date and does not consume new-card learning quota. | `tests/model.test.js` covers bare-word waiting/no due date; daily-new gating is separate from saving and is covered in `tests/grading.test.js`. |
| AT-02 | **Pass** | Same spelling with different senses creates separate card IDs and schedules. | `tests/model.test.js` plus live card-management acceptance use the two `bank` senses. |
| AT-03 | **Pass** | Re-import/update the same card without duplicating card/image/row or losing schedule/logs. | Excel browser acceptance covers preview, conflict choice, embedded image handling and retry without duplicate cards; import planning is deterministic/idempotent. |
| AT-04 | **Partial** | Small scoped decks use valid 2–4-option quiz/matching behavior and do not expose matching with only one usable card. | `tests/grading.test.js` directly covers 2/3 quiz choices and ambiguity; browser CI covers quiz/matching. The exact “3 cards in category + distractor outside category + one-card matching” scenario is not recorded as one acceptance run. |
| AT-05 | **Pass** | Ambiguous prompt/answer pairs must not create a question with multiple reasonable correct answers. | `core/questions.js` blocks ambiguous prompt mappings; domain tests and study-setup browser acceptance verify invalid combinations are blocked with a reason. |
| AT-06 | **Pass** | Cloze `Yesterday, I ___ to school.` accepts only its sentence answer `went`, not generic card variants. | Exact AT-06 domain test in `tests/grading.test.js`; cloze runtime and guided authoring are browser-tested. |
| AT-07 | **Pass** | One-character typo gets one correction; corrected result is Hard and error evidence is retained without duplicate schedule transitions. | Exact grading/retry test in `tests/grading.test.js`; attempt/error-book behavior and one-final-answer contention are covered. |
| AT-08 | **N/A (Phase 1)** | Speech retry behavior when microphone/ASR fails. | Speech/ASR is a later-phase capability and is not exposed in Phase 1. |
| AT-09 | **N/A (Phase 1)** | Handwriting/stroke correction and whole-word grading. | Handwriting is Phase 3 and is not exposed in Phase 1. |
| AT-10 | **Partial** | Scheduled easy recognition affects schedule once; later wrong free practice affects the error book but not schedule/EF. | Recognition grading cap and free-practice schedule isolation are tested independently. The exact two-step scenario is not recorded as one acceptance test. |
| AT-11 | **Pass** | Repeated free practice does not change EF/due date while logs/error-book rules remain active. | Exact AT-11 scheduler test plus runtime free-practice labeling/logging. |
| AT-12 | **Pass** | Interval/EF calculation uses old EF before the Easy EF increase. | Exact AT-12 scheduler tests in `tests/srs.test.js`. |
| AT-13 | **Pass** | Overdue interval uses specified rounding and answer-day due-date basis. | Exact AT-13 test in `tests/srs.test.js`. |
| AT-14 | **Pass** | Lapse reduces EF once; repeated relearning failures do not repeatedly penalize EF; recovery returns to one day. | Exact AT-14 test in `tests/srs.test.js`. |
| AT-15 | **Pass** | Closing during new learning preserves the current step and the 1/10/10-minute timing chain. | Exact scheduler test plus live controlled-clock browser acceptance across reload. |
| AT-16 | **Pass** | Error-book exit requires distinct games, recall evidence and spacing; two quick correct answers are insufficient. | Exact AT-16 error-book test in `tests/grading.test.js`; UI exposes remaining evidence. |
| AT-17 | **Pass** | Persistent-error flag activates after repeated failures and resets for the episode after valid exit while lifetime history remains. | Exact AT-17 test in `tests/grading.test.js`. |
| AT-18 | **Pass** | Competing results for one review opportunity merge conservatively and idempotently without double schedule/error effects. | Exact AT-18 scheduler test, server validation/dedup tests and live same-opportunity tab contention. |
| AT-19 | **Pass** | A late parent result causes deterministic replay; invalid descendants become practice and UI reports schedule adjustment. | Exact AT-19 scheduler/model tests plus late-parent browser acceptance and schedule-diff UI evidence. |
| AT-20 | **Pass** | Concurrent per-field edits merge; same-field conflict retains conflict history rather than replacing the whole card. | Exact AT-20 model test; sync/conflict UI retains per-field conflict evidence. |
| AT-21 | **Pass** | Tombstoned card is not resurrected by stale edits/logs; restore is explicit. | Exact AT-21 model test. |
| AT-22 | **N/A (Phase 1)** | AI result must not overwrite a manual edit made after an AI job started. | AI content fill is Phase 2 and is not released. |
| AT-23 | **N/A (Phase 1)** | Offline sentence-bank exhaustion falls back/reuses safely or disables cloze without creating a learning error. | Generated sentence bank is Phase 2. Phase-1 cloze uses author-confirmed card sentences only. |
| AT-24 | **N/A (Phase 1)** | Missing offline TTS/ASR capability must not be presented as available or silently upload speech. | TTS/ASR-dependent games are not released. Phase-1 dictation already requires stored offline audio and falls back/blocks explicitly when audio is missing. |
| AT-25 | **N/A (Phase 1)** | Chinese pinyin and Japanese whole-word/reading input behavior. | Chinese/Japanese profiles are later phases. |
| AT-26 | **N/A (Phase 1)** | Phase-2 Chinese cards upgrade to Phase 3 without reset or handwriting dependency. | Cross-phase Chinese/handwriting migration is not applicable to Phase 1. |
| AT-27 | **Pass** | Moving a multi-topic card replaces only the chosen source membership; other memberships and schedule stay intact. | PR #33; exact domain regression and live card/topic/bulk browser acceptance. |
| AT-28 | **Pass** | Submit then close/reopen/resend preserves one result/log/schedule transition and the correct next position. | Idempotent event append, deterministic opportunity identity, reload/session persistence and same-opportunity contention are automated. |
| AT-29 | **Partial** | Long TTS/ASR wait and pause time must not count as recall latency; interruption must not earn Easy or become Forget. | Phase-1 interruption timing is tested: interrupted correct recall cannot earn Easy; audio timing starts after playback. TTS/ASR wait path itself is later-phase. |
| AT-30 | **Partial** | Only ready/due cards in the current scope block new learning; blocked cards or another scope must not lock the current scope. | `learningAllowed` receives current scoped cards and filters on readiness; Today separates blocked cards. A dedicated exact A/B-scope browser acceptance run is still missing. |
| AT-31 | **Partial** | One synced primary reminder device; at most one notification/day; denied permission falls back to in-app. | Reminder planning, primary/secondary/denied-permission behavior and day-marker dedup are automated. Background delivery with an installed/closed PWA still needs physical-device evidence. |
| AT-32 | **Partial** | Two offline devices may exceed the account daily-new limit; sync keeps all results, shows exact total and blocks further starts until next day. | Deterministic merged-state test and Today counter browser check pass. A real two-device offline/reconnect drill is still pending. |

## UX-01..UX-30 acceptance trace

| UX | Status | Requirement summary | Evidence / remaining gap |
|---|---|---|---|
| UX-01 | **Pass** | An unfinished session is prioritized as Continue and resumes its current answer/attempt state without a new opportunity. | Session persistence plus Back/Forward and reload/resume browser acceptance. |
| UX-02 | **Pass** | Multi-topic cards are deduplicated in totals and scope labels/counts are correct. | Recursive-scope model test and live topic/card-management acceptance. |
| UX-03 | **Pass** | Missing-data readiness shows valid/blocked counts and reason, offers a path to fix data and does not grade the absence as wrong. | Study-setup browser acceptance checks blocked combinations and explicit reasons; missing media is an error state, not a learning failure. |
| UX-04 | **Pass** | Only valid game/face combinations can start; later setting changes do not mutate the current question snapshot. | `tests/browser_study_setup.py` directly verifies both behaviors. |
| UX-05 | **Pass** | Flash familiarization shows only Continue after flip; review flash uses Remember/Forget and review-only grading. | `studyView` renders familiarization separately; flash is covered in live browser CI. |
| UX-06 | **Partial** | Quiz supports 2/3/4 options, readable long definitions and one locked submission with text/icon feedback. | Choice count and one-submit behavior are implemented/tested; responsive browser coverage exists. An explicit long-definition/zoom acceptance fixture is still missing. |
| UX-07 | **Partial** | Matching works without drag via touch/keyboard and visibly rejects an incorrect pair. | Click/tap matching and wrong-pair status are implemented and browser-tested. Full keyboard-only traversal is still part of physical/accessibility acceptance. |
| UX-08 | **Pass** | One-character typing error allows one retry; corrected result is Hard and error evidence remains. | Exact retry/Hard domain test plus attempt/error-book flow. |
| UX-09 | **Pass** | Spelling/dictation does not expose the target before submit; replay/slow audio are helpers; playback/resource failure is not Forget. | Stored-audio gating, replay/slow controls and failure-safe media behavior are implemented and covered. |
| UX-10 | **Pass** | Sentence-key cloze uses the exact accepted answer; after submit it reveals the completed sentence and error state. | Exact AT-06 answer test; cloze feedback reconstructs the full sentence; cloze runtime is in browser CI. |
| UX-11 | **Pass** | A correct answer with a hint is capped at Hard with an explanation and does not create an error-book failure by itself. | Grading/error-book tests plus feedback reason text. |
| UX-12 | **Pass** | Review and free-practice modes clearly state whether they change the schedule, before and after answering. | Free practice is schedule-isolated by scheduler tests; setup/feedback/result UI labels `noSchedule` vs `localSchedule`. |
| UX-13 | **Pass** | Reload during 1/10-minute waits keeps `due_at`, allows other practice and never shortens the wait or auto-graduates. | Controlled-clock live browser acceptance across the full 1/10/10-minute chain and reload. |
| UX-14 | **Pass** | Session summary shows remaining learning/relearning steps and does not call unfinished cards graduated. | Session-summary domain/browser acceptance and `pendingLearning` UI. |
| UX-15 | **Pass** | Error book explains required game/time evidence and does not exit after arbitrary two correct answers. | Exact error-book evidence tests and UI evidence/spacing text. |
| UX-16 | **Pass** | Word-only card saves as waiting and does not consume the new-card learning quota. | AT-01 model evidence plus learning gating only counts actually started cards. |
| UX-17 | **Pass** | Meaning/identity edits require explicit copy/reset handling and unsaved edits are protected on exit. | Card editor implements copy/reset and unsaved-change confirmation; editor/navigation browser acceptance covers modal close/back behavior. |
| UX-18 | **Pass** | Excel duplicate/image/error/retry flow previews rows, resolves conflicts and does not duplicate on retry. | Dedicated Chromium Excel acceptance covers embedded image, reload/retry and keep-local/take-spreadsheet choices. |
| UX-19 | **Partial** | Offline/storage failure must distinguish local save success from failure and never show false success. | Offline journal/resource failure paths and explicit save/media errors exist. Real quota/storage-exhaustion behavior on physical browsers remains unverified. |
| UX-20 | **Pass** | Conflict/schedule merge UI shows field conflict and adjusted schedule while retaining original logs. | Conflict history, schedule-diff reasons and retained logs are implemented; late-parent/multi-client acceptance exercises the merge path. |
| UX-21 | **Partial** | 320/390 px with a real virtual keyboard remains readable, unblocked and free of page-level horizontal scroll. | Static/live responsive checks cover 320/390 px overflow. Real mobile virtual-keyboard obstruction is not yet tested. |
| UX-22 | **Partial** | Keyboard-only main flow has visible focus, no trap and modal focus restoration. | Focus styles and modal focus return are automated; a complete keyboard-only physical flow has not yet been signed off. |
| UX-23 | **Partial** | Contrast, target size and zoom/reflow must be measured against the declared criteria. | Responsive reflow and focus styles exist; measured WCAG contrast/target/zoom acceptance is still pending. |
| UX-24 | **Pending** | Screen reader receives labels, errors, status and save results without revealing the answer early. | ARIA labels/live regions are present in source, but no real screen-reader acceptance run has been recorded. |
| UX-25 | **Partial** | Denying reminder permission uses in-app fallback, does not promise background delivery and does not repeatedly prompt. | Denied-permission fallback and primary-device planning are automated. Physical installed-PWA/background behavior remains pending. |
| UX-26 | **Pass** | Unreleased features must not appear as selectable games or mandatory learning steps. | Phase-2/3 AI, speech, handwriting, Chinese/Japanese and advanced-statistics capabilities remain hidden/not selectable in Phase 1. |
| UX-27 | **N/A (Phase 1)** | G2/G3 pinyin/kana/IME whole-word behavior. | Chinese/Japanese input is not released. Generic IME Enter protection is already present in browser regression but does not certify the later language flows. |
| UX-28 | **N/A (Phase 1)** | G3 speech/handwriting feedback and non-leaking hints. | Speech/handwriting are not released. |
| UX-29 | **Partial** | Changing settings during a session must not mutate the current snapshot/past schedule; timezone impact must be warned. | Browser study-setup acceptance proves the current question/config snapshot stays frozen when settings change in another tab. Explicit timezone-impact warning acceptance remains to be completed. |
| UX-30 | **Pass** | Production UI must use real persistence/schedule/sync rather than demo labels/mock state. | Live app browser and Railway production acceptance exercise real auth, persistence, schedule, sync, offline reload and import/export; demo-only data is not used as completion evidence. |

## Phase-1 acceptance gaps after explicit trace

The remaining Phase-1 acceptance work is concentrated rather than broad:

1. Close the exact scenario evidence for **AT-04, AT-10 and AT-30** where implementation exists but the complete specified composition is not yet one acceptance test.
2. Run physical-device/accessibility evidence for **UX-19, UX-21, UX-22, UX-23, UX-24, UX-25**, including:
   - 320/390 CSS px with a real virtual keyboard;
   - keyboard-only primary flow;
   - measured contrast/target/zoom/focus checks;
   - real screen reader;
   - installed PWA install/upgrade/offline lifecycle;
   - background reminder behavior.
3. Run the real two-device offline/reconnect drill for **AT-32**.
4. Finish the explicit timezone-warning portion of **UX-29**.
5. Resend production delivery remains deferred to issue #29 until a verified sending domain and real delivery acceptance are available.

## Deferred later-phase cases

The following are explicitly not Phase-1 pass/fail blockers while their features remain unreleased:

- AT-08, AT-09: speech/handwriting;
- AT-22, AT-23: AI fill and generated sentence-bank behavior;
- AT-24: TTS/ASR-dependent capability handling beyond the current stored-audio fallback;
- AT-25, AT-26: Chinese/Japanese and cross-phase handwriting behavior;
- UX-27, UX-28: later-language IME and speech/handwriting UI.

When those phases are enabled, these rows must be changed from N/A to real evidence-backed states.

## Evidence sources in the repository

Primary evidence currently includes:

- `tests/model.test.js`
- `tests/grading.test.js`
- `tests/srs.test.js`
- `tests/card_management.test.js`
- `tests/browser_acceptance_next.py`
- `tests/browser_navigation_contention.py`
- `tests/browser_study_setup.py`
- `tests/browser_card_management.py`
- Excel, media, late-parent, session-summary/error-book and production acceptance slices referenced by `docs/TEST_REPORT.md`
- GitHub Actions **Verify** and **Browser regression**
- deployed Railway production acceptance where explicitly stated in `docs/TEST_REPORT.md`

## Next implementation / acceptance order

1. Add focused automated acceptance for AT-04, AT-10 and AT-30.
2. Run the physical-device/accessibility/PWA matrix and the real two-device AT-32 drill.
3. Close the UX-29 timezone-warning gap.
4. Keep Resend production activation in issue #29 until its domain prerequisite is available.
5. Start Phase 2 only after the remaining Phase-1 acceptance gaps are closed.
