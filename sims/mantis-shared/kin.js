// HIERODULA HX-6, the math. A robotic praying mantis scaled 14x from a Hierodula membranacea (body 100 mm, here
// 1.4 m): a long prothorax carrying two raptorial forelegs, a triangular head on a pan-tilt neck, four walking legs,
// a fan of hindwings under two tegmina, a ten-segment abdomen and a gyro core in the thorax bay.
//
// No three.js in here. Every pose and every readout is a function of the operator's events (EV) and time:
// the walk speed is integrated into the body's path and the gait phase, everything else is eased from the events.
// Units: metres, seconds, degrees where named *Deg, radians otherwise. Body frame: +x forward, +y up, +z right.

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

// ------------------------------------------------------------ dimensions (m), from the insect x 14
export const DIM = {
  bodyLen: 1.4,
  rideHeight: 0.4, // thorax centre above the ground
  thorax: {len: 0.36, width: 0.16},
  prothorax: {segs: 8, segLen: 0.052, pitchDeg: 30}, // 0.42 m of neck, raised 30 deg
  head: {width: 0.19, eyeR: 0.042},
  antenna: {segs: 20, segLen: 0.021},
  arm: {coxa: 0.18, femur: 0.24, tibia: 0.14, tarsus: 0.022, femSpines: 12, tibSpines: 9},
  mid: {coxa: 0.07, femur: 0.27, tibia: 0.29, tarsus: 0.026},
  hind: {coxa: 0.07, femur: 0.34, tibia: 0.36, tarsus: 0.03},
  abdomen: {segs: 10, segLen: 0.064},
  wing: {ribs: 10, spanDeg: 120, tegmen: 0.56},
};
// the walking legs: hip in the body frame, neutral foot on the ground, gait phase offset (diagonal pairs)
export const LEGS = [
  {id: 'L2', side: -1, pair: 'mid', hip: [0.08, -0.03, -0.075], foot: [0.3, -0.4, -0.5], phase: 0.0},
  {id: 'R2', side: 1, pair: 'mid', hip: [0.08, -0.03, 0.075], foot: [0.3, -0.4, 0.5], phase: 0.5},
  {id: 'L3', side: -1, pair: 'hind', hip: [-0.11, -0.03, -0.075], foot: [-0.48, -0.4, -0.52], phase: 0.5},
  {id: 'R3', side: 1, pair: 'hind', hip: [-0.11, -0.03, 0.075], foot: [-0.48, -0.4, 0.52], phase: 0.0},
];
export const GAIT = {stride: 0.24, duty: 0.66, lift: 0.075, coxaDeg: -35, tarsusDeg: -38};
// one gait cycle covers stride / duty of travel, so the phase advances at v * duty / stride cycles per metre
export const cyclesPerMetre = GAIT.duty / GAIT.stride;
export const WALK_V = 0.24; // m/s, a stalking walk

// The strike: 64 ms in the insect's time, filmed at 1/20 speed
export const STRIKE_MS = 64;
export const SLOWMO = 20;
export const STRIKE_DUR = (STRIKE_MS / 1000) * SLOWMO; // 1.28 s on screen
export const CATCH_U = 0.62; // the tibia closes on the target here
// where the target hovers, in the body frame
export const TARGET = [0.9, 0.24, 0.06];

