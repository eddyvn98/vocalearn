# VocaLearn progress

Updated: 2026-09-26

This file is the rolling engineering progress note for VocaLearn. The product requirements remain in `docs/spec-v0.5.docx`; this Markdown file records implementation status, acceptance evidence, active work and next steps so progress does not get lost across chats or PRs.

## Current progress

| Scope | Current estimate | Notes |
|---|---:|---|
| Phase 1 / MVP - functionality | ~88% | Core MVP is broadly implemented. AT-27 and richer sentence/cloze authoring are merged; explicit AT/UX traceability is now complete. Remaining work is focused acceptance evidence and smaller edge cases. |
| Phase 1 / MVP - acceptance evidence | ~82% | Every AT-01..AT-32 and UX-01..UX-30 has an explicit evidence-backed state; AT-04, AT-10, AT-30 and UX-29 now have exact automated/browser acceptance. Remaining gaps are predominantly physical-device/accessibility/PWA evidence. |
| Full specification v0.5 - phases 1-3 | ~60% | Phase 1 moved forward slightly; G2/G3 AI, Chinese, speech/ASR, handwriting, Japanese and advanced statistics are intentionally not complete. |

These are planning estimates, not release certification.

## Completed recently

### PR #30 - Stage-1 English profile - merged and deployed
- English -> Vietnamese and English -> English.
- Bilingual vs monolingual meaning mode.
- English-English prompt masking hides the target word and declared variants.
- Main CI passed across Chromium/WebKit and Linux/Windows/macOS.

### PR #31 - AT-31 reminder ownership - merged and deployed
- Synced primary reminder device.
- Only the primary device attempts browser notification.
- Denied/unsupported notification permission falls back to in-app reminder.
- Secondary devices stay in-app only.
- Synced day marker prevents duplicate primary reminders within the account day.
- Still needs physical-device evidence for installed/closed/background PWA behavior.

### PR #32 - AT-32 daily-new overflow - merged
Merged commit: `f816dede0dd6f37cc5846281de531008fd5b4001`

- Account-wide count of cards started today.
- Today shows exact started / daily-limit count, including overflow after sync.
- Offline overflow never deletes or rolls back learned results.
- After sync, new-card starts remain blocked until the next account day.
- Verify and Browser regression were green before merge.
- A real two-device offline/reconnect drill remains useful final evidence.

## Completed in this pass

### PR #33 - AT-27 / UI-10 topic move semantics - merged
Merged commit: `51035e7adc8de014032798a481b3a66113516164`

- Added explicit **Chuyển chủ đề** action for selected cards.
- The move requires an explicit shared source topic and target topic.
- It adds the target membership when needed and removes only the chosen source membership.
- Unrelated memberships remain intact.
- Card generation and review revision remain unchanged.
- Domain test for AT-27 passed.
- Live Chromium card/topic/bulk acceptance passed.
- Full Verify workflow passed (115 domain/API tests at this point).
- Browser regression workflow passed after stabilizing the sync-dialog close in the acceptance helper.

This closes the major AT-27 source-transfer semantics gap from the Phase-1 list.

## Completed after AT-27

### PR #34 - richer sentence/cloze authoring - merged
Merged commit: `f94e6b7cb581003a91268d2cc12cb3be66abc77d`

- Card editor now accepts a full sentence and lets the user highlight the target span.
- **Tạo ô trống từ phần bôi đen** replaces exactly that span with `___`.
- The selected text is seeded into accepted answers instead of using every card variant.
- A live preview shows the resulting cloze question and accepted answers before save.
- Browser acceptance verifies authoring, save and reopen persistence.
- Verify and the full Chromium browser-regression workflow are green.
- A selector collision found by browser CI was fixed before merge.

## Completed after cloze authoring

### PR #36 - explicit AT/UX traceability - merged
Merged commit: `85d4de9238c5750c01d54d358f6db995acccf576`

- `docs/SPEC_TRACEABILITY_V0.5.md` now records every **AT-01..AT-32** and **UX-01..UX-30** as **Pass / Partial / Pending / N/A (Phase 1)**.
- Pass is only used where the applicable behavior has direct domain/API/browser evidence.
- Physical-device, screen-reader, background-PWA and real two-device cases remain Partial/Pending where desktop automation is not enough.
- Stale UI-09/UI-10 notes were updated after PR #33/#34.
- Verify and Browser regression both passed before merge.
- This documentation change does not raise the planning percentages by itself because it clarifies evidence rather than adding runtime behavior.

## Completed after explicit traceability

### PR #37 - AT-04 / AT-10 / AT-30 exact acceptance - merged
Merged commit: `bafbfddcaa45a5d7a32de70961554230cd4191a7`

- **AT-04** now has exact domain evidence for three quiz choices, three valid match pairs and one-card matching rejection.
- **AT-10** now has exact schedule-isolation evidence: scheduled recognition changes the schedule; later free-practice failure does not, while the error book still records it.
- **AT-30** now has exact scope evidence: only ready + due cards inside the selected scope block new learning.
- Verify and Browser regression both passed before merge.
- Phase-1 acceptance-evidence planning estimate moves conservatively from ~81% to ~82%.

