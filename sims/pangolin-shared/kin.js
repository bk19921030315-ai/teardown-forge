// MANIS MP-6, the math. A robotic pangolin, about 2.2x a Chinese pangolin (Manis pentadactyla): a spine of thirty
// segments from snout to tail tip under rings of overlapping armour scales, a long sticky tongue, three big digging
// claws on each forefoot, a prehensile tail, and the trick: it rolls up into a ball and rolls away.
//
// No three.js in here. The spine is a planar chain: from the body's middle a forward chain (thorax, neck, head) and a
// backward chain (lumbar, tail). Every pose is a blend of the walking curve and the rolled curve by one number (roll);
// the body's height is solved so the lowest scale just touches the floor; rolling turns the whole ball about its
// centre by an integrated angle. Units: metres, seconds, degrees where named *Deg. Body frame: +x forward, +y up,
// +z right, origin at the middle of the back.

export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

// ------------------------------------------------------------ the spine
// each segment: length, cross-section half-width and half-height, walking and rolled angle (deg, relative to the
// previous segment; on the forward chain negative curls down, on the backward chain positive curls down)
const seg = (len, w, h, walk, roll) => ({len, w, h, walk, roll});
export const SPINE = {
  F: [
    seg(0.07, 0.15, 0.125, -1, -17),
    seg(0.07, 0.148, 0.123, -1, -17),
    seg(0.07, 0.144, 0.12, -1.5, -17),
    seg(0.07, 0.138, 0.115, -2, -18),
    seg(0.07, 0.128, 0.108, -2.5, -18),
    seg(0.066, 0.115, 0.098, -3, -20),
    seg(0.06, 0.095, 0.082, -9, -28), // neck
    seg(0.055, 0.08, 0.07, -8, -30), // neck
  ],
  B: [
    seg(0.07, 0.15, 0.125, 2, 19),
    seg(0.07, 0.148, 0.122, 2, 19),
    seg(0.07, 0.144, 0.118, 2.5, 19),
    seg(0.07, 0.138, 0.112, 3, 20),
    seg(0.068, 0.128, 0.105, 3.5, 21),
    seg(0.064, 0.116, 0.095, 4, 22),
    // the tail: thick at the root, a tapering blade, held off the floor and lifting at the tip
    ...Array.from({length: 16}, (_, i) => {
      const k = i / 15;
      return seg(0.05 - 0.016 * k, 0.1 - 0.075 * k, 0.07 - 0.052 * k, [5, 4, 3, 1, 0, -1, -2, -3, -3, -3, -3, -2, -2, -2, -1, -1][i], i < 6 ? 10 : 6);
    }),
  ],
};
export const HEAD = {len: 0.17, walk: -16, roll: -38};
export const NECK_I = 6; // first neck segment on F
export const TAIL_I = 6; // first tail segment on B
export const WALK_H = 0.36; // the middle of the back above the floor when walking

/** Planar FK of both chains: joint points and absolute angles for a roll amount k and per-segment extra curls. */
export function spineFK(k, extra = {}) {
  const out = {F: [], B: [], head: null};
  let x = 0;
  let y = 0;
  let a = 0;
  SPINE.F.forEach((s, i) => {
    a += (lerp(s.walk, s.roll, k) + (extra.F?.[i] ?? 0)) * D2R;
    out.F.push({x, y, a, s});
    x += s.len * Math.cos(a);
    y += s.len * Math.sin(a);
  });
  a += (lerp(HEAD.walk, HEAD.roll, k) + (extra.head ?? 0)) * D2R;
  out.head = {x, y, a};
  x = 0;
  y = 0;
  a = Math.PI;
  SPINE.B.forEach((s, i) => {
    a += (lerp(s.walk, s.roll, k) + (extra.B?.[i] ?? 0)) * D2R;
    out.B.push({x, y, a, s});
    x += s.len * Math.cos(a);
    y += s.len * Math.sin(a);
  });
  out.tailTip = {x, y};
  // the lowest point of the armour (each segment's mid point less its half-height across its normal)
  let low = Infinity;
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const p of [...out.F, ...out.B]) {
    const mx = p.x + 0.5 * p.s.len * Math.cos(p.a);
    const my = p.y + 0.5 * p.s.len * Math.sin(p.a);
    low = Math.min(low, my - p.s.h * Math.abs(Math.cos(p.a)) - p.s.w * 0.15 * Math.abs(Math.sin(p.a)));
    cx += mx;
    cy += my;
    n++;
  }
  const hx = out.head.x + 0.5 * HEAD.len * Math.cos(out.head.a);
  const hy = out.head.y + 0.5 * HEAD.len * Math.sin(out.head.a);
  low = Math.min(low, hy - 0.05);
  out.low = low;
  out.centre = [cx / n, cy / n];
  return out;
}

