// MANIS MP-6, the geometry. A spine of thirty vertebrae (eight forward to the head, twenty-two back to the tail tip),
// each carrying a ring of overlapping armour scales hinged at their front edge, intervertebral discs, rams under the
// body that curl it shut, and belly plates; a conical head with a long tongue; four clawed legs placed from the spine's
// FK each frame. Every rigid part that moves is registered once (reg), so the console's part count is the length of
// that list and nothing else.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {clamp, D2R, footTarget, HEAD, legIK, legRoot, LEGS, LIMB, lerp, NECK_I, smoother, SPINE, TAIL_I, TONGUE, TUCK} from './kin.js';

const V3 = THREE.Vector3;
export const SUBS = ['scales', 'head', 'spine', 'claws', 'tail', 'legs', 'body'];
export const ACCENT = '#c6f135';
const EXPLODE = 2.6;
// scales per ring, forward chain then backward chain; tuned with the rest so the registry lands on the count asked for
export const RINGS = {
  F: [12, 12, 12, 12, 11, 11, 10, 9],
  B: [12, 12, 12, 12, 12, 11, 10, 10, 9, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4],
};
export const COUNTS = {headRows: [7, 6, 5, 4, 3], limbScales: 5, tongue: TONGUE.segs};

function makeMaterials() {
  const lime = new THREE.Color(ACCENT);
  const M = {};
  for (const s of SUBS) {
    M[s] = {
      armour: new THREE.MeshStandardMaterial({color: '#bfc4bd', roughness: 0.5, metalness: 0.14, envMapIntensity: 0.55, emissive: lime.clone(), emissiveIntensity: 0}),
      warm: new THREE.MeshStandardMaterial({color: '#9fa39c', roughness: 0.52, metalness: 0.16, envMapIntensity: 0.5}),
      steel: new THREE.MeshStandardMaterial({color: '#2a2f35', roughness: 0.45, metalness: 0.72, envMapIntensity: 0.6}),
      gun: new THREE.MeshStandardMaterial({color: '#59616b', roughness: 0.46, metalness: 0.6, envMapIntensity: 0.55}),
      black: new THREE.MeshStandardMaterial({color: '#121417', roughness: 0.6, metalness: 0.3}),
      accent: new THREE.MeshStandardMaterial({color: '#20260c', emissive: lime.clone(), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0}),
      chrome: new THREE.MeshStandardMaterial({color: '#a9b0b6', roughness: 0.3, metalness: 0.95, envMapIntensity: 0.7}),
    };
  }
  M.eye = new THREE.MeshBasicMaterial({color: ACCENT, toneMapped: false});
  M.glow = new THREE.MeshBasicMaterial({color: ACCENT, toneMapped: false});
  M.tongue = new THREE.MeshStandardMaterial({color: '#c0657f', roughness: 0.28, metalness: 0.1, emissive: new THREE.Color('#6a2440'), emissiveIntensity: 0.4});
  return M;
}