## Completed after AT acceptance closure

### PR #38 - UX-29 timezone settings acceptance - merged
Merged commit: `637a88b9b47a67801d44d216b49eb74b0e8b9701`

- Live browser acceptance changes account timezone from another tab while a study question remains active.
- The test captures and accepts the warning that existing due dates are not rewritten.
- The synced model adopts the new timezone.
- The active question keeps its original settings snapshot.
- Verify and Browser regression both passed before merge.
- UX-29 is now **Pass** in the explicit trace table.
- The overall acceptance estimate remains ~82%; one additional acceptance case is not enough to justify another percentage-point increase.

## Completed after UX-29

### PR #39 - checkpointed delivery + Railway production smoke + Agent operability - merged and deployed
Merged commit: `60b6edb94e978a9b22609ab46859b184b502af94`

- Added `docs/DELIVERY_WORKFLOW.md` as the durable Code -> checkpoint -> CI -> merge -> Railway SUCCESS -> production smoke -> progress workflow.
- Added a production smoke suite targeting the real Railway public origin instead of localhost.
- Production smoke covers health/readiness, anonymous auth boundary, manifest/service worker, offline shell reload, 1440/390/320 CSS-pixel overflow and screenshots.
- Added an **Agent operability** gate: visible controls need discernible names, important actions use native interactive semantics and the login flow has predictable keyboard order. Repeated selector guessing, hidden/ambiguous actions or DOM/JavaScript hacks are treated as UX gaps.
- The first smoke run correctly exposed a test false-positive: the expected anonymous `/api/me` 401 appeared as a Chromium console resource error. The test now excludes only that expected auth response while preserving all other JS/resource errors.
- PR Verify, Browser regression and Production web smoke all passed before merge.
- Railway `checkSuites` remains enabled. A circular wait was found when the first main-branch smoke tried to wait for the same deployment that Railway was withholding for CI. The workflow now uses a two-pass model: the initial main smoke completes without waiting for the new deployment, Railway deploys after CI, then the Production web smoke job is rerun as the post-deploy gate and verifies the exact `/api/health.commit` before browser checks.
- Railway deployment `cf14c636-ebdf-4917-bc99-290abc815442` reached terminal **SUCCESS** on the merge commit.
- Physical virtual-keyboard, screen-reader, installed-PWA background notification and real two-device evidence remain Partial/Pending; emulation is not counted as physical-device proof.
- Planning percentages stay at ~88% functionality / ~82% acceptance evidence / ~60% full v0.5 because this primarily improves release evidence and operability discipline rather than adding product scope.

## Completed after production-operability workflow

### PR #40 - semantic Agent business journey - merged and deployed
Merged commit: `3deb5750738bd89f035222a64b609e48c081b415`

- Added a browser acceptance journey that creates/selects a clean study set, opens the library, adds and edits a card, authors cloze content, creates/assigns a topic, configures a typing session, completes study/results, then opens settings and sync status.
- The new journey intentionally uses visible Playwright roles, accessible names and labels rather than hidden `data-action` selectors, direct DOM state reads or JavaScript manipulation.
- The first semantic pass exposed a real UX ambiguity: the top-bar study-set switcher and a selectable study-set card both announced **Chọn bộ học: ...**. The product now distinguishes **Đổi bộ học: ...** from **Chọn bộ học: ...**.
- Sync status and the icon-only settings action now have explicit accessible action names.
- Verify passed and the full Browser regression matrix passed before merge, including the Chromium semantic business journey.
- Railway deployment `e5603a95-817e-4e73-8456-a2df2d3ac26f` reached terminal **SUCCESS** for the merge commit.
- Planning percentages remain ~88% functionality / ~82% acceptance evidence / ~60% full v0.5. This closes an operability/evidence gap rather than adding new product scope.
- Real virtual keyboard, screen reader, installed-PWA/background notification and two physical-device evidence remain Partial/Pending.

## Phase 1 gaps now

1. Run physical-device and accessibility acceptance:
   - mobile virtual keyboard at 320/390 CSS px;
   - screen reader and keyboard-only flow;
   - measured WCAG contrast/target/zoom/focus checks;
   - installed PWA install/upgrade/offline lifecycle;
   - background reminder behavior;
   - real two-device offline AT-32 drill.
2. Resend production activation stays deferred in issue #29 until a verified sending domain and real delivery acceptance are available.

## Phase 2 / Phase 3

Not counted as MVP completion:
- AI content fill and protected manual edits;
- sentence bank generation;
- pronunciation/phonetic data pipeline beyond current Stage-1 English support;
- Chinese profile, pinyin whole-word input, tone and classifier games;
- speech/ASR;
- handwriting;
- full Japanese profile;
- advanced statistics.

## Rule for updating this file

Update this file whenever a meaningful PR is merged or a major acceptance gap is closed. Record:
- PR / commit;
- what behavior changed;
- CI / acceptance evidence;
- remaining caveat;
- revised percentages only when enough scope changed to justify it.
