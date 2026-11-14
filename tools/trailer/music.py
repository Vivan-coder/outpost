"""Original trailer music, generated in code (numpy only). No samples, no third-party music.
Run: python music.py <timeline.json> <out.wav>
Style: cinematic sci-fi, 96 BPM, D minor. Cut times in the timeline are on the half-beat grid, so hits land on beats.
Written with AI assistance (disclosed in docs/trailer/CREDITS.txt).
"""
import json
import sys
import wave

import numpy as np

SR = 48000
tl = json.load(open(sys.argv[1], encoding="utf-8"))
BPM = tl["bpm"]
BEAT = 60.0 / BPM
TOTAL = tl["totalSeconds"]
N = int(SR * TOTAL)
shots = {s["id"]: s for s in tl["shots"]}
rng = np.random.default_rng(20260515)  # fixed: same music every run

L = np.zeros(N)
R = np.zeros(N)
T = np.arange(N) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(t, a, d, s=0.0, r=0.0, hold=0.0):
    """Simple attack/decay envelope over time array t starting at 0."""
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) / max(d, 1e-6)))
    return e * (t >= 0)


def add(buf_l, buf_r, sig, start, pan=0.0, gain=1.0):
    """Mix a mono signal into the stereo buffers at 'start' seconds. pan -1..1."""
    i = int(start * SR)
    if i >= N:
        return
    j = min(N, i + len(sig))
    seg = sig[: j - i] * gain
    gl = np.sqrt((1 - pan) / 2) * 1.4142
    gr = np.sqrt((1 + pan) / 2) * 1.4142
    buf_l[i:j] += seg * gl * 0.7071
    buf_r[i:j] += seg * gr * 0.7071


def pad_note(freq, dur, gain=1.0, bright=1.0):
    """Soft pad: three slightly detuned voices with a few harmonics (additive, no filters needed)."""
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for det in (-0.004, 0.0, 0.005):
        f = freq * (1 + det)
        for h, a in ((1, 1.0), (2, 0.45 * bright), (3, 0.22 * bright), (4, 0.1 * bright), (5, 0.05 * bright)):
            out += a * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28))
    atk = min(1.2, dur * 0.4)
    rel = min(1.5, dur * 0.4)
    e = np.minimum(1, t / atk) * np.minimum(1, (dur - t) / rel)
    return out * e * gain / 6


def pluck(freq, dur=1.2, gain=1.0):
    t = np.arange(int(dur * SR)) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 6) + 0.25 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 9)
    return s * np.minimum(1, t / 0.004) * np.exp(-t * 3.2) * gain


def bell(freq, dur=3.0, gain=1.0):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for ratio, a in ((1, 1.0), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12)):
        s += a * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t * (1.2 + ratio * 0.5))
    return s * np.minimum(1, t / 0.003) * gain


def thump(dur=0.5, f0=70, f1=38, gain=1.0):
    t = np.arange(int(dur * SR)) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 18)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * gain


def lowpass_noise(dur, cutoff_hz, seed=0):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    spec = np.fft.rfft(r.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / SR)
    spec *= 1 / (1 + (freqs / cutoff_hz) ** 4)
    return np.fft.irfft(spec, n)


