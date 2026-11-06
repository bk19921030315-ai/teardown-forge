// Writes the film's timeline (mantis-film/timeline.json: the beats the review sheets and the score key on) and the
// score's cue list (mantis-film/cues.json: footfalls, part seatings, the core's spin window), all from kin.js, so the
// sound cannot drift from the motion.   node sims/mantis-shared/cues.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CATCH_U, DURATION, inStance, lastEv, LEGS, makeIntegrals, SCRIPT, SEAT_DUR, SEAT_SPAN, speedAt, STRIKE_DUR, toEvents, yawRateAt} from './kin.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mantis-film');
const EV = toEvents(SCRIPT);
const I = makeIntegrals(EV, -2, DURATION + 1);
const at = (k, v) => EV.filter((e) => e.k === k && (v === undefined || e.v === v)).map((e) => e.t);
const strike = at('strike')[0];

const timeline = {
  duration: DURATION,
  beats: SCRIPT.filter((e) => e.cap && e.t > 0).map((e) => e.t),
  strike: {start: strike, catch: +(strike + CATCH_U * STRIKE_DUR).toFixed(3), end: +(strike + STRIKE_DUR).toFixed(3)},
};

// footfalls: a foot entering stance while the legs are stepping
const footfalls = [];
const prev = LEGS.map(() => true);
for (let t = 0; t <= DURATION; t += 1 / 240) {
  const amp = Math.min(1, speedAt(EV, t) / 0.12 + Math.abs(yawRateAt(EV, t)) * 0.9);
  LEGS.forEach((leg, i) => {
    const on = inStance(leg, I.phase(t), amp);
    if (on && !prev[i] && amp > 0.3) footfalls.push([+t.toFixed(3), leg.id]);
    prev[i] = on;
  });
}
// part seatings during the reassembly, every 12th part (the ratchet), and when the last one lands
const reasm = at('explode', 0)[0];
const seats = [];
for (let k = 0; k <= 1; k += 12 / 355) seats.push(+(reasm + 0.15 + k * SEAT_SPAN + SEAT_DUR).toFixed(3));
const cues = {
  footfalls,
  seats,
  seated: +(reasm + 0.15 + SEAT_SPAN + SEAT_DUR).toFixed(3),
  explode: at('explode', 1)[0],
  scan: at('scan')[0],
  lock: at('lock', 1)[0],
  armed: at('armed', 1)[0],
  plates: at('plates', 1)[0],
  core: [at('core', 1)[0], at('core', 0)[0]],
  dock: at('plates', 0)[0],
  wings: [at('wings', 1)[0], at('wings', 0)[0]],
  views: SCRIPT.filter((e) => e.view && e.t > 0).map((e) => e.t),
};
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline));
fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify(cues));
console.log(JSON.stringify(timeline), `\n${footfalls.length} footfalls, ${seats.length} seat ticks`);
