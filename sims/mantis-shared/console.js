// The HX-6 console, after the reference film's layout: a lime title block, three instrument panels down each side, an
// operation log along the bottom, the state's caption under the machine and leader-line callouts on it. Fixed
// 1600 x 900 CSS layout. update(d) redraws every live part from the frame's data, so a captured frame depends only on t.
import {ACCENT} from './mantis.js';

export const C = {
  lime: ACCENT,
  ink: '#e8ebe5',
  mute: '#7b838a',
  faint: '#4a5056',
  line: 'rgba(255,255,255,.085)',
  panel: 'rgba(17,19,22,.74)',
  dark: '#0c0e10',
};
export const DISPLAY_KEYS = [
  ['labels', 'LABELS'],
  ['explode', 'EXPLODED'],
  ['trail', 'GAIT TRAIL'],
  ['turntable', 'TURNTABLE'],
];
export const SUBSYS = [
  ['arms', 'RAPTOR ARMS', '2 ARMS · 42 SPINES'],
  ['head', 'HEAD & OPTICS', '2 EYES · 16 IRIS · 40 ANT'],
  ['core', 'GYRO CORE', '3 GIMBALS · 8 PISTONS'],
  ['wings', 'WING FAN', '20 RIBS · 18 PANELS'],
  ['abdomen', 'ABDOMEN', '10 SEGMENTS · 20 VENTS'],
  ['legs', 'LEGS', '4 LEGS · 6 JOINTS EACH'],
];
const TORQUE_ROWS = ['L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'NECK', 'WING', 'CORE'];

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.vig{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 46%,rgba(0,0,0,0) 52%,rgba(0,0,0,.55) 100%)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:7px;backdrop-filter:blur(4px)}
.ph{position:absolute;left:14px;top:13px;right:14px;display:flex;align-items:center;font:600 15.5px 'JetBrains Mono',monospace;letter-spacing:3.2px}
.ph:before{content:'';width:3px;height:15px;background:${C.lime};margin-right:9px}
.ph b{margin-left:auto;font-weight:400;font-size:12px;color:${C.mute};letter-spacing:1.5px}
.lb{font:500 10px 'JetBrains Mono',monospace;letter-spacing:2px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.big{font:500 46px Inter,sans-serif;letter-spacing:-.5px;line-height:1}
.big small{font:500 15px Inter,sans-serif;letter-spacing:.5px;margin-left:5px;color:${C.ink}}
.chip{position:absolute;height:24px;padding:0 10px;display:flex;align-items:center;justify-content:center;font:500 11px 'JetBrains Mono',monospace;letter-spacing:1.6px;border:1px solid rgba(255,255,255,.16);border-radius:3px;color:${C.ink};white-space:nowrap}
.st{position:absolute;right:14px;height:17px;padding:0 7px;display:flex;align-items:center;font:600 9.5px 'JetBrains Mono',monospace;letter-spacing:1.4px;border-radius:2px}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font:600 11.5px 'JetBrains Mono',monospace;letter-spacing:2px;color:${C.ink}}
.call span{display:block;font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.mute};margin-top:8px}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const HANDLE = 'BKBKkwu3';