// ------------------------------------------------------------ legs
export const LEGS = [
  {id: 'LF', side: -1, front: true, phase: 0.25, at: 4, z: 0.11},
  {id: 'RF', side: 1, front: true, phase: 0.75, at: 4, z: 0.11},
  {id: 'LH', side: -1, front: false, phase: 0.0, at: 4, z: 0.12},
  {id: 'RH', side: 1, front: false, phase: 0.5, at: 4, z: 0.12},
];
export const LIMB = {
  front: {upper: 0.13, lower: 0.13, foot: 0.065, metaDeg: -78},
  hind: {upper: 0.15, lower: 0.15, foot: 0.09, metaDeg: 0},
  hipDrop: 0.075,
};
// tucked against the belly when rolled, relative to the segment the leg hangs from (deg)
export const TUCK = {front: {a1: -165, a2: 150, a3: 80}, hind: {a1: -20, a2: -150, a3: -60}};
export const GAIT = {stride: 0.2, duty: 0.7, lift: 0.045};
export const cyclesPerMetre = GAIT.duty / GAIT.stride;
export const WALK_V = 0.2;
export const PAW_H = 0.02;

/** Where a leg's hip or shoulder is, in the level body frame, for an FK result. */
export function legRoot(leg, fk) {
  const p = (leg.front ? fk.F : fk.B)[leg.at];
  // the joint hangs below the spine at the segment's start, toward the belly
  const nx = Math.sin(p.a) * (leg.front ? 1 : -1);
  const ny = -Math.cos(p.a) * (leg.front ? 1 : -1);
  return [p.x + nx * LIMB.hipDrop, p.y + ny * LIMB.hipDrop, p.a];
}

/** Foot target in the level frame: x relative to the body origin, y above the floor. */
export function footTarget(leg, ph, amp, rootX, digK, t) {
  const u = (((ph + leg.phase) % 1) + 1) % 1;
  const {stride, duty, lift} = GAIT;
  let dx;
  let dy = 0;
  if (u < duty) dx = stride * (0.5 - u / duty);
  else {
    const v = (u - duty) / (1 - duty);
    dx = stride * (-0.5 + smoother(v));
    dy = lift * Math.sin(Math.PI * v);
  }
  let x = rootX + (leg.front ? 0.02 : -0.01) + dx * amp;
  let y = PAW_H + dy * amp;
  if (leg.front && digK > 0) {
    // digging: each forefoot scrapes an ellipse ahead and under the chin, the two a half stroke apart
    const w = t * 5.2 + (leg.side > 0 ? Math.PI : 0);
    x = lerp(x, rootX + 0.12 + 0.07 * Math.cos(w), digK);
    y = lerp(y, PAW_H + 0.045 * Math.max(0, Math.sin(w)), digK);
  }
  return [x, y];
}
export const inStance = (leg, ph, amp) => amp < 0.05 || (((ph + leg.phase) % 1) + 1) % 1 < GAIT.duty;