// ------------------------------------------------------------ the film's script: one event list drives everything
// k: walk (m/s), turn (rad/s), scan (start), lock (0/1), armed (0/1), strike (start), plates, core, vents, wings,
// explode (0/1), labels, trail, turntable; cap: the caption shown under the machine; view: the camera
export const SCRIPT = [
  {t: -2.0, walk: WALK_V, labels: 1},
  {t: 0.0, cap: ['STALKING', 'GAIT WALK · 4 LEGS LIVE'], view: 'hero'},
  {t: 2.6, cap: ['OPTICS SCAN', '2 EYES · 3 OCELLI · ±55° SWEEP'], view: 'head', walk: 0, scan: 1},
  {t: 5.0, cap: ['TARGET LOCK', 'BEARING FROM THE PSEUDOPUPILS'], view: 'face', lock: 1},
  {t: 6.6, cap: ['ARMS UNLOCK', '42 SPINES FLARE · NECK UP'], view: 'arm', armed: 1},
  {t: 8.4, cap: ['STRIKE', `${STRIKE_MS} ms REAL · SHOWN AT 1/${SLOWMO}`], view: 'side', strike: 1},
  {t: 10.5, cap: ['PLATES OPEN', '8 DORSAL PLATES · HINGED'], view: 'top', armed: 0, plates: 1, lock: 0},
  {t: 12.0, cap: ['GYRO SPIN', '3 GIMBALS · 8 PISTONS · 20 VENTS'], view: 'core', core: 1, vents: 1},
  {t: 14.4, cap: ['CORE DOCK', 'SLED DOWN · PLATES SEALED'], view: 'top', core: 0, plates: 0, vents: 0},
  {t: 15.9, cap: ['WING DISPLAY', '20 RIBS · 18 PANELS · 120° FAN'], view: 'display', wings: 1},
  {t: 18.3, cap: ['EXPLODED', '356 MOVING PARTS · 1 SKELETON'], view: 'wide', wings: 0, explode: 1},
  {t: 20.3, cap: ['REASSEMBLY', 'SEATED CORE OUT · LAST PART @ 1.8 s'], view: 'wide', explode: 0},
  {t: 22.6, cap: ['TURNING', 'YAW 0.55 rad/s · DIAGONAL PAIRS'], view: 'hero', walk: 0.2, turn: 0.55, trail: 1},
  {t: 24.6, cap: ['DEPARTING', 'WALK 0.30 m/s · FIELD MODE'], view: 'far', walk: 0.3, turn: 0},
];
export const DURATION = 27.4;
const STATE_KEYS = ['walk', 'turn', 'scan', 'lock', 'armed', 'strike', 'plates', 'core', 'vents', 'wings', 'explode', 'labels', 'trail', 'turntable'];

/** Flattens a SCRIPT into an event list [{t, k, v}], sorted. */
export const toEvents = (script) => {
  const ev = [];
  for (const e of script) for (const k of STATE_KEYS) if (e[k] !== undefined) ev.push({t: e.t, k, v: e[k]});
  return ev.sort((a, b) => a.t - b.t);
};

// ------------------------------------------------------------ event readers
const INIT = {walk: 0, turn: 0, lock: 0, armed: 0, plates: 0, core: 0, vents: 0, wings: 0, explode: 0, labels: 0, trail: 0, turntable: 0};
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

// ------------------------------------------------------------ integrated quantities (body path, gait, gyro spin)
export const speedAt = (EV, t) => ramp(EV, 'walk', t, 0.9);
export const yawRateAt = (EV, t) => ramp(EV, 'turn', t, 0.6);
export const spinRateAt = (EV, t) => ramp(EV, 'core', t, 1.0) * 9.0 + 0.4; // rad/s of the slowest gimbal
/** Tabulates the integrals of the event rates from t0 to t1, so render(t) only reads them. */
export function makeIntegrals(EV, t0, t1, dt = 1 / 240) {
  const n = Math.ceil((t1 - t0) / dt) + 1;
  const X = new Float64Array(n);
  const Z = new Float64Array(n);
  const PSI = new Float64Array(n);
  const PH = new Float64Array(n);
  const SPIN = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const t = t0 + (i - 0.5) * dt;
    const v = speedAt(EV, t);
    const w = yawRateAt(EV, t);
    const psi = PSI[i - 1] + w * dt * 0.5;
    PSI[i] = PSI[i - 1] + w * dt;
    X[i] = X[i - 1] + v * Math.cos(psi) * dt;
    Z[i] = Z[i - 1] - v * Math.sin(psi) * dt;
    // turning on the spot still steps: the inside and outside feet keep the gait going
    PH[i] = PH[i - 1] + (v + Math.abs(w) * 0.25) * cyclesPerMetre * dt;
    SPIN[i] = SPIN[i - 1] + spinRateAt(EV, t) * dt;
  }
  const at = (A, t) => {
    const u = clamp((t - t0) / dt, 0, n - 1 - 1e-9);
    const i = Math.floor(u);
    return A[i] + (A[i + 1] - A[i]) * (u - i);
  };
  return {x: (t) => at(X, t), z: (t) => at(Z, t), psi: (t) => at(PSI, t), phase: (t) => at(PH, t), spin: (t) => at(SPIN, t)};
}

