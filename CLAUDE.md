# Outpost

## What it is
"Outpost" is a browser game for kids ages 7-12, built for NASA Space Apps 2026 (challenge: "Junior Astronaut Mission Trainer"). You run a Moon outpost (then a short Mars preview) and learn the real trade-offs astronauts face: every choice costs something. Real NASA data drives the risks. Full design: `docs/GAME_DESIGN.md`. Data sources: `README.md` and `docs/CREDITS.md`.

## Goal
Win Best Use of Dataset (main) or Best Use of Technology at the Riffa local event. Submission deadline: Sun Nov 15, 12:45 (Bahrain time). Judges play about 2 minutes, so the first 2 minutes decide everything.

## Design pillars (priority order; when two clash, the lower number wins)
1. **Every choice has a cost.** No safe, free option (power vs oxygen vs protection).
2. **Real NASA data, clearly labelled:** DONKI (space weather), RadLab (ISS radiation dose), OSDR (astronaut health research). Archived data is never shown as live. Facts come only from NASA pages and are stored with source URLs in `src/data/`.
3. **Easy for ages 7-12.** Plain words, one goal at a time, three core resources (Power, Oxygen, Protection), food secondary.
4. **Feels like a real, polished game.** Responsive controls, clear feedback for every action, no waiting around, no confusing screens.
5. **Runs anywhere.** Phone and laptop browsers, no install, no login, can be added to the home screen.

## Core loop (one game day, about 2-3 minutes)
Morning briefing at Mission Control (forecast from real DONKI data, power budget, one decision card) -> Work shift in the 3D base (2-3 hands-on jobs, order crew to do others) -> Event (a storm from real data: shelter, dose meter) -> Evening report (what your choices caused, a real-world note, stars).
Moon mission = 5 days. Mars preview teaches communication delay.

## Tech
- Three.js + Vite + TypeScript, static deploy on Cloudflare Pages from `main` (live: https://novessa-outpost.pages.dev; `DEPLOY.md`; `netlify.toml` is kept for Netlify).
- `src/sim/` is pure logic on a fixed tick, no three.js or DOM, separate from rendering. A dashboard-only mode must stay possible.
- All player-facing text lives in `src/i18n/en.ts` and `ar.ts` (EN/AR, RTL). No hard-coded strings in UI code.
- Installable: a web app manifest and icons (add to home screen). There is no offline service worker yet, so do not claim offline play.
- Layout comes from data (`src/data/layout.ts`); `npm run build` validates it.

## Rules for working
- Test before saying something works. Never claim success from reading code alone.
- Never leave the game broken: git tag before each change, revert on failure.
- After each change run: type-check (`npx tsc --noEmit`), build (`npm run build`), and the automated playtest. Then push to `main`: Cloudflare Pages deploys it.
- Report what changed and what I should test, in plain words.
- Ask me before adding any feature that is not in `docs/GAME_DESIGN.md`. Prefer fixing and polishing over adding.
- If two sessions may be editing at once, only touch the files your task needs.

## Hard rules
- Kid-friendly content only (no gore, no scary death scenes, no ads, no chat, no tracking).
- No copied game assets or logos. No NASA logos or images unless the licence is checked and recorded.
- Every asset licence is recorded in `docs/ASSETS.md`.
- No API keys in the browser or the repo. The game makes no network calls while playing; NASA data is bundled as static JSON.
- AI use is disclosed in `docs/CREDITS.md` (and in the submission form).
- Real data is labelled "Real NASA data" / "Archived" with its source; game numbers are labelled "Game". Never blur the two.

## Known gaps between docs and code (as of 2026-11-15)
- The day loop, Mission Control, decision cards, two real DONKI storms with a seed, the Mars preview and the storm cutscene are built. See `docs/GAME_DESIGN.md` section 11 for what was added after the first design.
- Not built: offline service worker (only a manifest and icons), live NASA function (conflicts with no-network), helper bot, astronaut creator, guided tutorial checklist, the Playwright playtest bot (`npm run playtest` does not exist).
- Untested: real iPhone/Android, real VR headset, Arabic layout of the newer screens (the Arabic text is AI-drafted, not yet reviewed).
- Trailer tooling is on the `trailer` branch only. Never commit videos, audio or the demo song (git-ignored).
- Credits live in `docs/CREDITS.md` (not the repo root).
