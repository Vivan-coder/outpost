# Third-party licence notices

Outpost's own code is MIT (see LICENSE). The items below are included in, or used to build or test, the game. Where a licence asks for its notice to be kept, it is reproduced here.

## Shipped in the game (in the deployed files)

### three.js (MIT), the 3D engine bundled into the game

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Poly Haven textures and sky (CC0 1.0, public domain; no attribution required, credited anyway)

- Moon 01: Greg Zaal, Rico Cilliers, Jenelle van Heerden, Dario Barresi. https://polyhaven.com/a/moon_01
- Kloppenheim 02 (Pure Sky) HDRI: Greg Zaal, Jarod Guest. https://polyhaven.com/a/kloppenheim_02_puresky

### NASA data (bundled as JSON)

DONKI (NASA CCMC), RadLab and OSDR (NASA Open Science Data Repository) records and the NASA pages listed in docs/CREDITS.md. NASA content is used with credit and without implying NASA endorsement. No NASA logos or images are used.

### Fonts

None are shipped or downloaded; the game uses the system font stack.

## Build and test tools (not shipped in the deployed game)

| Tool | Licence | Used for |
|---|---|---|
| Vite | MIT | build |
| TypeScript | Apache-2.0 | type-checking |
| @types/three | MIT | type definitions |
| IWER (Immersive Web Emulation Runtime, Meta) | MIT | VR emulator tests |
| playwright-core | Apache-2.0 | browser tests and the trailer recorder |
| qrcode | MIT | the QR code on the trailer end card (trailer branch) |
| jsQR | Apache-2.0 | reading the QR code back in the trailer check (trailer branch) |
| pngjs | MIT | the same check (trailer branch) |
| ffmpeg | LGPL/GPL (separate program, not distributed) | trailer encoding (trailer branch) |
| cloudflared | Apache-2.0 | optional phone test tunnel, not part of the game |
