// CALLINECTES CB-9, the math. A robotic blue crab scaled 7x from a Callinectes sapidus (carapace 180 mm spine to
// spine, here 1.26 m): a carapace that opens gull-wing over two gill chambers and a central pump, a crusher claw and a
// cutter claw, six walking legs that carry it sideways, two swimming paddles, eyes on stalks that move on their own,
// antennae, antennules and three pairs of mouthparts.
//
// No three.js in here. Every pose and every readout is a function of the operator's events (EV) and time: the walk
// speed is integrated into the body's path and the gait phase, everything else is eased from the events.
// Units: metres, seconds, degrees where named *Deg, radians otherwise. Body frame: +x forward (the face), +y up,
// +z right. The crab walks sideways, along +z.

export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeIn = (x) => Math.pow(clamp(x, 0, 1), 3);

// ------------------------------------------------------------ dimensions (m), from the animal x 7
export const DIM = {
  rideHeight: 0.36, // body centre above the ground
  carapace: {width: 0.84, spine: 0.21, length: 0.5, height: 0.15}, // spine: the last lateral spine past the shell edge
  claw: {coxa: 0.05, merus: 0.27, carpus: 0.13, palm: 0.19, finger: 0.15},
  leg: {coxa: 0.05, merus: 0.34, carpus: 0.12, propodus: 0.18, dactyl: 0.14},
  paddle: {coxa: 0.05, merus: 0.25, carpus: 0.11, propodus: 0.13, blade: 0.13},
  eye: {stalk: 0.085, r: 0.026},
  antenna: {segs: 23, segLen: 0.0155},
};
// walking legs (pereiopods 2-4): hip on the body side, neutral foot on the ground, gait phase (alternating tripods)
export const LEGS = [
  {id: 'L2', side: -1, hip: [0.085, -0.04, -0.3], foot: [0.33, -0.36, -0.7], phase: 0.0},
  {id: 'L3', side: -1, hip: [-0.02, -0.04, -0.31], foot: [0.0, -0.36, -0.76], phase: 0.5},
  {id: 'L4', side: -1, hip: [-0.12, -0.04, -0.29], foot: [-0.3, -0.36, -0.7], phase: 0.0},
  {id: 'R2', side: 1, hip: [0.085, -0.04, 0.3], foot: [0.33, -0.36, 0.7], phase: 0.5},
  {id: 'R3', side: 1, hip: [-0.02, -0.04, 0.31], foot: [0.0, -0.36, 0.76], phase: 0.0},
  {id: 'R4', side: 1, hip: [-0.12, -0.04, 0.29], foot: [-0.3, -0.36, 0.7], phase: 0.5},
];
export const GAIT = {stride: 0.22, duty: 0.6, lift: 0.07, coxaDeg: -18, dactylDeg: -72};
// one gait cycle covers stride / duty of travel
export const cyclesPerMetre = GAIT.duty / GAIT.stride;
export const WALK_V = 0.22; // m/s, sideways

// The crusher's snap: 60 ms in the machine's time, filmed at 1/20
export const SNAP_MS = 60;
export const SLOWMO = 20;
export const SNAP_DUR = (SNAP_MS / 1000) * SLOWMO; // 1.2 s on screen
export const CATCH_U = 0.62;
// where the target hovers, in the body frame (y from the body centre)
export const TARGET = [0.86, 0.15, 0.2];
export const SCULL_HZ = 4;

