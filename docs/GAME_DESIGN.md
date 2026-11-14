# Outpost: Game Design

Status: design target for the Riffa submission (Sun Nov 15, 12:45 Bahrain time). Written 2026-11-14 from the current code plus the decisions below. Where the code differs, the code is catching up to this document, not the other way round.

## 1. Audience and challenge
**Players:** kids ages 7-12, on a phone or a laptop, often with no one explaining. **Judges:** play about 2 minutes.

**NASA challenge "Junior Astronaut Mission Trainer" asks for:**

| Requirement | How Outpost answers it |
|---|---|
| Ages 7-12 | Plain words, one goal at a time, tap-to-learn word tips, no reading walls |
| Manage life support, radiation shielding, power, food production, communication delay | Oxygen, Protection, Power as core meters; greenhouse for food; Mars preview for radio delay |
| Every choice has a consequence | Every decision card, power budget slider and job shows its cost before you commit |
| Real NASA data such as DONKI | Storm chain from DONKI; RadLab dose rates; OSDR research notes |
| Clear attribution | Source badge and link on every real number; Credits screen; `docs/CREDITS.md` |
| Replayability | Shuffled decision cards (seeded), random burnt parts in repairs, star ratings, judge mode vs full mission |
| Don't present static data as live | Bundled records carry an "Archived: May 2024" badge. Nothing says "live" |
| Don't overwhelm kids | Max 3 meters on screen, one goal line, one prompt |

## 2. Design pillars (priority order)
1. **Every choice has a cost.** There is no safe, free option. Shielding takes power; life support takes power; science takes power; a spacewalk gives research but costs oxygen and dose.
2. **Real NASA data, clearly labelled.** DONKI (space weather), RadLab (ISS dose), OSDR (astronaut health studies). Facts only from NASA pages, stored with source URLs in `src/data/`.
3. **Easy for 7-12.** Three core resources, food secondary.
4. **A real, polished game.** Instant response, feedback on every action, no dead time.
5. **Runs anywhere.** Browser only, no install or login, offline after first load.

## 3. The day loop (about 2-3 minutes per day)

| Phase | Length | Player does | Player learns |
|---|---|---|---|
| **1. Morning briefing** (Mission Control) | 30-40 s | Reads the forecast (flare, CME, proton stages from real DONKI records, with "Archived" badge). Splits the day's power across Life, Shield, Comms, Science. Picks one decision card (A or B, costs shown as icons). | Power is limited; protecting people costs energy you could spend on science. Space weather arrives in a known order. |
| **2. Work shift** (3D base) | 60-80 s | Walks the base, does 2-3 hands-on jobs (repair a panel, clean solar dust, swap a water filter, tend the greenhouse). Orders crew to do others. | Real station chores and why they matter (short NASA-sourced "why" line where verified). |
| **3. Event** | 20-40 s | Day 3 and 5: a storm. Warning, then call everyone to the shelter; watch the dose meter. Other days: a smaller game event (equipment failure, meteors). | What a proton storm does, why regolith shelters work, why warning time matters. |
| **4. Evening report** | 15-20 s | Sees what each choice caused (power, air, dose changes), a real-world note, 1-3 stars. Tap to continue. | Cause and effect: "You gave shields less power, so dose was higher." |

Day 1 skips the decision card and has no storm. Nothing in the budget can go badly wrong on day 1 (the sim already floors the multipliers on the first day).

### Moon mission: 5 days

| Day | Purpose | What happens |
|---|---|---|
| 1 | Learn controls. **Cannot be lost.** | Gentle practice: walk, do one job, see the meters. No card, no storm. Budget effects floored. |
| 2 | Power budget | First budget choice matters. One decision card. A small equipment failure. |
| 3 | First storm | Storm 1 (from the real May 2024 event, X3.9 flare chain). Shelter or take dose. |
| 4 | Harder trade-offs | Two decision cards; a failure plus meteors; supplies tighter. |
| 5 | Big storm, then rescue | Storm 2 (X5.8 chain, the stronger one). Survive, then the rescue ship arrives, final report, stars, **Mars preview teaser** ("Next: Mars, where a message takes minutes to arrive"). |

### Mars preview (short, after day 5)
One short scenario, 1-2 minutes. Same controls and meters. The new idea is **communication delay**: Mission Control's answer arrives late, so you decide first and the reply confirms or warns afterwards. Delay is scaled to game seconds and labelled as a game scaling of a real range (about 4-24 minutes one way). Dust storm cuts solar power (an existing sim feature). Cut first if time runs out; the teaser alone is enough.

### Judge mode (3 minutes)
`?judge=1` or "Quick demo (3 min)" on the title screen. Starts with a built base, skips the long intro, and plays a compressed **day 3**: short briefing (forecast, budget, one card), one hands-on job, the storm, a short report with the stars. "Reset demo" restarts it. It must show, in order: a cost on a choice, a real NASA source badge, the shelter moment, and the evening cause-and-effect line.

