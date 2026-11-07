// MANIS MP-6, the console film. The pangolin forages in, noses down on an ant trail, shoots its tongue across it (160 ms
// shown at 1/8), digs with its foreclaws, flares every scale, rolls up into a ball, rolls one full turn, lifts its
// armour to show the spine drive, unrolls, comes apart into its 600 parts, reseats them core-out, grips with its tail
// and wanders off. One event list (kin.js SCRIPT) drives the pose, the camera, the console and the score; render(t) is
// a pure function of t.
import {runSim} from '../kit/runtime.js';
import {D2R, DURATION, footTarget, GAIT, HEAD, inStance, legRoot, LEGS, makeIntegrals, rollAt, SCRIPT, speedAt, spineFK, ss, stateAt, toEvents, TONGUE_MS, WALK_H} from './kin.js';
import {createConsole} from './console.js';
import {createPangolinStage} from './stage.js';

export const EV = toEvents(SCRIPT);
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'dark', hud: {enabled: false, title: 'Manis MP-6', subtitle: ''}, director: {enabled: false}, watermark: ''};

// ------------------------------------------------------------ camera views
// a target in the body frame (y is height above the floor), an azimuth relative to the heading (0 = facing the
// snout, 90 = the left side), elevation, distance; views on the ball follow its centre
const ballP = (S) => [S.fk.centre[0], S.rootY + S.fk.centre[1], 0];
export const VIEW_FN = {
  hero: (u) => ({p: [-0.18, 0.3, 0], az: 40 + 1.2 * u, el: 15, d: 3.5}),
  head: (u) => ({p: [0.42, 0.22, 0], az: 34 - 1.2 * u, el: 10, d: 1.7}),
  tongue: (u) => ({p: [0.68, 0.14, 0], az: -84 + 0.6 * u, el: 9, d: 1.75}),
  claws: (u) => ({p: [0.5, 0.1, 0], az: 52 + 1.0 * u, el: 7, d: 1.55}),
  side: (u) => ({p: [-0.22, 0.3, 0], az: 78 + 1.0 * u, el: 14, d: 3.3}),
  roll: (u, S) => ({p: ballP(S), az: 60 + 2.0 * u, el: 14, d: 2.5}),
  rolling: (u, S) => ({p: ballP(S), az: 92 + 0.5 * u, el: 10, d: 3.0}),
  core: (u, S) => ({p: ballP(S), az: 40 + 3.0 * u, el: 30, d: 2.2}),
  hero2: (u) => ({p: [-0.12, 0.28, 0], az: -36 + 1.0 * u, el: 14, d: 3.3}),
  wide: (u) => ({p: [-0.22, 0.32, 0], az: 50 + 4.0 * u, el: 24, d: 6.6}),
  tail: (u) => ({p: [-0.75, 0.2, 0], az: 150 + 2.0 * u, el: 18, d: 2.5}),
  far: (u) => ({p: [-0.1, 0.3, 0], az: 200 + 1.0 * u, el: 14, d: 4.0 + 0.2 * u}),
};
const lerpDeg = (a, b, k) => a + ((((b - a + 540) % 360) - 180) * k);
export const VIEWS_LIST = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export function viewAt(t, S, list = VIEWS_LIST) {
  let i = 0;
  while (i < list.length - 1 && list[i + 1][0] <= t) i++;
  const cur = VIEW_FN[list[i][1]](t - list[i][0], S);
  if (i === 0) return cur;
  const prev = VIEW_FN[list[i - 1][1]](t - list[i - 1][0], S);
  const k = ss(list[i][0], list[i][0] + 1.6, t);
  const o = {p: prev.p.map((v, j) => v + (cur.p[j] - v) * k), az: lerpDeg(prev.az, cur.az, k), el: prev.el + (cur.el - prev.el) * k, d: prev.d + (cur.d - prev.d) * k};
  const swing = Math.min(1, Math.abs(((cur.az - prev.az + 540) % 360) - 180) / 90);
  o.el += 6 * Math.sin(Math.PI * k) * swing;
  o.d += 0.5 * swing * Math.sin(Math.PI * k);
  return o;
}
export const toCam = (S, v, st) => {
  const w = st.toWorld(S, v.p);
  return {tx: w.x, ty: w.y, tz: w.z, az: v.az * D2R + S.psi, el: v.el * D2R, d: v.d, sx: 0, sy: 0};
};

