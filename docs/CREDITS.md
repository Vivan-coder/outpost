# Sources and credits

## NASA data

| Used for | Dataset / page | URL |
|---|---|---|
| Solar storm timeline: flares, CMEs, proton (SEP) events, geomagnetic storms | NASA CCMC DONKI (Space Weather Database Of Notifications, Knowledge, Information), endpoints FLR, CME, SEP, GST | https://ccmc.gsfc.nasa.gov/tools/DONKI/ |
| Quiet-day dose rate, Apollo mission doses, August 1972 dose estimate | Apollo Lunar Surface Journal, "Radiation Environment" (the 1972 estimate is cited there from NCRP Report No. 98, p. 48) | https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html |
| Sheltering under regolith | NASA Science, "How NASA Will Protect Astronauts From Space Radiation at the Moon" | (article title as given; link to be added) |

**Credit line for DONKI:** Space weather records from the NASA Community Coordinated Modeling Center (CCMC) DONKI database. DONKI states its real-time information should be considered only as prototyping quality and in research context. NOAA Space Weather Prediction Center is the United States Government official source for space weather forecasts.

**Second event:** September 2017 (flares X9.3 2017-09-06 and X8.2 2017-09-10, CME 2650 km/s, GOES13 SEP, Kp 8). Downloaded 2026-11-14 the same way, no API key. Bundled in `src/data/solar-event-2017.json` with `.meta.json`.

**Event used:** May 2024 solar storm, active region 13664. Downloaded 2026-11-14 with the query `startDate=2024-05-08&endDate=2024-05-12` from `https://ccmc.gsfc.nasa.gov/DONKI/WS/get/`. No API key used.

DONKI event ids bundled in `src/data/solar-event.json`:

- Flares: `2024-05-10T06:27:00-FLR-001` (X3.9), `2024-05-11T01:10:00-FLR-001` (X5.8)
- CMEs: `2024-05-10T07:12:00-CME-001`, `2024-05-11T01:36:00-CME-001`
- Proton events used by the game (GOES): `2024-05-10T13:35:00-SEP-001`, `2024-05-11T02:10:00-SEP-001`
- Proton events bundled but not used (SOHO, STEREO A): `2024-05-10T12:59:00-SEP-001`, `2024-05-10T13:02:00-SEP-001`, `2024-05-10T14:50:00-SEP-001`, `2024-05-11T04:07:00-SEP-001`
- Geomagnetic storms: `2024-05-10T15:00:00-GST-001` (Kp up to 9), `2024-05-12T21:00:00-GST-001` (Kp up to 6.33)

**Not NASA data:** equipment failures, the meteor shower, the power loss during a storm, storm strength and length (stand-ins derived from flare class and flare length), and all supply numbers. These are game design and are labelled as game events in the game.

No NASA images or videos are used.

### Added: RadLab, OSDR and the flare scale (downloaded 2026-11-14, bundled, no runtime calls)

| Used for | Dataset / page | URL |
|---|---|---|
| ISS, Moon-orbit (LRO CRaTER) and Mars-surface (Curiosity MSL-RAD) dose rates, 1 March 2023 averages | NASA OSDR RadLab Data API (`src/data/radlab.json`, `radlab.meta.json`) | https://visualization.osdr.nasa.gov/radlab/gui/data-api |
| Six real spaceflight studies (bone, muscle, plants): titles, accession numbers and links only | NASA Open Science Data Repository search API (`src/data/osdr.json`, `osdr.meta.json`) | https://osdr.nasa.gov/bio/repo/ |
| Flare class scale (each letter ten times stronger) | NASA SVS / GOES X-ray description, partly verified from search excerpts (`facts.json`: flareScale) | https://svs.gsfc.nasa.gov/10109 |

**Caveats.** The RadLab unit (microgray per hour) comes from the RadLab knowledge base as quoted in a search result: the RadLab docs and knowledge-base pages returned HTTP 500 when fetched directly. The OSDR studies are mostly animal and plant studies and the game claims no result from them. The dosimeter number in the HUD is a game value and is labelled "Game"; only the ISS comparison is real data.

**Checked but not used:** NASA APOD (the API returned placeholder titles and logo images) and Mars Trek (an interactive map with no downloadable site map verified).

### Verified facts (`src/data/facts.json`), all archived NASA pages read on the date shown

