# Outpost

A first-person Moon base game for ages 10 to 14, built for NASA Space Apps 2026 (challenge: Junior Astronaut Mission Trainer). You keep a crew of four alive for five minutes of game time: fix what breaks, build modules, hand out chores, and get everyone into shelter when a solar storm arrives.

Runs in a phone or laptop browser. No server, no logins, no network calls while playing.

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