def reverb(x, seconds=2.6, decay=3.2, wet=0.35, seed=1):
    """Convolution reverb with a synthetic exponentially decaying noise impulse (FFT based)."""
    r = np.random.default_rng(seed)
    n_ir = int(seconds * SR)
    t = np.arange(n_ir) / SR
    ir = r.standard_normal(n_ir) * np.exp(-t * decay)
    ir[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    size = 1
    while size < len(x) + n_ir:
        size *= 2
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    y *= np.max(np.abs(x)) / (np.max(np.abs(y)) + 1e-9) * 0.9
    return x * (1 - wet) + y * wet


def echo(x, delay, fb=0.45, taps=4):
    y = x.copy()
    for k in range(1, taps + 1):
        d = int(delay * SR * k)
        if d < len(x):
            y[d:] += x[: len(x) - d] * (fb ** k)
    return y


# ---- Section times (from the timeline, so everything lines up with the cuts) ----
t_title_end = shots["title"]["end"]      # 2.5
t_storm_end = shots["storm"]["end"]      # 6.5625
t_ctrl_end = shots["control"]["end"]     # 11.5625
t_hands_end = shots["hands"]["end"]      # 17.5: the storm hits (impact)
t_hit_end = shots["hit"]["end"]          # 23.125
t_report_end = shots["report"]["end"]    # 26.25: end card
bar = 4 * BEAT  # 2.5 s

# D minor progression, one chord per bar: Dm  Bb  F  C  (then Gm, A, D at the end)
chords = {
    "Dm": [50, 57, 62, 65], "Bb": [46, 58, 62, 65], "F": [53, 57, 60, 65], "C": [48, 55, 60, 64],
    "Gm": [43, 55, 58, 62], "A": [45, 57, 61, 64], "D": [50, 57, 62, 66],
}
prog = ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A", "D", "D", "D", "D"]

pl = np.zeros(N); pr = np.zeros(N)   # pads
al = np.zeros(N); ar = np.zeros(N)   # arpeggio (gets echo)
dl = np.zeros(N); dr = np.zeros(N)   # drums / impact / riser (dry, little reverb)
bl = np.zeros(N); br = np.zeros(N)   # bells

# Drone: low D with slow swell from 0 s, held to the end (swells into the title)
t = T
drone = (np.sin(2 * np.pi * 36.71 * t) * 0.6 + np.sin(2 * np.pi * 73.42 * t) * 0.25 + np.sin(2 * np.pi * 36.9 * t) * 0.3)
drone *= np.minimum(1, t / 2.2) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 7.5) ** 2)
add(dl, dr, drone, 0, 0, 0.5)

# Pads: one chord per bar; calm and sparse at the report, big at the end
for i, name in enumerate(prog):
    start = i * bar
    if start >= TOTAL:
        break
    in_report = t_hit_end <= start < t_report_end
    g = 0.3 if in_report else (1.25 if start >= t_report_end else 0.75)
    for k, m in enumerate(chords[name]):
        pad = pad_note(mtof(m + (12 if k > 1 else 0)), bar + 1.0, g, 0.6 if in_report else 1.0)
        add(pl, pr, pad, start, -0.35 + 0.23 * k, 1.0)

# Arpeggio: 8th notes, shimmering; starts with the storm cutscene, thins out at the report, full at the end
arp_steps = {"Dm": [0, 2, 1, 3, 2, 1, 3, 2], "Bb": [0, 2, 1, 3, 2, 1, 3, 2], "F": [0, 2, 1, 3, 2, 1, 3, 2], "C": [0, 2, 1, 3, 2, 1, 3, 2],
             "Gm": [0, 2, 1, 3, 2, 1, 3, 2], "A": [0, 2, 1, 3, 2, 1, 3, 2], "D": [0, 2, 1, 3, 2, 1, 3, 2]}
for i, name in enumerate(prog):
    for s in range(8):
        tt = i * bar + s * BEAT / 2
        if tt >= TOTAL - 1.2:
            continue
        if tt < t_title_end:
            continue
        in_report = t_hit_end <= tt < t_report_end
        if in_report and s % 2 == 1:
            continue
        m = chords[name][arp_steps[name][s]] + 24
        gain = 0.2 if in_report else (0.62 if tt > t_report_end else 0.4)
        add(al, ar, pluck(mtof(m), 1.4, gain), tt, -0.6 + 1.2 * ((s * 3) % 8) / 7.0)

# Low pulse (heartbeat) while the storm is on screen, and from the storm cutscene as a soft tick
beat_t = t_title_end
while beat_t < TOTAL:
    in_hit = t_hands_end <= beat_t < t_hit_end
    in_pre = t_title_end <= beat_t < t_hands_end
    if in_hit:
        add(dl, dr, thump(0.45, 62, 36, 1.2), beat_t, 0, 1.0)
    elif in_pre and int(round((beat_t - t_title_end) / BEAT)) % 2 == 0:
        add(dl, dr, thump(0.35, 58, 40, 0.35), beat_t, 0, 1.0)
    beat_t += BEAT

