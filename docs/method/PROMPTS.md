# Prompts

Every prompt in the order you use them. Replace the parts in [brackets].

## 1. The reference picture

For ChatGPT or any image model:

```
A robotic [hammerhead shark] as a precision machine, studio product shot on a near-white background with a soft floor shadow.
White glossy plates with clearcoat, lime green (#c6f135) only on tips, rims, edges and joint rings.
Dense dark mechanism showing through cut-outs and clear glass: gears, pistons, hoses, small screws.
Eyes as glossy black lenses with a thin lime ring. Fins and membranes milky and frosted with thin veins.
Front three-quarter view, the whole subject in frame.
```

Keep the near-white background even though the film runs on the dark console: the grading still is rendered on the picture's own backdrop, and the dark share only means something against a light one.

Pick a subject with many joints and a dense core: an animal, an engine, a drone, a camera, a watch. Give a creature one main set of limbs. Smooth bodies (snakes, shells, rays) read as toys however many rounds they get.

## 2. Start the build

```
Use teardown. Read docs/method/JOB_DESCRIPTION.md, then this picture. Build a robotic [tarantula] with [500] moving parts.
First measure the picture (node grade.mjs compare ref.png ref.png) and write its checklist, 10 to 12 lines, in docs/method/CHECKLIST.md's format. Show me the checklist before the first line of code.
```

## 3. The still loop

```
Build the [tarantula] from the closest machine in sims/ and loop:
1. Render a grading still posed like the picture: node grade.mjs still [name] --t [s] --ref ref.png --cam '{...}'.
2. Stack and measure: node grade.mjs compare ref.png still.png [approved.png] --out teardown-out/[name]-r[N].
3. Grade every checklist line yes, partial or no, one line each, against the picture.
4. Fix the no's, then the partials.
Stop after round 2 and show me the stack, the 900 px stack, the numbers and the grades. Wait for my notes before round 3.
```

Then grade it yourself, against the picture and not against your memory of it.

## 4. Measuring

```
Measure the picture and your still the same way with grade.mjs compare.
Density: the dark share in the subject's box. Yours has to reach 0.8 of the picture's. Raise it by breaking plates into separate pieces with gaps over the mechanism; adding dots does not count.
Proportions: height / length and the silhouette profile, plus head and jaw or limb length as shares of the length read off both images. Report both numbers side by side.
```

## 5. Round notes

When you send Claude back for another round, give numbers, not adjectives:

```
Round [3]. Fix these in order, measure each on your still and on the picture, report both:
1. [The biggest problem with its target: "jaws at 0.36 of the body length, yours are 0.52".]
2. [The next one: "the accent as lines only, zero isolated dots".]
3. ...
Grade each item yes / partial / no against the picture. Save the round's stack and stop.
```

## 6. The film

```
I approved the still. Take the approved film of the machine in sims/ whose body is closest and port it 1:1: the same beat times, the same moves, distances scaled to this one. Change the body only.
Map its beats onto this machine's parts: [the eye, the abdomen, a front leg, the fangs].
Give every beat its own camera: its own side and height, aimed at the part, in place before the action starts.
Keep the house film: 10 to 13 beats, 25 to 30 s, EXPLODED and a REASSEMBLY that counts the parts back, an exit.
Before you show me the film, put its frames at 1.5, 4.5 and 12.4 s next to the approved film's. If it looks smaller, flatter or blurrier, it doesn't ship.
```

## 7. The short version

```
Write a 10-second version as its own script: the opening, one part ([the fangs]), the explode, the exit. Do not cut pieces out of the long film.
Give it its own opening and exit, different from the other machines'.
If the scene needs more than 10 seconds, play it back faster, up to 1.15x, and stretch the sound by the same factor.
```

## 8. Render and sound

```
Render the film frame by frame: render(t) is a pure function of time. Capture at 1600x900 with a device pixel ratio of 1.2 for 1920x1080 at 60 fps (2.4 and a lanczos downscale when thin veins must stay sharp), H.264, yuv420p, faststart.
Score it in code on the same script: a bed for the whole film, a quiet click per button, a short accent on every part that moves. Master to -14 LUFS.
```

A screen recorder drops frames when the GPU works hard. A film rendered frame by frame cannot.
