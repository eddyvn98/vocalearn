# Specification v0.5 traceability and progress

Date: 2026-09-26. Product source of truth: `docs/spec-v0.5.docx`.

This document is an implementation/verification index. It does not amend the specification and does not turn an untested requirement into a passed requirement.

## Planning estimate

These percentages are engineering estimates, not acceptance certificates. They weight implemented behavior, integration, and evidence separately.

| Scope | Estimated progress | Interpretation |
|---|---:|---|
| Phase 1 / MVP functional implementation | **~86%** | Core offline PWA, accounts/sync, card model, topics, Excel, six MVP game families, SRS, error book, session recovery, production hardening and most MVP UI are implemented. |
| Phase 1 / MVP acceptance evidence | **~76%** | Automated domain/API/browser coverage is strong, including production acceptance, but physical-device, screen-reader, virtual-keyboard, notification and some adversarial multi-device cases remain. |
| Full specification v0.5, phases 1-3 | **~59%** | Phase 2 AI/Chinese work and Phase 3 speech/handwriting/Japanese/advanced statistics are intentionally not released yet. |

A feature is counted as complete only when its runtime behavior exists. Acceptance evidence is scored separately because the specification explicitly requires reload/sync/device/UI verification, not only source code.

## UI coverage

| UI | Status | Current evidence / remaining gap |
|---|---|---|
| UI-01 Account/bootstrap | Mostly implemented | Email/password auth, offline reopen, reset flow and production recovery integration exist. Public signup/reset email remains disabled until Resend domain setup (issue #29). Email verification is not implemented. |
| UI-02 Study sets | Mostly implemented | English source sets support English→Vietnamese and English→English. Stage-1 language-profile behavior and monolingual prompt masking are being completed on the current branch. |
| UI-03 Today | Implemented | Due/new/learning/waiting/error counts, scope, resume and next-step timing are present. |
| UI-04 Study setup | Implemented | Mode/game/face selection, mix, valid-card counts and blocked reasons are present. |
| UI-05 Focused study | Implemented for MVP | Flash, quiz, matching, typing, spelling/dictation and cloze families run in browser CI. |
| UI-06 New/relearning | Implemented | 1/10/10-minute learning/relearning chain, persisted due times and resume behavior are covered. |
| UI-07 Session result | Implemented | Scheduled reviews, new started/graduated, free practice, error-book entry/exit and pending steps are separated. |
| UI-08 Library | Implemented | Search/filter/status/bulk operations and scoped selection are present. |
| UI-09 Card editor | Mostly implemented | Core/advanced/default/custom fields, media, identity-change reset/copy, delete/restore and unsaved-change protection exist. Rich sentence-authoring preview/blank-selection workflow can be improved. |
| UI-10 Topics | Mostly implemented | Hierarchy, multi-membership, recursive scope, counts, reorder buttons, subtopics and bulk assignment exist. Exact drag-source transfer semantics remain incomplete. |
| UI-11 Excel | Implemented for current Stage-1 scope | Import/export, embedded images including Place in Cell handling, preview, row validation, conflict choices, retry/idempotence and corrupt-file recovery are covered. |
| UI-12 Error book | Implemented | Episode/history counts, clean evidence, recall/spacing conditions and practice entry are shown. |
| UI-13 Settings/reminders | Mostly implemented | Timezone, daily new limit and SRS factors work. Reminder primary-device ownership is synced; only the primary device attempts browser notifications, denied/unsupported permission falls back to in-app, secondary devices stay in-app, and a synced day marker deduplicates the primary reminder. True background/PWA notification delivery still needs physical-device verification. |
| UI-14 Resources/sync | Mostly implemented | IndexedDB journal, authenticated sync, conflict history, schedule adjustment evidence, bounded media store and offline resource status exist. Some physical-device/storage exhaustion evidence remains. |
| UI-15 AI/Chinese G2 | Not released | Phase 2. |
| UI-16 Advanced statistics G3 | Not released | Phase 3. |

## Acceptance coverage summary

The repository has direct automated coverage for many core cases including AT-03, AT-07, AT-11-15, AT-18-20, AT-28 and related UX flows, plus browser evidence for six MVP games, timed learning, reload/resume, offline reconnect, multi-tab/account sync, Excel import/export, session summary/error-book, mobile reflow and modal focus.

Important cases still needing stronger or physical-device evidence include:
- physical-device/background-notification verification for the implemented AT-31 primary-device/fallback logic (UX-25);
- cross-device daily-new-limit overflow behavior (AT-32);
- exact category drag/source-transfer semantics (AT-27);
- real mobile virtual keyboard, screen reader and measured WCAG checks (UX-21 to UX-24);
- installed/upgrade PWA behavior on declared device/browser matrix;
- G2/G3 cases such as speech, handwriting, Chinese/Japanese input and advanced statistics when those phases are released.

## Deferred work recorded

- **Issue #29**: configure a verified Resend sending domain, create a sending-only key, enable production reset/signup, send a real reset email and rerun production acceptance.
- G2/G3 features remain hidden until their phase requirements and evidence are ready.

## Next implementation order

1. Close remaining topic move semantics and card-editor sentence-authoring gaps.
2. Implement and verify AT-32 cross-device daily-new-limit overflow handling.
3. Expand AT-01..AT-32 and UX-01..UX-30 traceability with explicit pass/partial/not-applicable evidence.
4. Perform physical-device/accessibility/PWA lifecycle checks, including background reminder behavior, before calling Phase 1 complete.
5. Start Phase 2 only after Phase 1 acceptance gaps are closed: AI fill protection, pronunciation data pipeline, sentence bank, Chinese profile, tone/classifier games.
