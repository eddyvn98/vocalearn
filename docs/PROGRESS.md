# VocaLearn progress

Updated: 2026-09-26

This file is the rolling engineering progress note for VocaLearn. The product requirements remain in `docs/spec-v0.5.docx`; this Markdown file records implementation status, acceptance evidence, active work and next steps so progress does not get lost across chats or PRs.

## Current progress

| Scope | Current estimate | Notes |
|---|---:|---|
| Phase 1 / MVP - functionality | ~88% | Core MVP is broadly implemented. AT-27 and richer sentence/cloze authoring are merged; explicit AT/UX traceability is now complete. Remaining work is focused acceptance evidence and smaller edge cases. |
| Phase 1 / MVP - acceptance evidence | ~84% | Automated accessibility coverage now includes measured contrast, product 44px targets, keyboard/modal focus behavior and 320/390px reflow. Remaining gaps are predominantly physical-device, real screen-reader/virtual-keyboard, installed-PWA/background-notification and real two-device evidence. |
| Full specification v0.5 - phases 1-3 | ~68% | Phase 2 AI/sentence semantics, Chinese/Japanese profile rules, device capability gates, handwriting grading semantics, Chinese tone/classifier rules and the defined advanced-statistics core are now implemented. UI/runtime exposure and physical-device validation for G2/G3 remain incomplete. |

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

## Completed after the delivery workflow

### PR #42 - automated accessibility acceptance - merged and deployed
Merged commit: `ff10ab6e5d14c4931879009893f7f641f938583b`

- Added automated checks for text/non-text contrast, the product 44px target rule, keyboard/modal focus restoration and mobile reflow at 320/390 CSS px.
- Corrected the initial zoom-emulation approach so the acceptance now measures CSS-viewport reflow instead of treating a fake browser scale as WCAG evidence.
- Verify and Browser regression passed before merge.
- This improves software-verifiable UX-21/22/23 evidence, but real screen-reader and virtual-keyboard checks remain physical-device work.

### PR #43 - Phase 2 AI jobs + sentence-pool semantics - merged and deployed
Merged commit: `d52eba03f07aca8de2ece0efafff6764fe78cf01`

- AI jobs snapshot content/field revisions and never overwrite fields the user changed after the job was queued; stale results are retained as suggestions.
- Sentence pools validate gap/answer/content-version semantics, prefer unused sentences, deterministically reuse/refill after exhaustion, and disable safely when no valid sentence exists.
- Covers the software semantics behind AT-22 and AT-23 without introducing a paid/external AI provider.
- Verify and Browser regression passed before merge.

### PR #46 - defined Phase 3 statistics core - merged and deployed
Merged commit: `37b0ade791713331660a514926a620c280b746e7`

- Implements the v0.5 definition of “Đã thuộc”: review phase, interval >= 21 days, not overdue and not in the error book.
- Uses all active cards in scope as the denominator, including new/waiting cards; empty scope reports 0/0 and “—”.
- Activity series keeps scheduled review separate from free/error practice and exposes a textual summary for future accessible charts/tables.
- UI-16 is still not exposed as a complete production screen.

### PR #55 - consolidated G2/G3 language, capability, handwriting and Chinese-game rules - merged and deployed
Merged commit: `b4e3810664222ece6004e34db18d2f4d31c3f8d1`

- Replaced the conflicting PR #51/#52/#53/#54 heads with one clean integration branch based on current main.
- Chinese/Japanese profiles now carry phase-aware data-driven rules; Chinese pinyin accepts marked/numbered forms with mandatory tones, Japanese rejects raw romaji and handles kana-only/katakana cases according to AT-25/26.
- Device capability gates only expose TTS/ASR/pen behavior that has explicit tested capability; offline support is never inferred and speech technical failures do not consume a valid attempt (AT-08/24).
- Handwriting aggregation records per-character/stroke evidence while producing one word-level result for AT-09; the geometry/stroke-shape engine remains intentionally external and gated by tested/versioned data.
- Chinese tone/classifier domain rules implement explicit per-syllable tone grading including neutral tone and suppress classifier questions when data is missing.
- Initial Verify failure was only the generated service-worker manifest; the manifest was regenerated with the four integrated core modules. Final Verify and Browser regression both passed.
- Railway deployment `aafc0c72-abf3-490d-8677-c29e841f927e` reached terminal **SUCCESS** for commit `b4e3810664222ece6004e34db18d2f4d31c3f8d1`; Railway healthcheck `/api/health` returned 200 on the new container.
- The production-web smoke job was rerun after deployment and passed against the real Railway production origin.
- Superseded PRs #51-#54 were closed after #55 merged.

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