/** Two-link IK in the sagittal plane, the last segment laid at metaA; bend +1 knee forward, -1 elbow back. */
export function legIK(root, foot, L1, L2, Lm, metaA, bend) {
  const ax = foot[0] - Lm * Math.cos(metaA);
  const ay = foot[1] - Lm * Math.sin(metaA);
  const dx = ax - root[0];
  const dy = ay - root[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const phi = Math.atan2(dy, dx);
  const a1 = phi + bend * Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const kx = root[0] + L1 * Math.cos(a1);
  const ky = root[1] + L1 * Math.sin(a1);
  return {a1, a2: Math.atan2(ay - ky, ax - kx), a3: metaA};
}

// ------------------------------------------------------------ tongue and ants
export const TONGUE = {segs: 30, segLen: 0.016};
export const TONGUE_MS = 160;
export const SLOWMO = 8;
export const TONGUE_DUR = (TONGUE_MS / 1000) * SLOWMO; // 1.28 s
/** Tongue extension 0..1 over u in 0..1 of the flick: out fast, a sweep across the trail, back in. */
export const tongueExt = (u) => (u < 0 || u >= 1 ? 0 : u < 0.35 ? easeOut(u / 0.35) : u < 0.65 ? 1 : 1 - smoother((u - 0.65) / 0.35));
export const ANTS = 14;
/** An ant on the floor in the body frame: a trail crossing in front of the snout, marching right to left. */
export const antAt = (i, t, x0) => {
  const z = 0.32 - ((t * 0.07 + i * 0.05) % 0.7);
  return [x0 + 0.03 * Math.sin(z * 9 + i), 0.004, z];
};

// ------------------------------------------------------------ the film's script
// keys: walk (m/s), scan (start), lock (0/1), tongue (start), dig (0/1), flare (0/1), roll (0/1), rollv (m/s),
// tail (0/1), explode (0/1), labels, trail, turntable
export const SCRIPT = [
  {t: -2.0, walk: WALK_V, labels: 1},
  {t: 0.0, cap: ['FORAGING', '4-LEG WALK · ARCHED SPINE'], view: 'hero'},
  {t: 2.6, cap: ['SCENT LOCK', 'NOSE DOWN · ANT TRAIL AHEAD'], view: 'head', walk: 0, scan: 1, lock: 1},
  {t: 4.6, cap: ['TONGUE', `0.48 m OUT · ${TONGUE_MS} ms REAL · SHOWN AT 1/${SLOWMO}`], view: 'tongue'},
  {t: 5.35, tongue: 1},
  {t: 6.8, cap: ['CLAW DIG', '6 BIG FORE CLAWS · ALTERNATE STROKES'], view: 'claws', lock: 0, dig: 1},
  {t: 8.8, cap: ['SCALES FLARE', 'EVERY SCALE RAISED · THREAT'], view: 'side', dig: 0, flare: 1},
  {t: 10.8, cap: ['ROLL UP', 'SPINE CURLS SHUT · HEAD TUCKED'], view: 'roll', flare: 0, roll: 1},
  {t: 12.8, cap: ['ROLLING', 'ONE TURN · Ø 0.6 m · 0.75 m/s'], view: 'rolling', rollv: 0.75},
  {t: 15.2, cap: ['SPINE DRIVE', 'ARMOUR LIFTS · 32 RAMS BELOW'], view: 'core', rollv: 0, flare: 1},
  {t: 17.0, cap: ['UNROLL', 'OPENS OUT · LEGS DOWN'], view: 'hero2', flare: 0, roll: 0},
  {t: 19.0, cap: ['EXPLODED', '600 MOVING PARTS · 1 SPINE'], view: 'wide', explode: 1},
  {t: 21.0, cap: ['REASSEMBLY', 'SEATED CORE OUT · LAST PART @ 2.0 s'], view: 'wide', explode: 0},
  {t: 23.6, cap: ['TAIL GRIP', 'PREHENSILE TAIL · 16 LINKS CURL'], view: 'tail', tail: 1, trail: 1},
  {t: 25.4, cap: ['WANDERING OFF', 'WALK 0.26 m/s · FIELD MODE'], view: 'far', tail: 0, walk: 0.26},
];
export const DURATION = 28.5;
const STATE_KEYS = ['walk', 'scan', 'lock', 'tongue', 'dig', 'flare', 'roll', 'rollv', 'tail', 'explode', 'labels', 'trail', 'turntable'];
export const toEvents = (script) => {
  const ev = [];
  for (const e of script) for (const k of STATE_KEYS) if (e[k] !== undefined) ev.push({t: e.t, k, v: e[k]});
  return ev.sort((a, b) => a.t - b.t);
};

const INIT = {walk: 0, lock: 0, dig: 0, flare: 0, roll: 0, rollv: 0, tail: 0, explode: 0, labels: 0, trail: 0, turntable: 0};
export const ramp = (EV, k, t, dur = 0.7) => {
  let v = INIT[k] ?? 0;
  for (const e of EV) {
    if (e.k !== k || e.t > t) continue;
    v += (e.v - v) * ss(e.t, e.t + dur, t);
  }
  return v;
};
export const lastEv = (EV, k, t) => {
  let out = null;
  for (const e of EV) if (e.k === k && e.t <= t) out = e;
  return out;
};

// ------------------------------------------------------------ integrated quantities: path, gait, rolling angle
export const speedAt = (EV, t) => ramp(EV, 'walk', t, 0.9);
export const rollAt = (EV, t) => ramp(EV, 'roll', t, 1.6);
export const rollVAt = (EV, t) => ramp(EV, 'rollv', t, 0.8);
export const BALL_R = 0.3;
export function makeIntegrals(EV, t0, t1, dt = 1 / 240) {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const X = new Float64Array(n);
  const PH = new Float64Array(n);
  const RA = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const t = t0 + (i - 0.5) * dt;
    const v = speedAt(EV, t);
    const rv = rollVAt(EV, t);
    X[i] = X[i - 1] + (v + rv) * dt;
    PH[i] = PH[i - 1] + v * cyclesPerMetre * dt;
    RA[i] = RA[i - 1] + (rv / BALL_R) * dt;
  }
  // the ball stops belly-down: scale the rolling angle so the whole run is a whole number of turns
  const tot = RA[n - 1];
  if (tot > 0.1) {
    const k = (Math.max(1, Math.round(tot / (Math.PI * 2))) * Math.PI * 2) / tot;
    for (let i = 0; i < n; i++) RA[i] *= k;
  }
  const at = (A, t) => {
    const u = clamp((t - t0) / dt, 0, n - 1 - 1e-9);
    const i = Math.floor(u);
    return A[i] + (A[i + 1] - A[i]) * (u - i);
  };
  return {x: (t) => at(X, t), z: () => 0, psi: () => 0, phase: (t) => at(PH, t), rollAng: (t) => at(RA, t)};
}

