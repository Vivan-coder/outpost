# Third-party assets

Every asset in the game is listed here, with its licence. Nothing is used without an entry. All are CC0 (public domain).

| Asset | Author | Source | Licence | Used for | Files |
|---|---|---|---|---|---|
| Moon 01 (PBR texture: albedo, normal GL, roughness, 1k JPG) | Greg Zaal, Rico Cilliers, Jenelle van Heerden (photography), Dario Barresi (processing) | https://polyhaven.com/a/moon_01 (files via https://api.polyhaven.com/files/moon_01) | CC0, per https://polyhaven.com/license (read 2026-11-14) | Moon ground (regolith) | `public/assets/regolith/moon_01_diff_1k.jpg` (329 KB), `moon_01_nor_gl_1k.jpg` (1.3 MB), `moon_01_rough_1k.jpg` (111 KB) |
| Kloppenheim 02 (Pure Sky), 1k HDR | Greg Zaal (original), Jarod Guest (sky edits) | https://polyhaven.com/a/kloppenheim_02_puresky | CC0, per https://polyhaven.com/license (read 2026-11-14) | Image-based lighting and reflections only (the sky you see is black space) | `public/assets/sky/kloppenheim_02_puresky_1k.hdr` (1.4 MB) |

Total downloaded assets: about 3.1 MB. They load lazily: the HDR after start-up, the textures with the terrain.

## Not used
All 3D models are still built in code from primitives (original). I did not find or download model packs (Kenney, Quaternius, Sketchfab) in this pass, so no models, rigs or plant meshes from outside were added, and there is no glTF pipeline (gltf-transform, KTX2, LODs) because there are no glTF files. No offline cache (PWA) exists in this project.

## Not licensed for use (rules)
CC-BY-NC, CC-BY-ND, GPL-only art, unclear "free download" licences, rips from commercial games and anything with a trademark or agency logo.