Implemented at domain/core level but not yet complete as released end-user flows:
- AI content-fill job semantics and protected manual edits;
- sentence-bank validation/selection/reuse/refill semantics;
- Chinese and Japanese language-profile rules, including pinyin/kana whole-word behavior;
- device capability gates for TTS/ASR/pen and speech-attempt semantics;
- handwriting result aggregation and detailed stroke-error evidence;
- Chinese tone and classifier game rules;
- advanced-statistics metric definitions and activity aggregation.

Still open before G2/G3 can be called complete:
- wire the new G2/G3 domain modules into released UI/game flows with phase gates;
- finish the user-facing statistics screen and accessible chart/table presentation;
- provide the real stroke-data/geometry engine and license/coverage evidence for handwriting;
- validate TTS/ASR/pen on real target devices and browsers before exposing those capabilities;
- complete full Japanese UI/furigana/IME acceptance and Chinese tone/classifier UI acceptance;
- perform the physical-device and installed-PWA acceptance that cannot be certified from desktop automation.

## Rule for updating this file

Update this file whenever a meaningful PR is merged or a major acceptance gap is closed. Record:
- PR / commit;
- what behavior changed;
- CI / acceptance evidence;
- remaining caveat;
- revised percentages only when enough scope changed to justify it.

## 2026-09-27 MVP RC1 integration

- Created `release/mvp-rc1` from current `main` instead of merging the long-lived hardening branch directly.
- Curated only release-relevant post-main fixes: restore local event ordering after reload, drain/coalesce bounded sync batches, accept logically earlier same-device retry history delivered after its final answer, and build the generated service worker reproducibly in CI/deployment.
- Phase-2 Chinese UI work remains outside the MVP RC1 integration so this release does not accidentally expand its scope.
- Issue #29 Resend production activation remains explicitly deferred.
- RC1 must pass Verify, Browser regression and Deployed smoke on the integrated code before promotion to `main`.


## Phase 2 release gate (2026-09-27)

### PR #69 - lookup adapters - merged and production-verified
Merged feature commit: `17dd49e0839e5f5a19b49919e538fa9c4f0f5148`

- Added deterministic English IPA from a vendored open-dict-data snapshot.
- Added deterministic Chinese Pinyin + Hán-Việt from Unicode Unihan 17, including simplified-to-traditional fallback for missing Vietnamese readings.
- Persisted source/version/license provenance and confirmation/review state; unsupported data remains missing instead of being fabricated.
- Added editor lookup actions and Browser acceptance for saved provenance, ambiguous readings, unsupported lookups, manual overrides and `中国 → zhōng guó / trung quốc`.
- Browser acceptance exposed a real source-provenance schema mismatch before release; it was fixed on the branch before merge.
- PR Verify, Browser regression and Production web smoke were green before squash merge.
- Main Verify run `36315084208` and Browser regression run `36315084206` passed on the merged feature SHA.
- Railway deployment `31340611-c8eb-400c-bf19-877c76779cbf` reached terminal **SUCCESS**.
- Production web smoke run `36315084159`, attempt 2, verified the exact deployed feature SHA before browser smoke and passed.
- Phase-3-only Japanese full-profile UI, handwriting and speech remain gated.

### Issue #65 - final Phase-2 release gate
This release-gate documentation PR records only evidence already observed above. After it merges, the resulting documentation-only main SHA must also reach Railway terminal **SUCCESS** and pass the post-deploy exact-SHA production smoke before #65 is closed. Planning percentages are left unchanged because release evidence alone does not add product scope.
