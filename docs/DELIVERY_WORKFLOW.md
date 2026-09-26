# VocaLearn delivery workflow

Updated: 2026-09-26

This file defines the working process for future VocaLearn changes so long tool runs do not become silent and progress remains recoverable.

## Working rule

For each meaningful change, use this sequence:

1. **Read current main + `docs/PROGRESS.md`**
   - Confirm the active gap before editing.
   - Reuse existing architecture and data model when possible.
2. **Create a focused branch**
   - One acceptance gap or closely related behavior per branch.
3. **Implement the smallest complete change**
   - Add or update domain tests and browser acceptance with the behavior.
   - Do not update the DOCX product specification unless explicitly requested.
4. **Report Checkpoint: code complete**
   - State what changed and what remains before merge.
5. **Open PR**
   - Summarize behavior, evidence target and caveats.
6. **Report Checkpoint: CI running**
   - Track Verify and Browser regression separately.
   - If CI fails, report the concrete failing step, fix it on the same branch and let CI rerun.
7. **Merge only after required CI is green**
   - Prefer squash merge with expected head SHA.
8. **Report Checkpoint: merged**
   - Record PR number and merge commit.
9. **Wait for Railway production deployment**
   - Do not call the deployment successful until Railway reports terminal `SUCCESS`.
   - Intermediate `WAITING`, `BUILDING`, `DEPLOYING`, `SKIPPED` or `REMOVED` are not success.
10. **Test the deployed Railway URL**
    - Run the production web smoke suite against the real public Railway domain.
    - Check health/readiness, public auth shell, JS/page errors, PWA manifest/service worker, offline shell reload and responsive overflow.
    - Physical-device-only cases stay separate until a real-device run exists.
11. **Report Checkpoint: production verified**
    - State deployment commit, Railway terminal status and production-smoke result.
12. **Update `docs/PROGRESS.md`**
    - Record PR/commit, behavior, CI/acceptance evidence, remaining caveat and percentage changes only when justified.

## Communication rule

During long work, report at these checkpoints instead of staying silent:

- **Checkpoint 1 — scope confirmed**
- **Checkpoint 2 — code complete**
- **Checkpoint 3 — PR/CI running**
- **Checkpoint 4 — merged / Railway deploying**
- **Checkpoint 5 — Railway SUCCESS / production URL smoke**
- **Checkpoint 6 — progress file updated / next gap selected**

If an external tool is slow, explicitly report its current state when control returns. Do not imply background progress that has not been observed.

## Current testing policy

Until physical-device testing is resumed:

- Continue domain/API/browser automation.
- Test the real Railway production URL after deploy.
- Use desktop Chromium plus a 390x844 mobile viewport for the production web shell.
- Do not mark real virtual-keyboard, screen-reader, installed-PWA background notification or real two-device acceptance as Pass from emulation alone.
- Keep those rows Partial/Pending in the trace table.

## Production target

Current production service:

- Railway service: `vocalearn-web`
- Environment: `production`
- Public origin: `https://vocalearn-web-production.up.railway.app`
- Health: `/api/health`
- Readiness: `/api/ready`

If the Railway domain changes, update this file and the production-smoke workflow together.
