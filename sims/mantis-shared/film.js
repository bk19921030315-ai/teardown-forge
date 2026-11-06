// HIERODULA HX-6, the console film. The mantis stalks in, scans, locks a target drone, unlocks its arms and takes the
// drone in a 64 ms strike shown at 1/20 speed, opens its thorax bay and spins the gyro core, docks it, throws the wing
// display, comes apart into its 356 parts, reseats them core-out, turns and walks off. One event list (kin.js SCRIPT)
// drives the pose, the camera, the console and the score; render(t) is a pure function of t.
import {runSim} from '../kit/runtime.js';
import {armTip, D2R, DIM, DURATION, footTarget, GAIT, inStance, lastEv, LEGS, makeIntegrals, SCRIPT, speedAt, ss, stateAt, STRIKE_DUR, STRIKE_MS, TARGET, toEvents, yawRateAt} from './kin.js';
import {createConsole, SUBSYS} from './console.js';
import {createMantisStage} from './stage.js';

export const EV = toEvents(SCRIPT);
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'Hierodula HX-6', subtitle: ''}, director: {enabled: false}, watermark: ''};

// ------------------------------------------------------------ camera views
// each view is a function of u (seconds since it was switched on) and the state: a target in the body frame, an
// azimuth relative to the body's heading (0 = in front, looking at the face; 90 = the left side), elevation, distance
export const VIEW_FN = {
  hero: (u) => ({p: [-0.05, 0.42, 0], az: 36 + 1.3 * u, el: 13, d: 3.3}),
  head: (u) => ({p: [0.48, 0.62, 0], az: 36 - 1.5 * u, el: 7, d: 1.75}),
  face: (u) => ({p: [0.7, 0.62, 0.02], az: 42 + 1.0 * u, el: 5, d: 1.65}),
  arm: (u) => ({p: [0.42, 0.52, 0], az: 66 - 1.2 * u, el: 9, d: 2.3}),
  side: (u) => ({p: [0.3, 0.5, 0], az: 90 + 0.6 * u, el: 5, d: 3.2}),
  top: (u) => ({p: [-0.12, 0.42, 0], az: 112 + 2 * u, el: 50, d: 2.75}),
  core: (u) => ({p: [-0.02, 0.6, 0], az: 104 + 2.5 * u, el: 30, d: 1.8}),
  display: (u) => ({p: [-0.02, 0.62, 0], az: -24 + 1.6 * u, el: 12, d: 3.5}),
  wide: (u) => ({p: [-0.12, 0.45, 0], az: 52 + 4 * u, el: 24, d: 5.3}),
  far: (u) => ({p: [0.0, 0.4, 0], az: 196 + 1.5 * u, el: 12, d: 3.8 + 0.2 * u}),
};
const lerpDeg = (a, b, k) => a + ((((b - a + 540) % 360) - 180) * k);
export const VIEWS_LIST = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
const viewRaw = (name, u) => VIEW_FN[name](u);
/** The camera at t for a view list [[t, name], ...], blended 1.6 s between views, backing off on wide swings. */
export function viewAt(t, list = VIEWS_LIST) {
  let i = 0;
  while (i < list.length - 1 && list[i + 1][0] <= t) i++;
  const cur = viewRaw(list[i][1], t - list[i][0]);
  if (i === 0) return cur;
  const prev = viewRaw(list[i - 1][1], t - list[i - 1][0]);
  const k = ss(list[i][0], list[i][0] + 1.6, t);
  const o = {p: prev.p.map((v, j) => v + (cur.p[j] - v) * k), az: lerpDeg(prev.az, cur.az, k), el: prev.el + (cur.el - prev.el) * k, d: prev.d + (cur.d - prev.d) * k};
  const swing = Math.min(1, Math.abs(((cur.az - prev.az + 540) % 360) - 180) / 90);
  o.el += 6 * Math.sin(Math.PI * k) * swing;
  o.d += 0.6 * swing * Math.sin(Math.PI * k);
  return o;
}
/** A body-frame view to the stage's world camera. */
export const toCam = (S, v, st) => {
  const w = st.toWorld(S, v.p);
  return {tx: w.x, ty: w.y, tz: w.z, az: v.az * D2R + S.psi, el: v.el * D2R, d: v.d, sx: 0, sy: 0};
};