// ------------------------------------------------------------ callouts
const CALLS = [
  {k: 'scales', name: 'SCALE ARMOUR', sub: '317 SCALES · HINGED'},
  {k: 'spine', name: 'SPINE DRIVE', sub: '30 VERTEBRAE · 26 RAMS'},
  {k: 'tail', name: 'TAIL', sub: '16 LINKS · 15 RAMS'},
  {k: 'head', name: 'HEAD', sub: '25 SCALES · SNIFFING NOSE'},
  {k: 'tongue', name: 'TONGUE', sub: '30 LINKS · 0.48 m'},
  {k: 'claws', name: 'FORECLAWS RF', sub: '3 BIG · 2 SMALL'},
];
const CALL_VIEWS = {
  hero: ['scales', 'head', 'tail'],
  head: ['head'],
  tongue: ['tongue'],
  claws: ['claws'],
  side: ['scales', 'tail'],
  roll: ['scales'],
  rolling: [],
  core: ['spine'],
  hero2: ['scales', 'head'],
  wide: [],
  tail: ['tail'],
  far: ['tail'],
};

// ------------------------------------------------------------ console data for a frame
const pct = (x) => Math.min(1, Math.max(0, x));
export const capAt = (t, script = SCRIPT) => {
  let c = script.find((e) => e.cap);
  for (const e of script) if (e.cap && e.t <= t) c = e;
  return c;
};
const CURL0 = (() => {
  const f = spineFK(0);
  return ((f.B[f.B.length - 1].a - Math.PI) - f.head.a) / D2R;
})();
/** The spine's curl beyond its walking arch, degrees, from the FK of the state. */
export const curlOf = (S) => Math.max(0, ((S.fk.B[S.fk.B.length - 1].a - Math.PI) - S.fk.head.a) / D2R - CURL0);

