# Outpost

A first-person Moon base game for ages 7 to 12, built for NASA Space Apps 2026 (challenge: Junior Astronaut Mission Trainer). You keep a crew of four alive for five game days: plan power each morning, fix what breaks, and get everyone into shelter when a real solar storm arrives. Every choice costs something. A short Mars preview (`?mars=1`) teaches why radio messages to Earth are slow.

Runs in a phone or laptop browser. No server, no logins, no network calls while playing.

## Judges: quick demo

Open the game with `?judge=1` (or press "Quick demo (3 min)" on the title screen) for a ready base about 20 seconds before the first storm warning. Use "Reset demo" to restart it.

## Run it

```
npm install
npm run dev      # local development
npm run build    # production build into dist/
node scripts/simcheck.ts   # balance check of the simulation, no browser needed
```

Add `?skip=150` to the URL to start the mission 150 seconds in (a testing aid). Deployment steps are in `DEPLOY.md`.

## Data

The solar storm in the game is built from real NASA records. The game never calls a NASA API while it runs; the records are bundled as static JSON.

| What | Where it comes from |
|---|---|
| Storm timeline (flares, CMEs, proton events, geomagnetic storms) | NASA CCMC DONKI, Space Weather Database Of Notifications, Knowledge, Information: https://ccmc.gsfc.nasa.gov/tools/DONKI/ |
| Radiation context (quiet-day dose rate, Apollo mission doses, August 1972 estimate) | Apollo Lunar Surface Journal, "Radiation Environment": https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html |
| Regolith shelter story | NASA Science, "How NASA Will Protect Astronauts From Space Radiation at the Moon" |

**The event:** the May 2024 solar storm from active region 13664.

| Time (UTC) | Record | DONKI id |
|---|---|---|
| 2024-05-10 06:27 | X3.9 solar flare | `2024-05-10T06:27:00-FLR-001` |
| 2024-05-10 07:12 | CME, 1018 km/s | `2024-05-10T07:12:00-CME-001` |
| 2024-05-10 13:35 | Protons above 10 MeV at GOES | `2024-05-10T13:35:00-SEP-001` |
| 2024-05-10 15:00 | Geomagnetic storm, Kp up to 9 | `2024-05-10T15:00:00-GST-001` |
| 2024-05-11 01:10 | X5.8 solar flare | `2024-05-11T01:10:00-FLR-001` |
| 2024-05-11 01:36 | CME, 1263 km/s | `2024-05-11T01:36:00-CME-001` |
| 2024-05-11 02:10 | Protons above 100 MeV at GOES | `2024-05-11T02:10:00-SEP-001` |
| 2024-05-12 21:00 | Geomagnetic storm, Kp up to 6.33 | `2024-05-12T21:00:00-GST-001` |

**Also bundled (see docs/CREDITS.md):** RadLab dose rates (`src/data/radlab.json`) for the dosimeter comparison and data cards, and OSDR study titles (`src/data/osdr.json`) for the research cards. All real data in the game carries a "Real NASA data" badge; game values carry a "Game" badge. Open the NASA Data Lab from the NASA DATA button.

Four more proton records from SOHO and STEREO A, linked to the same flares, are in the JSON but are not used by the game.

Downloaded 2026-11-14 from `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/{FLR,SEP,CME,GST}?startDate=2024-05-08&endDate=2024-05-12`. No API key was needed.

**Files**

- `src/data/solar-event.json`: the trimmed records. Field values are unchanged.
- `src/data/solar-event.meta.json`: source, query, download date, event ids.
- `src/data/stormTimeline.ts`: turns the records into the two in-game storms.
- `src/data/apollo.ts`: the Apollo figures and the radiation meter calibration.
- `scripts/make-solar-event.mjs`: rebuilds the JSON from raw DONKI downloads.

**How the records drive the game**

- Each proton event measured at GOES becomes one storm. Its warning starts when the linked flare began, and the radiation starts when the protons were measured.
- About 20 real hours are compressed linearly into 160 game seconds, so the order and the relative gaps are kept. The second storm had only an hour of real warning, which would be 8 game seconds, so the game raises it to 15.
- Storm strength follows the flare class (X5.8 is the stronger one). Storm length follows the flare's length.