// ------------------------------------------------------------ callouts
const CALLS = [
  {k: 'armL', name: 'RAPTOR ARM L', sub: '21 SPINES · 4 RAMS'},
  {k: 'armR', name: 'RAPTOR ARM R', sub: '21 SPINES · 4 RAMS'},
  {k: 'eyes', name: 'OPTIC DOMES', sub: '2 EYES · 16 IRIS'},
  {k: 'antenna', name: 'ANTENNAE', sub: '2 × 20 SEGMENTS'},
  {k: 'core', name: 'GYRO CORE', sub: '3 GIMBALS · ROTOR'},
  {k: 'plates', name: 'DORSAL PLATES', sub: '8 HINGED'},
  {k: 'wing', name: 'WING FAN', sub: '10 RIBS EACH'},
  {k: 'legR3', name: 'LEG R3', sub: '19 PARTS · IK'},
  {k: 'legL2', name: 'LEG L2', sub: '19 PARTS · IK'},
  {k: 'abdomen', name: 'ABDOMEN', sub: '10 SEGMENTS'},
];
// which callouts each view shows
const CALL_VIEWS = {
  hero: ['eyes', 'armR', 'legR3', 'abdomen', 'legL2'],
  head: ['eyes', 'antenna'],
  face: ['eyes', 'antenna'],
  arm: ['armL', 'eyes'],
  side: ['armL', 'eyes', 'abdomen'],
  top: ['plates', 'abdomen', 'legR3'],
  core: ['core', 'plates'],
  display: ['wing', 'eyes', 'armR'],
  wide: [],
  far: ['abdomen', 'legL2'],
};

// ------------------------------------------------------------ console data for a frame
const pct = (x) => Math.min(1, Math.max(0, x));
export const capAt = (t, script = SCRIPT) => {
  let c = script.find((e) => e.cap);
  for (const e of script) if (e.cap && e.t <= t) c = e;
  return c;
};

/**
 * Everything the console shows, from the state. ctx: {st, total, joints, hist(dt) → state dt seconds ago (or null),
 * clock, duration, paused, view, viewSince, log: {cur, next, ticks, pos, foot}, cap, capSince}.
 */