## 4. Resources
Three core meters are always visible. Food is secondary and only shows when it matters.

| Meter | What it is | Goes up by | Goes down by |
|---|---|---|---|
| **Power** (battery) | Energy to run everything | Solar panels (less when dusty or in storm), battery-storage upgrades, cleaning panels | Life support, greenhouse, base load; spending budget on Science |
| **Oxygen** (air) | Breathable air | Life support running, O2/water/CO2 jobs | Crew breathing; spacewalks and sample trips |
| **Protection** (shield + dose) | How safe the crew is from radiation. Shown as a dose bar that fills | Budget share to Shield, regolith shielding, sheltering in time | Storms when anyone is outside; low Shield budget lets radiation leak into the shelter |

Secondary values (shown in menus or the report, not the main HUD): Food, Health, Parts, Research.

### How choices change the core resources

| Choice | Power | Oxygen | Protection |
|---|---|---|---|
| Budget: more to Life | -  (less for others) | + | no change |
| Budget: more to Shield | -  (less for others) | no change | + (less leak, lower dose) |
| Budget: more to Comms | - | no change | no change (matters on Mars: faster reply) |
| Budget: more to Science | - | no change | no change (more Research) |
| Card "Spacewalk" A / B | - / - | -8 / +3 | dose +4 / health -4 |
| Card "Regolith on the shelter" A / B | -3 / - | - | shield bonus +18% / food +8 |
| Card "Dust the panels" A / B | -  / + | -4 / - | no change |
| Card "Workout vs rest" | -4 / +2 | - | - |
| Card "Collect a sample" A / B | - / +4 | -7 / - | dose +3 / - |
| Card "Send science data" A / B | -6 / +3 | - | - |
| Hands-on job (repair, clean, filter) | + (solar, thermal) | + (O2, water, CO2) | - dose via radiation monitor |
| Skipping the shelter in a storm | - | - | large dose rise |

(Exact numbers are in `src/data/decisions.ts` and `src/data/moon.ts`; the table shows direction only.)

### Game simplification vs real data

| Real (from NASA pages, labelled) | Game simplification (labelled "Game") |
|---|---|
| Storm timeline: flare time, CME speed, proton onset, geomagnetic Kp (DONKI, May 2024 and Sept 2017) | Time compression (real hours squeezed into game seconds); storm strength and length are stand-ins from flare class; no proton end time exists in the records |
| ISS/ground dose rates (RadLab) used for comparisons and cards | Dose bar scale: a full bar stands for the Aug 1972 estimate, a story choice, not a dosimetry model |
| Apollo mission doses and the Aug 1972 storm estimate (ALSJ) | All supply, power and oxygen numbers, equipment failures, meteors |
| OSDR study titles for research and health notes | Task rewards, upgrade costs, crew behaviour |
| NASA article on regolith shelter | The shielding percentages |

Every real number carries a badge ("Real NASA data" / "Archived") and a link. Every game number is plainly "Game".

## 5. Controls

| | Laptop | Phone |
|---|---|---|
| Move | W A S D / arrows | Left-thumb joystick |
| Look | Mouse (click to capture) | Right-thumb drag |
| Act / talk / start job | E (button shows what it will do) | Big action button |
| Call crew to shelter | G (also on-screen button) | On-screen button |
| Menus | B build, Tab crew, J goals, Esc pause | On-screen buttons |
| Work-bench tools | 1-8, E to use, Esc to leave | Tap tool, tap/drag on target |
| Jump | Space | Jump button |

VR (WebXR) exists as an extra: teleport, snap turn, wrist panel. It is not part of the judged path.

## 6. UI layout
**Always on screen (3D view):**
1. **Max 3 meters:** Power, Oxygen, Protection (dose). Icons plus bars, colour never the only cue.
2. **The goal line:** one sentence, e.g. "Fix the solar panel" or "Get everyone to the shelter".
3. **One prompt:** the single thing you can do right now ("E: REPAIR").

Everything else lives in menus: Build, Crew, Goals, NASA Data Lab, Mission Log, Pause, Credits, language switch (EN/AR, RTL).

**Mission Control screen:** forecast strip (with source badge), four budget sliders that always add to 100 (so no choice is free), power-per-day readout, then one decision card with A and B each showing costs as icon chips (green = gain, red = cost).

**Evening report:** three cause-and-effect lines, one real-world note, stars.

**Menus:** keyboard and touch both work; same key that opens a menu closes it; tap any dotted word for a short meaning.

## 7. Feedback rules
Every action gets a visible and audible response within 100 ms (sound, flash, number pop-up). No loading spinners during play. If a job cannot be done, the prompt says why in one short line.