// ------------------------------------------------------------ walking legs
/** Foot target in the body frame for a leg at gait phase ph (cycles) with walk amplitude amp (0 standing, 1 walking). */
export function footTarget(leg, ph, amp, turn = 0) {
  const u = (((ph + leg.phase) % 1) + 1) % 1;
  const {stride, duty, lift} = GAIT;
  let dx;
  let dy = 0;
  if (u < duty) dx = stride * (0.5 - u / duty);
  else {
    const v = (u - duty) / (1 - duty);
    const e = smoother(v);
    dx = stride * (-0.5 + e);
    dy = lift * Math.sin(Math.PI * v);
  }
  // turning: the feet swing tangentially around the body centre, outside legs further
  const tx = -leg.foot[2] * turn * 0.35;
  const tz = leg.foot[0] * turn * 0.35;
  return [leg.foot[0] + (dx + tx * Math.sign(dx || 1)) * amp, leg.foot[1] + dy * amp, leg.foot[2] + tz * (dx / stride) * amp * 2];
}
/** Whether the foot is on the ground (stance) at this phase. */
export const inStance = (leg, ph, amp) => amp < 0.05 || (((ph + leg.phase) % 1) + 1) % 1 < GAIT.duty;

/**
 * Leg pose from its foot target (body frame) and the body's ride height: hip yaw, then coxa, femur and tibia in the
 * leg's vertical plane by two-link IK (knee up), and the tarsus laid from the ankle to the foot. Angles in radians,
 * femur and tibia relative to their parent; the tarsus angle absolute in the leg plane.
 */
export function legIK(leg, foot, bodyY = 0) {
  const L = DIM[leg.pair];
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
  const ta = GAIT.tarsusDeg * D2R;
  const tl = L.tarsus * 5;
  const ax = r - tl * Math.cos(ta);
  const ay = fy - tl * Math.sin(ta);
  const dx = ax - cx;
  const dy = ay - cy;
  const L1 = L.femur;
  const L2 = L.tibia;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const phi = Math.atan2(dy, dx);
  const a1 = phi + Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const kx = cx + L1 * Math.cos(a1);
  const ky = cy + L1 * Math.sin(a1);
  const a2 = Math.atan2(ay - ky, ax - kx);
  return {yaw, coxa: ca, femur: a1 - ca, tibia: a2 - a1, tarsus: ta, femurAbs: a1, tibiaAbs: a2, knee: [kx, ky], reach: d};
}

// ------------------------------------------------------------ raptorial arms
// absolute side-view angles (deg from the forward horizontal) of coxa and femur, tibia relative to the femur
export const ARM_POSES = {
  pray: {coxa: -74, femur: 62, tibia: -166, yaw: 7},
  armed: {coxa: -48, femur: 80, tibia: -160, yaw: 4},
  cock: {coxa: -58, femur: 88, tibia: -163, yaw: 3},
  reach: {coxa: 4, femur: 18, tibia: -38, yaw: -3},
  catch: {coxa: -2, femur: 24, tibia: -167, yaw: -3},
  hold: {coxa: -36, femur: 68, tibia: -167, yaw: 2},
};
const mixPose = (a, b, k) => ({coxa: lerp(a.coxa, b.coxa, k), femur: lerp(a.femur, b.femur, k), tibia: lerp(a.tibia, b.tibia, k), yaw: lerp(a.yaw, b.yaw, k)});
/** The strike as a function of u in 0..1 of its 64 ms: cock, extend, snap shut on the target, pull it in. */
export function strikePose(u) {
  const P = ARM_POSES;
  if (u < 0.15) return mixPose(P.armed, P.cock, smoother(u / 0.15));
  if (u < 0.5) return mixPose(P.cock, P.reach, easeOut((u - 0.15) / 0.35));
  if (u < CATCH_U + 0.04) return mixPose(P.reach, P.catch, easeIn((u - 0.5) / (CATCH_U + 0.04 - 0.5)) ** 0.5);
  return mixPose(P.catch, P.hold, smoother((u - CATCH_U - 0.04) / (1 - CATCH_U - 0.04)));
}

// ------------------------------------------------------------ the whole machine's state at t
/**
 * Everything the geometry and the console need, from the events and the integrals. `I` is {x, z, psi, phase, spin}
 * as functions of t (the film's tables, or the live page's running integrals).
 */
