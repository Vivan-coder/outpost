# Novessa — plan v2 (matches brief v2)

Game: first-person Moon base sim, you + 3 NPC crew (Zaid, Mariam, Sam). Mars = second config, cut first.
Stack: Vite + Three.js + TypeScript, static deploy, no server, no runtime external requests.
Audience 7-12. One difficulty, forgiving; wrong choices cost, and the fail screen explains why.

## Architecture
- src/sim/     fixed-tick pure logic (resources, modules, chores, events, scoring). No three/DOM. Tested in node.
- src/data/    levels (moon, mars), modules, chores, events (all data, not code), NASA source ids
- src/game/    player, camera, input (joystick + touch look; WASD + pointer lock), interaction, build ghost, crew AI + pathfinding
- src/render/  terrain, lighting, post-processing (quality toggle), characters, day/night, storm effect
- src/ui/      suit HUD, build menu, assign menu, tutorial, info cards, mission report, certificate
- src/audio/   CC0 sfx + ambience
- src/i18n/    en.ts, ar.ts (RTL), all text here from day one
- Quality: Low/Medium/High auto-detect. Budget: 60 fps mid-range phone @ Medium, one shadow light, instancing, pixel ratio <= 2, <15 MB.

## Feature tiers
MUST (Moon level shippable)
1. Walkable base on phone + laptop, terrain, sun, Earth in sky, collision
2. 4 resources, Fix, Build with ghost preview, suit HUD
3. 3 crew + chores (funny names) + walk/work/idle animations
4. NASA solar-storm event with on-screen source tag + info cards
5. Fail screen that explains the cause; tutorial; sound
6. Deploy + QR + 2-device test
SHOULD (impression in judging)
7. Mission Report: resource chart over the run + "this decision caused it" line
8. Junior Astronaut certificate (name, days survived, rank, shareable image)
9. Rule-based Mission Control hints (not AI)
10. Crew personalities/moods; planet comparison card (Earth/Moon/Mars: day, gravity, sunlight, radio delay)
11. Day/night, post-processing, storm visuals
STRETCH
12. Mars config: dust storm + comms delay mechanic
13. Arabic (RTL) toggle
14. Sandbox mode after campaign
15. Regional info card (e.g. UAE Hope probe) — verify facts first
SKIP: AI advisor, classroom mode, multiplayer, saving, accounts, analytics.

## Checkpoints
- Sat 11:00-13:00: walkable on phone, terrain, lighting, one module, resources ticking. Pick NASA dataset (check DONKI), write events.
- Sat 14:00-15:30: Fix/Build, HUD, 3 crew with chores.
- Sat 15:30 GATE: first person playable on a real phone? If not, cut Mars and keep first-person Moon only. No art polish before this passes.
- Sat 15:30-17:45: visual pass + storm event.
- Sat evening: Mars, Arabic, tutorial, audio, personalities.
- Sun 09:00-11:30: balance, phone test, fail screens, report/certificate, pitch text.
- Sun 11:30-12:45: freeze, deploy, 2-device test, record 30s demo, submit.
- Sun 14:00: live pitch, hotspot backup.

## Cut order
Arabic -> sandbox -> regional card -> Mars -> certificate -> film grain/AO -> character animation extras

## Names
Novessa: Outpost | Novessa: Lunar Ledger | Every Fix Has a Cost | Base Camp Novessa