**What is not NASA data**

- Storm strength and length are stand-ins. DONKI proton records give an onset time and an energy channel, not a peak level or an end time.
- The power loss during a storm, equipment failures, the meteor shower, and every supply number are game design.
- A full radiation bar stands for the August 1972 estimate (130 rem to blood-forming organs). That is a calibration choice for the story, not a dosimetry model.

**Data quality.** DONKI states that its real-time information "should be considered only as prototyping quality and in research context". NOAA Space Weather Prediction Center is the United States Government official source for space weather forecasts.

Full credits, including tools and AI use, are in `docs/CREDITS.md`.

## Which NASA data we used and why

- **DONKI (space weather), two real events:** May 2024 (flares up to X5.8) and September 2017 (X9.3, X8.2, Kp 8). The storms in the game are built from these records, so the warning time, class and speed are real. Each run picks storms with a seed (`?seed=N`; `?classic` is the May 2024 pair). Why: the game's main risk is real, and kids see where it came from.
- **RadLab (ISS dose rates, Moon and Mars instrument readings):** shown next to the player's storm dose so a kid can compare. Why: it puts the game numbers in a real-world scale.
- **OSDR (astronaut health studies):** six study titles shown as research cards when a task matches. Why: each chore links to real science.
- **NASA Mars facts:** gravity (0.38 of Earth), radio delay (about 4 to 24 minutes one way), dust storms and solar panels (Opportunity, 2018). Source URLs are in `src/data/facts.json`.
- **Archived, not live:** all data is bundled. The forecast screen says "Archived NASA data". Nothing is shown as live.
- **Game, not real:** power, oxygen, protection numbers, the radio delay in seconds, and all effects are labelled "Game". The Mars delay is shrunk to 20 seconds each way.

## VR / WebXR

VR mode built with WebXR and tested in a WebXR emulator; testing on a physical headset is planned. It has not been tried on a real headset, so real frame rate, comfort and hand tracking are unverified.

**Try it.** Open the game over HTTPS in the Meta Quest Browser, or in desktop Chrome with the Immersive Web Emulator extension, and press **Enter VR** (the button only appears when the browser supports immersive VR). Start the game on the desktop first (the cinematic is skipped in VR).

**Controls.**
- Teleport: push the right thumbstick forward, aim the arc (green = valid floor, red = blocked or too far), release. Walls block teleporting.
- Snap turn: right thumbstick left or right (30 degrees).
- Trigger: use whatever the ray points at. Hold it on a machine to start a task, tap it on a door, a crew member or a console.
- Left Y or X button: open the menu (crew options, call crew to shelter, fast-forward, Data Lab, Mission Log, exit).
- Wrist panel on the left controller shows the meters, the timer, the dosimeter and the current prompt. Subtitles and speech bubbles are world-space.

**Tasks in VR.** The work panel pops out at chest height instead of moving the camera. Point and hold the trigger; sweep the controller to wipe dust. The right tool is picked for you. Twisting to unscrew and grip-grab are not built (a click unscrews).

**Known limits.** No VR on iPhone Safari. Hand tracking is not used. Not available in VR yet: building, the engineering console (upgrades), the storm quiz, the space weather console, the astronaut creator (none exists yet) and the full Data Lab (a text summary is shown). Smooth movement is not built; only teleport and snap turn exist. Post-processing (bloom) is switched off inside VR. Arabic panels use right-to-left drawing but were not checked in the emulator.

**Proof.** `npm run test:vr` runs the game in headless Chrome with the IWER emulator (a headset and two controllers) and checks: the button appears, the session starts, both eyes render, teleport works and is blocked by walls, snap turn, the wrist panel, a menu click with the controller ray, the solar-panel cleaning task, a storm warning, and leaving VR, with no console errors. Screenshots and a video clip are in `docs/vr-proof/` (`vr-demo.mp4`).
