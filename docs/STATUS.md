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
| UI-03 | Today, scope selection, learning/due/new/waiting/error counts, resume entry and next-step time. Live-browser CI covers pause/resume reload plus the controlled-clock 1/10/10-minute new-learning chain, including reload while waiting. |
| UI-04 | Mode/game selection, configurable face matrix (meaning, word, ipa, image, audio), valid-count checks. |
| UI-05 | Six game families, final-answer feedback, retry, hints, pause. Dictation requires stored uploaded audio. No ASR or pronunciation scoring. |
| UI-06 | Pure scheduler has 1/10-minute learning steps, mandatory recall graduation and relearning; browser queue uses these states. Scheduler timing is covered by domain tests and the live-browser suite verifies the full 1/10/10-minute new-learning chain with a shared controlled browser/server clock. |
| UI-07 | Answer/clean/error summary and pending learning steps. Full started/graduated/entered/left breakdown remains incomplete. |
| UI-08/09 | Search/filter, edit word/meaning/part of speech/IPA/sentence answers/note/image/audio; delete/restore; identity-change copy or reset; bulk selection, bulk delete, bulk assign topic and bulk reset. |
| UI-10 | Parent/child topic data, parent selection, multi-membership and recursive scope. Hierarchical topic tree with depth indentation, subtopic creation and card counts. |
| UI-11 | **Excel import/export implemented** in pure JS (.xlsx with OpenXML/ZIP), embedded images, column mapping, row-level validation, sense-aware duplicate handling. |
| UI-12 | Error-book filter, practice, episode counts/evidence display. Pure evidence rules tested; richer remaining-condition UI pending. |
| UI-13 | Daily limit, timezone, basic SRS factors, open-app reminder. No background notifications or primary-device scheduler. |
| UI-14 | IndexedDB journal, authenticated sync, authoritative server snapshot & grade validation, opportunity deduplication, conservative multi-device merge, offline resource status modal. |
| UI-15/16 | G2/G3 AI, advanced statistics, Chinese/Japanese profiles, recognition/handwriting are not implemented or shown as playable. |

## High-priority work before calling this MVP complete

1. Finish the remaining navigation/contention acceptance around browser Back and deliberately competing same-question submissions. Controlled-clock new learning, offline reload/reconnect, multi-tab propagation and isolated-profile account sync now run in CI.
2. Continue authoritative review hardening. The server validates v2 question/config snapshots, allowed learning transitions, deterministic opportunity identity, same-device duplicate scheduled submissions, anchored clock bounds and deferred child-before-parent replay. Add more adversarial late-parent contradiction histories and conflict-detail evidence.
3. Add live-browser Excel import acceptance, including embedded-image import, conflict choices and restart/retry behavior. Core import/export round trips and UI export are automated.
4. Complete the user-configurable face matrix and game mix, card custom fields, valid question disambiguation, advanced settings/time rules, topic tree interactions and scoped bulk operations.
5. Move media to a versioned, bounded, deduplicated blob store with compression and explicit offline resource status. Do not let missing assets silently create learning errors.
6. Verify every applicable AT-01..AT-32 and UX-01..UX-30 case; record results individually. Automated coverage now includes modal focus return, IME Enter protection, responsive reflow smoke checks and multi-engine/OS browser jobs. Real screen-reader, measured contrast, real virtual keyboard and declared physical-device checks still require manual/device evidence.
7. Establish production migrations, secret handling, backup/restore, account recovery, throttling/observability and tested scale limits before public hosting.

## Important known behavior differences

- Excel transfer is content interchange, not a full backup: review schedule/logs are excluded, and Excel Place in Cell images remain unsupported.
- The core SRS formula is implemented, but not every configurable per-language/game threshold is exposed. Full late clock correction can reclassify dependent local attempts.
- A new learning step is resumed through a new due session rather than an always-updating in-session scheduler. The waiting indicator shows a timestamp, not a per-second timer.
- English alternatives are constructed from local cards. Semantic synonym ambiguity is not comprehensively detected; the author should verify candidate meanings. Exact duplicate checks are not semantic validation.
- A new card is identified as ready by word + meaning/IPA/image. Missing meaning prevents some games; unsupported combinations stay unavailable. Full semantic disambiguation/readiness per language is pending.
- Browser edits retain hidden fields in the journal, but the UI exposes only a subset of all spec fields.
- Local restricted environments may still block browser navigation. GitHub Actions now launches the live app on Chromium/WebKit across Linux, Windows and macOS. WebKit coverage is useful engine coverage but is not proof of real Safari/iPhone/iPad acceptance.

## Suggested issue titles for the repository

- [P0] Timed-learning, offline/reconnect and multi-client browser acceptance
- [P0] Authoritative opportunity validation and clock-conflict replay
- [P1] Excel import/export with embedded images and stable row IDs
- [P1] Full game-face setup, topic tree and bulk card management
- [P1] Separate media store and offline resource manager
- [P1] AT/UX traceability and accessibility/device matrix
- [P2] Production auth, migrations, recovery and operations

These are backlog suggestions in a file, not issues already created on GitHub.
