# Implementation coverage: v0.1.0 against specification v0.5

This is a first runnable vertical slice, **not full MVP completion**. Original requirements remain in `spec-v0.5.docx`; none of the shortcuts below replaces a requirement.

Status meanings:
- Implemented: source exists and is connected to the runtime. Not equivalent to browser acceptance.
- Automated: covered by the domain/API suite to the extent listed in TEST_REPORT.
- Pending: not implemented or not verified; do not mark its AT/UX acceptance case passed.

## Present in this version

| Area | Implementation and qualification |
|---|---|
| UI-01/02 | Local email/password account API, create/switch English-to-Vietnamese/English study sets. Reset-password/verification flows not implemented. |
| UI-03 | Today, scope selection, learning/due/new/waiting/error counts, resume entry and next-step time. Needs actual-browser end-to-end acceptance. |
| UI-04 | Mode/game selection, basic valid-count checks, limited face selection. Mix is a fixed subset, not yet the full user-configurable matrix. |
| UI-05 | Six game families, final-answer feedback, retry, hints, pause. Dictation requires stored uploaded audio. No ASR or pronunciation scoring. |
| UI-06 | Pure scheduler has 1/10-minute learning steps, mandatory recall graduation and relearning; browser queue uses these states. Boundary scenarios need actual browser tests. |
| UI-07 | Answer/clean/error summary and pending learning steps. Full started/graduated/entered/left breakdown remains incomplete. |
| UI-08/09 | Search/filter, edit word/meaning/part of speech/IPA/sentence answers/note/image/audio; delete/restore; identity-change copy or reset. Full custom fields and bulk editing pending. |
| UI-10 | Parent/child topic data, parent selection, multi-membership and recursive scope. Full tree expand/collapse/reorder and include-descendants toggle pending. |
| UI-11 | **Excel not implemented.** Extra JSON utility previews and transfers basic content, omits IDs/topics/review journal. Not spec-compliant Excel or backup. |
| UI-12 | Error-book filter, practice, episode counts/evidence display. Pure evidence rules tested; richer remaining-condition UI pending. |
| UI-13 | Daily limit, timezone, basic SRS factors, open-app reminder. No background notifications or primary-device scheduler. |
| UI-14 | IndexedDB journal, basic authenticated sync, per-field conflicts, last-sync details. Media download manager and full clock/conflict acceptance pending. |
| UI-15/16 | G2/G3 AI, advanced statistics, Chinese/Japanese profiles, recognition/handwriting are not implemented or shown as playable. |

## High-priority work before calling this MVP complete

1. Run real-browser end-to-end tests of account creation, set creation, new-card steps with fake clock, reload during retry, offline reload, reconnection, duplicate submissions, two devices, multiple tabs, image/audio loading and browser Back.
2. Make the server validate question/opportunity snapshots, allowed state transitions and eligibility independently. Harden initial clock reconciliation and late-parent replay with adversarial/out-of-order histories. Add deterministic per-question uniqueness beyond client event ID.
3. Implement the required Excel import/export: embedded images, column mapping, row-level errors, sense-aware duplicate handling, stable import IDs and resumable retries. Do not rename the JSON utility to Excel.
4. Complete the user-configurable face matrix and game mix, card custom fields, valid question disambiguation, advanced settings/time rules, topic tree interactions and scoped bulk operations.
5. Move media to a versioned, bounded, deduplicated blob store with compression and explicit offline resource status. Do not let missing assets silently create learning errors.
6. Verify every applicable AT-01..AT-32 and UX-01..UX-30 case; record results individually. Complete keyboard focus, IME, screen-reader, zoom/contrast and mobile virtual-keyboard checks on declared devices.
7. Establish production migrations, secret handling, backup/restore, account recovery, throttling/observability and tested scale limits before public hosting.

## Important known behavior differences

- The JSON transfer is whole-set basic content, not a full filtered/selected export; no images-in-Excel support.
- The core SRS formula is implemented, but not every configurable per-language/game threshold is exposed. Full late clock correction can reclassify dependent local attempts.
- A new learning step is resumed through a new due session rather than an always-updating in-session scheduler. The waiting indicator shows a timestamp, not a per-second timer.
- English alternatives are constructed from local cards. Semantic synonym ambiguity is not comprehensively detected; the author should verify candidate meanings. Exact duplicate checks are not semantic validation.
- A new card is identified as ready by word + meaning/IPA/image. Missing meaning prevents some games; unsupported combinations stay unavailable. Full semantic disambiguation/readiness per language is pending.
- Browser edits retain hidden fields in the journal, but the UI exposes only a subset of all spec fields.
- On this environment actual app navigation in Chromium was blocked by policy. Static view screenshots are not proof of functioning IndexedDB, reload persistence, audio, accessibility or full flows.

## Suggested issue titles for the repository

- [P0] Actual-browser session/persistence/offline acceptance suite
- [P0] Authoritative opportunity validation and clock-conflict replay
- [P1] Excel import/export with embedded images and stable row IDs
- [P1] Full game-face setup, topic tree and bulk card management
- [P1] Separate media store and offline resource manager
- [P1] AT/UX traceability and accessibility/device matrix
- [P2] Production auth, migrations, recovery and operations

These are backlog suggestions in a file, not issues already created on GitHub.
