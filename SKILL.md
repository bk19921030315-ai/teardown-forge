---
name: teardown
description: Build an interactive 3D simulator of a real machine or mechanism (an engine, a landing gear, a walking linkage, a pump, a gearbox) as one offline HTML page people can take apart, with live panels driven by the same model that moves the parts, a button for every subsystem, cutaways, camera views and an auto tour that hands control to the visitor; then record it frame by frame to a 60 fps video with a synced procedural score. Use when someone asks how a machine works, wants a "visual explainer", a "simulator", a "cutaway", an "exploded view" or an "interactive 3D lesson", or wants a 3D object shown working rather than described.
---

# Teardown

One machine, one page. The visitor sees the thing run, presses a button, and the part doing the work opens up while the gauges around it read the real numbers. Left alone, the page tours itself with a cursor. The same code records a film of the tour, frame by frame, with a score built on the same timeline.

`SKILL_DIR` below is the folder this file lives in. Builds and renders go to `./teardown-out` of the folder you run from.

## First run

```
cd "$SKILL_DIR" && npm install && npx playwright install chromium
```

The pages need nothing else. The video needs `ffmpeg` on PATH and the score needs Python 3 (standard library only). Set `FFMPEG`, `PYTHON` or `CHROMIUM` to point at other binaries.

## House style: the default for every new machine

Unless the request names another look, build on the HX-6 console. Copy `sims/mantis-*` as the starting point and change the machine, not the chrome.

- **Look.** Dark studio `#0c0e10`, one lime accent `#c6f135`, ring floor under the machine, soft key, cool rim, gentle bloom (`mantis-shared/stage.js`).
- **Console** (`mantis-shared/console.js`, 1600 x 900). A lime title block top left with a glyph and the machine code; the title as "Name CODE /" with a kicker line above and a one-line spec below. Three numbered panels down each side (01-06): the machine's key action, BUILD (the live part count), a torque or load table, a tracking or state readout, DISPLAY chips (LABELS, EXPLODED, a trail, TURNTABLE), SUBSYSTEMS with status chips. An operation log along the bottom, the state's caption under the machine, leader-line callouts, the footer line.
- **Badge.** The white pill bottom right reads the X handle in `HANDLE` (`console.js`): `@BKBKkwu3`.
- **Part count.** Every rigid moving part goes through a registry (`reg()` in `mantis-shared/mantis.js`); BUILD reads its length. When the request names a count, hit it exactly by tuning repeated parts (segments, spines, ribs, blades), and say how it splits by subsystem.
- **Film.** 10-13 beats about 2 s apart, 25-30 s in all, one caption per beat: a state name and one line of real numbers. Open on the machine already working (frame 0 is the thumbnail, with caption and callouts), show the hero action (slowed down if it is fast), open the internals, an EXPLODED beat and a REASSEMBLY that counts the parts back, and end on the machine leaving or idling.
- **Live page.** The film as an auto tour; a click on a subsystem or chip hands over, buttons push events onto the same state function the film uses, 25 s of quiet hands back.
- **Deliver.** `sims/<name>-shared|film|live`, the film at `--size 1600x900 --dpr 1.2` (1920 x 1080, 60 fps) muxed with its score, and the live page from `build.mjs`.

## The reference machines

| | The machine | What drives it | Worth stealing |
|---|---|---|---|
| `mantis-*` | Hierodula HX-6, a robotic praying mantis (Hierodula membranacea × 14) with 356 registered moving parts on the dark console. | One event list: walk speed and yaw rate integrated into the path and the gait phase; every other subsystem eased from its events. Legs by two-link IK, a 64 ms strike shown at 1/20. | A part registry the BUILD counter reads, an exploded view that reseats core-out, a live page whose buttons push events onto the same state function the film uses. |
| `crab-*` | Callinectes CB-9, a robotic blue crab (Callinectes sapidus × 7) with 500 registered moving parts: crusher and cutter claws, six walking legs, two swimming paddles, a gull-wing shell over 16 gills and a pump. | The same event list; the walk integrated sideways along the body's z axis, alternating tripods, a 60 ms crusher snap shown at 1/20, the pump and the paddle scull integrated as phases. | Hitting an exact part count by tuning repeated parts (teeth, segments, lamellae), independent eyestalks, yaw-joint rams aimed in the horizontal plane. |
| `pangolin-*` | Manis MP-6, a robotic pangolin (Manis pentadactyla × 2.2) with 600 registered moving parts, 317 of them armour scales on a thirty-vertebra spine. | One event list; the spine is a planar chain blended between a walking arch and a rolled curve by one number, the body's height solved so the lowest scale touches the floor, the ball's rolling angle integrated and scaled to a whole turn. | Rolling a whole body into a ball and rolling it, scale rings that flare and wrap shut, a tongue aimed from the snout's FK, an ant trail as the target. |