export function consoleData(S, ctx) {
  const {st} = ctx;
  const tip = armTip(S.arm);
  const reach = Math.hypot(tip[0], tip[1]);
  // clamp: the tibia's closure on the femur, while it has something in it or is armed
  const closure = pct((-S.arm.tibia - 120) / 47);
  const holding = S.caught && S.armed > 0.3 ? 1 : 0;
  const clamp = 24 + (holding ? 310 : 120 * S.armed) * closure * (S.strikeU >= 0 || holding ? 1 : 0.6) + (S.strikeU >= 0.15 && S.strikeU < 0.5 ? 180 : 0);
  const reachHist = [];
  for (let i = 0; i <= 48; i++) {
    const h = ctx.hist(1.6 - (i / 48) * 1.6);
    const tp = armTip((h ?? S).arm);
    reachHist.push(Math.hypot(tp[0], tp[1]));
  }
  // limb torque: stance share and knee bend for the walking legs, gravity moment for the arms
  const legsOut = st.mantis.out.legs || [];
  const down = legsOut.filter((l, i) => inStance(LEGS[i], S.phase, S.amp)).length || 1;
  const torque = {};
  LEGS.forEach((leg, i) => {
    const l = legsOut[i];
    if (!l) return;
    const stance = inStance(leg, S.phase, S.amp);
    const bend = Math.abs(l.k.tibia) / Math.PI;
    torque[leg.id] = pct((stance ? 0.28 + 0.9 / down : 0.12) + bend * 0.35 + (S.explodeK(0.5) > 0.5 ? -1 : 0));
  });
  const armT = pct(0.18 + Math.cos(S.arm.femur * D2R) * 0.25 + (reach - 0.25) * 0.6 + (S.strikeU >= 0 && S.strikeU < 0.66 ? 0.45 : 0));
  torque.L1 = armT;
  torque.R1 = pct(armT * 0.97);
  torque.NECK = pct(0.22 + Math.abs(S.headYaw) / 120 + S.neckRaise / 60);
  torque.WING = pct(0.06 + S.wings * 0.78 + S.plates * 0.18);
  torque.CORE = pct(0.08 + S.spinRate / 11);

  // target bearing and range from the head
  const headAt = [0.53, DIM.rideHeight + 0.25];
  const range = S.targetOn > 0.05 ? Math.hypot(TARGET[0] - headAt[0], TARGET[1] + DIM.rideHeight - headAt[1]) : null;
  const bearing = Math.atan2(-(TARGET[2]), TARGET[0] - headAt[0]) / D2R;

  const explodeOn = S.exE && S.exE.v === 1;
  const sub = (active, label, ok = true) => ({active: pct(active), label, ok});
  const subs = {
    arms: sub(S.strikeU >= 0 ? 1 : S.armed, S.strikeU >= 0 ? 'STRIKE' : S.caught && S.armed > 0.5 ? 'HOLDING' : S.armed > 0.5 ? 'ARMED' : 'LOCKED', true),
    head: sub(S.scanS < 2.4 || (S.lock > 0.5 && S.strikeU < 0) ? 1 : 0, S.lock > 0.5 ? 'LOCKED' : S.scanS < 2.4 ? 'SCANNING' : 'TRACKING'),
    core: sub(S.coreLift > 0.1 ? 1 : S.plates > 0.3 ? 0.6 : 0, S.coreLift > 0.5 ? 'SPINNING' : S.plates > 0.3 ? 'BAY OPEN' : 'DOCKED'),
    wings: sub(S.wings, S.wings > 0.5 ? 'DISPLAY' : 'FOLDED'),
    abdomen: sub(S.vents > 0.5 || S.curl > 0.5 ? 1 : 0, S.vents > 0.5 ? 'VENTING' : S.curl > 0.5 ? 'CURLED' : 'SEALED'),
    legs: sub(S.amp > 0.3 ? 1 : 0, S.amp > 0.3 ? '4 / 4 LIVE' : 'STANDING'),
  };
  if (explodeOn || (S.exE && S.exE.v === 0 && st.mantis.out.seated < ctx.total)) for (const k in subs) subs[k] = sub(0, 'APART', false);

  const strikeLoad = S.strikeU >= 0 ? (S.strikeU < 0.5 ? 1 : 1 - (S.strikeU - 0.5) * 1.6) : S.armed * 0.62 + 0.12;
  const strikeState = S.strikeU >= 0 ? `FIRED · ${Math.min(STRIKE_MS, Math.round(S.strikeU * STRIKE_MS))} ms` : S.armed > 0.5 ? 'ARMED' : 'IDLE';

  // callouts for the current view
  const want = CALL_VIEWS[ctx.view] ?? [];
  const vo = ss(1.0, 1.6, ctx.viewSince) * S.labels * (explodeOn ? 0 : 1);
  const callouts = CALLS.filter((c) => want.includes(c.k)).map((c) => ({...c, at: st.anchorPx(c.k), o: vo}));

  return {
    total: ctx.total,
    joints: ctx.joints,
    seated: st.mantis.out.seated ?? ctx.total,
    reach,
    clamp,
    reachHist,
    loopHz: (S.speed * GAIT.duty) / GAIT.stride + Math.abs(S.turn) * 0.25 * (GAIT.duty / GAIT.stride),
    gaitLabel: S.amp > 0.3 ? (Math.abs(S.turn) > 0.1 ? 'GAIT TURN' : 'GAIT WALK') : 'STANDING',
    torque,
    yaw: S.headYaw,
    range,
    targetBearing: bearing,
    targetOn: S.targetOn,
    iris: S.iris,
    opticLabel: S.lock > 0.5 ? 'LOCKED' : S.scanS < 2.4 ? 'SWEEP' : 'OCELLI 3 / 3',
    display: {labels: S.labels, explode: explodeOn ? 1 : 0, trail: S.trail, turntable: S.turntable},
    subs,
    strikeLoad: pct(strikeLoad),
    strikeState,
    clock: ctx.clock,
    duration: ctx.duration,
    paused: ctx.paused,
    logCur: ctx.log.cur,
    logNext: ctx.log.next,
    logTicks: ctx.log.ticks,
    logPos: ctx.log.pos,
    logFoot: ctx.log.foot,
    cap: ctx.cap,
    capO: ss(0, 0.45, ctx.capSince),
    callouts,
    cx: 800,
  };
}