## 8. Dataset use
Three datasets, each shown during play, not only in a menu:
- **DONKI** (briefing forecast chain and the storm itself).
- **RadLab** (dose comparison on the dose meter and in the evening report).
- **OSDR** (health/research notes in jobs and the report).

All bundled as static JSON with a `.meta.json` recording source, query and download date. No runtime API calls. The README explains each dataset, what is real, and what is game design.

## 9. Existing features: keep, secondary, or hide

**Keep (core to the loop):**
- 3D base with first-person walking and collision
- Hands-on work stage (repair, solar cleaning, water filter, greenhouse)
- DONKI-driven storms, shelter mechanic, dose meter, warning siren
- Mission Control screen: forecast, power budget, decision cards (`src/ui/mission.ts`)
- Day reports and stars
- Source badges, NASA Data Lab, Credits
- EN/AR with RTL
- Judge mode, pause, fast-forward for testing
- Crew with orders (simplified to a short list of jobs)
- Title intro (skippable)

**Secondary (keep, but not on the main path, kept out of the first 2 minutes):**
- Build menu and module placement (limited to one or two useful modules)
- Upgrades (reduce to a short list)
- NASA Data Lab and Mission Log (opened by button)
- Talk to crew / quiz (optional, small reward)
- VR mode
- Mission goals panel (J)
- Auto-quality and performance tools

**Hide or cut (do not serve the loop for 7-12):**
- Free-form base building as a main activity
- Full 6-goal list; replace with the single goal line
- Per-crew chore micromanagement screens
- Fast-forward / skip buttons for players (keep as debug/judge tools)
- Any text-heavy panel shown during play
- Anything that shows more than three meters at once

Nothing new gets added unless it is in this document. If it must change, update this doc first.

## 10. Definition of done
- [ ] A 7-year-old can play the first 2 minutes without help.
- [ ] Every decision shows its cost before it is chosen.
- [ ] Real data appears with its source during play (not only in a menu).
- [ ] Works on phone and laptop browsers, with no console errors.
- [ ] 60 fps on a laptop; 30+ fps on a mid-range phone.
- [ ] Judge mode works start to finish and resets cleanly.
- [ ] Day 1 cannot be lost.
- [ ] The Moon mission can be won and lost, and the fail screen explains why in plain words.
- [ ] Works offline after the first load; Arabic/RTL has no broken screens.
- [ ] README explains the datasets (what is real, what is game design, with links).
- [ ] `docs/ASSETS.md` and `docs/CREDITS.md` are complete, including AI disclosure.
- [ ] Type-check, build, and automated playtest all pass; deployed on Cloudflare Pages (https://novessa-outpost.pages.dev); link tested on a second device.

## 11. Changes made after the first design (approved by the author, Nov 14-15 2026)

These were added on request during the build. They follow the pillars (every choice costs something, real data labelled, easy for ages 7-12).

| Change | Why | Where |
|---|---|---|
| **Second real DONKI event (Sept 2017) and a seed** that picks the two storms of a run (`?seed=N`, `?classic` = May 2024) | More variety from real data; storms land on day 3 and day 5 | `src/data/stormTimeline.ts`, `src/data/moon.ts` |
| **Eat a meal at the canteen** (food -3, health +6, short cooldown); live Oxygen % and Food % labels over the gauges; furniture and shelter boulders are solid for the player | Every object should be usable or solid; levels must match the bars | `src/sim/sim.ts` (`eatMeal`), `src/render/building.ts`, `src/game/world.ts` |
| **Storm cutscene "A storm is forming"**: flare class and time, C-M-X scale, CME speed, trip to the Moon, all from the bundled DONKI record, labelled Real NASA data / Archived. Skippable, short on repeat, replay in the Mission Log, reduce-motion setting | Explains the data right before the event | `src/cutscenes/` |
| **Objective line and a "What to do now" card** after the first cutscene | Players did not know what to do next | `src/main.ts` (`objective`), `src/ui/ui.ts` |
| **Phone layout fix and switches:** UI sized to the visible area under Safari's bars, compact layout for short screens, ☰ and ✔ switches to hide the menu buttons and the task list, web app manifest and icons for full-screen install | Buttons were hidden behind Safari's bars | `index.html`, `src/main.ts`, `public/` |
| **Mars preview** implemented as described in section 3, with the verified delay range (see below) | Teaches communication delay | `src/data/mars.ts` |

**Correction:** the real one-way radio delay between Earth and Mars is about **4 to 24 minutes** (NASA Goddard), not "3 to 22"; the code and the README use 4 to 24.

**Not built from the plan:** the live-data function (it conflicts with the no-network rule), a helper bot, an astronaut creator, a guided tutorial checklist, and an offline service worker.