Every machine added to `sims/` becomes a reference too: copy the closest one when you start a new machine. Each comes in 3 folders: `<name>-shared/` holds the machine, `<name>-film/` the recorded tour, `<name>-live/` the page you drive.

```
node "$SKILL_DIR/sims/build.mjs" mantis-live      # → teardown-out/dist/mantis-live.html, offline, ~800 KB
node "$SKILL_DIR/sims/build.mjs"                  # every machine in sims/
```

## How a machine is built

One folder per machine, split by job. HX-6 follows this exactly:

| File (`mantis-shared/`) | Job |
|---|---|
| `kin.js` | The math. Real dimensions in real units, the event `SCRIPT`, and every pose and readout as a function of the events and time (`stateAt`). No three.js in here. |
| `mantis.js` | The geometry, built from code: rounded boxes, lathed knobs, cones, tubes. Every moving part goes through `reg()`. `update(state)` poses it. |
| `stage.js` | Studio, lights, shadows, floor, bloom. `frame(state, cam)` draws one frame. |
| `console.js` | The overlay: fixed 1600 x 900 CSS layout of panels, charts, chips, callouts with leaders. `update(data)` redraws it from the frame's data. |
| `film.js` | The camera views and `filmFrame(t)`, a pure function of time shared with the live page's tour. |
| `live.js` | The same machine in real time: subsystem buttons, display chips, orbit, zoom, keys. With no input it plays the film as an auto tour; any click, drag, wheel or key hands control over, 25 s of quiet hands it back. |
| `cues.mjs`, `score.py` | The timeline and cue list written from `kin.js`, and the sound on them. |

For a machine outside `SKILL_DIR`, make a folder with a `main.js` and import the kit by name: `import {runSim} from 'teardown-kit/runtime.js'`. Build it with `node "$SKILL_DIR/sims/build.mjs" ./my-machine`.

## Rules that decide whether it works

1. **Start from a reference, never from imagination.** A photo, a cutaway drawing from a manual, a clip of the real thing. Build against it and compare frame by frame. Machines invented from a sentence come out generic every time; the same model rebuilds a real one closely when it has something to match.
2. **Real numbers, one source.** Get the real dimensions first (bore, stroke, tooth count, link lengths). Every gauge, chart and label reads from the same function that poses the parts, so nothing on screen can disagree with the motion. Check one by hand: in HX-6 one gait cycle covers stride ÷ duty = 0.24 ÷ 0.66 = 0.364 m, so at 0.24 m/s the legs cycle at 0.66 Hz, which is what the LOOP readout shows.
3. **One input drives everything.** Pose from one input (a crank angle, a stroke, the wind) or, like HX-6, one event list whose rates are integrated. Nothing is keyframed by hand, so the film, the live page and the score never drift.
4. **The part doing the work opens up.** Isolate it, cut it, x-ray it. A camera that goes inside is worth more than ten orbits.
5. **One accent.** The house style is the dark console; a light studio only when the request asks for one (then watch near-white parts on the pale backdrop: give them an ink outline or a darker ground). The accent marks the thing that is changing. On the dark console near-white armour blows out under the key: keep it at or below `#c0c4be` with roughness ≥ 0.5.
6. **Pick the camera for the mechanism.** A planar linkage seen face-on collapses into a lattice; a 3/4 view along the spine keeps every leg readable.
7. **Fix collisions with a number.** When a part pokes through another, scale or move it in the parameter block. Never hide it with the camera.

## Live page rules

- **Test on an integrated GPU.** A page that runs at 60 fps on a desktop card can drop to 15 fps on a laptop's built-in one. HX-6 carries quality tiers (`TIERS` in `mantis-shared/live.js`): no MSAA, smaller shadow maps, bloom off, lower pixel ratio, stepped down when frames run long. Find the expensive shader first: a displacement computed 5 times per vertex costs more than every tier together.
- **Warm the shaders.** `kit/warm.js` compiles every program in parallel before the first frame, so the page never freezes on first draw.
- **Keep the page under 1 MB.** Link crawlers (X, Slack) read the share card from the HTML and give up on a 15 MB page. Big models go out as files next to the page: `build.json` → `{"external": {"heavy.glb": "light.glb"}}`.

## render(t) contract

```js
import {runSim} from '../kit/runtime.js';

const DEFAULTS = {duration: 20, fps: 60, hud: {enabled: false}, director: {enabled: false}};

runSim(DEFAULTS, async ({cfg, canvas, capture}) => {
  // build the scene, precompute anything stateful
  return {render(t) { /* draw frame t from scratch */ return {}; }, resize() {}};
});
```

