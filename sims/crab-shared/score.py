"""Score for the CALLINECTES CB-9 console film: a dark E-minor bed at 88 bpm, a light tick under every footfall of the
sideways walk, a click on every operator event, two runs of blips (one per eyestalk, panned apart) for the sweep, a
tick pair for the lock, a rattle as the claws go up, a riser into the 60 ms crusher snap and one impact on the catch,
chatter while the mouthparts feed, the shell's hiss and the pump's motor, a swish per paddle stroke, a ratchet as
500 parts reseat and a chime when the last one lands.

    python run_sfx.py sims/crab-shared/score.py

Every time comes from crab-film/timeline.json and crab-film/cues.json, which sims/crab-shared/cues.mjs writes from
kin.js.
"""

import json
import os

from sfx.score_kit import airy, bed, chords, hz, motor, rattle, thud
from sfx.synth import blip, chime, click, impact, pop, riser, whoosh

TIMELINE = "../crab-film/timeline.json"
CUES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "crab-film", "cues.json")
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "crab-score.wav")
TARGET_LUFS = -14.0
SEED = 9

CHORDS = chords("Em9:E2 B2 D3 F#3 G3/E1", "Cmaj7:C2 G2 B2 E3/C1", "Am9:A1 E2 G2 B2 C3/A0", "B7sus:B1 F#2 A2 E3/B0")
MOTIF = [(0.5, hz("B4")), (1.5, hz("G4")), (2.5, hz("F#4"))]
SCALE = [hz(n) for n in ("E4", "F#4", "G4", "B4", "D5", "E5", "F#5", "G5")]


def score(mix, tl):
    with open(CUES, encoding="utf8") as f:
        cu = json.load(f)
    dur = tl["duration"]
    snap = tl["snap"]

    left, right, low, drums = bed(dur, 88, CHORDS, MOTIF, motif_voice="blip", kicks=(0, 2.5), snares=(3,), hats=8, swing=0.0, keys_vel=0.55, keys_lp=2600)
    mix.put_stereo(0, left, right, 0.1)
    mix.put(0, low, 0.14)
    mix.put(0, drums, 0.04)

    # the walk: a light, high tick per dactyl tip, panned by side
    for t, leg in cu["footfalls"]:
        mix.put(t, thud(140 if leg.endswith("3") else 165, 0.025, 0.16), 0.045, pan=-0.4 if leg[0] == "L" else 0.4)

    for t in tl["beats"]:
        mix.put(t, click(2600, 0.022), 0.06)
    for t in cu["views"]:
        mix.put(t - 0.1, whoosh(1.2, 500, 1600, 0.45), 0.025)

    # the eyestalks: two runs of blips, one per stalk, panned apart; a tick pair on the lock
    for i, f in enumerate(SCALE):
        mix.put(cu["scan"] + 0.15 + i * 0.25, blip(f, 0.2, 0.07), 0.045, pan=-0.6)
        mix.put(cu["scan"] + 0.27 + i * 0.25, blip(f * 1.5, 0.16, 0.06), 0.035, pan=0.6)
    mix.put(cu["lock"], blip(hz("E5"), 0.18, 0.05), 0.06)
    mix.put(cu["lock"] + 0.12, blip(hz("B5"), 0.24, 0.07), 0.06)

    # the claws go up: plates and teeth settling
    mix.put(cu["claws"] + 0.1, rattle(0.7, rate=20, f=3600, level=1.0), 0.03)

    # the snap: a riser that ends as the fingers start to close, one impact on the catch
    mix.put(snap["start"] - 1.4, riser(1.4 + (snap["catch"] - snap["start"]) * 0.7), 0.05)
    mix.put(snap["start"] + 0.1, whoosh(0.6, 300, 3200, 0.7), 0.05)
    mix.put(snap["catch"], impact(1.4), 0.2)
    mix.put(snap["catch"], pop(1400, 500, 0.2), 0.05)

    # mouthparts feeding: a soft chatter of clicks across the window
    m0, m1 = cu["mouth"]
    t = m0 + 0.2
    i = 0
    while t < m1 - 0.1:
        mix.put(t, click(3200 + (i % 4) * 200, 0.012), 0.02, pan=-0.2 + 0.4 * (i % 2))
        t += 0.14
        i += 1

    # the shell: two latches and a hiss up, the pump's motor, a thud as it seals
    s0, s1 = cu["shell"]
    mix.put(s0, click(1400, 0.03), 0.06, pan=-0.5)
    mix.put(s0 + 0.06, click(1500, 0.03), 0.06, pan=0.5)
    mix.put(s0 + 0.05, airy(1.0, 1800, 600, 0.7), 0.04)
    p0, p1 = cu["pump"]
    mix.put(p0, motor(p1 - p0 + 0.6, f0=96, grit_hz=800, wobble=7), 0.025)
    mix.put(p0 + 0.2, airy(p1 - p0, 500, 1500, 0.4), 0.02)
    mix.put(s1 + 0.8, thud(66, 0.1, 0.5), 0.12)

    # the paddles: a swish per stroke
    for i, t in enumerate(cu["strokes"]):
        mix.put(t, whoosh(0.18, 900, 2200, 0.5), 0.022, pan=-0.3 if i % 2 else 0.3)

    # apart and back
    mix.put(cu["explode"], whoosh(1.1, 1600, 300, 0.3), 0.07)
    mix.put(cu["explode"] + 0.1, thud(60, 0.12, 0.6), 0.08)
    for i, t in enumerate(cu["seats"]):
        mix.put(t, click(2200 + (i % 5) * 180, 0.015), 0.035, pan=-0.4 + 0.8 * ((i * 7) % 11) / 10)
    mix.put(cu["seated"], chime([hz("E5"), hz("B5"), hz("G5")], 1.6, 0.6), 0.05)
