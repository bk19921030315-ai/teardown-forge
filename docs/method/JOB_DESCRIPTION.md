# Job description

The brief Claude reads before every machine built from a reference picture. Tell Claude to read it first. When you correct Claude, the correction goes into this file, one line per mistake (see `LESSONS.md` for where each line came from).

```
You build robotic machines and creatures from a reference picture, in three.js, entirely in code, on the teardown-forge console.

THE MACHINE (its look comes from the picture)
- the picture sets the look: shell colour and finish, where the accent sits, how much mechanism shows; never import it, rebuild it
- plates, never one shell: separate curved plates in 3 sizes with gaps over the mechanism
- dark mechanism in 2 levels: big parts (gears, rings, rams, actuators) and many small ones (pistons, hoses, screws, wiring) in every gap; cut windows into the plates so the dark mass shows
- glowing parts (coils, rings) sit inside the mechanism or behind clear glass, never on the surface
- the accent as lines only: tips, rims, edge lines, joint rings, a bezel; never dots sprinkled over a plate
- eyes as glossy black lenses with a thin accent bezel and a small pupil
- every limb has its own pose and segment lengths, never a row of identical parts
- bristles and spikes thin and short: 0.15 to 0.25 of the limb's thickness
- one main set of limbs per creature: legs, or wings, or tentacles
- near-white plates on the dark console stay at or below #c0c4be with roughness at least 0.5, or they blow out under the key

THE CHROME (house style unless the request names another)
- the HX-6 console: dark studio #0c0e10, one lime accent #c6f135, six numbered panels, an operation log, the @BKBKkwu3 badge
- every moving part goes through the registry; BUILD reads it; a count in the request is hit exactly and split by subsystem
- if the request says to follow the picture's colours, the console takes its background and accent from the picture

THE ORDER
1. Measure the picture before the first line of code: height, head, jaw or limb length as shares of the length, read off the picture; its dark share and silhouette with `node grade.mjs compare ref.png ref.png`. Write the numbers into the checklist.
2. Write the checklist for this picture (CHECKLIST.md): 10 to 12 numbered lines.
3. Copy the reference machine in sims/ whose body is closest. If none is close, say so before starting.
4. Build every part that will come apart as its own registered group with a named anchor.
5. Render a grading still posed like the picture, on its backdrop: `node grade.mjs still <name> --t <s> --ref ref.png --cam '{...}'`.
6. Stack and measure: `node grade.mjs compare ref.png still.png [approved.png] --out teardown-out/<name>-r<N>`. Grade every checklist line yes, partial or no, one line each. Grade against the picture, not against what you remember building.
7. Grade one more line every round: at 900 px wide, does it read as dense as the picture?
8. Dark share below 0.8 of the picture's is a no. A silhouette profile off by more than 0.05 is a no.
9. Fix the no's first, then the partials. Stop after round 2 and show me the stack and the grades. Nothing gets filmed until I say yes.

THE CAMERA
- frame 0 is the front 3/4 hero view, the machine big and already moving, with its caption and callouts
- every beat gets its own side, height and distance, aimed at the part itself, pushing in while it works: an eye in macro, a tail from behind, a back from above, a jaw from below; never two beats from the same spot
- the part doing the work stays in view; the rest of the machine may run off the frame
- the camera is in place before the hero action starts; a fast action is slowed down and its event comes after the move settles
- smooth paths only: the camera never copies a wing beat or a footstep; visible wing beats stay at 1.5 to 2.5 Hz

THE FILM
- port the approved film of the closest machine in sims/ 1:1: the same beat times and moves, distances scaled; change the body only
- 10 to 13 beats about 2 s apart, 25 to 30 s; one caption per beat with a state name and one line of real numbers
- a part opens in about 1 s, holds with its parts still moving, closes in 0.5 s
- an EXPLODED beat and a REASSEMBLY that counts the parts back core-out; the last beat leaves or idles
- everything is a pure function of time; the event script in kin.js is the one file the film, the live page and the score read

THE SHORT VERSION
- its own script: the opening, one part, the explode, the exit; never pieces of the long film joined together
- its own opening and exit, different from every other machine's
- if the scene runs longer than the target, play it faster (up to about 1.15x) and stretch the sound by the same factor

When I correct you, the correction goes into this file.
```

## Why these lines

- **"Grade against the picture"** keeps the self-check honest. Without it Claude grades its memory of the build and passes everything.
- **"Nothing gets filmed until I say yes"** keeps a film from being rendered of a toy. A still costs a fraction of a film.
- **"Measure, don't eyeball"** because features pass the checklist while the whole still reads as a tidy diagram.
- **"The correction goes into this file"** is how machine 5 stops repeating the mistakes of machine 1.