// ------------------------------------------------------------ the whole machine's state at t
export function stateAt(t, EV, I) {
  const speed = speedAt(EV, t);
  const amp = clamp(speed / 0.08, 0, 1);
  const ph = I.phase(t);
  const roll = rollAt(EV, t);
  const flare = ramp(EV, 'flare', t, 0.6);
  const dig = ramp(EV, 'dig', t, 0.5);
  const tailK = ramp(EV, 'tail', t, 0.8);
  const lock = ramp(EV, 'lock', t, 0.6);

  // head: a sniffing sweep, then nose down at the trail
  const scanE = lastEv(EV, 'scan', t);
  const scanS = scanE ? t - scanE.t : Infinity;
  const env = scanS < 1.8 ? ss(0, 0.3, scanS) * (1 - ss(1.5, 1.8, scanS)) : 0;
  const headYaw = (env > 0 ? 28 * Math.sin((scanS / 1.8) * Math.PI * 2) * env : 0) + 5 * Math.sin(t * 0.7) * (1 - lock) * (1 - roll);
  const headPitch = -6 * lock + 3 * Math.sin(t * 2.6) * (1 - roll) * (scanS < 3 ? 1 : 0.3);
  const sniff = Math.max(0, Math.sin(t * 9)) * (0.3 + 0.7 * lock);

  // the spine: walking arch with a little sway, curled when rolled, flexing with the dig
  const breathe = 0.6 * Math.sin(t * 1.4);
  const extra = {
    F: SPINE.F.map((_, i) => (i < NECK_I ? 0.4 * amp * Math.sin(ph * Math.PI * 4 - i * 0.5) : 0) + (i >= NECK_I ? -6 * lock * (1 - roll) : 0) + dig * (i < NECK_I ? -0.8 : 2)),
    B: SPINE.B.map((_, i) => (i < TAIL_I ? breathe * 0.2 : 2.5 * Math.sin(t * 1.3 - i * 0.4) * (1 - roll))),
    head: headPitch,
  };
  const fk = spineFK(roll, extra);
  // stand on the legs while walking; once curling, sit on the lowest scale
  const lift = -fk.low;
  const bob = 0.006 * amp * Math.cos(ph * Math.PI * 4);
  const rootY = Math.max(lerp(WALK_H + bob, lift, smoother(clamp((roll - 0.15) / 0.6, 0, 1))), lift);

  // tongue: the flick, and the trail it clears
  const toE = lastEv(EV, 'tongue', t);
  const toU = toE ? (t - toE.t) / TONGUE_DUR : -1;
  const ext = tongueExt(toU);
  const ate = toE ? t - (toE.t + 0.5 * TONGUE_DUR) : -1;
  const trailX = fk.head.x + Math.cos(fk.head.a) * HEAD.len + 0.36;

  const exE = lastEv(EV, 'explode', t);
  const explodeK = (o) => {
    if (!exE) return 0;
    if (exE.v === 1) return ss(exE.t + 0.25 * (1 - o), exE.t + 0.25 * (1 - o) + 0.85, t);
    const prevOut = EV.some((e) => e.k === 'explode' && e.v === 1 && e.t < exE.t);
    if (!prevOut) return 0;
    const t0 = exE.t + 0.15 + o * SEAT_SPAN;
    return 1 - ss(t0, t0 + SEAT_DUR, t);
  };

  return {
    t, speed, amp, phase: ph, roll, fk, rootY, rollAng: I.rollAng(t), rollV: rollVAt(EV, t),
    x: I.x(t), z: 0, psi: 0,
    flare, dig, tailK, lock, scanS, headYaw, headPitch, sniff,
    toU, ext, ate, trailX, antsOn: lock > 0.05 || (toE && ate < 3) ? 1 : 0,
    explodeK, exE,
    labels: ramp(EV, 'labels', t, 0.4), trail: ramp(EV, 'trail', t, 0.4), turntable: ramp(EV, 'turntable', t, 0.4),
  };
}
export const SEAT_SPAN = 1.65;
export const SEAT_DUR = 0.36;
