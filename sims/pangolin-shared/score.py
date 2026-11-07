"""Score for the MANIS MP-6 console film: a dark A-minor bed at 80 bpm, a soft tick under every footfall, a click on
every operator event, a run of sniffing blips, a riser into the 160 ms tongue and a hit as it takes the ants, a scrape
per dig stroke, a rattle as 317 scales flare, a ratchet as the spine curls shut and a thud as the ball settles, a low
roll with a knock every quarter turn, the ratchet of 600 parts reseating and a chime when the last one lands.

    python run_sfx.py sims/pangolin-shared/score.py

Every time comes from pangolin-film/timeline.json and pangolin-film/cues.json, which sims/pangolin-shared/cues.mjs
writes from kin.js.
"""

import json
import os

from sfx.score_kit import airy, bed, chords, hz, rattle, rumble, thud
from sfx.synth import blip, chime, click, impact, pop, riser, whoosh

TIMELINE = "../pangolin-film/timeline.json"
CUES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pangolin-film", "cues.json")
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "pangolin-score.wav")
TARGET_LUFS = -14.0
SEED = 13

CHORDS = chords("Am9:A1 E2 G2 B2 C3/A0", "Fmaj7:F1 C2 E2 A2/F0", "Dm9:D2 A2 C3 E3 F3/D1", "E7sus:E1 B1 D2 A2/E0")
MOTIF = [(0.5, hz("E5")), (1.5, hz("C5")), (2.5, hz("B4"))]
SCALE = [hz(n) for n in ("A4", "B4", "C5", "E5", "G5", "A5")]


def score(mix, tl):
    with open(CUES, encoding="utf8") as f:
        cu = json.load(f)
    dur = tl["duration"]
    tg = tl["tongue"]

    left, right, low, drums = bed(dur, 80, CHORDS, MOTIF, motif_voice="blip", kicks=(0, 2.5), snares=(3,), hats=8, swing=0.0, keys_vel=0.55, keys_lp=2500)
    mix.put_stereo(0, left, right, 0.1)
    mix.put(0, low, 0.14)
    mix.put(0, drums, 0.04)

    for t, leg in cu["footfalls"]:
        mix.put(t, thud(120 if leg.endswith("H") else 140, 0.03, 0.18), 0.045, pan=-0.35 if leg[0] == "L" else 0.35)
    for t in tl["beats"]:
        mix.put(t, click(2600, 0.022), 0.06)
    for t in cu["views"]:
        mix.put(t - 0.1, whoosh(1.2, 500, 1600, 0.45), 0.025)

    # sniffing, then the tongue: a riser into the throw, a hit as it takes the trail
    for i, f in enumerate(SCALE):
        mix.put(cu["scan"] + 0.12 + i * 0.22, blip(f, 0.16, 0.06), 0.04, pan=-0.4 + 0.16 * i)
    mix.put(tg["start"] - 1.0, riser(1.0 + (tg["out"] - tg["start"])), 0.045)
    mix.put(tg["start"] + 0.05, whoosh(0.5, 400, 3600, 0.7), 0.05)
    mix.put(tg["catch"], impact(1.2), 0.16)
    mix.put(tg["catch"], pop(1600, 700, 0.2), 0.05)

    # the dig: a dry scrape per stroke
    for t in cu["strokes"]:
        mix.put(t, airy(0.16, 2400, 900, 0.9), 0.05, pan=0.2)

    # scales: a rattle each time they rise, a softer one as they settle
    for t in cu["flare"]:
        mix.put(t, rattle(0.8, rate=34, f=3800, level=1.0), 0.035)
    for t in cu["unflare"]:
        mix.put(t, rattle(0.5, rate=22, f=2600, level=0.7), 0.02)

    # the roll: a ratchet as the spine curls, a thud as the ball settles; a low roll with a knock each quarter turn
    for i in range(12):
        mix.put(cu["roll"] + 0.08 * i, click(1300 + 60 * i, 0.02), 0.035)
    mix.put(cu["roll"] + 1.3, thud(62, 0.12, 0.6), 0.12)
    r0, r1 = cu["rolling"]
    mix.put(r0, rumble(r1 - r0 + 0.8, lambda t: 46 + 14 * min(1, t / 0.8), 1.0), 0.05)
    for t in cu["quarters"]:
        mix.put(t, thud(80, 0.05, 0.25), 0.07)
    for i in range(10):
        mix.put(cu["unroll"] + 0.1 * i, click(2000 - 70 * i, 0.02), 0.03)

    # apart and back
    mix.put(cu["explode"], whoosh(1.1, 1600, 300, 0.3), 0.07)
    mix.put(cu["explode"] + 0.1, thud(60, 0.12, 0.6), 0.08)
    for i, t in enumerate(cu["seats"]):
        mix.put(t, click(2200 + (i % 5) * 180, 0.015), 0.035, pan=-0.4 + 0.8 * ((i * 7) % 11) / 10)
    mix.put(cu["seated"], chime([hz("A5"), hz("E5"), hz("C6")], 1.6, 0.6), 0.05)

    # the tail's grip
    mix.put(cu["tail"], rattle(0.5, rate=16, f=2200, level=0.8), 0.025)