# Riser into the storm: last 6 beats before the impact (noise + rising sine), then a hush of 1 beat
riser_len = 6 * BEAT
rs = t_hands_end - riser_len
tr = np.arange(int(riser_len * SR)) / SR
u = tr / riser_len
sweep = np.sin(2 * np.pi * np.cumsum(180 * (12 ** u)) / SR) * (u ** 2) * 0.35
noise = lowpass_noise(riser_len, 5000, 3) * (u ** 2.5) * 0.9
add(dl, dr, sweep + noise, rs, 0, 1.5)
# tiny reverse-style cut right before the hit so the impact is felt
# Impact: deep boom exactly at the storm (17.5 s) with a bright crack and a long tail
imp = thump(2.2, 95, 28, 1.6)
crack = lowpass_noise(1.0, 2500, 9) * np.exp(-np.arange(SR) / SR * 6) * 0.9
imp[: len(crack)] += crack
add(dl, dr, imp, t_hands_end, 0, 2.6)
# A second, lighter hit on the cut to the report (calm) and a bell
add(dl, dr, thump(1.2, 70, 40, 0.6), t_hit_end, 0, 0.8)
# Bells in the calm report moment
for k, (dt_, m) in enumerate([(0.0, 74), (BEAT * 1.5, 69), (BEAT * 3, 77), (BEAT * 4.5, 76)]):
    tt = t_hit_end + 0.1 + dt_
    if tt < t_report_end:
        add(bl, br, bell(mtof(m), 3.0, 0.3), tt, -0.3 + 0.2 * k, 1.0)
# Uplift at the end card (26.25): brighter bell chord and a sparkle run, with a clean tail
for k, m in enumerate([74, 78, 81, 86]):
    add(bl, br, bell(mtof(m), 3.4, 0.7), t_report_end + 0.02 * k, -0.4 + 0.27 * k, 1.0)
add(dl, dr, thump(1.6, 80, 34, 0.9), t_report_end, 0, 0.9)
# Swell into the title: a soft rising whoosh in the first 2.4 s, with a hit on the title (0.0) and the cut (2.5)
tw = np.arange(int(t_title_end * SR)) / SR
add(dl, dr, lowpass_noise(t_title_end, 3000, 5) * (tw / t_title_end) ** 2 * 0.5, 0, 0, 0.5)
add(dl, dr, thump(1.4, 75, 32, 0.8), t_title_end, 0, 0.7)

# Reverbs (stereo: different seeds), echo on the arpeggio at a dotted eighth
pl = reverb(pl, 3.0, 2.2, 0.35, 11); pr = reverb(pr, 3.0, 2.2, 0.35, 12)
al = reverb(echo(al, BEAT * 0.75), 2.2, 3.0, 0.3, 13); ar = reverb(echo(ar, BEAT * 0.75), 2.2, 3.0, 0.3, 14)
bl = reverb(bl, 3.0, 1.8, 0.5, 15); br = reverb(br, 3.0, 1.8, 0.5, 16)
dl = reverb(dl, 2.0, 2.5, 0.18, 17); dr = reverb(dr, 2.0, 2.5, 0.18, 18)

mixL = 0.85 * pl + 0.75 * al + 0.7 * bl + 0.9 * dl
mixR = 0.85 * pr + 0.75 * ar + 0.7 * br + 0.9 * dr

# Sidechain-like dip so the impact is clear: duck pads and arpeggio for 0.25 s right after the hit
duck = np.ones(N)
i0 = int(t_hands_end * SR)
duck[i0 - int(0.45 * SR): i0] = np.linspace(1, 0.25, int(0.45 * SR))      # hush before the hit
duck[i0: i0 + int(1.5 * SR)] = np.linspace(0.3, 1, int(1.5 * SR))
mixL = (mixL - 0.9 * dl) * duck + 0.9 * dl
mixR = (mixR - 0.9 * dr) * duck + 0.9 * dr

# Fade in over 0.4 s, fade out over the last 1.0 s, clean tail
fade = np.ones(N)
fade[: int(0.4 * SR)] = np.linspace(0, 1, int(0.4 * SR))
fade[-int(1.0 * SR):] = np.linspace(1, 0, int(1.0 * SR)) ** 1.5
mixL *= fade; mixR *= fade

# Normalise: peak -3 dBFS, no clipping (loudness is set in the compose step)
peak = max(np.max(np.abs(mixL)), np.max(np.abs(mixR)))
g = 10 ** (-3 / 20) / peak
out = np.stack([mixL * g, mixR * g], axis=1)
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"wrote {sys.argv[2]} ({TOTAL}s, {BPM} BPM, peak -3 dBFS)")
