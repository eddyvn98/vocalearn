# VocaLearn progress

Updated: 2026-09-26

This file is the rolling engineering progress note for VocaLearn. The product requirements remain in `docs/spec-v0.5.docx`; this Markdown file records implementation status, acceptance evidence, active work and next steps so progress does not get lost across chats or PRs.

## Current progress

| Scope | Current estimate | Notes |
|---|---:|---|
| Phase 1 / MVP - functionality | ~88% | Core MVP is broadly implemented. AT-27 and richer sentence/cloze authoring are merged; explicit AT/UX traceability is now complete. Remaining work is focused acceptance evidence and smaller edge cases. |
| Phase 1 / MVP - acceptance evidence | ~81% | Every AT-01..AT-32 and UX-01..UX-30 now has an explicit evidence-backed state. Physical-device, accessibility, PWA lifecycle and selected exact-scenario checks remain. |
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

## Phase 1 gaps now

1. Add focused automated acceptance for the exact remaining composite cases **AT-04, AT-10 and AT-30**.
2. Run physical-device and accessibility acceptance:
   - mobile virtual keyboard at 320/390 CSS px;
   - screen reader and keyboard-only flow;
   - measured WCAG contrast/target/zoom/focus checks;
   - installed PWA install/upgrade/offline lifecycle;
   - background reminder behavior;
   - real two-device offline AT-32 drill.
3. Close the explicit timezone-impact warning portion of **UX-29**.
4. Resend production activation stays deferred in issue #29 until a verified sending domain and real delivery acceptance are available.

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
