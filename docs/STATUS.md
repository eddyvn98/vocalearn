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
| UI-04 | Mode/game selection, configurable face matrix (meaning, word, ipa, image, audio), valid-count checks. |
| UI-05 | Six game families, final-answer feedback, retry, hints, pause. Dictation requires stored uploaded audio. No ASR or pronunciation scoring. |
| UI-06 | Pure scheduler has 1/10-minute learning steps, mandatory recall graduation and relearning; browser queue uses these states. Covered by end-to-end browser lifecycle suite. |
| UI-07 | Answer/clean/error summary, pending learning steps, and session transition counts for started, graduated, entered-error-book and left-error-book cards. |
| UI-08/09 | Search/filter, edit word/meaning/part of speech/IPA/sentence answers/note/image/audio plus level, variants and tags; delete/restore; identity-change copy or reset; bulk selection, bulk delete, bulk assign topic and bulk reset. Arbitrary per-set custom field definitions remain pending. |
| UI-10 | Parent/child topic data, parent selection, multi-membership, recursive/exact scope toggle, hierarchical tree, subtopic creation, card counts, and drag reparent/reorder with cycle protection. |
| UI-11 | **Excel import/export implemented** in pure JS (.xlsx with OpenXML/ZIP), embedded images, column mapping, row-level validation, sense-aware duplicate handling. |
| UI-12 | Error-book filter, practice, episode counts/evidence display. Pure evidence rules tested; richer remaining-condition UI pending. |
| UI-13 | Daily limit, timezone, SRS hard/easy factors, easy threshold, maximum interval, and open-app reminder. No background notifications or primary-device scheduler. |
| UI-14 | IndexedDB journal, authenticated sync, authoritative server snapshot & grade validation, opportunity deduplication, conservative multi-device merge, offline resource status modal. |
| UI-15/16 | G2/G3 AI, advanced statistics, Chinese/Japanese profiles, recognition/handwriting are not implemented or shown as playable. |

## High-priority work before calling this MVP complete

1. Extend the real-browser suite beyond the current register/create-set/card/reload/offline/reconnect path: fake-clock learning steps, retry reload, duplicate submissions, two browser profiles, multiple tabs, image/audio loading and browser Back.
2. Continue authoritative sync hardening. Snapshot/grade validation, duplicate-final-answer rejection, tombstone protection, refreshed trusted clock anchors and deterministic device/event tie-breaking are implemented. Remaining focus: adversarial late-parent replay, descendant invalidation/reclassification and two-device browser acceptance.
3. Finish the remaining UI/spec gaps: full face/game configuration, arbitrary per-set custom fields, remaining language-profile-specific fields and any acceptance-only interaction details. Ambiguous auto-graded prompts, topic descendant scope, topic drag ordering and maximum interval settings are implemented.
4. Move media to a versioned, bounded, deduplicated blob store with compression and explicit offline resource status. Do not let missing assets silently create learning errors.
5. Verify every applicable AT-01..AT-32 and UX-01..UX-30 case; record results individually. Complete keyboard focus, IME, screen-reader, zoom/contrast and mobile virtual-keyboard checks on declared devices.
6. Establish production migrations, secret handling, backup/restore, account recovery, throttling/observability and tested scale limits before public hosting.

## Important known behavior differences

- JSON transfer remains a separate basic utility. Excel import/export is implemented, including embedded-image handling; filtered/selected export and full journal backup remain separate concerns.
- The core SRS formula is implemented, but not every configurable per-language/game threshold is exposed. Full late clock correction can reclassify dependent local attempts.
- A new learning step is resumed through a new due session rather than an always-updating in-session scheduler. The waiting indicator shows a timestamp, not a per-second timer.
- Exact duplicate prompt ambiguity is blocked for auto-graded games, but semantic synonym equivalence is not comprehensively inferred; the author still needs to verify meanings that are different text but equivalent in meaning.
- A new card is identified as ready by word + meaning/IPA/image. Missing meaning prevents some games; unsupported combinations stay unavailable. Full semantic disambiguation/readiness per language is pending.
- Browser edits retain hidden fields in the journal, but the UI exposes only a subset of all spec fields.
- GitHub Actions now runs a real Chromium regression against the live app. The current suite covers registration, set/card creation, reload persistence, offline edit persistence and reconnect sync. Audio, accessibility, multi-tab and full multi-device browser flows remain unproven.

## Suggested issue titles for the repository

- [P0] Actual-browser session/persistence/offline acceptance suite
- [P0] Authoritative opportunity validation and clock-conflict replay
- [P1] Excel import/export with embedded images and stable row IDs
- [P1] Full game-face setup, topic tree and bulk card management
- [P1] Separate media store and offline resource manager
- [P1] AT/UX traceability and accessibility/device matrix
- [P2] Production auth, migrations, recovery and operations

These are backlog suggestions in a file, not issues already created on GitHub.


## Recent hardening progress

Tracked implementation branch: `feature/core-hardening-mvp`.

- Real Chromium E2E added for register -> set -> card -> reload -> offline edit -> offline reload -> reconnect sync.
- Server rejects attempts/answers against tombstoned cards.
- Device clock anchors refresh after successful sync; clamped timestamps are marked with `clockAdjusted`.
- Sync responses return the refreshed server/client anchor pair for the next offset calculation.
- Concurrent review ties are deterministic by result severity, assistance, effective time, device ID, then event ID.
- Focused regression tests were added for tombstones, clock reconciliation and deterministic review ordering.

See `docs/PROGRESS.md` for the rolling change log and CI state.