export function consoleData(S, ctx) {
  const {st} = ctx;
  const curl = curlOf(S);
  const curlHist = [];
  for (let i = 0; i <= 48; i++) curlHist.push(curlOf(ctx.hist(1.6 - (i / 48) * 1.6) ?? S));
  const curling = Math.abs(curl - curlHist[curlHist.length - 4]) / 0.1; // degrees per second, roughly
  const torque = 14 + curling * 0.28 + 60 * S.rollV + 30 * S.flare;
  const legsOut = st.pango.out.legs || [];
  const down = legsOut.filter((l, i) => inStance(LEGS[i], S.phase, S.amp)).length || 1;
  const apart = S.explodeK(0.5) > 0.5;
  const tq = {};
  LEGS.forEach((leg, i) => {
    const l = legsOut[i];
    if (!l) return;
    const stance = inStance(leg, S.phase, S.amp);
    const bend = Math.abs(l.a.a2 - l.a.a1) / Math.PI;
    tq[leg.id] = apart ? 0 : pct(((stance ? 0.2 + 1.0 / down : 0.1) + bend * 0.3 + (leg.front ? S.dig * 0.35 : 0)) * (1 - S.roll * 0.85));
  });
  tq.SPINE = apart ? 0 : pct(0.15 + S.roll * 0.45 + S.rollV * 0.5 + curling / 900);
  tq.TAIL = apart ? 0 : pct(0.12 + S.tailK * 0.7 + S.roll * 0.2);
  tq.NECK = apart ? 0 : pct(0.14 + Math.abs(S.headYaw) / 60 + S.lock * 0.2);
  tq.TONGUE = apart ? 0 : pct(0.04 + S.ext * 0.88);
  tq.CLAWS = apart ? 0 : pct(0.1 + S.dig * 0.8);

  // the ant trail from the snout tip
  const tipX = S.fk.head.x + Math.cos(S.fk.head.a) * HEAD.len;
  const range = S.antsOn > 0 && S.lock > 0.3 ? Math.max(0.05, S.trailX - tipX) : null;

  const explodeOn = S.exE && S.exE.v === 1;
  const sub = (active, label, ok = true) => ({active: pct(active), label, ok});
  const subs = {
    scales: sub(Math.max(S.flare, S.roll * 0.6), S.flare > 0.5 ? 'FLARED' : S.roll > 0.5 ? 'SHELL' : 'SMOOTH'),
    head: sub(S.ext > 0.05 || S.lock > 0.5 || S.scanS < 1.8 ? 1 : 0, S.ext > 0.05 ? 'TONGUE OUT' : S.lock > 0.5 ? 'ON THE TRAIL' : S.scanS < 1.8 ? 'SNIFFING' : S.roll > 0.5 ? 'TUCKED' : 'IDLE'),
    spine: sub(Math.max(S.roll, S.rollV / 0.75), S.rollV > 0.1 ? 'ROLLING' : S.roll > 0.5 ? 'CURLED' : 'ARCHED'),
    claws: sub(S.dig, S.dig > 0.5 ? 'DIGGING' : 'KNUCKLES'),
    tail: sub(S.tailK, S.tailK > 0.5 ? 'GRIP' : S.roll > 0.5 ? 'WRAPPED' : 'TRAILING'),
    legs: sub(S.amp > 0.3 ? 1 : 0, S.amp > 0.3 ? 'WALKING' : S.roll > 0.5 ? 'TUCKED' : 'STANDING'),
  };
  if (explodeOn || (S.exE && S.exE.v === 0 && st.pango.out.seated < ctx.total)) for (const k in subs) subs[k] = sub(0, 'APART', false);

  const strikeLoad = 0.1 + 0.5 * S.roll + 0.4 * (S.rollV / 0.75) + 0.2 * S.flare;
  const strikeState = S.rollV > 0.1 ? 'ROLLING' : S.roll > 0.5 ? 'CURLED' : S.flare > 0.5 ? 'FLARED' : 'IDLE';

  const want = CALL_VIEWS[ctx.view] ?? [];
  const vo = ss(1.0, 1.6, ctx.viewSince) * S.labels * (explodeOn ? 0 : 1);
  const callouts = CALLS.filter((c) => want.includes(c.k)).map((c) => ({...c, at: st.anchorPx(c.k), o: vo}));

  return {
    total: ctx.total,
    joints: ctx.joints,
    seated: st.pango.out.seated ?? ctx.total,
    reach: curl,
    clamp: torque,
    reachHist: curlHist,
    loopHz: (S.speed * GAIT.duty) / GAIT.stride,
    gaitLabel: S.rollV > 0.1 ? 'ROLLING' : S.roll > 0.5 ? 'ROLLED' : S.dig > 0.5 ? 'DIGGING' : S.amp > 0.3 ? 'LATERAL WALK' : 'STANDING',
    torque: tq,
    yaw: S.headYaw,
    yaw2: null,
    range,
    targetBearing: 0,
    targetOn: S.antsOn * (S.ate > 0.4 ? 0 : 1),
    iris: S.sniff,
    opticLabel: S.ext > 0.05 ? `TONGUE · ${TONGUE_MS} ms` : S.lock > 0.5 ? 'ON THE TRAIL' : S.roll > 0.5 ? 'TUCKED' : 'SNIFFING',
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

// ------------------------------------------------------------ gait trails: each foot over the last 3 s, in the world
export function trailPoints(st, I, t, EV0 = EV) {
  const samples = Array.from({length: 60}, (_, k) => {
    const tt = t - 3 + (k / 59) * 3;
    const fk = spineFK(rollAt(EV0, tt));
    return {tt, fk, x: I.x(tt), amp: Math.min(1, speedAt(EV0, tt) / 0.08)};
  });
  return LEGS.map((leg) =>
    samples.map(({tt, fk, x, amp}) => {
      const [rx] = legRoot(leg, fk);
      const ft = footTarget(leg, I.phase(tt), amp, rx, 0, tt);
      const w = st.toWorld({x, z: 0, psi: 0}, [ft[0], 0.004, leg.side * leg.z]);
      return [w.x, w.y, w.z];
    }),
  );
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

export function filmFrame(st, ui, I, t, {paused = false} = {}) {
  const S = stateAt(t, EV, I);
  const vi = VIEWS_LIST.filter(([a]) => a <= t).length - 1;
  const [v0, view] = VIEWS_LIST[Math.max(0, vi)];
  const cam = toCam(S, viewAt(t, S), st);
  st.frame(S, cam);
  st.setTrails(S.trail > 0.02 ? trailPoints(st, I, t) : [], S.trail);
  const c = capAt(t);
  ui.update(
    consoleData(S, {
      st,
      total: st.pango.parts.length,
      joints: st.pango.joints,
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
    const st = createPangolinStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'), cfg.badge ? {badge: cfg.badge} : {});
    const I = makeIntegrals(EV, -2, DURATION + 1);
    window.PANGO = st;
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
