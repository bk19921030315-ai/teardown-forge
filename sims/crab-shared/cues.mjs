// Writes the film's timeline (crab-film/timeline.json: the beats the review sheets and the score key on) and the
// score's cue list (crab-film/cues.json: footfalls, part seatings, the pump and paddle windows), all from kin.js, so
// the sound cannot drift from the motion.   node sims/crab-shared/cues.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATCH_U, DURATION, inStance, LEGS, makeIntegrals, SCRIPT, SEAT_DUR, SEAT_SPAN, SNAP_DUR, speedAt, toEvents, yawRateAt} from './kin.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'crab-film');
const EV = toEvents(SCRIPT);
const I = makeIntegrals(EV, -2, DURATION + 1);
const at = (k, v) => EV.filter((e) => e.k === k && (v === undefined || e.v === v)).map((e) => e.t);
const snap = at('snap')[0];

const timeline = {
  duration: DURATION,
  beats: SCRIPT.filter((e) => e.cap && e.t > 0).map((e) => e.t),
  snap: {start: snap, catch: +(snap + CATCH_U * SNAP_DUR).toFixed(3), end: +(snap + SNAP_DUR).toFixed(3)},
};
const footfalls = [];
const prev = LEGS.map(() => true);
for (let t = 0; t <= DURATION; t += 1 / 240) {
  const amp = Math.min(1, Math.abs(speedAt(EV, t)) / 0.1 + Math.abs(yawRateAt(EV, t)) * 0.9);
  LEGS.forEach((leg, i) => {
    const on = inStance(leg, I.phase(t), amp);
    if (on && !prev[i] && amp > 0.3) footfalls.push([+t.toFixed(3), leg.id]);
    prev[i] = on;
  });
}
const reasm = at('explode', 0)[0];
const seats = [];
for (let k = 0; k <= 1; k += 15 / 499) seats.push(+(reasm + 0.15 + k * SEAT_SPAN + SEAT_DUR).toFixed(3));
// one tick per scull stroke while the paddles run
const strokes = [];
for (let t = 0, last = 0; t <= DURATION; t += 1 / 240) {
  const n = Math.floor(I.scull(t) / Math.PI);
  if (n > last) strokes.push(+t.toFixed(3));
  last = n;
}
const cues = {
  footfalls,
  seats,
  seated: +(reasm + 0.15 + SEAT_SPAN + SEAT_DUR).toFixed(3),
  explode: at('explode', 1)[0],
  scan: at('scan')[0],
  lock: at('lock', 1)[0],
  claws: at('claws', 1)[0],
  mouth: [at('mouth', 1)[0], at('mouth', 0)[0]],
  shell: [at('shell', 1)[0], at('shell', 0)[0]],
  pump: [at('pump', 1)[0], at('pump', 0)[0]],
  paddle: [at('paddle', 1)[0], at('paddle', 0)[0]],
  strokes,
  views: SCRIPT.filter((e) => e.view && e.t > 0).map((e) => e.t),
};
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline));
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(cues));
console.log(JSON.stringify(timeline), `\n${footfalls.length} footfalls, ${seats.length} seat ticks, ${strokes.length} strokes`);
