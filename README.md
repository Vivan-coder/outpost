# Outpost

**Play it: https://novessa-outpost.pages.dev** (phone, laptop or VR browser; no install, no login, free).

A first-person Moon base game for ages 7 to 12, built for NASA Space Apps 2026 (challenge: Junior Astronaut Mission Trainer). You keep a crew of three alive for five game days: plan power each morning, fix what breaks, and get everyone into the shelter when a real solar storm arrives. Every choice costs something: power spent on shielding is power not spent on science. A short Mars preview (`?mars=1`) teaches why radio messages to Earth are slow.

Runs in a phone or laptop browser. No server, no logins, no network calls while playing: all NASA data is bundled as static JSON.

## What is in the game

- **A day loop** (about 2 to 3 minutes per day, 5 days): Mission Control briefing (space weather forecast, a daily power budget, a decision card), a work shift in the 3D base, a storm, and an evening report with before/after bars and a real-world note.
- **Three core meters:** Power, Oxygen and Protection (food and crew health are small extras). Floating labels over the oxygen unit and the food locker show their levels too.
- **Hands-on jobs** in a close-up view: repair a power panel, clean the solar panels, swap the water filter, tend the greenhouse. Give the crew orders, or eat a meal at the canteen (it costs food and gives health).
- **Real NASA data, labelled:** two real solar storms (DONKI), the ISS dose range for comparison (RadLab), and astronaut research cards (OSDR). A short in-engine cutscene, "A storm is forming", shows the real flare class, time and CME speed before each storm.
- **Mars preview:** a dust storm and slow radio replies from Earth (the real delay is 4 to 24 minutes one way; the game shrinks it to seconds and says so).
- **Phone friendly:** the layout fits the visible area under Safari's bars, short landscape screens get a compact layout, and two small switches (menu and tasks) hide and show the buttons. **VR mode** is built with WebXR (see below).
- **English and Arabic** (right to left).

## Judges: quick demo

Open the game with `?judge=1` (or press "Quick demo (3 min)" on the title screen) for a ready base about 20 seconds before the first storm warning. Use "Reset demo" to restart it.

## How to play

A line at the top of the screen always says your next step (for example "Next job: Solar array: clean the dust. Follow the ★ marker."). The first time a storm cutscene ends, a short "What to do now" card explains the three steps.

| | Laptop | Phone |
|---|---|---|
| Move and look | WASD (Shift to run), click and move the mouse to look | Left thumb: walk. Right thumb: look |
| Do a job / use something | Hold **E** on the highlighted machine | Hold the round action button (its label changes: TALK, door, job) |
| Crew orders, menus | **Tab** (crew), **B** (build), Esc (pause) | CREW, BUILD and PAUSE buttons |
| Hide or show the buttons and the task list | not needed | The ☰ and ✔ switches on the left edge |

**On an iPhone**, Safari keeps its address bar and toolbar on screen. For the best view, tap Share, then **Add to Home Screen**, and open Outpost from the home screen icon: it then runs full screen. The game also fits the visible area when played inside Safari.

**The storm:** when the siren rings, get everyone into the shelter (the CALL CREW TO SHELTER button, or G, calls the crew). The shelter is the only place that stops the radiation. The storm chart and the dose meter (next to the real ISS range) show what the real data says.

## Run it

```
npm install
npm run dev      # local development
npm run build    # production build into dist/
node scripts/simcheck.ts   # balance check of the simulation, no browser needed
npm run test:vr            # WebXR test with a headset emulator (needs Chrome)
```

Add `?skip=150` to the URL to start the mission 150 seconds in (a testing aid). Deployment steps are in `DEPLOY.md`.

## Data

The solar storm in the game is built from real NASA records. The game never calls a NASA API while it runs; the records are bundled as static JSON.

| What | Where it comes from |
|---|---|
| Storm timeline (flares, CMEs, proton events, geomagnetic storms) | NASA CCMC DONKI, Space Weather Database Of Notifications, Knowledge, Information: https://ccmc.gsfc.nasa.gov/tools/DONKI/ |
| Radiation context (quiet-day dose rate, Apollo mission doses, August 1972 estimate) | Apollo Lunar Surface Journal, "Radiation Environment": https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html |
| Regolith shelter story | NASA Science, "How NASA Will Protect Astronauts From Space Radiation at the Moon" |

**First event: May 2024.** The solar storm from active region 13664 (this is the `?classic` pair).

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

**Second event: September 2017.** Flares X9.3 (2017-09-06 11:53 UTC) and X8.2 (2017-09-10 15:35 UTC), a CME of 2650 km/s, a GOES-13 proton event above 10 MeV (2017-09-10 16:45 UTC) and a geomagnetic storm of Kp 8, from the same DONKI database (`src/data/solar-event-2017.json`, downloaded 2026-11-14, no API key). Each run picks its two storms from these records with a seed (`?seed=N`); `?classic` always plays the May 2024 pair.

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
- The real hours are compressed linearly into game seconds, so the order and the relative gaps are kept. The warning is kept between 60 and 90 game seconds, so the player always has time to react. A mission is 5 days of 132 game seconds; the storms land on day 3 and day 5.
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

## Honest status (read this before judging)

- **Tested:** type-check, production build, the balance simulation (`node scripts/simcheck.ts`), the layout validator, the VR emulator test, and phone-sized layouts in desktop Chrome (portrait, landscape, a simulated Safari toolbar).
- **Not tested:** a real iPhone or Android phone, a real VR headset, real phone frame rates.
- **Arabic:** drafted with AI and not yet reviewed by a native speaker; some newer screens have not been checked in right-to-left layout.
- **Offline:** the game has a web app manifest and icons (so it can be added to the home screen), but no service worker yet, so it needs a connection to load the first time.
- **Not built:** the live-data function (it would break the "no network calls while playing" rule), a helper bot, an astronaut creator.
- **Partly verified fact:** the flare scale (each letter is ten times stronger) is marked "partly verified" in `src/data/facts.json`; the game does not state it on screen.

## Deploying

The live site is built by Cloudflare Pages from the `main` branch (build `npm run build`, output `dist`, `NODE_VERSION=22`). Every push to `main` redeploys. Details and alternatives are in `DEPLOY.md`. The 30-second trailer tooling lives on the `trailer` branch (`docs/trailer/README.md` there); trailer videos are never part of the deployed site.
