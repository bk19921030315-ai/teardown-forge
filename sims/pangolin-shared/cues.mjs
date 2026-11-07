// Writes the film's timeline (pangolin-film/timeline.json: the beats the review sheets and the score key on) and the
// score's cue list (pangolin-film/cues.json: footfalls, dig strokes, the roll's turns, part seatings), all from kin.js,
// so the sound cannot drift from the motion.   node sims/pangolin-shared/cues.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DURATION, inStance, LEGS, makeIntegrals, ramp, SCRIPT, SEAT_DUR, SEAT_SPAN, speedAt, toEvents, TONGUE_DUR} from './kin.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'pangolin-film');
const EV = toEvents(SCRIPT);
const I = makeIntegrals(EV, -2, DURATION + 1);
const at = (k, v) => EV.filter((e) => e.k === k && (v === undefined || e.v === v)).map((e) => e.t);
const tongue = at('tongue')[0];

const timeline = {
  duration: DURATION,
  beats: SCRIPT.filter((e) => e.cap && e.t > 0).map((e) => e.t),
  tongue: {start: tongue, out: +(tongue + 0.35 * TONGUE_DUR).toFixed(3), catch: +(tongue + 0.5 * TONGUE_DUR).toFixed(3), end: +(tongue + TONGUE_DUR).toFixed(3)},
};
const footfalls = [];
const prev = LEGS.map(() => true);
for (let t = 0; t <= DURATION; t += 1 / 240) {
  const amp = Math.min(1, speedAt(EV, t) / 0.08);
  LEGS.forEach((leg, i) => {
    const on = inStance(leg, I.phase(t), amp);
    if (on && !prev[i] && amp > 0.3) footfalls.push([+t.toFixed(3), leg.id]);
    prev[i] = on;
  });
}
// dig strokes: each forefoot's scrape (the bottom of its ellipse) while digging
const strokes = [];
for (let t = 0, last = null; t <= DURATION; t += 1 / 240) {
  const k = Math.floor((t * 5.2) / Math.PI);
  if (last !== null && k !== last && ramp(EV, 'dig', t, 0.5) > 0.5) strokes.push(+t.toFixed(3));
  last = k;
}
// the roll: a tick every quarter turn while the ball rolls
const quarters = [];
for (let t = 0, last = 0; t <= DURATION; t += 1 / 240) {
  const q = Math.floor(I.rollAng(t) / (Math.PI / 2));
  if (q > last) quarters.push(+t.toFixed(3));
  last = q;
}
const reasm = at('explode', 0)[0];
const seats = [];
for (let k = 0; k <= 1; k += 18 / 599) seats.push(+(reasm + 0.15 + k * SEAT_SPAN + SEAT_DUR).toFixed(3));
const cues = {
  footfalls,
  strokes,
  quarters,
  seats,
  seated: +(reasm + 0.15 + SEAT_SPAN + SEAT_DUR).toFixed(3),
  scan: at('scan')[0],
  dig: [at('dig', 1)[0], at('dig', 0)[0]],
  flare: at('flare', 1),
  unflare: at('flare', 0),
  roll: at('roll', 1)[0],
  unroll: at('roll', 0)[0],
  rolling: [at('rollv').find((t, i, a) => i === 0), at('rollv')[1]],
  explode: at('explode', 1)[0],
  tail: at('tail', 1)[0],
  views: SCRIPT.filter((e) => e.view && e.t > 0).map((e) => e.t),
};
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline));
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(cues));
console.log(JSON.stringify(timeline), `\n${footfalls.length} footfalls, ${strokes.length} dig strokes, ${quarters.length} quarter turns, ${seats.length} seat ticks`);