// ------------------------------------------------------------ geometry helpers
const G = {};
const q = (v) => Math.round(v * 2000) / 2000;
const rbox = (w, h, d, r) => {
  const k = `rb${w},${h},${d},${r}`;
  return (G[k] ??= new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
};
const box = (w, h, d) => (G[`b${w},${h},${d}`] ??= new THREE.BoxGeometry(w, h, d));
const cylX = (r0, r1, len, seg = 12) => {
  const k = `cx${r0},${r1},${len},${seg}`;
  if (!G[k]) G[k] = new THREE.CylinderGeometry(r1, r0, len, seg).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0);
  return G[k];
};
const cylY = (r, h, seg = 16) => (G[`cy${r},${h},${seg}`] ??= new THREE.CylinderGeometry(r, r, h, seg));
const cylZ = (r, h, seg = 16) => (G[`cz${r},${h},${seg}`] ??= new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2));
const sph = (r, s = 16) => (G[`s${r},${s}`] ??= new THREE.SphereGeometry(r, s, Math.max(8, Math.round(s * 0.7))));
const torusG = (R, r, s = 32) => (G[`t${R},${r},${s}`] ??= new THREE.TorusGeometry(R, r, 8, s));
const coneX = (len, r, seg = 8) => (G[`kx${len},${r},${seg}`] ??= new THREE.ConeGeometry(r, len, seg).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0));
/** One armour scale: a pointed shield, convex across, hinged at x = 0 and pointing along +x (dir -1: along -x). */
const scaleGeo = (L, W, dir) => {
  const k = `sc${q(L)},${q(W)},${dir}`;
  if (G[k]) return G[k];
  const s = new THREE.Shape();
  s.moveTo(0, -W * 0.42);
  s.quadraticCurveTo(-L * 0.12, 0, 0, W * 0.42);
  s.quadraticCurveTo(L * 0.55, W * 0.56, L * 0.84, W * 0.3);
  s.quadraticCurveTo(L * 0.97, W * 0.08, L, 0);
  s.quadraticCurveTo(L * 0.97, -W * 0.08, L * 0.84, -W * 0.3);
  s.quadraticCurveTo(L * 0.55, -W * 0.56, 0, -W * 0.42);
  const g = new THREE.ExtrudeGeometry(s, {depth: 0.004, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6});
  g.rotateX(-Math.PI / 2);
  // convex across, and a ridge down the middle
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) / (W * 0.5);
    p.setY(i, p.getY(i) - 0.012 * z * z * (W / 0.06) + 0.003 * Math.max(0, 1 - Math.abs(z) * 3));
  }
  if (dir < 0) g.rotateY(Math.PI);
  g.computeVertexNormals();
  return (G[k] = g);
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export function buildPangolin() {
  const M = makeMaterials();
  const parts = [];
  const reg = (obj, sub, name, {joint = true, dist = 0.04, dir = null} = {}) => {
    obj.userData.part = {sub, name, joint, dist, dir};
    parts.push(obj);
    return obj;
  };
  const anchors = {};
  const anchor = (key, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    anchors[key] = o;
    return o;
  };

  const root = new THREE.Group(); // world position
  const ball = new THREE.Group(); // pivot at the ball's centre for rolling
  const body = new THREE.Group(); // the level body frame, spine origin
  root.add(ball);
  ball.add(body);

  // ------------------------------------------------------------ the spine: vertebrae, scales, discs, rams, belly plates
  const SM = M.scales;
  const SP = M.spine;
  const TM = M.tail;
  const chains = {F: [], B: []};
  const allScales = [];
  for (const side of ['F', 'B']) {
    let parent = body;
    SPINE[side].forEach((s, i) => {
      const isTail = side === 'B' && i >= TAIL_I;
      const sub = isTail ? 'tail' : 'spine';
      const MM = isTail ? TM : SP;
      const v = reg(new THREE.Group(), sub, `${isTail ? 'TAIL LINK' : side === 'F' ? 'THORAX VERTEBRA' : 'LUMBAR VERTEBRA'} ${i + 1}`, {dist: 0.035, dir: [1, 0, 0]});
      if (i > 0) v.position.set(SPINE[side][i - 1].len, 0, 0);
      // the vertebra: a gunmetal body down the spine's axis, a gold joint at its root
      v.add(mesh(rbox(s.len * 0.92, s.h * 0.9, s.w * 0.75, Math.min(s.h, s.w) * 0.3), MM.steel, s.len / 2, -s.h * 0.08, 0));
      v.add(mesh(cylZ(Math.min(s.h, s.w) * 0.32, s.w * 0.6, 14), MM.gun));
      parent.add(v);
      // in the backward chain the segment frame points back down the body: dorsal is local -y, so flip it
      const inner = new THREE.Group();
      if (side === 'B') inner.rotation.x = Math.PI;
      v.add(inner);
      const seg = {v, inner, s, i, side, scales: [], rams: [], disc: null, belly: null};
      // the disc between this vertebra and the last
      if (i > 0) {
        const d = reg(new THREE.Group(), sub, `${isTail ? 'TAIL' : 'SPINE'} DISC ${side}${i}`, {dist: 0.03, dir: [0, 1, 0]});
        d.add(mesh(cylX(Math.min(s.h, s.w) * 0.42, Math.min(s.h, s.w) * 0.42, 0.008, 16), MM.accent, -0.004, -s.h * 0.08, 0));
        v.add(d);
        seg.disc = d;
      }
      // the ring of scales over the back and flanks, hinged at the edge nearer the head, pointing toward the tail
      const n = RINGS[side][i];
      const span = isTail ? 200 : 210;
      for (let j = 0; j < n; j++) {
        const th = (-span / 2 + (j + 0.5 + (i % 2 ? 0.5 : 0) - 0.25) * (span / n)) * D2R;
        const y = s.h * Math.cos(th);
        const z = s.w * Math.sin(th);
        const arc = ((span * D2R) * (s.w + s.h)) / 2 / n;
        const L = s.len * 1.55;
        const W = arc * 1.32;
        const dir = side === 'F' ? -1 : 1;
        const sc = reg(new THREE.Group(), isTail ? 'tail' : 'scales', `SCALE ${side}${i + 1}.${j + 1}`, {dist: 0.05, dir: [0, Math.cos(th), Math.sin(th)]});
        sc.position.set(side === 'F' ? s.len : 0, y, z);
        sc.rotation.x = th;
        const leaf = new THREE.Group();
        const mid = Math.abs(th) < 0.12;
        const mat = mid ? SM.accent : (i + j) % 6 === 0 ? SM.warm : SM.armour;
        leaf.add(mesh(scaleGeo(L, W, dir), (isTail && !mid ? TM.armour : mat)));
        if (!mid && (i * 3 + j) % 11 === 5) leaf.add(mesh(box(L * 0.4, 0.003, 0.004), SM.accent, dir * L * 0.45, 0.009, 0));
        sc.add(leaf);
        sc.userData.leaf = leaf;
        sc.userData.dir = dir;
        sc.userData.th = th;
        sc.userData.k = (side === 'F' ? -1 : 1) * (i + 1) + j * 0.15;
        inner.add(sc);
        seg.scales.push(sc);
        allScales.push(sc);
      }
      // the drive: two rams under the body segments, one under each tail link
      if (!isTail && i < SPINE[side].length - 1) {
        for (const zs of [-1, 1]) {
          const cyl = reg(new THREE.Group(), 'spine', `ROLL RAM ${side}${i + 1}${zs < 0 ? 'L' : 'R'}`, {dist: 0.03, dir: [0, -1, zs]});
          cyl.add(mesh(cylX(0.009, 0.009, s.len * 0.7, 10), SP.steel));
          cyl.add(mesh(cylX(0.0105, 0.0105, 0.008, 10), SP.accent, s.len * 0.7 - 0.008, 0, 0));
          const rod = reg(new THREE.Group(), 'spine', `ROLL ROD ${side}${i + 1}${zs < 0 ? 'L' : 'R'}`, {dist: 0.03, dir: [0, -1, zs]});
          rod.add(mesh(cylX(0.005, 0.005, s.len * 0.7, 8), SP.chrome));
          cyl.position.z = zs * s.w * 0.45;
          rod.position.z = zs * s.w * 0.45;
          inner.add(cyl, rod);
          seg.rams.push({cyl, rod, A: [0.008, -s.h * 0.55]});
        }
      } else if (isTail && i < SPINE[side].length - 1) {
        const cyl = reg(new THREE.Group(), 'tail', `TAIL RAM ${i - TAIL_I + 1}`, {dist: 0.025, dir: [0, -1, 0]});
        cyl.add(mesh(cylX(0.006, 0.006, s.len * 0.65, 8), TM.steel));
        const rod = reg(new THREE.Group(), 'tail', `TAIL ROD ${i - TAIL_I + 1}`, {dist: 0.025, dir: [0, -1, 0]});
        rod.add(mesh(cylX(0.0035, 0.0035, s.len * 0.65, 6), TM.chrome));
        inner.add(cyl, rod);
        seg.rams.push({cyl, rod, A: [0.004, -s.h * 0.5]});
      }
      // the belly: soft plates under the body, a keel under the tail
      const bp = reg(new THREE.Group(), isTail ? 'tail' : 'body', `${isTail ? 'TAIL KEEL' : 'BELLY PLATE'} ${side}${i + 1}`, {joint: false, dist: 0.035, dir: [0, -1, 0]});
      bp.position.set(s.len / 2, -s.h * 0.82, 0);
      bp.add(mesh(rbox(s.len * 0.95, 0.014, s.w * (isTail ? 0.9 : 1.2), 0.006), isTail ? TM.gun : M.body.gun));
      if (!isTail && i % 2 === 0) bp.add(mesh(box(s.len * 0.6, 0.003, 0.012), M.body.accent, 0, -0.008, 0));
      inner.add(bp);
      seg.belly = bp;
      chains[side].push(seg);
      parent = v;
    });
  }
  anchor('scales', chains.B[1].inner, 0.03, 0.14, 0.04);
  anchor('spine', chains.B[2].inner, 0.03, -0.09, 0.06);
  anchor('tail', chains.B[TAIL_I + 7].inner, 0, 0.04, 0);

  // ------------------------------------------------------------ head: a cone of a skull, small eyes, the tongue
  const HM = M.head;
  const headJ = reg(new THREE.Group(), 'head', 'NECK JOINT', {dist: 0.04, dir: [1, 0, 0]});
  headJ.position.set(SPINE.F[SPINE.F.length - 1].len, 0, 0);
  headJ.add(mesh(cylZ(0.04, 0.09, 18), HM.gun));
  chains.F[SPINE.F.length - 1].v.add(headJ);
  const skull = reg(new THREE.Group(), 'head', 'SKULL', {dist: 0.06, dir: [1, 0.3, 0]});
  {
    const prof = [];
    for (let i = 0; i <= 20; i++) {
      const x = (i / 20) * HEAD.len;
      const r = 0.064 * Math.pow(1 - (i / 20) * 0.82, 0.9) * (i < 3 ? 0.85 + 0.05 * i : 1);
      prof.push(new THREE.Vector2(Math.max(0.004, r), x));
    }
    const g = new THREE.LatheGeometry(prof, 28).rotateZ(-Math.PI / 2);
    const sk = mesh(g, HM.steel);
    sk.scale.set(1, 0.82, 1);
    skull.add(sk);
    skull.add(mesh(sph(0.012, 14), HM.black, HEAD.len - 0.002, -0.003, 0));
  }
  headJ.add(skull);
  anchor('head', skull, 0.07, 0.05, 0.03);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = reg(new THREE.Group(), 'head', `EYE ${s < 0 ? 'L' : 'R'}`, {joint: false, dist: 0.03, dir: [0.3, 0.3, s]});
    e.position.set(0.05, 0.024, s * 0.046);
    e.add(mesh(sph(0.0095, 14), M.eye));
    e.add(mesh(torusG(0.0095, 0.0022, 20), HM.chrome).rotateY(Math.PI / 2 - s * 0.6));
    skull.add(e);
    const lid = reg(new THREE.Group(), 'head', `EYELID ${s < 0 ? 'L' : 'R'}`, {dist: 0.02, dir: [0, 1, s]});
    lid.position.copy(e.position);
    lid.add(mesh(new THREE.SphereGeometry(0.0115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), HM.armour));
    skull.add(lid);
    const ear = reg(new THREE.Group(), 'head', `EAR VENT ${s < 0 ? 'L' : 'R'}`, {dist: 0.02, dir: [0, 0, s]});
    ear.position.set(0.012, 0.02, s * 0.054);
    ear.add(mesh(torusG(0.009, 0.0025, 16), HM.accent).rotateY(Math.PI / 2 + s * 1.2));
    skull.add(ear);
    eyes.push({e, lid, ear, s});
  }
  const nostrils = [];
  for (const s of [-1, 1]) {
    const n = reg(new THREE.Group(), 'head', `NOSTRIL ${s < 0 ? 'L' : 'R'}`, {dist: 0.015, dir: [1, 0, s]});
    n.position.set(HEAD.len + 0.006, 0.0, s * 0.006);
    n.add(mesh(rbox(0.004, 0.006, 0.004, 0.0015), HM.chrome));
    skull.add(n);
    nostrils.push(n);
  }
  const jaw = reg(new THREE.Group(), 'head', 'JAW', {dist: 0.03, dir: [0.3, -1, 0]});
  jaw.position.set(0.03, -0.034, 0);
  jaw.add(mesh(rbox(HEAD.len * 0.75, 0.012, 0.05, 0.005), HM.gun, HEAD.len * 0.37, 0, 0));
  skull.add(jaw);
  // head scales: rows over the crown, pointing back down the neck
  const headScales = [];
  COUNTS.headRows.forEach((n, r) => {
    const x = 0.03 + r * 0.03;
    const rr = 0.064 * Math.pow(1 - (x / HEAD.len) * 0.82, 0.9);
    for (let j = 0; j < n; j++) {
      const th = (-80 + (j + 0.5) * (160 / n)) * D2R;
      const sc = reg(new THREE.Group(), 'head', `HEAD SCALE ${r + 1}.${j + 1}`, {joint: false, dist: 0.035, dir: [0, Math.cos(th), Math.sin(th)]});
      sc.position.set(x + 0.03, rr * 0.82 * Math.cos(th), rr * Math.sin(th));
      sc.rotation.x = th;
      sc.add(mesh(scaleGeo(0.045, (Math.PI * rr * 1.25) / n, -1), r === 0 && Math.abs(th) < 0.3 ? HM.accent : HM.armour));
      skull.add(sc);
      headScales.push(sc);
    }
  });
  const tongue = [];
  {
    let tp = skull;
    for (let i = 0; i < COUNTS.tongue; i++) {
      const t = reg(new THREE.Group(), 'head', `TONGUE ${i + 1}`, {dist: 0.012, dir: [1, 0, 0]});
      if (i === 0) t.position.set(HEAD.len - 0.03, -0.018, 0);
      const r = 0.0085 - (i / COUNTS.tongue) * 0.0045;
      t.add(mesh(cylX(r, r * 0.92, TONGUE.segLen * 1.05, 8), i === COUNTS.tongue - 1 ? M.glow : M.tongue));
      tp.add(t);
      tongue.push(t);
      tp = t;
    }
  }
  anchor('tongue', tongue[COUNTS.tongue - 4], 0, 0, 0);

  // ------------------------------------------------------------ legs: placed from the spine's FK, angles in the level frame
  const CM = M.claws;
  const LG = M.legs;
  const legs = [];
  for (const leg of LEGS) {
    const s = leg.side;
    const tag = leg.id;
    const Lb = leg.front ? LIMB.front : LIMB.hind;
    const rootJ = reg(new THREE.Group(), 'legs', `${leg.front ? 'SHOULDER' : 'HIP'} ${tag}`, {dist: 0.05, dir: [0, -0.3, s]});
    rootJ.add(mesh(sph(0.032, 16), LG.gun));
    body.add(rootJ);
    const up = reg(new THREE.Group(), 'legs', `${leg.front ? 'HUMERUS' : 'FEMUR'} ${tag}`, {dist: 0.04, dir: [0, -1, 0]});
    up.add(mesh(rbox(Lb.upper, 0.05, 0.045, 0.018), LG.armour, Lb.upper / 2, 0, 0));
    rootJ.add(up);
    const lo = reg(new THREE.Group(), 'legs', `${leg.front ? 'FOREARM' : 'TIBIA'} ${tag}`, {dist: 0.035, dir: [1, 0, 0]});
    lo.position.set(Lb.upper, 0, 0);
    lo.add(mesh(cylZ(0.022, 0.05, 14), LG.steel));
    lo.add(mesh(rbox(Lb.lower, 0.038, 0.036, 0.014), LG.armour, Lb.lower / 2, 0, 0));
    lo.add(mesh(box(Lb.lower * 0.6, 0.004, 0.012), LG.accent, Lb.lower * 0.5, 0.0205, 0));
    up.add(lo);
    const ft = reg(new THREE.Group(), 'legs', `${leg.front ? 'HAND' : 'FOOT'} ${tag}`, {dist: 0.03, dir: [1, 0, 0]});
    ft.position.set(Lb.lower, 0, 0);
    ft.add(mesh(cylZ(0.018, 0.044, 14), LG.gun));
    ft.add(mesh(rbox(Lb.foot, 0.026, 0.05, 0.01), LG.armour, Lb.foot / 2, 0, 0));
    lo.add(ft);
    const digits = new THREE.Group();
    digits.position.set(Lb.foot, 0, 0);
    ft.add(digits);
    // limb scales over the outside of the upper segment
    const lsc = [];
    for (let j = 0; j < COUNTS.limbScales; j++) {
      const sc = reg(new THREE.Group(), 'scales', `LIMB SCALE ${tag}${j + 1}`, {joint: false, dist: 0.03, dir: [0, 0.3, s]});
      sc.position.set(0.01 + j * (Lb.upper * 0.18), 0.012, s * 0.026);
      sc.rotation.x = s * 1.1;
      sc.add(mesh(scaleGeo(0.05, 0.04, 1), LG.armour));
      up.add(sc);
      lsc.push(sc);
    }
    // digits: five per foot; the forefeet carry three long digging claws
    const fingers = [];
    for (let k = 0; k < 5; k++) {
      const z = (k - 2) * 0.011;
      const big = leg.front && k >= 1 && k <= 3;
      const kn = reg(new THREE.Group(), leg.front ? 'claws' : 'legs', `${leg.front ? 'KNUCKLE' : 'TOE'} ${tag}${k + 1}`, {dist: 0.02, dir: [1, 0, (k - 2) * 0.3]});
      kn.position.set(0, -0.004, z);
      kn.add(mesh(rbox(0.018, 0.016, 0.011, 0.005), leg.front ? CM.gun : LG.gun, 0.009, 0, 0));
      digits.add(kn);
      const cl = reg(new THREE.Group(), leg.front ? 'claws' : 'legs', `${leg.front ? 'CLAW' : 'NAIL'} ${tag}${k + 1}`, {dist: 0.02, dir: [1, -0.3, 0]});
      cl.position.set(0.017, 0, 0);
      const len = leg.front ? (big ? (k === 2 ? 0.075 : 0.06) : 0.03) : 0.022;
      cl.add(mesh(new THREE.ConeGeometry(big ? 0.0062 : 0.004, len, 6).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0), big ? CM.chrome : leg.front ? CM.armour : LG.chrome));
      if (big) cl.add(mesh(box(len * 0.5, 0.003, 0.003), CM.accent, len * 0.35, 0.005, 0));
      kn.add(cl);
      fingers.push({kn, cl, big});
    }
    const ram = (par, Aa, name, cl, rl) => {
      const cyl = reg(new THREE.Group(), 'legs', `${name} CYLINDER ${tag}`, {dist: 0.025, dir: [0, 0, s]});
      cyl.add(mesh(cylX(0.0068, 0.0068, cl, 10), LG.steel));
      const rod = reg(new THREE.Group(), 'legs', `${name} ROD ${tag}`, {dist: 0.025, dir: [0, 0, s]});
      rod.add(mesh(cylX(0.0036, 0.0036, rl, 8), LG.chrome));
      cyl.position.z = s * 0.032;
      rod.position.z = s * 0.032;
      par.add(cyl, rod);
      return {cyl, rod, A: Aa};
    };
    const r1 = ram(rootJ, [0.0, 0.03], leg.front ? 'SHOULDER' : 'HIP', 0.06, 0.08);
    const r2 = ram(up, [0.04, 0.026], leg.front ? 'ELBOW' : 'KNEE', 0.07, 0.08);
    legs.push({leg, Lb, rootJ, up, lo, ft, digits, fingers, lsc, r1, r2});
    if (tag === 'RF') anchor('claws', digits, 0.04, 0.0, 0.01);
  }

  // ------------------------------------------------------------ rest poses, explode axes, seating order
  for (const p of parts) {
    p.userData.p0 = p.position.clone();
    p.userData.q0 = p.quaternion.clone();
    const d = p.userData.part.dir ? new V3(...p.userData.part.dir) : p.position.clone();
    if (d.lengthSq() < 1e-8) d.set(0, 1, 0);
    p.userData.ex = d.normalize();
  }
  root.updateMatrixWorld(true);
  const wp = new V3();
  parts
    .map((p, i) => [p.getWorldPosition(wp).length() + p.userData.part.dist * 0.5, i])
    .sort((a, b) => a[0] - b[0])
    .forEach(([, i], r) => (parts[i].userData.order = r / (parts.length - 1)));
  const joints = parts.filter((p) => p.userData.part.joint).length;
  const bySub = Object.fromEntries(SUBS.map((s) => [s, parts.filter((p) => p.userData.part.sub === s).length]));
  const scaleCount = parts.filter((p) => /SCALE/.test(p.userData.part.name)).length;

  // ------------------------------------------------------------ pose
  const tmpA = new THREE.Vector2();
  const rotZ = (jx, jy, ang, px, py) => tmpA.set(jx + px * Math.cos(ang) - py * Math.sin(ang), jy + px * Math.sin(ang) + py * Math.cos(ang));
  const aim = (a, B) => {
    const dx = B.x - a.A[0];
    const dy = B.y - a.A[1];
    const ang = Math.atan2(dy, dx);
    a.cyl.position.x = a.A[0];
    a.cyl.position.y = a.A[1];
    a.cyl.rotation.set(0, 0, ang);
    a.rod.position.x = B.x;
    a.rod.position.y = B.y;
    a.rod.rotation.set(0, 0, ang + Math.PI);
  };
  const out = {};

  const update = (S) => {
    for (const p of parts) {
      p.position.copy(p.userData.p0);
      p.quaternion.copy(p.userData.q0);
    }
    const fk = S.fk;
    const [cx, cy] = fk.centre;
    ball.position.set(cx, S.rootY + cy, 0);
    ball.rotation.z = -S.rollAng;
    body.position.set(-cx, -cy, 0);

    // spine angles from the FK (relative per segment), with the tail drifting sideways as it wraps the ball
    for (const side of ['F', 'B']) {
      const P = fk[side];
      chains[side].forEach((sg, i) => {
        const prevA = i === 0 ? (side === 'F' ? 0 : Math.PI) : P[i - 1].a;
        const rel = P[i].a - prevA + (i === 0 && side === 'B' ? Math.PI : 0);
        const isTail = side === 'B' && i >= TAIL_I;
        const yaw = isTail ? (S.roll * (i < TAIL_I + 3 ? 16 : 7) + S.tailK * 14 * Math.sin(S.t * 1.6 + i * 0.25) + S.tailK * 9) * D2R : 0;
        sg.v.rotation.set(0, yaw, rel);
        // scales: flare lifts the trailing edge; a ripple runs nose to tail while they are up; rolled, they open a touch
        const f = S.flare;
        // curled up, the ring of scales wraps further round toward the belly and closes the sides of the ball
        const wrap = 1 + 0.42 * smoother(S.roll);
        sg.scales.forEach((sc) => {
          const th = sc.userData.th * wrap;
          sc.position.y = sg.s.h * Math.cos(th);
          sc.position.z = sg.s.w * Math.sin(th);
          sc.rotation.x = th;
          const wave = f > 0.02 ? 0.35 * Math.sin(S.t * 7 - sc.userData.k * 0.6) : 0;
          const lift = (f * (48 + 14 * wave) + 3 * S.roll + 2 * Math.sin(S.t * 1.4 + sc.userData.k * 0.3)) * D2R;
          sc.userData.leaf.rotation.z = sc.userData.dir < 0 ? -lift : lift;
        });
        // rams aim at the next vertebra's root, where its joint will carry them
        const next = P[i + 1];
        if (next && sg.rams.length) {
          const nrel = next.a - P[i].a;
          for (const r of sg.rams) aim(r, rotZ(sg.s.len, 0, side === 'B' ? -nrel : nrel, 0.012, -sg.s.h * 0.5));
        }
        if (sg.disc) sg.disc.scale.set(1, 1 - 0.25 * S.roll, 1);
        if (sg.belly) sg.belly.position.y += 0.002 * Math.sin(S.t * 1.4 - i * 0.4);
      });
    }

    // head: tucked by the FK; yaw, sniffing nostrils, blinking lids, the tongue
    headJ.rotation.set(0, S.headYaw * D2R, (lerp(HEAD.walk, HEAD.roll, S.roll) + S.headPitch) * D2R);
    nostrils.forEach((n, i) => (n.scale.set(1, 1 + 0.6 * S.sniff, 1 + 0.4 * S.sniff)));
    eyes.forEach(({lid}) => (lid.rotation.z = (-140 + 140 * Math.max(S.roll, (S.t % 4.1) / 4.1 > 0.95 ? 1 : 0)) * D2R));
    jaw.rotation.z = -(0.04 + 0.12 * S.ext);
    const tipX = S.fk.head.x + Math.cos(S.fk.head.a) * HEAD.len;
    const tipY = S.rootY + S.fk.head.y + Math.sin(S.fk.head.a) * HEAD.len - 0.018;
    const aimRel = Math.atan2(0.006 - tipY, Math.max(0.05, S.trailX - tipX)) - S.fk.head.a;
    tongue.forEach((t, i) => {
      const n = COUNTS.tongue;
      const k = clamp(S.ext * n - i, 0, 1);
      if (i > 0) t.position.x = TONGUE.segLen * k;
      t.rotation.z = i === 0 ? aimRel + 0.12 : (-0.9 + 3.5 * Math.sin(S.t * 22 - i * 0.6) * S.ext) * D2R;
      t.rotation.y = (i === 0 ? 0 : 4 * Math.sin(S.t * 3 - i * 0.2) * S.ext) * D2R;
      t.visible = S.ext > 0.001 || i === 0;
    });

    // legs: IK to the floor while walking or digging, tucked to the belly when rolled
    const rk = smoother(clamp(S.roll * 1.6, 0, 1));
    out.legs = legs.map((l) => {
      const [rx, ry, segA] = legRoot(l.leg, fk);
      const rootLevel = [rx, ry + S.rootY];
      l.rootJ.position.set(rx, ry, l.leg.side * l.leg.z);
      const tgt = footTarget(l.leg, S.phase, S.amp, rx, S.dig, S.t);
      const Lb = l.Lb;
      const ik = legIK(rootLevel, tgt, Lb.upper, Lb.lower, Lb.foot, Lb.metaDeg * D2R, l.leg.front ? -1 : 1);
      const segLevel = l.leg.front ? segA : segA - Math.PI;
      const T = l.leg.front ? TUCK.front : TUCK.hind;
      const a1 = lerp(ik.a1, segLevel + T.a1 * D2R, rk);
      const a2 = lerp(ik.a2, a1 + T.a2 * D2R, rk);
      const a3 = lerp(ik.a3, a2 + T.a3 * D2R, rk);
      l.up.rotation.z = a1;
      l.lo.rotation.z = a2 - a1;
      l.ft.rotation.z = a3 - a2;
      l.digits.rotation.z = -a3 * (1 - rk);
      // the forefeet walk on their knuckles, claws curled under; digging, the claws reach forward
      const curl = l.leg.front ? lerp(lerp(-70, -15, S.dig), -100, rk) : lerp(-10, -60, rk);
      l.fingers.forEach(({kn, cl}) => {
        kn.rotation.z = (curl * 0.4) * D2R;
        cl.rotation.z = (curl * 0.7) * D2R;
      });
      aim(l.r1, rotZ(0, 0, a1, Lb.upper * 0.45, l.leg.front ? -0.018 : 0.026));
      aim(l.r2, rotZ(Lb.upper, 0, a2 - a1, 0.06, 0.02));
      return {foot: tgt, a: {a1, a2, a3}};
    });

    for (const p of parts) {
      const e = S.explodeK(p.userData.order);
      if (e > 1e-4) p.position.addScaledVector(p.userData.ex, p.userData.part.dist * EXPLODE * e);
    }
    out.seated = parts.reduce((n, p) => n + (S.explodeK(p.userData.order) < 0.02 ? 1 : 0), 0);
  };

  return {root, ball, body, parts, joints, bySub, scaleCount, anchors, update, out, M, legs, chains};
}
