"""Score for the HIERODULA HX-6 console film: a dark D-minor bed at 84 bpm, soft steps under the walk, a click on every
operator event, a sweep of blips for the optics scan, a tick pair for the lock, a rattle as the spines flare, a riser
into the 64 ms strike and one impact on the catch, the gyro core's motor, a ratchet as 356 parts reseat and a chime
when the last one lands.

    python run_sfx.py sims/mantis-shared/score.py

Every time comes from mantis-film/timeline.json and mantis-film/cues.json, which sims/mantis-shared/cues.mjs writes
from kin.js.
"""

import json
import os

from sfx.score_kit import airy, bed, chords, hz, motor, rattle, thud
from sfx.synth import blip, chime, click, impact, pop, riser, whoosh

TIMELINE = "../mantis-film/timeline.json"
CUES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mantis-film", "cues.json")
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "mantis-score.wav")
TARGET_LUFS = -14.0
SEED = 6

CHORDS = chords("Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb1 F2 A2 D3/Bb0", "Gm9:G1 D2 F2 A2 Bb2/G0", "A7sus:A1 E2 G2 D3/A0")
MOTIF = [(0.5, hz("A4")), (1.5, hz("F4")), (2.5, hz("E4"))]
SCALE = [hz(n) for n in ("D4", "E4", "F4", "A4", "C5", "D5", "E5", "F5")]


def score(mix, tl):
    with open(CUES, encoding="utf8") as f:
        cu = json.load(f)
    dur = tl["duration"]
    strike = tl["strike"]

    left, right, low, drums = bed(dur, 84, CHORDS, MOTIF, motif_voice="blip", kicks=(0, 2.5), snares=(3,), hats=8, swing=0.0, keys_vel=0.55, keys_lp=2600)
    mix.put_stereo(0, left, right, 0.1)
    mix.put(0, low, 0.14)
    mix.put(0, drums, 0.04)

    # the walk: a soft step per footfall, panned by side
    for t, leg in cu["footfalls"]:
        mix.put(t, thud(88 if leg.endswith("3") else 104, 0.04, 0.22), 0.05, pan=-0.35 if leg[0] == "L" else 0.35)

    # every operator event clicks; every camera move breathes
    for t in tl["beats"]:
        mix.put(t, click(2600, 0.022), 0.06)
    for t in cu["views"]:
        mix.put(t - 0.1, whoosh(1.2, 500, 1600, 0.45), 0.025)

    # optics: a rising run of blips across the sweep, a tick pair on the lock
    for i, f in enumerate(SCALE):
        mix.put(cu["scan"] + 0.15 + i * 0.27, blip(f, 0.22, 0.08), 0.05, pan=-0.6 + i * 0.17)
    mix.put(cu["lock"], blip(hz("D5"), 0.18, 0.05), 0.06)
    mix.put(cu["lock"] + 0.12, blip(hz("A5"), 0.24, 0.07), 0.06)

    # the arms unlock: 42 spines flaring
    mix.put(cu["armed"] + 0.1, rattle(0.6, rate=26, f=4200, level=1.0), 0.03)

    # the strike: a riser that ends on the extension, one impact on the catch
    mix.put(strike["start"] - 1.6, riser(1.6 + (strike["catch"] - strike["start"]) * 0.6), 0.05)
    mix.put(strike["start"] + 0.2, whoosh(0.7, 300, 3800, 0.7), 0.06)
    mix.put(strike["catch"], impact(1.4), 0.2)
    mix.put(strike["catch"], pop(1800, 600, 0.2), 0.05)

    # the bay: eight plates, the core's motor up and down, the dock
    for i in range(8):
        mix.put(cu["plates"] + 0.08 * i, click(1500 + 120 * i, 0.03), 0.05, pan=-0.5 if i % 2 == 0 else 0.5)
    c0, c1 = cu["core"]
    mix.put(c0, motor(c1 - c0 + 0.6, f0=110, grit_hz=900, wobble=9), 0.025)
    mix.put(c0 + 0.2, airy(c1 - c0, 600, 2400, 0.5), 0.02)
    mix.put(cu["dock"] + 0.6, thud(70, 0.09, 0.5), 0.12)

    # the wing display: a slow swell of air as the fan opens
    w0, w1 = cu["wings"]
    mix.put(w0, airy(1.6, 300, 1400, 0.8), 0.06)
    mix.put(w1, airy(0.9, 1200, 400, 0.5), 0.03)

    # apart and back: a breath out, a ratchet of seatings, a chime when the last part lands
    mix.put(cu["explode"], whoosh(1.1, 1600, 300, 0.3), 0.07)
    mix.put(cu["explode"] + 0.1, thud(60, 0.12, 0.6), 0.08)
    for i, t in enumerate(cu["seats"]):
        mix.put(t, click(2200 + (i % 5) * 180, 0.015), 0.035, pan=-0.4 + 0.8 * ((i * 7) % 11) / 10)
    mix.put(cu["seated"], chime([hz("D5"), hz("A5"), hz("F5")], 1.6, 0.6), 0.05)