// ------------------------------------------------------------ gait trails: the feet over the last 1.5 s, in the world
export function trailPoints(st, I, t, EV0 = EV) {
  return LEGS.map((leg) => {
    const pts = [];
    for (let k = 0; k < 90; k++) {
      const tt = t - 3 + (k / 89) * 3;
      const S = {x: I.x(tt), z: I.z(tt), psi: I.psi(tt)};
      const amp = Math.min(1, Math.max(0, speedAt(EV0, tt) / 0.12 + Math.abs(yawRateAt(EV0, tt)) * 0.9));
      const ft = footTarget(leg, I.phase(tt), amp, yawRateAt(EV0, tt));
      const w = st.toWorld(S, [ft[0], ft[1] + DIM.rideHeight, ft[2]]);
      pts.push([w.x, Math.max(0.003, w.y), w.z]);
    }
    return pts;
  });
}

// ------------------------------------------------------------ the operation log for the film
const LOG = SCRIPT.filter((e) => e.cap);
export function filmLog(t) {
  let i = 0;
  while (i < LOG.length - 1 && LOG[i + 1].t <= t) i++;
  const nx = LOG[i + 1];
  return {
    cur: LOG[i].cap[0],
    next: nx ? `NEXT · ${nx.cap[0]} @ ${nx.t.toFixed(1)}s` : 'NEXT · LOOP',
    ticks: LOG.map((e) => e.t / DURATION),
    pos: t / DURATION,
    foot: `EVERY 1-2 S SOMETHING FIRES · ${LOG.length} EVENTS`,
  };
}

/** One film frame at t: pose, camera, trails, console. Shared by the film and the live page's auto tour. */
export function filmFrame(st, ui, I, t, {paused = false} = {}) {
  const S = stateAt(t, EV, I);
  const vi = VIEWS_LIST.filter(([a]) => a <= t).length - 1;
  const [v0, view] = VIEWS_LIST[Math.max(0, vi)];
  const cam = toCam(S, viewAt(t), st);
  st.frame(S, cam);
  st.setTrails(S.trail > 0.02 ? trailPoints(st, I, t) : [], S.trail);
  const c = capAt(t);
  ui.update(
    consoleData(S, {
      st,
      total: st.mantis.parts.length,
      joints: st.mantis.joints,
      hist: (dt) => stateAt(Math.max(0, t - dt), EV, I),
      clock: t,
      duration: DURATION,
      paused,
      view,
      viewSince: vi <= 0 ? t + 10 : t - v0,
      log: filmLog(t),
      cap: c.cap,
      capSince: c === SCRIPT.find((e) => e.cap) ? t + 10 : t - c.t,
    }),
  );
  return {S, cam};
}

export function makeFilm() {
  return async ({cfg, canvas, capture}) => {
    const st = createMantisStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), cfg.badge ? {badge: cfg.badge} : {});
    const I = makeIntegrals(EV, -2, DURATION + 1);
    window.MANTIS = st;
    return {
      resize,
      render(t) {
        filmFrame(st, ui, I, t);
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