// ------------------------------------------------------------ the film's script
// keys: walk (m/s sideways), turn (rad/s), eyes (stalks up 0/1), scan (start), lock (0/1), claws (threat 0/1),
// snap (start), mouth (0/1), shell (0/1), pump (0/1), paddle (0/1), explode (0/1), labels, trail, turntable
export const SCRIPT = [
  {t: -2.0, walk: WALK_V, labels: 1, eyes: 1},
  {t: 0.0, cap: ['SIDEWALK', 'ALTERNATING TRIPODS · 6 LEGS LIVE'], view: 'hero'},
  {t: 2.6, cap: ['EYES UP', 'STALKS SWEEP ON THEIR OWN · ±50°'], view: 'eyes', walk: 0, scan: 1},
  {t: 4.8, cap: ['TARGET LOCK', 'BEARING FROM BOTH STALKS'], view: 'face', lock: 1},
  {t: 6.3, cap: ['CLAWS UP', 'THREAT POSE · 44 TEETH BARED'], view: 'claws', claws: 1},
  {t: 8.2, cap: ['CRUSHER SNAP', `${SNAP_MS} ms REAL · SHOWN AT 1/${SLOWMO}`], view: 'snap', snap: 1},
  {t: 10.2, cap: ['MOUTHPARTS', '3 PAIRS · 22 PARTS · FEEDING'], view: 'mouth', mouth: 1},
  {t: 12.0, cap: ['SHELL OPEN', '2 HALVES · 24 TEETH · GULL-WING'], view: 'top', claws: 0, mouth: 0, lock: 0, shell: 1},
  {t: 13.5, cap: ['GILL PUMP', '16 GILLS · 112 LAMELLAE · 6 PISTONS'], view: 'gills', pump: 1},
  {t: 15.5, cap: ['SHELL SEALED', 'PUMP IDLE · HALVES LATCHED'], view: 'top', pump: 0, shell: 0},
  {t: 16.9, cap: ['PADDLE SCULL', `2 PADDLES · 16 SLATS · ${SCULL_HZ} Hz`], view: 'rear', paddle: 1},
  {t: 18.9, cap: ['EXPLODED', '500 MOVING PARTS · 1 CHASSIS'], view: 'wide', paddle: 0, explode: 1},
  {t: 20.9, cap: ['REASSEMBLY', 'SEATED CORE OUT · LAST PART @ 2.0 s'], view: 'wide', explode: 0},
  {t: 23.4, cap: ['TURNING', 'YAW 0.6 rad/s · ON THE SPOT'], view: 'hero', turn: 0.6, trail: 1},
  {t: 25.2, cap: ['SIDLING OFF', 'SIDEWAYS 0.30 m/s · FIELD MODE'], view: 'far', walk: 0.3, turn: 0},
];
export const DURATION = 28.0;
const STATE_KEYS = ['walk', 'turn', 'eyes', 'scan', 'lock', 'claws', 'snap', 'mouth', 'shell', 'pump', 'paddle', 'explode', 'labels', 'trail', 'turntable'];

/** Flattens a SCRIPT into an event list [{t, k, v}], sorted. */
export const toEvents = (script) => {
  const ev = [];
  for (const e of script) for (const k of STATE_KEYS) if (e[k] !== undefined) ev.push({t: e.t, k, v: e[k]});
  return ev.sort((a, b) => a.t - b.t);
};

// ------------------------------------------------------------ event readers
const INIT = {walk: 0, turn: 0, eyes: 0, lock: 0, claws: 0, mouth: 0, shell: 0, pump: 0, paddle: 0, explode: 0, labels: 0, trail: 0, turntable: 0};
/** A key's value eased from event to event (dur s per change). */
export const ramp = (EV, k, t, dur = 0.7) => {
  let v = INIT[k] ?? 0;
  for (const e of EV) {
    if (e.k !== k || e.t > t) continue;
    v += (e.v - v) * ss(e.t, e.t + dur, t);
  }
  return v;
};
/** The last event of a key at or before t: {t, v} or null. */
export const lastEv = (EV, k, t) => {
  let out = null;
  for (const e of EV) if (e.k === k && e.t <= t) out = e;
  return out;
};
const firstAfter = (EV, k, v, t) => {
  for (const e of EV) if (e.k === k && e.v === v && e.t > t) return e.t;
  return Infinity;
};

// ------------------------------------------------------------ integrated quantities (body path, gait, pump, scull)
export const speedAt = (EV, t) => ramp(EV, 'walk', t, 0.9);
export const yawRateAt = (EV, t) => ramp(EV, 'turn', t, 0.6);
export const pumpRateAt = (EV, t) => ramp(EV, 'pump', t, 1.0) * 10 + 0.6; // rad/s of the pump rotor
export const scullRateAt = (EV, t) => ramp(EV, 'paddle', t, 0.6) * SCULL_HZ * Math.PI * 2;
/** Tabulates the integrals of the event rates from t0 to t1, so render(t) only reads them. */
export function makeIntegrals(EV, t0, t1, dt = 1 / 240) {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const X = new Float64Array(n);
  const Z = new Float64Array(n);
  const PSI = new Float64Array(n);
  const PH = new Float64Array(n);
  const SPIN = new Float64Array(n);
  const SC = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const t = t0 + (i - 0.5) * dt;
    const v = speedAt(EV, t);
    const w = yawRateAt(EV, t);
    const psi = PSI[i - 1] + w * dt * 0.5;
    PSI[i] = PSI[i - 1] + w * dt;
    // sideways: the body's +z axis in the world
    X[i] = X[i - 1] + v * Math.sin(psi) * dt;
    Z[i] = Z[i - 1] + v * Math.cos(psi) * dt;
    PH[i] = PH[i - 1] + (Math.abs(v) + Math.abs(w) * 0.3) * cyclesPerMetre * dt;
    SPIN[i] = SPIN[i - 1] + pumpRateAt(EV, t) * dt;
    SC[i] = SC[i - 1] + scullRateAt(EV, t) * dt;
  }
  const at = (A, t) => {
    const u = clamp((t - t0) / dt, 0, n - 1 - 1e-9);
    const i = Math.floor(u);
    return A[i] + (A[i + 1] - A[i]) * (u - i);
  };
  return {x: (t) => at(X, t), z: (t) => at(Z, t), psi: (t) => at(PSI, t), phase: (t) => at(PH, t), spin: (t) => at(SPIN, t), scull: (t) => at(SC, t)};
}