- `render(t)` is pure: no `Math.random` (use `rng(seed)` from `kit/util.js` at setup), no `Date`, no state carried between frames. Capture calls it at arbitrary times.
- Anything that moves by its own rules (agents, particles) is simulated once at load into typed arrays; `render` only reads them. A quantity integrated over time (HX-6's path and gait phase under a changing walk speed) is integrated in closed form or tabulated at load.
- Every beat goes into `<name>-film/timeline.json` in seconds. The score reads the same file.
- Frame 0 is the thumbnail. It must already show the machine.

## Commands

```
node "$SKILL_DIR/sims/mantis-shared/cues.mjs"
node "$SKILL_DIR/sims/build.mjs" mantis-film
node "$SKILL_DIR/sims/capture.mjs" mantis-film --size 1600x900 --dpr 1.2 --stills beats --cols 4 --out teardown-out/mantis-beats.png
node "$SKILL_DIR/sims/capture.mjs" mantis-film --size 1600x900 --dpr 1.2 --still 9.2 --out teardown-out/mantis-9.2.png
node "$SKILL_DIR/sims/capture.mjs" mantis-film --size 1600x900 --dpr 1.2 --out teardown-out/mantis-silent.mp4
python "$SKILL_DIR/run_sfx.py" "$SKILL_DIR/sims/mantis-shared/score.py"
ffmpeg -y -i teardown-out/mantis-silent.mp4 -i teardown-out/mantis-score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart teardown-out/mantis.mp4
node "$SKILL_DIR/wave.mjs" teardown-out/mantis.mp4 --timeline "$SKILL_DIR/sims/mantis-film/timeline.json"
```

On a software GPU (a cloud container) a 1080p frame takes over a second: render halves in parallel with `--from` / `--to` and join them with `ffmpeg -f concat -c copy`.

`--size` is the CSS layout and `--dpr` multiplies it: 1600 x 900 at 1.2 gives 1920 x 1080. Capture prints the GPU it got; a software renderer means the GPU flags in `paths.mjs` did not take.

## Review loop

You cannot watch the video; you can look at frames. Never report a machine as done without reading sheets of the current render.

1. `--stills beats`: one tile per timeline beat, 0.3 s after it, each labelled `t=`.
2. Read every tile against the checklist below.
3. Zoom in: `--stills every:0.2 --from A --to B` for a transition, `--still T` for one full frame.
4. Fix, rebuild, go back to 1. Stop when a full pass finds nothing.
5. Final: `node "$SKILL_DIR/sheet.mjs" --video <final.mp4> --timeline <timeline.json>` and read that too: it shows what the encoder wrote.

Checklist:

- **The mechanism.** Every part that should touch touches; nothing passes through anything; the numbers on the panels match the pose.
- **Composition.** One focal point per frame. Nothing important within 60 px of an edge. Labels never cover the part they name.
- **Type.** Nothing clipped. The key readout reads at phone width.
- **3D.** Bloom eats detail: keep emissive layers under 1.0. Near-white surfaces blow out. Glossy metal under a low light streaks: roughness ≥ 0.45 and envMapIntensity ≈ 0.5 on big surfaces.
- **Timing.** Each state holds long enough to read: 1 s for a short phrase plus 0.25 s per word beyond three.

## three.js traps already hit

- `smoothstep(a, b, x)` with `a > b` returns 0 on Windows (ANGLE/D3D). Write `1.0 - smoothstep(b, a, x)`.
- A `ShadowMaterial` or a decal a fraction of a millimetre above the floor loses the depth test inside a post-processing render target. Give it `polygonOffset`.
- A quad laid into the ground with a mirrored mapping gets culled as a back face. Use `DoubleSide`.
- One NaN pixel blacks out the whole frame through bloom. Clamp every `pow()` base in a shader.
- GTAO on a clipped (cutaway) model needs the same clipping planes on `gtao.normalMaterial`, or the cut half returns as a pale ghost.

## Sound

`sfx/` synthesises every sound in pure Python (48 kHz, reproducible) and reads the film's timeline, so sound cannot drift out of sync. `python "$SKILL_DIR/run_sfx.py" --list` shows the generators. `sample()` adds the recorded CC0 sounds in `sfx/samples/`. `sfx/score_kit.py` has the beds and accents the scores use: a chord bed, a soft thud per footfall, a motor, air under a move.

- Every time comes from the timeline, never a typed number.
- Mastering is automatic: −14 LUFS, true peak ≤ −2 dBFS.
- Accent, never narrate: continuous motion stays silent. One key for every tonal sound.

## Taste, with numbers

- Easing: entrances `cubic-bezier(0.16, 1, 0.3, 1)`, exits `cubic-bezier(0.6, 0, 0.9, 0.35)` at half the entrance's length, state to state `cubic-bezier(0.65, 0, 0.35, 1)`. Linear only for continuous motion.
- The machine fills 60-70% of its viewport. Labels never under 34 px on a 1080 canvas.
- One accent, and it means something: the part that is working right now.
- Nothing dead-still: one element always alive.

## License

MIT, see `LICENSE`.
