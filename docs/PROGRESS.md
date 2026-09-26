# VocaLearn progress

Updated: 2026-09-26

This file is the rolling engineering progress note for VocaLearn. The product requirements remain in `docs/spec-v0.5.docx`; this Markdown file records implementation status, acceptance evidence, active work and next steps so progress does not get lost across chats or PRs.

## Current progress

| Scope | Current estimate | Notes |
|---|---:|---|
| Phase 1 / MVP - functionality | ~86% | Core MVP is broadly implemented. AT-27 topic-transfer semantics is the active remaining functional gap being closed now. |
| Phase 1 / MVP - acceptance evidence | ~78% | CI/browser evidence is strong; physical-device, accessibility, PWA lifecycle and real multi-device checks remain. |
| Full specification v0.5 - phases 1-3 | ~59% | G2/G3 AI, Chinese, speech/ASR, handwriting, Japanese and advanced statistics are intentionally not complete. |

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

## Active work

### AT-27 / UI-10 - topic move semantics
Working branch: `feature/at27-topic-move`

Target behavior from spec:
- a card may belong to multiple topics without duplicating its review schedule;
- moving a card from a specific source topic replaces only that source membership;
- all other memberships remain;
- review state/schedule remains unchanged;
- when there is no explicit source context, assigning a topic continues to mean add membership rather than destructive move.

Implementation in the current branch:
- added explicit **Chuyển chủ đề** action for selected cards;
- the move dialog requires an explicit shared source topic and explicit target topic;
- submit adds the target membership when needed and removes only the chosen source membership;
- unrelated memberships are preserved;
- browser acceptance checks that AT-27 preserves the independent Finance membership and review revision;
- domain regression checks that source -> target transfer does not change card generation or review revision.

Status: code written; CI/PR verification pending.

## Phase 1 gaps after AT-27

1. Improve sentence/cloze authoring in the card editor: choose the blank span, confirm accepted answer(s), preview the final question.
2. Expand the trace table so each AT-01..AT-32 and UX-01..UX-30 has explicit Pass / Partial / N/A / Pending evidence.
3. Run physical-device and accessibility acceptance:
   - mobile virtual keyboard at 320/390 CSS px;
   - screen reader and keyboard-only flow;
   - measured WCAG contrast/focus checks;
   - installed PWA install/upgrade/offline lifecycle;
   - background reminder behavior;
   - real two-device offline AT-32 drill.
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