// ------------------------------------------------------------ walking legs
/** Foot target in the body frame at gait phase ph with walk amplitude amp; the stance foot sweeps against the walk. */
export function footTarget(leg, ph, amp, turn = 0) {
  const u = (((ph + leg.phase) % 1) + 1) % 1;
  const {stride, duty, lift} = GAIT;
  let d;
  let dy = 0;
  if (u < duty) d = stride * (0.5 - u / duty);
  else {
    const v = (u - duty) / (1 - duty);
    d = stride * (-0.5 + smoother(v));
    dy = lift * Math.sin(Math.PI * v);
  }
  // turning on the spot: every foot swings tangentially around the body centre
  const r = Math.hypot(leg.foot[0], leg.foot[2]);
  const tx = (-leg.foot[2] / r) * turn * 0.5;
  const tz = (leg.foot[0] / r) * turn * 0.5;
  const walkK = clamp(1 - Math.abs(turn) * 1.4, 0, 1);
  return [leg.foot[0] + d * tx * amp, leg.foot[1] + dy * amp, leg.foot[2] + d * (walkK + tz) * amp];
}
export const inStance = (leg, ph, amp) => amp < 0.05 || (((ph + leg.phase) % 1) + 1) % 1 < GAIT.duty;

/**
 * Leg pose from its foot target (body frame): hip yaw, then coxa, merus and the carpus-propodus pair in the leg's
 * vertical plane by two-link IK (knee up), and the dactyl laid steeply from the ankle to the tip, as a crab stands.
 */
export function legIK(leg, foot, bodyY = 0) {
  const L = DIM.leg;
  const hx = leg.hip[0];
  const hy = leg.hip[1] + bodyY;
  const hz = leg.hip[2];
  const vx = foot[0] - hx;
  const vz = foot[2] - hz;
  const yaw = Math.atan2(-vz, vx);
  const r = Math.hypot(vx, vz);
  const fy = foot[1] - hy;
  const ca = GAIT.coxaDeg * D2R;
  const cx = L.coxa * Math.cos(ca);
  const cy = L.coxa * Math.sin(ca);
  const da = GAIT.dactylDeg * D2R;
  const ax = r - L.dactyl * Math.cos(da);
  const ay = fy - L.dactyl * Math.sin(da);
  const dx = ax - cx;
  const dy = ay - cy;
  const L1 = L.merus;
  const L2 = L.carpus + L.propodus;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const phi = Math.atan2(dy, dx);
  const a1 = phi + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const kx = cx + L1 * Math.cos(a1);
  const ky = cy + L1 * Math.sin(a1);
  const a2 = Math.atan2(ay - ky, ax - kx);
  return {yaw, coxa: ca, merus: a1 - ca, carpus: a2 - a1, dactyl: da - a2, merusAbs: a1, carpusAbs: a2, knee: [kx, ky], reach: d};
}

// ------------------------------------------------------------ claws
// yaw angles in the horizontal plane, outward positive (mirrored per side), pitch at the shoulder, dactyl opening
export const CLAW_POSES = {
  fold: {pitch: 8, coxa: 20, merus: 20, carpus: -50, palm: -25, open: 4, roll: -20},
  threat: {pitch: 38, coxa: 34, merus: 50, carpus: -25, palm: -15, open: 45, roll: -30},
  aim: {pitch: 16, coxa: 14, merus: 10, carpus: -4, palm: -30, open: 55, roll: -15},
  shut: {pitch: 15, coxa: 13, merus: 9, carpus: -5, palm: -31, open: 0, roll: -15},
  feed: {pitch: 6, coxa: 18, merus: 16, carpus: -56, palm: -40, open: 0, roll: -10},
};
const mixPose = (a, b, k) => Object.fromEntries(Object.keys(a).map((key) => [key, lerp(a[key], b[key], k)]));
/** The crusher's snap over u in 0..1 of its 60 ms: swing out to aim, open wide, shut on the target, bring it in. */
export function snapPose(u) {
  const P = CLAW_POSES;
  if (u < 0.3) return mixPose(P.threat, P.aim, smoother(u / 0.3));
  if (u < 0.52) return P.aim;
  if (u < CATCH_U) return mixPose(P.aim, P.shut, easeIn((u - 0.52) / (CATCH_U - 0.52)) ** 0.6);
  return mixPose(P.shut, P.feed, easeOut((u - CATCH_U) / (1 - CATCH_U)) * 0.35);
}
/** Tip gap of a claw (m): the dactyl's opening against the fixed finger. */
export const clawGap = (pose, finger = DIM.claw.finger) => 2 * finger * Math.sin((pose.open * D2R) / 2);

