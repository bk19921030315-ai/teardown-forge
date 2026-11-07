// CALLINECTES CB-9, the console film. The crab sidles in, raises its eyestalks and sweeps them on their own, locks a
// target drone, throws its claws up, takes the drone in a 60 ms crusher snap shown at 1/20 speed, feeds it to its
// mouthparts, opens its shell over the gills and runs the pump, seals up, sculls its paddles, comes apart into its 500
// parts, reseats them core-out, turns and sidles off. One event list (kin.js SCRIPT) drives the pose, the camera, the
// console and the score; render(t) is a pure function of t.
import {runSim} from '../kit/runtime.js';
import {clawGap, D2R, DIM, DURATION, footTarget, GAIT, inStance, LEGS, makeIntegrals, SCRIPT, SNAP_MS, speedAt, ss, stateAt, TARGET, toEvents, yawRateAt} from './kin.js';
import {createConsole} from './console.js';
import {createCrabStage} from './stage.js';

export const EV = toEvents(SCRIPT);
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'Callinectes CB-9', subtitle: ''}, director: {enabled: false}, watermark: ''};

// ------------------------------------------------------------ camera views
// each view is a function of u (seconds since it was switched on) and the state: a target in the body frame, an
// azimuth relative to the body's heading (0 = in front, looking at the face; 90 = the left side), elevation, distance
export const VIEW_FN = {
  hero: (u) => ({p: [0.12, 0.32, 0], az: 38 + 1.3 * u, el: 17, d: 3.5}),
  eyes: (u) => ({p: [0.26, 0.5, 0], az: 24 - 1.4 * u, el: 16, d: 2.05}),
  face: (u) => ({p: [0.5, 0.46, 0.08], az: -36 - 1.0 * u, el: 10, d: 2.7}),
  claws: (u) => ({p: [0.38, 0.5, 0], az: 14 + 1.2 * u, el: 11, d: 2.9}),
  snap: (u) => ({p: [0.55, 0.47, 0.18], az: -58 + 0.6 * u, el: 9, d: 2.3}),
  mouth: (u) => ({p: [0.27, 0.32, -0.02], az: 34 + 0.8 * u, el: 3, d: 1.4}),
  top: (u) => ({p: [-0.02, 0.42, 0], az: 122 + 2 * u, el: 48, d: 4.3}),
  gills: (u) => ({p: [-0.02, 0.44, 0], az: 100 + 2 * u, el: 46, d: 3.3}),
  rear: (u) => ({p: [-0.36, 0.42, 0.36], az: 222 + 2.5 * u, el: 20, d: 1.9}),
  wide: (u) => ({p: [0.0, 0.4, 0], az: 50 + 4 * u, el: 26, d: 5.6}),
  far: (u) => ({p: [0.0, 0.34, 0], az: 140 + 1.2 * u, el: 14, d: 4.0 + 0.2 * u}),
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
  {k: 'crusher', name: 'CRUSHER CLAW', sub: '22 MOLARS · 3 RAMS'},
  {k: 'cutter', name: 'CUTTER CLAW', sub: '22 TEETH · 3 RAMS'},
  {k: 'eyes', name: 'EYESTALKS', sub: '2 × 11 PARTS'},
  {k: 'antenna', name: 'ANTENNAE', sub: '2 × 23 SEGMENTS'},
  {k: 'shell', name: 'CARAPACE', sub: '2 HALVES · 24 TEETH'},
  {k: 'gills', name: 'GILLS', sub: '16 × 7 LAMELLAE'},
  {k: 'pump', name: 'PUMP', sub: 'ROTOR · 6 PISTONS'},
  {k: 'paddle', name: 'SWIM PADDLE', sub: '8 SLATS · SCULL'},
  {k: 'legR3', name: 'LEG R3', sub: '17 PARTS · IK'},
  {k: 'legL2', name: 'LEG L2', sub: '17 PARTS · IK'},
  {k: 'mouth', name: 'MOUTHPARTS', sub: '3 PAIRS · 22 PARTS'},
];
// which callouts each view shows
const CALL_VIEWS = {
  hero: ['crusher', 'eyes', 'legR3', 'paddle'],
  eyes: ['eyes', 'antenna'],
  face: ['eyes'],
  claws: ['crusher', 'cutter'],
  snap: ['crusher'],
  mouth: ['mouth', 'eyes'],
  top: ['shell', 'legR3'],
  gills: ['gills', 'pump'],
  rear: ['paddle', 'shell'],
  wide: [],
  far: ['paddle', 'legL2'],
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
  const gap = clawGap(S.crusher) * 1000;
  // grip: the crusher's closure, high while it holds the catch
  const closure = pct(1 - S.crusher.open / 55);
  const holding = S.caught && S.threat > 0.3 ? 1 : 0;
  const grip = 24 + closure * (holding ? 620 : 30 + 140 * S.threat) + (S.snapU >= 0.52 && S.snapU < 0.75 ? 320 * closure : 0);
  const gapHist = [];
  for (let i = 0; i <= 48; i++) {
    const h = ctx.hist(1.6 - (i / 48) * 1.6);
    gapHist.push(clawGap((h ?? S).crusher) * 1000);
  }
  // limb torque: stance share and knee bend for the walking legs, lift and reach for the claws, the paddles' sweep
  const legsOut = st.crab.out.legs || [];
  const down = legsOut.filter((l, i) => inStance(LEGS[i], S.phase, S.amp)).length || 1;
  const apart = S.explodeK(0.5) > 0.5;
  const torque = {};
  LEGS.forEach((leg, i) => {
    const l = legsOut[i];
    if (!l) return;
    const stance = inStance(leg, S.phase, S.amp);
    const bend = Math.abs(l.k.carpus) / Math.PI;
    torque[leg.id] = apart ? 0 : pct((stance ? 0.2 + 1.2 / down : 0.1) + bend * 0.3);
  });
  const clawT = (P) => pct(0.16 + Math.sin(P.pitch * D2R) * 0.6 + (P.merus + 10) / 160);
  torque['CLAW L'] = apart ? 0 : clawT(S.cutter);
  torque['CLAW R'] = apart ? 0 : pct(clawT(S.crusher) + (S.snapU >= 0.52 && S.snapU < 0.7 ? 0.35 : 0));
  torque.PADDLE = apart ? 0 : pct(0.08 + S.paddle * 0.75 * (0.6 + 0.4 * Math.abs(Math.sin(S.scull))));

  // target bearing and range from between the eyestalks
  const eyeAt = [0.26, 0.15];
  const range = S.targetOn > 0.05 ? Math.hypot(TARGET[0] - eyeAt[0], TARGET[1] - eyeAt[1], TARGET[2]) : null;
  const bearing = Math.atan2(-TARGET[2], TARGET[0] - eyeAt[0]) / D2R;

  const explodeOn = S.exE && S.exE.v === 1;
  const sub = (active, label, ok = true) => ({active: pct(active), label, ok});
  const subs = {
    claws: sub(S.snapU >= 0 ? 1 : S.threat, S.snapU >= 0 ? 'SNAP' : holding && S.threat > 0.5 ? 'HOLDING' : S.threat > 0.5 ? 'THREAT' : 'FOLDED'),
    eyes: sub(S.scanS < 2.2 || (S.lock > 0.5 && S.snapU < 0) ? 1 : 0, S.lock > 0.5 ? 'LOCKED' : S.scanS < 2.2 ? 'SWEEP' : S.eyes > 0.5 ? 'TRACKING' : 'STOWED'),
    core: sub(S.pump > 0.3 ? 1 : S.shell > 0.3 ? 0.6 : 0, S.pump > 0.5 ? 'PUMPING' : S.shell > 0.3 ? 'SHELL OPEN' : 'SEALED'),
    paddles: sub(S.paddle, S.paddle > 0.5 ? 'SCULLING' : 'STOWED'),
    mouth: sub(S.mouth, S.mouth > 0.5 ? 'FEEDING' : 'CLOSED'),
    legs: sub(S.amp > 0.3 ? 1 : 0, S.amp > 0.3 ? '6 / 6 LIVE' : 'STANDING'),
  };
  if (explodeOn || (S.exE && S.exE.v === 0 && st.crab.out.seated < ctx.total)) for (const k in subs) subs[k] = sub(0, 'APART', false);

  const snapMs = Math.min(SNAP_MS, Math.round(S.snapU * SNAP_MS));
  const strikeLoad = S.snapU >= 0 ? (S.snapU < 0.62 ? 0.5 + S.snapU * 0.8 : 1 - (S.snapU - 0.62) * 1.4) : S.threat * 0.6 + 0.12;
  const strikeState = S.snapU >= 0 ? `SNAP · ${snapMs} ms` : S.threat > 0.5 ? 'THREAT' : 'IDLE';

  // callouts for the current view
  const want = CALL_VIEWS[ctx.view] ?? [];
  const vo = ss(1.0, 1.6, ctx.viewSince) * S.labels * (explodeOn ? 0 : 1);
  const callouts = CALLS.filter((c) => want.includes(c.k)).map((c) => ({...c, at: st.anchorPx(c.k), o: vo}));

  return {
    total: ctx.total,
    joints: ctx.joints,
    seated: st.crab.out.seated ?? ctx.total,
    reach: gap,
    clamp: grip,
    reachHist: gapHist,
    loopHz: ((Math.abs(S.speed) + Math.abs(S.turn) * 0.3) * GAIT.duty) / GAIT.stride,
    gaitLabel: S.amp > 0.3 ? (Math.abs(S.turn) > 0.1 ? 'TURN ON SPOT' : 'SIDEWAYS') : 'STANDING',
    torque,
    yaw: S.eyeYaw[1],
    yaw2: S.eyeYaw[0],
    range,
    targetBearing: bearing,
    targetOn: S.targetOn,
    iris: S.iris,
    opticLabel: S.lock > 0.5 ? 'LOCKED' : S.scanS < 2.2 ? 'SWEEP' : S.eyes > 0.5 ? 'STALKS UP' : 'STALKS DOWN',
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
      const amp = Math.min(1, Math.max(0, Math.abs(speedAt(EV0, tt)) / 0.1 + Math.abs(yawRateAt(EV0, tt)) * 0.9));
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
      total: st.crab.parts.length,
      joints: st.crab.joints,
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
    const st = createCrabStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), cfg.badge ? {badge: cfg.badge} : {});
    const I = makeIntegrals(EV, -2, DURATION + 1);
    window.CRAB = st;
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
