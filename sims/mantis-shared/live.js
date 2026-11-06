// HX-6 as a page you drive: the film's console over the stage, in real time. Left alone it plays the film as an auto
// tour; a click on a subsystem or a display chip, a drag, the wheel or a key hands control to the visitor, and 25 s
// of quiet hands it back. The visitor's buttons push events onto their own event list, and the same stateAt() turns
// those into the pose, so a strike here is the film's strike. Walk speed, heading and gyro spin are integrated frame
// by frame instead of from the film's tables.
import {warmComposer} from '../kit/warm.js';
import {clamp, D2R, DURATION, lastEv, makeIntegrals, ramp, speedAt, spinRateAt, stateAt, STRIKE_DUR, WALK_V, yawRateAt, cyclesPerMetre} from './kin.js';
import {C, createConsole, DISPLAY_KEYS, SUBSYS} from './console.js';
import {consoleData, EV as FILM_EV, filmFrame, trailPoints} from './film.js';
import {createMantisStage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;

const CSS = `
html,body{background:#0c0e10;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
[data-chip],[data-sub],.playhit{pointer-events:auto;cursor:pointer}
[data-chip]:hover{border-color:${C.lime}!important}
[data-sub]:hover{background:rgba(198,241,53,.05)}
.tourchip{position:absolute;left:1030px;top:146px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:24px;padding:0 12px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(17,19,22,.8);color:${C.ink};font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:1.6px;white-space:nowrap;pointer-events:auto;cursor:pointer}
.tourchip i{display:block;width:7px;height:7px;border-radius:50%;background:${C.lime}}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.keys{position:absolute;left:1288px;top:872px;width:287px;text-align:center;white-space:nowrap;font:500 8.5px 'JetBrains Mono',monospace;letter-spacing:.6px;color:${C.mute}}
.turn{position:fixed;left:0;right:0;bottom:14px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.mute};text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
#gl{transition:opacity .35s}
`;

const CAPS = {
  arms: [['ARMS UNLOCK', '42 SPINES FLARE · NECK UP'], ['STRIKE', `64 ms REAL · SHOWN AT 1/20`]],
  scan: ['OPTICS SCAN', '2 EYES · 3 OCELLI · ±55° SWEEP'],
  lock: ['TARGET LOCK', 'BEARING FROM THE PSEUDOPUPILS'],
  unlock: ['TARGET RELEASED', 'OPTICS BACK TO IDLE DRIFT'],
  coreOn: ['GYRO SPIN', 'BAY OPEN · 3 GIMBALS · 8 PISTONS'],
  coreOff: ['CORE DOCK', 'SLED DOWN · PLATES SEALED'],
  wingsOn: ['WING DISPLAY', '20 RIBS · 18 PANELS · 120° FAN'],
  wingsOff: ['WINGS FOLDED', 'TEGMINA DOWN'],
  ventsOn: ['VENTING', '20 LOUVERS OPEN'],
  ventsOff: ['VENTS SEALED', '20 LOUVERS SHUT'],
  walkOn: ['STALKING', 'GAIT WALK · 4 LEGS LIVE'],
  walkOff: ['STANDING', 'FEET PLANTED · 4 / 4'],
  turnL: ['TURNING', 'YAW LEFT · DIAGONAL PAIRS'],
  turnR: ['TURNING', 'YAW RIGHT · DIAGONAL PAIRS'],
  explodeOn: ['EXPLODED', '356 MOVING PARTS · 1 SKELETON'],
  explodeOff: ['REASSEMBLY', 'SEATED CORE OUT'],
  labelsOn: ['LABELS ON', 'CALLOUTS FOLLOW THE PARTS'],
  labelsOff: ['LABELS OFF', 'THE MACHINE ALONE'],
  trailOn: ['GAIT TRAIL', 'THE LAST 3 S OF EACH FOOT'],
  trailOff: ['TRAIL OFF', ''],
  ttOn: ['TURNTABLE', 'CAMERA ORBITS 12°/s'],
  ttOff: ['TURNTABLE OFF', 'DRAG TO ORBIT'],
};

export function runLive() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);

  const st = createMantisStage({canvas});
  const ui = createConsole(app);
  const tourI = makeIntegrals(FILM_EV, -2, DURATION + 1);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 4, shadow: 2048, bloomOn: true, pr: 2},
    {samples: 0, shadow: 1024, bloomOn: true, pr: 1.3},
    {samples: 0, shadow: 512, bloomOn: false, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    scale = Math.min(innerWidth / W, innerHeight / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const keys = document.createElement('div');
  keys.className = 'keys';
  keys.textContent = 'DRAG ORBIT · WHEEL ZOOM · 1–6 · E · ←/→ · SPACE';
  ui.root.appendChild(keys);
  const turnNote = document.createElement('div');
  turnNote.className = 'turn';
  turnNote.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(turnNote);
  const playHit = document.createElement('div');
  playHit.className = 'playhit';
  Object.assign(playHit.style, {position: 'absolute', left: '42px', top: '788px', width: '44px', height: '44px', borderRadius: '50%'});
  ui.root.appendChild(playHit);

  // ------------------------------------------------------------ state
  let mode = 'tour';
  let tourT0 = performance.now() / 1000;
  let tourT = 0;
  let paused = false;
  let lastInput = -1e9;
  let ut = 0; // the visitor's clock
  const EVu = [];
  const caps = [];
  const integ = {x: 0, z: 0, psi: 0, phase: 0, spin: 0};
  const Iu = {x: () => integ.x, z: () => integ.z, psi: () => integ.psi, phase: () => integ.phase, spin: () => integ.spin};
  const hist = []; // {t, x, z, psi, phase, S}
  const orbit = {az: 0, el: 14, d: 3.4, ty: 0.45};
  let lastS = null;
  let lastCam = null;

  const push = (k, v, at = ut) => {
    EVu.push({t: at, k, v});
    EVu.sort((a, b) => a.t - b.t);
  };
  const cap = (c, at = ut) => {
    caps.push({t: at, cap: c});
    caps.sort((a, b) => a.t - b.t);
  };
  const val = (k) => ramp(EVu, k, ut + 5, 0.01);

  // hand the tour's current state to the visitor: every key settled at its tour value, the integrals copied
  const takeOver = () => {
    if (mode === 'user') return;
    mode = 'user';
    const t = tourT;
    ut = 100;
    EVu.length = 0;
    caps.length = 0;
    hist.length = 0;
    for (const k of ['walk', 'turn', 'lock', 'armed', 'plates', 'core', 'vents', 'wings', 'labels', 'trail', 'turntable']) {
      const e = lastEv(FILM_EV, k, t);
      if (e) EVu.push({t: ut - 20 + (e.t - t), k, v: e.v});
    }
    for (const k of ['scan', 'strike', 'explode']) {
      const e = lastEv(FILM_EV, k, t);
      if (e) EVu.push({t: ut + (e.t - t), k, v: e.v});
    }
    // a strike or reassembly in flight keeps running on the visitor's clock
    EVu.sort((a, b) => a.t - b.t);
    integ.x = tourI.x(t);
    integ.z = tourI.z(t);
    integ.psi = tourI.psi(t);
    integ.phase = tourI.phase(t);
    integ.spin = tourI.spin(t);
    if (lastCam) {
      orbit.az = (lastCam.az - integ.psi) / D2R;
      orbit.el = clamp(lastCam.el / D2R, 8, 30);
      orbit.d = Math.max(3.2, lastCam.d);
    }
    cap(['YOU HAVE CONTROL', 'PICK A SUBSYSTEM OR A DISPLAY MODE']);
  };
  const touch = () => {
    lastInput = performance.now() / 1000;
    takeOver();
  };

  // ------------------------------------------------------------ the visitor's actions
  const S0 = () => lastS || stateAt(ut, EVu, Iu);
  const act = {
    arms() {
      const S = S0();
      if (S.strikeU >= 0) return;
      let t = ut;
      if (S.targetOn < 0.5 || S.caught) {
        push('scan', 1, t);
        cap(CAPS.scan, t);
        push('lock', 1, t + 2.4);
        cap(CAPS.lock, t + 2.4);
        t += 2.6;
      } else if (S.lock < 0.5) {
        push('lock', 1, t);
        t += 0.6;
      }
      push('armed', 1, t);
      cap(CAPS.arms[0], t);
      push('strike', 1, t + 1.3);
      cap(CAPS.arms[1], t + 1.3);
      push('armed', 0, t + 1.3 + STRIKE_DUR + 1.4);
      push('lock', 0, t + 1.3 + STRIKE_DUR + 1.4);
    },
    head() {
      if (val('lock') > 0.5) {
        push('lock', 0);
        cap(CAPS.unlock);
      } else {
        push('scan', 1);
        cap(CAPS.scan);
        push('lock', 1, ut + 2.4);
        cap(CAPS.lock, ut + 2.4);
      }
    },
    core() {
      if (val('core') > 0.5 || val('plates') > 0.5) {
        push('core', 0);
        push('vents', 0);
        push('plates', 0, ut + 0.8);
        cap(CAPS.coreOff);
      } else {
        push('plates', 1);
        push('core', 1, ut + 0.7);
        push('vents', 1, ut + 0.7);
        cap(CAPS.coreOn);
      }
    },
    wings() {
      const on = val('wings') > 0.5;
      push('wings', on ? 0 : 1);
      cap(on ? CAPS.wingsOff : CAPS.wingsOn);
    },
    abdomen() {
      const on = val('vents') > 0.5;
      push('vents', on ? 0 : 1);
      cap(on ? CAPS.ventsOff : CAPS.ventsOn);
    },
    legs() {
      const on = val('walk') > 0.05;
      push('walk', on ? 0 : WALK_V);
      if (on) push('turn', 0);
      cap(on ? CAPS.walkOff : CAPS.walkOn);
    },
    labels() {
      const on = val('labels') > 0.5;
      push('labels', on ? 0 : 1);
      cap(on ? CAPS.labelsOff : CAPS.labelsOn);
    },
    explode() {
      const e = lastEv(EVu, 'explode', ut);
      const on = e && e.v === 1;
      push('explode', on ? 0 : 1);
      cap(on ? CAPS.explodeOff : CAPS.explodeOn);
    },
    trail() {
      const on = val('trail') > 0.5;
      push('trail', on ? 0 : 1);
      cap(on ? CAPS.trailOff : CAPS.trailOn);
    },
    turntable() {
      const on = val('turntable') > 0.5;
      push('turntable', on ? 0 : 1);
      cap(on ? CAPS.ttOff : CAPS.ttOn);
    },
  };
  for (const [k] of SUBSYS)
    ui.rows[k].addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      act[k]();
    });
  for (const [k] of DISPLAY_KEYS)
    ui.chips[k].addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      act[k]();
    });
  const togglePause = () => {
    touch();
    paused = !paused;
  };
  playHit.addEventListener('click', togglePause);
  tourChip.addEventListener('click', () => {
    if (mode === 'user') {
      mode = 'tour';
      tourT0 = performance.now() / 1000;
      paused = false;
    } else touch();
  });

  // orbit, zoom
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    touch();
    drag = {x: e.clientX, y: e.clientY, az: orbit.az, el: orbit.el};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    orbit.az = drag.az - ((e.clientX - drag.x) / scale) * 0.3;
    orbit.el = clamp(drag.el + ((e.clientY - drag.y) / scale) * 0.2, 2, 72);
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      touch();
      orbit.d = clamp(orbit.d * Math.exp(e.deltaY * 0.0012), 1.2, 7);
    },
    {passive: false},
  );
  const held = {};
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const map = {1: 'arms', 2: 'head', 3: 'core', 4: 'wings', 5: 'abdomen', 6: 'legs', l: 'labels', e: 'explode', t: 'trail', r: 'turntable'};
    if (map[k]) {
      touch();
      act[map[k]]();
    } else if (k === ' ') togglePause();
    else if ((k === 'arrowleft' || k === 'arrowright') && !held[k]) {
      touch();
      held[k] = true;
      const s = k === 'arrowleft' ? 1 : -1;
      push('turn', 0.55 * s);
      if (val('walk') < 0.05) push('walk', 0.12);
      cap(s > 0 ? CAPS.turnL : CAPS.turnR);
    } else if (k === 'arrowup') {
      touch();
      act.legs();
    } else return;
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright') {
      held[k] = false;
      push('turn', 0);
    }
  });

  // ------------------------------------------------------------ the visitor's frame
  const histAt = (t) => {
    if (!hist.length) return null;
    if (t <= hist[0].t) return hist[0];
    for (let i = hist.length - 1; i > 0; i--) if (hist[i - 1].t <= t) return hist[i];
    return hist[hist.length - 1];
  };
  const histI = {
    x: (t) => histAt(t)?.x ?? integ.x,
    z: (t) => histAt(t)?.z ?? integ.z,
    psi: (t) => histAt(t)?.psi ?? integ.psi,
    phase: (t) => histAt(t)?.phase ?? integ.phase,
  };
  const userFrame = (dt) => {
    if (!paused) {
      ut += dt;
      const v = speedAt(EVu, ut);
      const w = yawRateAt(EVu, ut);
      integ.psi += w * dt;
      integ.x += v * Math.cos(integ.psi) * dt;
      integ.z -= v * Math.sin(integ.psi) * dt;
      integ.phase += (v + Math.abs(w) * 0.25) * cyclesPerMetre * dt;
      integ.spin += spinRateAt(EVu, ut) * dt;
      // keep the walk on the floor's lit area: a soft leash back toward the origin
      const r = Math.hypot(integ.x, integ.z);
      if (r > 4) {
        integ.x *= 4 / r;
        integ.z *= 4 / r;
      }
    }
    const S = stateAt(ut, EVu, Iu);
    lastS = S;
    hist.push({t: ut, x: integ.x, z: integ.z, psi: integ.psi, phase: integ.phase, S});
    while (hist.length > 2 && hist[0].t < ut - 3.2) hist.shift();
    if (!paused && S.turntable > 0.5) orbit.az += 12 * dt;
    const target = st.toWorld(S, [0.0, orbit.ty, 0]);
    const cam = {tx: target.x, ty: target.y, tz: target.z, az: orbit.az * D2R + S.psi, el: orbit.el * D2R, d: orbit.d, sx: 0, sy: 0};
    st.frame(S, cam);
    st.setTrails(S.trail > 0.02 ? trailPoints(st, histI, ut, EVu) : [], S.trail);
    let c = caps[0] ?? {t: ut, cap: ['', '']};
    for (const x of caps) if (x.t <= ut) c = x;
    const since = performance.now() / 1000 - lastInput;
    const ticks = EVu.filter((e) => e.t > ut - 30 && e.t <= ut).map((e) => (e.t - (ut - 30)) / 30);
    ui.update(
      consoleData(S, {
        st,
        total: st.mantis.parts.length,
        joints: st.mantis.joints,
        hist: (d) => histAt(ut - d)?.S ?? null,
        clock: ut - 100,
        duration: Math.max(0, ut - 100),
        paused,
        view: 'hero',
        viewSince: 10,
        log: {cur: c.cap[0], next: `YOU HAVE CONTROL · TOUR IN ${Math.max(0, Math.ceil(IDLE - since))}s`, ticks, pos: 1, foot: `LAST 30 S · ${ticks.length} EVENTS`},
        cap: c.cap,
        capSince: ut - c.t,
      }),
    );
    if (since > IDLE && !drag) {
      mode = 'tour';
      tourT0 = performance.now() / 1000;
      paused = false;
    }
  };

  // ------------------------------------------------------------ loop, frame-time watchdog
  let last = performance.now();
  let acc = 0;
  let n = 0;
  let checks = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === 'tour') {
      if (paused) tourT0 += dt;
      tourT = (((now / 1000 - tourT0) % DURATION) + DURATION) % DURATION;
      const r = filmFrame(st, ui, tourI, tourT, {paused});
      lastCam = r.cam;
      lastS = r.S;
    } else userFrame(dt);
    tourChip.className = `tourchip ${mode === 'tour' ? 'on' : ''}`;
    tourChip.innerHTML = mode === 'tour' ? '<i></i>AUTO TOUR · CLICK ANY PANEL TO DRIVE' : '<i></i>YOU’RE DRIVING · CLICK TO RESUME THE TOUR';
    // step down a tier when frames run long
    acc += dt;
    n++;
    if (acc > 2) {
      const ms = (acc / n) * 1000;
      if (ms > 24 && tier < TIERS.length - 1 && checks < 6) {
        tier++;
        applyTier();
      }
      checks++;
      acc = 0;
      n = 0;
    }
    requestAnimationFrame(loop);
  };

  // first frame after the shaders are warm
  const S = stateAt(0, FILM_EV, tourI);
  filmFrame(st, ui, tourI, 0);
  warmComposer(st.renderer, st.composer, st.scene, st.camera)
    .catch(() => {})
    .then(() => {
      tourT0 = performance.now() / 1000;
      last = performance.now();
      requestAnimationFrame(loop);
      window.SIM = {ready: true, st, S};
    });
}