export function createConsole(app, {badge = `@${HANDLE}`} = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  add(`<div class="vig"></div>`);

  // ------------------------------------------------------------ title block
  add(`<div style="position:absolute;left:0;top:0;width:240px;height:128px;background:${C.lime}"></div>`);
  add(`<svg style="position:absolute;left:38px;top:40px" width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="#0c0e10" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M25 7 l-7 5 7 5 7 -5z" fill="#0c0e10"/><path d="M21 8 l-6 -5 M29 8 l6 -5"/>
    <path d="M25 17 v14"/><path d="M25 21 l-9 4 -3 -9 M25 21 l9 4 3 -9"/><path d="M13 16 l4 3 M37 16 l-4 3"/>
    <ellipse cx="25" cy="37" rx="5.5" ry="9" fill="#0c0e10"/><path d="M20 31 l-10 6 -3 9 M30 31 l10 6 3 9 M21 37 l-8 9 M29 37 l8 9"/></svg>`);
  add(`<div class="mono" style="position:absolute;left:116px;top:52px;font-size:19px;font-weight:700;letter-spacing:6px;color:#0c0e10">HX-6</div>`);
  add(`<div class="lb" style="position:absolute;left:272px;top:20px;font-size:12.5px;letter-spacing:3.4px;color:${C.mute}">ROBOTIC MANTODEA · 6-LEG RAPTORIAL FRAME</div>`);
  add(`<div style="position:absolute;left:270px;top:40px;font:600 50px Inter,sans-serif;letter-spacing:-.5px;line-height:1.1">Hierodula HX-6 <span style="color:${C.lime};font-weight:300;margin-left:14px">/</span></div>`);
  add(`<div class="lb" style="position:absolute;left:272px;top:110px;font-size:12.5px;letter-spacing:3.4px">ONE PROMPT → PURE THREE.JS / 356 MOVING PARTS</div>`);
  add(`<div class="lb" style="position:absolute;left:350px;top:158px;font-size:11px;letter-spacing:2.6px">MODEL HX-6 · REV A · <span data-k="live" style="color:${C.ink}"></span> PARTS LIVE</div>`);
  add(`<div style="position:absolute;left:350px;top:190px;width:46px;height:70px;border-left:1px dotted ${C.faint};border-top:1px dotted ${C.faint}"></div>`);
  // strike load, top right
  add(`<div class="lb" style="position:absolute;left:1400px;top:27px;font-size:11.5px;letter-spacing:2.6px;color:${C.ink}">STRIKE LOAD</div>`);
  const load = add(`<svg style="position:absolute;left:1400px;top:46px" width="174" height="16"></svg>`);
  const loadSt = add(`<div class="lb" style="position:absolute;left:1400px;top:70px;font-size:10.5px;letter-spacing:2.4px"></div>`);

  // ------------------------------------------------------------ left column
  const LX = 25;
  const PW = 287;
  // 01 strike
  add(`<div class="pn" style="left:${LX}px;top:152px;width:${PW}px;height:222px"><div class="ph">STRIKE<b>01</b></div></div>`);
  add(`<div class="big" style="position:absolute;left:${LX + 14}px;top:200px" data-k="reach"></div>`);
  add(`<div style="position:absolute;right:${1600 - LX - PW + 16}px;top:214px;font:500 24px Inter,sans-serif" data-k="clamp"></div>`);
  add(`<div class="lb" style="position:absolute;left:${LX + 14}px;top:254px">ARM REACH</div>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - LX - PW + 16}px;top:254px">CLAMP</div>`);
  const reachChart = add(`<svg style="position:absolute;left:${LX + 14}px;top:272px" width="${PW - 28}" height="62"></svg>`);
  add(`<div class="lb" style="position:absolute;left:${LX + 14}px;top:350px">LOOP <span data-k="loop" style="color:${C.ink};font-weight:700;margin-left:10px"></span></div>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - LX - PW + 16}px;top:350px" data-k="gait"></div>`);
  // 02 build
  add(`<div class="pn" style="left:${LX}px;top:388px;width:${PW}px;height:150px"><div class="ph">BUILD<b>02</b></div></div>`);
  add(`<div class="big" style="position:absolute;left:${LX + 14}px;top:434px"><span data-k="seated"></span><small>PARTS</small></div>`);
  const buildBar = add(`<svg style="position:absolute;left:${LX + 168}px;top:446px" width="105" height="22"></svg>`);
  add(`<div class="lb" style="position:absolute;left:${LX + 14}px;top:478px" data-k="seatlbl"></div>`);
  add(`<div style="position:absolute;left:${LX + 14}px;top:498px;width:${PW - 28}px;display:grid;grid-template-columns:repeat(4,1fr)">
    ${[['joints', 'JOINTS'], ['', 'LEGS', '4'], ['', 'ARMS', '2'], ['', 'ANTENNA', '40']].map(([k, l, v]) => `<div><div class="mono" style="font-size:14px;font-weight:600" ${k ? `data-k="${k}"` : ''}>${v ?? ''}</div><div class="lb" style="font-size:8.5px;margin-top:2px">${l}</div></div>`).join('')}</div>`);
  // 03 limb torque
  add(`<div class="pn" style="left:${LX}px;top:552px;width:${PW}px;height:194px"><div class="ph">LIMB TORQUE<b>03</b></div></div>`);
  add(`<div class="lb" style="position:absolute;left:${LX + 14}px;top:584px;font-size:9px">FROM THE IK · % OF RATED</div>`);
  const torque = add(`<svg style="position:absolute;left:${LX + 14}px;top:600px" width="${PW - 28}" height="138"></svg>`);

  // ------------------------------------------------------------ right column
  const RX = 1288;
  // 04 head track
  add(`<div class="pn" style="left:${RX}px;top:152px;width:${PW}px;height:222px"><div class="ph">HEAD TRACK<b>04</b></div></div>`);
  add(`<div class="big" style="position:absolute;left:${RX + 14}px;top:200px" data-k="yaw"></div>`);
  add(`<div style="position:absolute;right:${1600 - RX - PW + 16}px;top:214px;font:500 24px Inter,sans-serif" data-k="range"></div>`);
  add(`<div class="lb" style="position:absolute;left:${RX + 14}px;top:254px">NECK YAW</div>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - RX - PW + 16}px;top:254px">TARGET</div>`);
  const radar = add(`<svg style="position:absolute;left:${RX + 14}px;top:272px" width="${PW - 28}" height="70"></svg>`);
  add(`<div class="lb" style="position:absolute;left:${RX + 14}px;top:350px">IRIS <span data-k="iris" style="color:${C.ink};font-weight:700;margin-left:10px"></span></div>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - RX - PW + 16}px;top:350px" data-k="optic"></div>`);
  // 05 display
  add(`<div class="pn" style="left:${RX}px;top:388px;width:${PW}px;height:104px"><div class="ph">DISPLAY<b>05</b></div></div>`);
  const chips = {};
  [[0, 0, 74], [1, 84, 96], [2, 0, 102], [3, 112, 104]].forEach(([i, x, w]) => {
    const [k, l] = DISPLAY_KEYS[i];
    chips[k] = add(`<div class="chip" data-chip="${k}" style="left:${RX + 14 + x}px;top:${i < 2 ? 426 : 458}px;width:${w}px">${l}</div>`);
  });
  // 06 subsystems
  add(`<div class="pn" style="left:${RX}px;top:506px;width:${PW}px;height:240px"><div class="ph">SUBSYSTEMS<b>06</b></div></div>`);
  const rows = {};
  SUBSYS.forEach(([k, name, sub], i) => {
    const y = 544 + i * 33;
    rows[k] = add(`<div data-sub="${k}" style="position:absolute;left:${RX + 1}px;top:${y}px;width:${PW - 2}px;height:30px">
      <div data-r="bar" style="position:absolute;left:0;top:3px;width:3px;height:24px;background:${C.lime};opacity:0"></div>
      <div class="mono" style="position:absolute;left:13px;top:2px;font-size:9.5px;color:${C.mute}">0${i + 1}</div>
      <div class="mono" data-r="name" style="position:absolute;left:34px;top:0;font-size:12.5px;letter-spacing:1.8px;font-weight:600">${name}</div>
      <div class="lb" style="position:absolute;left:34px;top:16px;font-size:8.5px;letter-spacing:1.4px">${sub}</div>
      <div class="st" data-r="st" style="top:5px"></div></div>`);
  });

  // ------------------------------------------------------------ bottom: operation log, badge, footer
  const OL = {x: 25, y: 758, w: 915, h: 104};
  add(`<div class="pn" style="left:${OL.x}px;top:${OL.y}px;width:${OL.w}px;height:${OL.h}px"></div>`);
  const playBtn = add(`<svg style="position:absolute;left:${OL.x + 22}px;top:${OL.y + 35}px" width="34" height="34"><circle cx="17" cy="17" r="16" fill="${C.lime}"/><g data-r="icon"></g></svg>`);
  add(`<div class="mono" style="position:absolute;left:${OL.x + 72}px;top:${OL.y + 30}px;font-size:13.5px;letter-spacing:2.6px">OPERATION LOG</div>`);
  add(`<div class="lb" style="position:absolute;left:${OL.x + 72}px;top:${OL.y + 58}px;font-size:10.5px" data-k="clock"></div>`);
  add(`<div class="lb" style="position:absolute;left:${OL.x + 250}px;top:${OL.y + 24}px;color:${C.lime};font-size:10.5px" data-k="logcur"></div>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - OL.x - OL.w + 22}px;top:${OL.y + 24}px;font-size:10.5px" data-k="lognext"></div>`);
  const logTrack = add(`<svg style="position:absolute;left:${OL.x + 250}px;top:${OL.y + 40}px" width="${OL.w - 272}" height="26"></svg>`);
  add(`<div class="lb" style="position:absolute;right:${1600 - OL.x - OL.w + 22}px;top:${OL.y + 74}px;font-size:9.5px" data-k="logfoot"></div>`);
  const badgeEl = add(`<div style="position:absolute;left:1288px;top:799px;width:287px;height:50px;border-radius:25px;background:#f4f5f2;color:#0c0e10;display:flex;align-items:center;justify-content:center;gap:10px;font:600 17px 'JetBrains Mono',monospace;letter-spacing:.5px"></div>`);
  // the X mark, then the handle
  badgeEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#0c0e10" d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5L9 13 0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.3H4.3l13.3 17.3z"/></svg><span></span>`;
  badgeEl.querySelector('span').textContent = badge;
  add(`<div class="lb" style="position:absolute;left:198px;top:874px;font-size:11px;letter-spacing:3px">HX-6 FIELD ROBOTICS · 1 EVENT LIST · 0 KEYFRAMES · <span data-k="pc" style="color:${C.ink}"></span> PARTS <span style="color:${C.lime};letter-spacing:1px">//////</span></div>`);

  // ------------------------------------------------------------ caption and callouts
  const cap = add(`<div style="position:absolute;left:350px;top:664px">
    <div data-r="name" style="font:700 35px Inter,sans-serif;letter-spacing:1.5px;color:${C.lime};line-height:1"></div>
    <div class="lb" data-r="sub" style="margin-top:12px;font-size:11px;letter-spacing:2.6px"></div></div>`);
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const tour = add(`<div class="lb" style="position:absolute;left:800px;top:186px;transform:translateX(-50%);font-size:10px;display:none"></div>`);

  const K = {};
  for (const n of ui.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  // panels the callouts must keep clear of
  const PANELS = [[0, 0, 1290, 135], [LX, 140, LX + PW, 750], [RX, 140, RX + PW, 750], [OL.x, OL.y, OL.x + OL.w, OL.y + OL.h], [1288, 790, 1575, 850], [1390, 0, 1600, 90], [340, 655, 760, 712]];
  const covered = (x, y, pad = 10) => PANELS.some(([a, b, c, d]) => x > a - pad && x < c + pad && y > b - pad && y < d + pad);
  const lastHtml = new WeakMap();
  const setHTML = (n, h) => {
    if (lastHtml.get(n) !== h) {
      n.innerHTML = h;
      lastHtml.set(n, h);
    }
  };
  const setText = (n, s) => {
    if (n.textContent !== s) n.textContent = s;
  };

  return {
    root: ui,
    chips,
    rows,
    playBtn,
    tour,
    covered,
    update(d) {
      setText(K.live, String(d.total));
      setText(K.pc, String(d.total));
      // strike load: 18 segments
      {
        let h = '';
        for (let i = 0; i < 18; i++) h += `<rect x="${i * 9.6}" y="0" width="6.6" height="16" fill="${i < Math.round(d.strikeLoad * 18) ? C.ink : 'rgba(255,255,255,.18)'}"/>`;
        setHTML(load, h);
        setText(loadSt, d.strikeState);
        loadSt.style.color = d.strikeState === 'IDLE' ? C.mute : C.lime;
      }
      // 01 strike
      setHTML(K.reach, `${d.reach.toFixed(2)}<small>m</small>`);
      setText(K.clamp, `${Math.round(d.clamp)} N`);
      {
        const W = 259;
        const H = 62;
        const Y = (v) => 44 - ((v - 0.2) / 0.75) * 38;
        let p = '';
        d.reachHist.forEach((v, i) => (p += `${i ? 'L' : 'M'}${((i / (d.reachHist.length - 1)) * W).toFixed(1)} ${Y(v).toFixed(1)}`));
        const last = d.reachHist[d.reachHist.length - 1];
        setHTML(
          reachChart,
          `<line x1="0" x2="${W}" y1="${Y(0.2)}" y2="${Y(0.2)}" stroke="${C.faint}" stroke-width="1"/><line x1="${W - 1}" x2="${W - 1}" y1="0" y2="${Y(0.2)}" stroke="${C.faint}" stroke-dasharray="2 3"/>` +
            `<path d="${p}" fill="none" stroke="${C.lime}" stroke-width="1.6"/><circle cx="${W - 3}" cy="${Y(last).toFixed(1)}" r="3.4" fill="${C.lime}"/>` +
            `<text x="0" y="${H - 2}" font-size="9" fill="${C.mute}" font-family="JetBrains Mono">-1.6 S</text><text x="${W}" y="${H - 2}" font-size="9" fill="${C.mute}" text-anchor="end" font-family="JetBrains Mono">NOW</text>`,
        );
      }
      setText(K.loop, `${d.loopHz.toFixed(1)} HZ`);
      setText(K.gait, d.gaitLabel);
      // 02 build
      setText(K.seated, String(d.seated));
      setText(K.joints, String(d.joints));
      setText(K.seatlbl, d.seated === d.total ? 'SEATED · 3D MODEL' : `SEATING · ${d.total - d.seated} LOOSE`);
      {
        const n = 12;
        const on = Math.round((d.seated / d.total) * n);
        let h = '';
        for (let i = 0; i < n; i++) h += `<rect x="${i * 8.8}" y="0" width="6" height="22" fill="${i < on ? C.lime : 'rgba(255,255,255,.14)'}"/>`;
        setHTML(buildBar, h);
      }
      // 03 limb torque
      {
        let h = '';
        TORQUE_ROWS.forEach((k, i) => {
          const v = d.torque[k] ?? 0;
          const y = i * 15;
          const hot = v > 0.7;
          h += `<text x="0" y="${y + 9}" font-size="9" fill="${C.mute}" font-family="JetBrains Mono">${k}</text><rect x="38" y="${y + 2}" width="176" height="7" fill="rgba(255,255,255,.07)"/><rect x="38" y="${y + 2}" width="${(176 * v).toFixed(1)}" height="7" fill="${hot ? C.lime : '#b9d94a'}" opacity="${hot ? 1 : 0.82}"/><text x="259" y="${y + 9}" font-size="9" fill="${C.ink}" text-anchor="end" font-family="JetBrains Mono">${Math.round(v * 100)}%</text>`;
        });
        setHTML(torque, h);
      }
      // 04 head track
      setHTML(K.yaw, `${d.yaw >= 0 ? '+' : '−'}${Math.abs(d.yaw).toFixed(0)}<small>°</small>`);
      setText(K.range, d.range == null ? '— m' : `${d.range.toFixed(2)} m`);
      {
        const W = 259;
        const cx = W / 2;
        const cy = 66;
        const R = 60;
        const ang = (deg) => [cx + Math.sin(deg * (Math.PI / 180)) * R, cy - Math.cos(deg * (Math.PI / 180)) * R];
        let h = `<path d="M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="rgba(255,255,255,.035)" stroke="${C.faint}"/>`;
        h += `<path d="M${cx - R * 0.55} ${cy} A${R * 0.55} ${R * 0.55} 0 0 1 ${cx + R * 0.55} ${cy}" fill="none" stroke="${C.faint}" stroke-dasharray="2 3"/>`;
        for (let a = -90; a <= 90; a += 15) {
          const [x1, y1] = ang(a);
          h += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(cx + (x1 - cx) * 0.92).toFixed(1)}" y2="${(cy + (y1 - cy) * 0.92).toFixed(1)}" stroke="${C.mute}" stroke-width="1"/>`;
        }
        // the sweep's wedge, the gaze line, the target
        const [gx, gy] = ang(-d.yaw);
        h += `<path d="M${cx} ${cy} L${ang(-d.yaw - 12).map((v) => v.toFixed(1)).join(' ')} A${R} ${R} 0 0 1 ${ang(-d.yaw + 12).map((v) => v.toFixed(1)).join(' ')} Z" fill="${C.lime}" opacity=".13"/>`;
        h += `<line x1="${cx}" y1="${cy}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${C.lime}" stroke-width="1.6"/>`;
        if (d.targetBearing != null) {
          const [tx, ty] = (() => {
            const a = -d.targetBearing * (Math.PI / 180);
            const r = R * 0.72;
            return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
          })();
          h += `<rect x="${(tx - 4).toFixed(1)}" y="${(ty - 4).toFixed(1)}" width="8" height="8" fill="none" stroke="${C.lime}" stroke-width="1.4" transform="rotate(45 ${tx.toFixed(1)} ${ty.toFixed(1)})" opacity="${d.targetOn.toFixed(2)}"/>`;
        }
        h += `<circle cx="${cx}" cy="${cy}" r="3" fill="${C.ink}"/>`;
        setHTML(radar, h);
      }
      setText(K.iris, `${Math.round(d.iris * 100)}%`);
      setText(K.optic, d.opticLabel);
      // 05 display chips
      for (const [k] of DISPLAY_KEYS) {
        const on = d.display[k] > 0.5;
        const c = chips[k];
        c.style.background = on ? C.lime : 'transparent';
        c.style.color = on ? '#0c0e10' : C.ink;
        c.style.borderColor = on ? C.lime : 'rgba(255,255,255,.16)';
      }
      // 06 subsystems
      for (const [k] of SUBSYS) {
        const r = rows[k];
        const s = d.subs[k];
        const st = r.querySelector('[data-r=st]');
        setText(st, s.label);
        const hot = s.active > 0.5;
        st.style.background = hot ? C.lime : s.ok ? 'rgba(198,241,53,.16)' : 'rgba(255,255,255,.1)';
        st.style.color = hot ? '#0c0e10' : s.ok ? C.lime : C.mute;
        r.querySelector('[data-r=bar]').style.opacity = String(s.active);
        r.querySelector('[data-r=name]').style.color = hot ? C.lime : C.ink;
      }
      // operation log
      setText(K.clock, `${fmtT(d.clock)} / ${fmtT(d.duration)}`);
      setText(K.logcur, d.logCur);
      setText(K.lognext, d.logNext);
      setText(K.logfoot, d.logFoot);
      {
        const W = 643;
        let h = `<line x1="0" x2="${W}" y1="13" y2="13" stroke="rgba(255,255,255,.22)" stroke-width="1"/>`;
        for (const e of d.logTicks) h += `<line x1="${(e * W).toFixed(1)}" x2="${(e * W).toFixed(1)}" y1="5" y2="21" stroke="rgba(255,255,255,.4)" stroke-width="1"/>`;
        const px = d.logPos * W;
        h += `<line x1="0" x2="${px.toFixed(1)}" y1="13" y2="13" stroke="${C.lime}" stroke-width="2"/><line x1="0" x2="0" y1="3" y2="23" stroke="${C.lime}" stroke-width="2"/><circle cx="${px.toFixed(1)}" cy="13" r="5" fill="${C.lime}"/>`;
        setHTML(logTrack, h);
      }
      setHTML(playBtn.querySelector('[data-r=icon]'), d.paused ? `<path d="M13 10 L24 17 L13 24 Z" fill="#0c0e10"/>` : `<rect x="12" y="10" width="3.6" height="14" fill="#0c0e10"/><rect x="18.4" y="10" width="3.6" height="14" fill="#0c0e10"/>`);
      // caption
      setText(cap.querySelector('[data-r=name]'), d.cap[0]);
      setText(cap.querySelector('[data-r=sub]'), d.cap[1]);
      cap.style.opacity = String(d.capO);
      cap.style.transform = `translateY(${((1 - d.capO) * 8).toFixed(1)}px)`;

      // callouts: dot on the part, an elbow, a shelf, the name over the shelf; spread so no two collide
      const items = [];
      for (const c of d.callouts) {
        if (!c.at || c.o < 0.02) continue;
        const [ax, ay] = c.at;
        if (ax < 330 || ax > 1270 || ay < 150 || ay > 745) continue;
        const right = c.side ? c.side > 0 : ax > d.cx;
        items.push({...c, ax, ay, right, ly: ay - 46});
      }
      for (const side of [true, false]) {
        const g = items.filter((i) => i.right === side).sort((a, b) => a.ly - b.ly);
        for (let i = 1; i < g.length; i++) if (g[i].ly < g[i - 1].ly + 40) g[i].ly = g[i - 1].ly + 40;
      }
      let lh = '';
      let ch = '';
      for (const c of items) {
        const lx = c.ax + (c.right ? 64 : -64);
        const ex = lx + (c.right ? 118 : -118);
        if (covered(ex, c.ly, 4) || covered(lx, c.ly, 4)) continue;
        const o = c.o.toFixed(2);
        lh += `<g opacity="${o}"><polyline points="${c.ax.toFixed(1)},${c.ay.toFixed(1)} ${lx.toFixed(1)},${c.ly.toFixed(1)} ${ex.toFixed(1)},${c.ly.toFixed(1)}" fill="none" stroke="${C.lime}" stroke-width="1" opacity=".75"/><circle cx="${c.ax.toFixed(1)}" cy="${c.ay.toFixed(1)}" r="3.2" fill="none" stroke="${C.lime}" stroke-width="1.4"/><circle cx="${c.ax.toFixed(1)}" cy="${c.ay.toFixed(1)}" r="1.2" fill="${C.lime}"/></g>`;
        ch += `<div class="call" style="left:${(c.right ? lx + 4 : ex).toFixed(1)}px;top:${(c.ly - 18).toFixed(1)}px;opacity:${o};text-align:${c.right ? 'left' : 'right'};width:114px"><b>${c.name}</b><span>${c.sub}</span></div>`;
        // the sub line sits under the shelf
      }
      setHTML(callSvg, lh);
      setHTML(callG, ch);
    },
  };
}