// ------------------------------------------------------------ the whole machine's state at t
/** I: {x, z, psi, phase, spin, scull} as functions of t (the film's tables, or the live page's running integrals). */
export function stateAt(t, EV, I) {
  const speed = speedAt(EV, t);
  const turn = yawRateAt(EV, t);
  const amp = clamp(Math.abs(speed) / 0.1 + Math.abs(turn) * 0.9, 0, 1);
  const ph = I.phase(t);
  const bob = 0.006 * amp * Math.cos(ph * Math.PI * 4);

  // eyes: stalks up, an independent sweep each, then both on the target
  const eyes = ramp(EV, 'eyes', t, 0.6);
  const scanE = lastEv(EV, 'scan', t);
  const scanS = scanE ? t - scanE.t : Infinity;
  const lock = ramp(EV, 'lock', t, 0.6);
  const env = scanS < 2.2 ? ss(0, 0.3, scanS) * (1 - ss(1.9, 2.2, scanS)) : 0;
  const sweepL = env > 0 ? 50 * Math.sin((scanS / 2.2) * Math.PI * 2) * env : 0;
  const sweepR = env > 0 ? -45 * Math.sin((scanS / 2.2) * Math.PI * 2 + 1.3) * env : 0;
  const eyeBase = [0.26, 0.07];
  const bearingOf = (z) => Math.atan2(-(TARGET[2] - z), TARGET[0] - eyeBase[0]) / D2R;
  const idle = (k) => 5 * Math.sin(t * 0.7 + k) * (1 - lock);
  const eyeYaw = [sweepL + idle(0) + lock * bearingOf(-0.07), sweepR + idle(2) + lock * bearingOf(0.07)];
  const iris = clamp(0.35 + 0.55 * (scanS < 2.4 ? ss(0, 0.4, scanS) : 0) + lock * 0.4, 0, 1);

  // claws: fold / threat from 'claws', the crusher's snap over them, hold the catch until the claws stand down
  const threat = ramp(EV, 'claws', t, 0.8);
  const base = mixPose(CLAW_POSES.fold, CLAW_POSES.threat, threat);
  const snE = lastEv(EV, 'snap', t);
  let crusher = base;
  let snapU = -1;
  let caught = 0;
  if (snE) {
    const u = (t - snE.t) / SNAP_DUR;
    if (u < 1) {
      snapU = u;
      crusher = snapPose(u);
    } else {
      const off = firstAfter(EV, 'claws', 0, snE.t);
      crusher = mixPose(snapPose(1), base, ss(off, off + 0.9, t));
    }
    caught = u >= CATCH_U && (!scanE || snE.t > scanE.t) ? 1 : 0;
  }
  // the cutter follows the threat pose and shadows the snap at a third of the travel
  const cutter = snapU >= 0 ? mixPose(base, crusher, 0.3) : base;
  const sinceCatch = snE ? t - (snE.t + CATCH_U * SNAP_DUR) : -1;
  const scanned = scanE ? ss(scanE.t + 0.4, scanE.t + 1.0, t) : 0;
  const targetOn = scanned * (snE && scanE && snE.t > scanE.t && sinceCatch > 0 ? 0 : 1);
  const flash = sinceCatch > 0 && sinceCatch < 0.5 ? 1 - sinceCatch / 0.5 : 0;

  const mouth = ramp(EV, 'mouth', t, 0.6);
  const shell = ramp(EV, 'shell', t, 0.9);
  const pump = ramp(EV, 'pump', t, 0.8);
  const paddle = ramp(EV, 'paddle', t, 0.6);

  // explode and reassembly: k(order) for a part seated in order o (0 inner .. 1 outer)
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
    t, speed, turn, amp, phase: ph, bob,
    x: I.x(t), z: I.z(t), psi: I.psi(t),
    eyes, scanS, lock, eyeYaw, iris,
    threat, crusher, cutter, snapU, caught, sinceCatch, targetOn, flash,
    mouth, shell, pump, spin: I.spin(t), pumpRate: pumpRateAt(EV, t), paddle, scull: I.scull(t),
    explodeK, exE,
    labels: ramp(EV, 'labels', t, 0.4), trail: ramp(EV, 'trail', t, 0.4), turntable: ramp(EV, 'turntable', t, 0.4),
  };
}
export const SEAT_SPAN = 1.65;
export const SEAT_DUR = 0.36;
