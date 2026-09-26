# Implementation instructions

1. `docs/spec-v0.5.docx` is the product source of truth. The older reference HTML is only a visual reference. Read `docs/STATUS.md` before describing completion.
2. Preserve the UI tokens in `public/css/base.css`; keep the focused-study layout and Vietnamese interface. Do not replace the approved UI with an unrelated template.
3. JavaScript modules must stay below 300 lines. Keep dependencies minimal and explain new ones in an architecture decision.
4. After finishing any feature or bug fix, run `npm run feature:check` before declaring the work complete. Fix every failing check and rerun until it passes. Treat warnings as unresolved review items: either add/update a focused regression test or explicitly confirm which existing test covers the changed behavior. `feature:check` rebuilds the service worker and runs `npm run verify`; if `public/sw.js` changes, include it in the same commit.
5. Never use the appearance of a view as proof of persistence, sync, grading or accessibility. Add actual tests and distinguish unrun scenarios.
6. Do not leak answers in text, alt labels, choices, audio filenames or live regions before submission. Missing audio is not an incorrect answer.
7. Preserve one final result per question, one schedule transition per opportunity, immutable question/config snapshots, retry history and local transaction boundaries.
8. No automatic AI/cloud-audio calls, no assumptions about offline OS voice support. G2/G3 features stay hidden until implemented and tested.
9. Do not expose credentials, database files or user data. Keep the repository private unless its owner explicitly changes that decision.
10. No silent destructive migrations or force push. Back up the server database before schema changes. JSON card export is not a journal backup.
11. The initial sync/replay is not fully production hardened. See the acceptance backlog; in particular test clock skew, late parent revisions, concurrent tabs, tombstones and initial offline synchronization.
12. When a browser tool reports an environment/security restriction, report it. Do not bypass it; use the permitted unit/API tests and label static UI checks correctly.
13. Keep source CSS readable and expanded. Do not manually minify, compress, or pack multiple selectors/declarations onto very long lines just to reduce line count. Use normal indentation and generally one CSS declaration per line. The 300-line limit applies to JavaScript modules, not CSS. If minification is ever added for deployment, generate a separate build artifact and never overwrite the committed source CSS.