export function stateAt(t, EV, I) {
  const speed = speedAt(EV, t);
  const turn = yawRateAt(EV, t);
  const amp = clamp(speed / 0.12 + Math.abs(turn) * 0.9, 0, 1);
  const ph = I.phase(t);
  const bob = 0.007 * amp * Math.cos(ph * Math.PI * 4);

  // optics: idle drift, a scan sweep, then a lock on the target
  const scanE = lastEv(EV, 'scan', t);
  const scanS = scanE ? t - scanE.t : Infinity;
  const lock = ramp(EV, 'lock', t, 0.6);
  const sweep = scanS < 2.4 ? 55 * Math.sin((scanS / 2.4) * Math.PI * 2) * ss(0, 0.3, scanS) * (1 - ss(2.1, 2.4, scanS)) : 0;
  const idleYaw = 7 * Math.sin(t * 0.55) * (1 - lock);
  const headPos = [0.53, 0.25, 0];
  const bearing = Math.atan2(-(TARGET[2] - headPos[2]), TARGET[0] - headPos[0]) / D2R;
  const tilt = Math.atan2(TARGET[1] - headPos[1], TARGET[0] - headPos[0]) / D2R;
  const headYaw = sweep + idleYaw + lock * bearing;
  const headPitch = -18 + lock * (tilt * 0.6) + 3 * Math.sin(t * 0.8) * (1 - lock);
  const iris = clamp(0.35 + 0.65 * ss(0, 0.5, scanS < Infinity ? scanS : -1) * (scanS < 2.6 ? 1 : 0) + lock * 0.35, 0, 1);

  // arms: pray / armed from the 'armed' events, the strike sequence over them, hold until disarmed
  const armed = ramp(EV, 'armed', t, 0.8);
  const base = mixPose(ARM_POSES.pray, ARM_POSES.armed, armed);
  const stE = lastEv(EV, 'strike', t);
  let arm = base;
  let strikeU = -1;
  let caught = 0;
  if (stE) {
    const u = (t - stE.t) / STRIKE_DUR;
    if (u < 1) {
      strikeU = u;
      arm = strikePose(u);
    } else {
      const off = firstAfter(EV, 'armed', 0, stE.t);
      arm = mixPose(ARM_POSES.hold, base, ss(off, off + 0.9, t));
    }
    caught = u >= CATCH_U && (!scanE || stE.t > scanE.t) ? 1 : 0;
  }
  const spines = Math.max(armed, strikeU >= 0 ? 1 : 0, stE && t - stE.t < STRIKE_DUR + 0.4 ? 1 : 0);
  const sinceCatch = stE ? t - (stE.t + CATCH_U * STRIKE_DUR) : -1;
  const chew = sinceCatch > 0 && sinceCatch < 1.6 ? Math.abs(Math.sin(sinceCatch * 9)) * (1 - ss(1.2, 1.6, sinceCatch)) : 0;

  // the target: shown from the scan, caught in the strike
  const scanned = scanE ? ss(scanE.t + 0.4, scanE.t + 1.0, t) : 0;
  const targetOn = scanned * (stE && scanE && stE.t > scanE.t && sinceCatch > 0 ? 0 : 1);
  const flash = sinceCatch > 0 && sinceCatch < 0.5 ? 1 - sinceCatch / 0.5 : 0;

  // thorax bay, core, vents, wings, abdomen, neck
  const plates = ramp(EV, 'plates', t, 0.8);
  const coreE = ramp(EV, 'core', t, 0.9);
  const coreLift = coreE;
  const vents = ramp(EV, 'vents', t, 0.5);
  const wings = ramp(EV, 'wings', t, 1.0);
  const neckRaise = 10 * armed + 14 * wings + 4 * lock;
  const curl = wings;

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
    headYaw, headPitch, iris, lock, scanS, sweep,
    armed, arm, strikeU, caught, spines, chew, sinceCatch,
    targetOn, flash,
    plates, coreLift, spin: I.spin(t), spinRate: spinRateAt(EV, t), vents, wings, curl, neckRaise,
    explodeK, exE,
    labels: ramp(EV, 'labels', t, 0.4), trail: ramp(EV, 'trail', t, 0.4), turntable: ramp(EV, 'turntable', t, 0.4),
  };
}
export const SEAT_SPAN = 1.6;
export const SEAT_DUR = 0.36;

// ------------------------------------------------------------ the arm's forward kinematics in the side plane
/** Hook tip relative to the shoulder (m) for an arm pose, used by the reach readout and the strike target. */
export function armTip(p) {
  const A = DIM.arm;
  const c = p.coxa * D2R;
  const f = p.femur * D2R;
  const tb = f + p.tibia * D2R;
  const x = A.coxa * Math.cos(c) + A.femur * Math.cos(f) + A.tibia * Math.cos(tb);
  const y = A.coxa * Math.sin(c) + A.femur * Math.sin(f) + A.tibia * Math.sin(tb);
  return [x, y];
}