| Fact id | NASA page | Verified |
|---|---|---|
| `water90` | https://www.nasa.gov/podcasts/houston-we-have-a-podcast/recycling-water-and-air/ | 2026-11-14 |
| `bone1` | https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/ | 2026-11-14 |
| `exercise2h` | https://www.nasa.gov/missions/station/iss-research/counteracting-bone-and-muscle-loss-in-microgravity/ | 2026-11-14 |
| `moxie6` | https://science.nasa.gov/blog/moxie-sets-consecutive-personal-bests-and-mars-records-for-oxygen-production/ | 2026-11-14 |
| `dustPanels` | https://science.nasa.gov/solar-system/planets/mars/10-things-massive-dust-storm-on-mars/ | 2026-11-14 |
| `dustOpportunity` | https://science.nasa.gov/solar-system/planets/mars/10-things-massive-dust-storm-on-mars/ | 2026-11-14 |
| `commsDelay` | https://www.nasa.gov/centers-and-facilities/goddard/space-communications-7-things-you-need-to-know/ | 2026-11-14 |
| `gravityMars` | https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html | 2026-11-14 |
| `gravityMoon` | https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html | 2026-11-14 |
| `flareScale` | https://svs.gsfc.nasa.gov/10109 | 2026-11-14 |

The `flareScale` fact is only partly verified (read in search excerpts; the pages could not be fetched) and the game does not state it on screen.

### Added later (Nov 14-15 2026)

- **Storm cutscene:** the flare class and time, the CME speed and the source links come from the bundled DONKI records (no new data). The picture (Sun, bubble, Earth, Moon) is drawn in code and is not to scale; the cutscene says so.
- **Mars preview facts** (gravity 0.38 of Earth's, radio delay 4 to 24 minutes one way, dust storms and solar panels): sources and verification notes are in `src/data/facts.json`.
- **Home-screen icons** (`public/icon-192.png`, `public/icon-512.png`): original art drawn in code (`tools/trailer/icons.mjs`). No outside images.
- **Hosting:** Cloudflare Pages (free tier) builds the site from this repository. No tracking, no analytics, no accounts in the game.

### Trailer (branch `trailer`, not part of the deployed site)

- Recorded from the real game by a script (`?trailer=1`); the code and tools are in `src/trailer/` and `tools/trailer/` on the `trailer` branch.
- **Music:** the original trailer music is generated by code (`tools/trailer/music.py`, additive synthesis, no samples, no third-party music), written with AI assistance. A private demo copy of the trailer used a commercial song by the author's choice for one physical screening only; that file is not in the repository and **that version must not be published or attached to the submission**. The submission version uses the original generated music.
- End card QR code: generated locally with the `qrcode` npm package (MIT). Checks use `jsQR` (Apache-2.0), `pngjs` (MIT), ffmpeg and Playwright (Apache-2.0).
- AI use in the trailer: the pipeline (director, recorder, music generator, compose and check scripts) was written with Claude Code. No AI-generated images, video or voice.

## Third-party assets

All 3D models are built from primitives in code, and all sounds are synthesised at runtime with WebAudio. The only outside assets are two CC0 sets from Poly Haven (full details in `docs/ASSETS.md`):

| Asset | Author | URL | Licence |
|---|---|---|---|
| Moon 01 (regolith PBR textures) | Greg Zaal, Rico Cilliers, Jenelle van Heerden, Dario Barresi | https://polyhaven.com/a/moon_01 | CC0 |
| Kloppenheim 02 (Pure Sky) HDRI, used for lighting | Greg Zaal, Jarod Guest | https://polyhaven.com/a/kloppenheim_02_puresky | CC0 |

## Libraries and tools

| Name | Licence |
|---|---|
| Three.js | MIT |
| Vite | MIT |
| IWER (Immersive Web Emulation Runtime, by Meta), dev/test only | MIT |
| playwright-core, dev/test only | Apache-2.0 |
| TypeScript | Apache-2.0 |
| cloudflared (phone testing tunnel only, not part of the game) | Apache-2.0 |
| qrcode, jsQR, pngjs, ffmpeg (trailer tools only, `trailer` branch) | MIT / Apache-2.0 / MIT / LGPL-GPL tool, not shipped |

## AI use disclosure (required)

- Code: written with AI assistance (Claude Code, by Anthropic), directed, run and checked by the author. This covers everything in `src/`, `scripts/`, `tests/`, `tools/`, `index.html` and the config files.
- Text: the English and Arabic in-game text was drafted with Claude Code. The Arabic has not yet been reviewed by a native speaker.
- AI images or video: none. No AI-generated images, video or voice are used anywhere.
- Audio in the game: none from AI or from sound libraries; all sounds are synthesised in code. (The trailer music is original and generated by code; see "Trailer" above.)
- Pre-existing material: gamedev agent skills (github.com/gamedev-skills/awesome-gamedev-agent-skills, Apache-2.0) were installed as guidance; Three.js and Vite as above.
- Tick "Confirm All Work is Original" on the submission form.

## Pre-event preparation (disclose if asked)

- Before Nov 14: only planning docs (`docs/*.md`), asset and licence research, and installing helper agent skills. No game code written.
