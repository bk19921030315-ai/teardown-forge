// HIERODULA HX-6, the geometry. Built from code: rounded boxes, lathed knobs, cones, tubes. Every rigid part that
// moves is registered once (reg) with its subsystem, so the console's part count is the length of that list and
// nothing else. update(state) poses all of them from kin.js's state for the frame, then lays the exploded view over
// the pose: each part slides out along its own mount axis, in the order it reseats.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {ARM_POSES, clamp, D2R, DIM, footTarget, GAIT, legIK, LEGS, smoother} from './kin.js';

const V3 = THREE.Vector3;
export const SUBS = ['arms', 'head', 'core', 'wings', 'abdomen', 'legs', 'body'];
export const ACCENT = '#c6f135';
const EXPLODE = 2.6;

// ------------------------------------------------------------ materials, one set per subsystem so each can light up
function makeMaterials() {
  const lime = new THREE.Color(ACCENT);
  const M = {};
  for (const s of SUBS) {
    M[s] = {
      armour: new THREE.MeshStandardMaterial({color: '#bfc4bd', roughness: 0.55, metalness: 0.12, envMapIntensity: 0.5, emissive: lime.clone(), emissiveIntensity: 0}),
      steel: new THREE.MeshStandardMaterial({color: '#2a2f35', roughness: 0.45, metalness: 0.72, envMapIntensity: 0.6}),
      gun: new THREE.MeshStandardMaterial({color: '#59616b', roughness: 0.46, metalness: 0.6, envMapIntensity: 0.55}),
      black: new THREE.MeshStandardMaterial({color: '#121417', roughness: 0.6, metalness: 0.3}),
      accent: new THREE.MeshStandardMaterial({color: '#20260c', emissive: lime.clone(), emissiveIntensity: 0.5, roughness: 0.5, metalness: 0}),
      chrome: new THREE.MeshStandardMaterial({color: '#a9b0b6', roughness: 0.3, metalness: 0.95, envMapIntensity: 0.7}),
    };
  }
  M.membrane = new THREE.MeshStandardMaterial({color: '#1d2410', emissive: lime.clone(), emissiveIntensity: 0.06, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false});
  M.eye = new THREE.MeshStandardMaterial({color: '#1a1f12', roughness: 0.18, metalness: 0.3, envMapIntensity: 1.0, emissive: lime.clone(), emissiveIntensity: 0.05});
  M.pupil = new THREE.MeshBasicMaterial({color: ACCENT, toneMapped: false});
  M.glow = new THREE.MeshBasicMaterial({color: ACCENT, toneMapped: false});
  return M;
}

// ------------------------------------------------------------ shared geometry helpers
const G = {};
const rbox = (w, h, d, r) => {
  const k = `rb${w},${h},${d},${r}`;
  return (G[k] ??= new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
};
const box = (w, h, d) => (G[`b${w},${h},${d}`] ??= new THREE.BoxGeometry(w, h, d));
const cylX = (r0, r1, len, seg = 14) => {
  const k = `cx${r0},${r1},${len},${seg}`;
  if (!G[k]) {
    const g = new THREE.CylinderGeometry(r1, r0, len, seg);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    G[k] = g;
  }
  return G[k];
};
const cylY = (r, h, seg = 18) => (G[`cy${r},${h},${seg}`] ??= new THREE.CylinderGeometry(r, r, h, seg));
const cylZ = (r, h, seg = 16) => {
  const k = `cz${r},${h},${seg}`;
  if (!G[k]) G[k] = new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2);
  return G[k];
};
const sph = (r, s = 16) => (G[`s${r},${s}`] ??= new THREE.SphereGeometry(r, s, Math.max(8, s * 0.75)));
const torus = (R, r, s = 48) => (G[`t${R},${r},${s}`] ??= new THREE.TorusGeometry(R, r, 8, s));
// a spine: a cone whose tip points down local -y, base at the origin
const spineGeo = (len, r) => {
  const k = `sp${len},${r}`;
  if (!G[k]) G[k] = new THREE.ConeGeometry(r, len, 7).rotateZ(Math.PI).translate(0, -len / 2, 0);
  return G[k];
};
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
// a limb segment along +x from the joint: a rounded box body, a lime strip on top, a joint drum at the root
const segment = (len, w, h, M, {strip = true, drum = true, skin = 'armour'} = {}) => {
  const g = new THREE.Group();
  g.add(mesh(rbox(len, h, w, Math.min(w, h) * 0.38), M[skin], len / 2, 0, 0));
  if (strip) g.add(mesh(box(len * 0.62, 0.004, w * 0.24), M.accent, len * 0.52, h / 2 + 0.0015, 0));
  if (drum) g.add(mesh(cylZ(Math.max(w, h) * 0.46, w * 1.12, 18), M.steel));
  return g;
};

export function buildMantis() {
  const M = makeMaterials();
  const parts = [];
  // reg: one rigid moving part. joint: it turns or slides against its parent (false: it rides along, like a panel
  // on a rib). dir: the axis it slides out along in the exploded view (default: from its parent's joint to its own).
  const reg = (obj, sub, name, {joint = true, dist = 0.045, dir = null} = {}) => {
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

  const root = new THREE.Group(); // world pose
  const body = new THREE.Group(); // ride height and bob
  root.add(body);

  // ------------------------------------------------------------ thorax: two shells, the bay, eight dorsal plates
  const B = M.body;
  const meso = reg(new THREE.Group(), 'body', 'MESOTHORAX', {joint: false, dist: 0.0});
  meso.position.set(0.07, 0, 0);
  meso.add(mesh(rbox(0.2, 0.12, 0.15, 0.03), B.armour, 0, -0.025, 0));
  meso.add(mesh(box(0.17, 0.006, 0.122), B.black, 0, 0.033, 0));
  for (const s of [-1, 1]) meso.add(mesh(box(0.16, 0.012, 0.004), B.accent, 0, -0.012, s * 0.076));
  body.add(meso);
  const meta = reg(new THREE.Group(), 'body', 'METATHORAX', {dist: 0.12, dir: [-1, 0, 0]});
  meta.position.set(-0.03, 0, 0);
  meta.add(mesh(rbox(0.17, 0.12, 0.16, 0.03), B.armour, -0.075, -0.024, 0));
  meta.add(mesh(box(0.15, 0.006, 0.128), B.black, -0.075, 0.034, 0));
  meta.add(mesh(cylZ(0.03, 0.17, 20), B.steel, 0.0, -0.016, 0));
  for (const s of [-1, 1]) meta.add(mesh(box(0.14, 0.012, 0.004), B.accent, -0.075, -0.014, s * 0.081));
  body.add(meta);

  const C = M.core;
  const plates = [];
  [0.13, 0.045, -0.04, -0.125].forEach((x, i) => {
    for (const s of [-1, 1]) {
      const h = reg(new THREE.Group(), 'core', `DORSAL PLATE ${i + 1}${s < 0 ? 'L' : 'R'}`, {dist: 0.09, dir: [0, 1, s * 0.6]});
      h.position.set(x, 0.039, s * 0.079);
      h.add(mesh(rbox(0.079, 0.012, 0.077, 0.004), C.armour, 0, 0.006, -s * 0.0385));
      h.add(mesh(box(0.06, 0.003, 0.006), C.accent, 0, 0.0128, -s * 0.06));
      h.add(mesh(cylX(0.0045, 0.0045, 0.07, 10), C.steel, -0.035, 0, 0));
      h.userData.side = s;
      body.add(h);
      plates.push(h);
    }
  });
  anchor('plates', plates[3], 0, 0.02, 0);

  // ------------------------------------------------------------ gyro core on its sled
  const sled = reg(new THREE.Group(), 'core', 'CORE SLED', {dist: 0.0});
  sled.add(mesh(cylY(0.058, 0.01, 32), C.steel, 0, 0, 0));
  sled.add(mesh(cylY(0.012, 0.06, 12), C.gun, 0, 0.03, 0));
  sled.add(mesh(torus(0.058, 0.0035), C.accent, 0, 0.007, 0).rotateX(Math.PI / 2));
  body.add(sled);
  const pistons = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p = reg(new THREE.Group(), 'core', `PISTON ${i + 1}`, {dist: 0.05, dir: [Math.cos(a), 0.6, Math.sin(a)]});
    p.position.set(Math.cos(a) * 0.047, 0.006, Math.sin(a) * 0.047);
    p.add(mesh(cylY(0.0055, 0.04, 10), C.chrome, 0, 0.02, 0));
    p.add(mesh(cylY(0.0085, 0.008, 12), C.accent, 0, 0.042, 0));
    sled.add(p);
    pistons.push(p);
  }
  const g1 = reg(new THREE.Group(), 'core', 'GIMBAL OUTER', {dist: 0.06, dir: [0, 1, 0]});
  g1.position.set(0, 0.06, 0);
  g1.add(mesh(torus(0.05, 0.0055), C.chrome));
  sled.add(g1);
  const g2 = reg(new THREE.Group(), 'core', 'GIMBAL MID', {dist: 0.05, dir: [0, 1, 0]});
  g2.add(mesh(torus(0.04, 0.005), C.gun).rotateY(Math.PI / 2));
  g1.add(g2);
  const g3 = reg(new THREE.Group(), 'core', 'GIMBAL INNER', {dist: 0.04, dir: [0, 1, 0]});
  g3.add(mesh(torus(0.03, 0.0045), C.chrome).rotateX(Math.PI / 2));
  g2.add(g3);
  const rotor = reg(new THREE.Group(), 'core', 'ROTOR', {dist: 0.04, dir: [0, 1, 0]});
  rotor.add(mesh(cylY(0.02, 0.008, 24), C.steel));
  rotor.add(mesh(torus(0.02, 0.0028, 24), M.glow).rotateX(Math.PI / 2));
  for (let k = 0; k < 3; k++) rotor.add(mesh(box(0.038, 0.0045, 0.005), C.accent).rotateY((k * Math.PI) / 3));
  g3.add(rotor);
  anchor('core', g1, 0, 0.04, 0);

  // ------------------------------------------------------------ prothorax: 8 vertebrae, 8 dorsal plates
  const P = DIM.prothorax;
  const verts = [];
  const vplates = [];
  let parent = body;
  for (let j = 0; j < P.segs; j++) {
    const v = reg(new THREE.Group(), 'body', `VERTEBRA ${j + 1}`, {dist: 0.04});
    v.position.set(j === 0 ? 0.17 : P.segLen, j === 0 ? 0.008 : 0, 0);
    const w = j >= 5 ? 0.074 + (j === 6 ? 0.012 : 0) : 0.062 - j * 0.002;
    v.add(mesh(rbox(P.segLen - 0.004, 0.048, w, 0.014), M.body.armour, P.segLen / 2, 0, 0));
    v.add(mesh(cylZ(0.021, w + 0.006, 16), M.body.steel));
    v.add(mesh(box(0.004, 0.05, w + 0.004), M.body.accent, 0.003, 0, 0));
    parent.add(v);
    verts.push(v);
    const dp = reg(new THREE.Group(), 'body', `NECK PLATE ${j + 1}`, {dist: 0.05, dir: [0, 1, 0]});
    dp.position.set(0.004, 0.026, 0);
    dp.add(mesh(rbox(P.segLen - 0.002, 0.009, w * 0.8, 0.004), M.body.gun, P.segLen / 2, 0.004, 0));
    v.add(dp);
    vplates.push(dp);
    parent = v;
  }

  // ------------------------------------------------------------ head on a pan-tilt neck
  const H = M.head;
  const neckMount = new THREE.Group();
  neckMount.position.set(P.segLen, 0.004, 0);
  verts[P.segs - 1].add(neckMount);
  const pan = reg(new THREE.Group(), 'head', 'NECK PAN', {dist: 0.03});
  pan.add(mesh(cylY(0.02, 0.03, 16), H.steel, 0, 0, 0));
  pan.add(mesh(torus(0.02, 0.0025, 24), H.accent, 0, 0.012, 0).rotateX(Math.PI / 2));
  neckMount.add(pan);
  const tilt = reg(new THREE.Group(), 'head', 'NECK TILT', {dist: 0.03});
  tilt.position.set(0.018, 0.0, 0);
  tilt.add(mesh(cylZ(0.014, 0.05, 14), H.gun));
  tilt.add(mesh(rbox(0.03, 0.02, 0.036, 0.006), H.steel, 0.014, 0, 0));
  pan.add(tilt);
  const head = reg(new THREE.Group(), 'head', 'HEAD CAPSULE', {dist: 0.06, dir: [1, 0.3, 0]});
  head.position.set(0.05, 0.0, 0);
  head.scale.setScalar(1.3);
  {
    // a triangle face: eyes at the top corners, the mouth at the bottom point
    const s = new THREE.Shape();
    s.moveTo(-0.082, 0.042);
    s.lineTo(0.082, 0.042);
    s.lineTo(0.016, -0.07);
    s.lineTo(-0.016, -0.07);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3});
    g.translate(0, 0, -0.015);
    g.rotateY(Math.PI / 2);
    head.add(mesh(g, H.armour));
    head.add(mesh(box(0.008, 0.06, 0.004), H.accent, 0.028, -0.005, 0));
    head.add(mesh(rbox(0.03, 0.026, 0.07, 0.01), H.steel, -0.02, 0.01, 0));
  }
  tilt.add(head);
  anchor('head', head, 0.03, -0.03, 0);
  const eyes = [];
  const irises = [];
  for (const s of [-1, 1]) {
    const e = reg(new THREE.Group(), 'head', `EYE DOME ${s < 0 ? 'L' : 'R'}`, {joint: false, dist: 0.05, dir: [0.4, 0.4, s]});
    e.position.set(0.004, 0.042, s * 0.084);
    e.add(mesh(sph(DIM.head.eyeR, 24), M.eye));
    e.add(mesh(torus(DIM.head.eyeR * 0.98, 0.003, 36), H.steel).rotateY(Math.PI / 2 - s * 0.5));
    head.add(e);
    eyes.push(e);
    // the iris: 8 blades on the eye's forward-outward face, around a lit pseudopupil
    const dirv = new V3(0.85, 0.25, s * 0.75).normalize();
    const ir = new THREE.Group();
    ir.position.copy(dirv).multiplyScalar(DIM.head.eyeR * 0.93);
    ir.quaternion.setFromUnitVectors(new V3(0, 0, 1), dirv);
    e.add(ir);
    const pupil = mesh(sph(0.0085, 12), M.pupil, 0, 0, -0.002);
    ir.add(pupil);
    const blades = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = reg(new THREE.Group(), 'head', `IRIS ${s < 0 ? 'L' : 'R'}${i + 1}`, {dist: 0.025, dir: [Math.cos(a), Math.sin(a), 1]});
      b.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0.001);
      b.userData.a = a;
      b.add(mesh(box(0.022, 0.0075, 0.0022), H.steel, -0.011, 0, 0));
      ir.add(b);
      blades.push(b);
    }
    irises.push({ir, blades, pupil});
  }
  anchor('eyes', eyes[1], 0.02, 0.02, 0.02);
  const ocelli = [];
  [[0.03, 0.036, 0], [0.028, 0.022, -0.014], [0.028, 0.022, 0.014]].forEach(([x, y, z], i) => {
    const o = reg(new THREE.Group(), 'head', `OCELLUS ${i + 1}`, {dist: 0.03, dir: [1, 0.3, z * 30]});
    o.position.set(x, y, z);
    o.add(mesh(sph(0.0058, 10), M.glow));
    o.add(mesh(cylX(0.0075, 0.0075, 0.004, 14), H.steel, 0.002, 0, 0));
    o.rotation.z = 0.3;
    head.add(o);
    ocelli.push(o);
  });
  const antennae = [];
  for (const s of [-1, 1]) {
    const chain = [];
    let p = head;
    for (let i = 0; i < DIM.antenna.segs; i++) {
      const a = reg(new THREE.Group(), 'head', `ANTENNA ${s < 0 ? 'L' : 'R'}${i + 1}`, {dist: 0.012});
      if (i === 0) a.position.set(0.03, 0.048, s * 0.016);
      else a.position.set(DIM.antenna.segLen, 0, 0);
      const r = 0.0042 - (i / DIM.antenna.segs) * 0.0026;
      a.add(mesh(cylX(r, r * 0.85, DIM.antenna.segLen * 0.94, 7), i % 4 === 3 ? H.accent : H.steel));
      if (i === 0) a.add(mesh(sph(0.007, 10), H.gun));
      p.add(a);
      chain.push(a);
      p = a;
    }
    antennae.push(chain);
  }
  anchor('antenna', antennae[1][13], 0.01, 0, 0);
  const mands = [];
  const palps = [];
  for (const s of [-1, 1]) {
    const m = reg(new THREE.Group(), 'head', `MANDIBLE ${s < 0 ? 'L' : 'R'}`, {dist: 0.03, dir: [0.5, -1, s]});
    m.position.set(0.018, -0.066, s * 0.012);
    m.add(mesh(rbox(0.026, 0.012, 0.009, 0.003), H.steel, 0.012, -0.004, 0));
    m.add(mesh(new THREE.ConeGeometry(0.004, 0.014, 6).rotateZ(Math.PI / 2).translate(0.03, -0.004, 0), H.chrome));
    head.add(m);
    mands.push(m);
    // maxillary palp: 3 segments; labial palp: 2
    for (const [n, base, len, kind] of [[3, [0.012, -0.05, s * 0.03], 0.022, 'MAXILLARY'], [2, [0.014, -0.068, s * 0.006], 0.016, 'LABIAL']]) {
      let pp = head;
      const ch = [];
      for (let i = 0; i < n; i++) {
        const g = reg(new THREE.Group(), 'head', `${kind} PALP ${s < 0 ? 'L' : 'R'}${i + 1}`, {dist: 0.015});
        if (i === 0) g.position.set(...base);
        else g.position.set(len, 0, 0);
        g.add(mesh(cylX(0.0035, 0.003, len * 0.92, 7), i === n - 1 ? H.accent : H.gun));
        pp.add(g);
        ch.push(g);
        pp = g;
      }
      palps.push({ch, s, kind});
    }
  }

  // ------------------------------------------------------------ raptorial forelegs
  const A = DIM.arm;
  const AM = M.arms;
  const arms = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const ring = reg(new THREE.Group(), 'arms', `SHOULDER RING ${tag}`, {dist: 0.04, dir: [0, -0.4, s]});
    ring.position.set(0.03, -0.034, s * 0.048);
    ring.add(mesh(cylY(0.024, 0.02, 18), AM.steel, 0, 0.004, 0));
    ring.add(mesh(torus(0.024, 0.003, 24), AM.accent, 0, 0.013, 0).rotateX(Math.PI / 2));
    verts[6].add(ring);
    const coxa = reg(new THREE.Group(), 'arms', `COXA ${tag}`, {dist: 0.05, dir: [0, -1, 0]});
    coxa.add(segment(A.coxa, 0.03, 0.034, AM));
    ring.add(coxa);
    const troch = reg(new THREE.Group(), 'arms', `TROCHANTER ${tag}`, {dist: 0.04});
    troch.position.set(A.coxa, 0, 0);
    troch.add(mesh(cylZ(0.024, 0.05, 18), AM.gun));
    troch.add(mesh(torus(0.024, 0.0025, 24), AM.accent, 0, 0, 0.026));
    coxa.add(troch);
    const femur = reg(new THREE.Group(), 'arms', `FEMUR ${tag}`, {dist: 0.045, dir: [1, 0, 0]});
    {
      // the raptorial femur: deep and flat, a groove underneath where the tibia folds in
      femur.add(mesh(rbox(A.femur, 0.058, 0.044, 0.016), AM.armour, A.femur / 2, 0.004, 0));
      femur.add(mesh(box(A.femur * 0.8, 0.008, 0.02), AM.black, A.femur * 0.52, -0.026, 0));
      femur.add(mesh(box(A.femur * 0.66, 0.004, 0.012), AM.accent, A.femur * 0.5, 0.034, 0));
    }
    troch.add(femur);
    const fsp = [];
    for (let i = 0; i < A.femSpines; i++) {
      const big = i % 3 === 1;
      const sp = reg(new THREE.Group(), 'arms', `FEMORAL SPINE ${tag}${i + 1}`, {dist: 0.03, dir: [0, -1, 0]});
      sp.position.set(0.04 + i * 0.016, -0.028, (i % 2 ? 1 : -1) * 0.011);
      sp.add(mesh(spineGeo(big ? 0.032 : 0.019, big ? 0.0048 : 0.0034), big ? AM.chrome : AM.steel));
      femur.add(sp);
      fsp.push(sp);
    }
    const tibia = reg(new THREE.Group(), 'arms', `TIBIA ${tag}`, {dist: 0.045, dir: [1, 0, 0]});
    tibia.position.set(A.femur, 0, 0);
    tibia.add(segment(A.tibia, 0.032, 0.034, AM, {strip: true}));
    femur.add(tibia);
    const tsp = [];
    for (let i = 0; i < A.tibSpines; i++) {
      const sp = reg(new THREE.Group(), 'arms', `TIBIAL SPINE ${tag}${i + 1}`, {dist: 0.025, dir: [0, -1, 0]});
      sp.position.set(0.03 + i * 0.0115, -0.016, (i % 2 ? 1 : -1) * 0.007);
      sp.add(mesh(spineGeo(0.014, 0.0028), AM.steel));
      tibia.add(sp);
      tsp.push(sp);
    }
    const hook = reg(new THREE.Group(), 'arms', `TIBIAL HOOK ${tag}`, {joint: false, dist: 0.03});
    hook.position.set(A.tibia, 0, 0);
    hook.add(mesh(new THREE.ConeGeometry(0.008, 0.04, 8).rotateZ(Math.PI / 2 + 0.6).translate(0.012, -0.012, 0), AM.chrome));
    tibia.add(hook);
    const tars = [];
    let tp = tibia;
    for (let i = 0; i < 5; i++) {
      const g = reg(new THREE.Group(), 'arms', `FORE TARSUS ${tag}${i + 1}`, {dist: 0.015});
      g.position.set(i === 0 ? A.tibia - 0.022 : A.tarsus, i === 0 ? 0.012 : 0, 0);
      g.add(mesh(cylX(0.0062 - i * 0.0006, 0.0055 - i * 0.0006, A.tarsus * 0.9, 8), i === 4 ? AM.accent : AM.gun));
      tp.add(g);
      tars.push(g);
      tp = g;
    }
    // two hydraulic actuators: coxa → femur, femur → tibia; cylinder and rod both live in the parent's frame
    const act = (par, Aa, name, cl, rl) => {
      const cyl = reg(new THREE.Group(), 'arms', `${name} CYLINDER ${tag}`, {dist: 0.03, dir: [0, 0, s]});
      cyl.add(mesh(cylX(0.0085, 0.0085, cl, 12), AM.steel));
      cyl.add(mesh(cylX(0.0095, 0.0095, 0.008, 12), AM.accent, cl - 0.008, 0, 0));
      const rod = reg(new THREE.Group(), 'arms', `${name} ROD ${tag}`, {dist: 0.03, dir: [0, 0, s]});
      rod.add(mesh(cylX(0.0045, 0.0045, rl, 10), AM.chrome));
      cyl.position.set(Aa[0], Aa[1], s * 0.03);
      rod.position.set(0, 0, s * 0.03);
      par.add(cyl, rod);
      return {cyl, rod, A: Aa};
    };
    const a1 = act(coxa, [0.0, 0.03], 'FEMUR', 0.11, 0.13);
    const a2 = act(femur, [0.05, 0.035], 'TIBIA', 0.12, 0.12);
    arms.push({s, ring, coxa, troch, femur, tibia, fsp, tsp, hook, tars, a1, a2});
    if (s < 0) anchor('armL', femur, A.femur * 0.55, 0.03, -0.03);
    else anchor('armR', femur, A.femur * 0.55, 0.03, 0.03);
  }

  // ------------------------------------------------------------ walking legs
  const LM = M.legs;
  const legs = [];
  for (const leg of LEGS) {
    const L = DIM[leg.pair];
    const s = leg.side;
    const hip = reg(new THREE.Group(), 'legs', `HIP SERVO ${leg.id}`, {dist: 0.06, dir: [0, -0.3, s]});
    hip.position.set(...leg.hip);
    hip.add(mesh(cylY(0.026, 0.042, 18), LM.steel));
    hip.add(mesh(torus(0.026, 0.003, 24), LM.accent, 0, -0.02, 0).rotateX(Math.PI / 2));
    body.add(hip);
    const coxa = reg(new THREE.Group(), 'legs', `COXA ${leg.id}`, {dist: 0.04, dir: [1, 0, 0]});
    coxa.add(segment(L.coxa, 0.036, 0.04, LM, {strip: false}));
    hip.add(coxa);
    const troch = reg(new THREE.Group(), 'legs', `TROCHANTER ${leg.id}`, {dist: 0.03});
    troch.position.set(L.coxa, 0, 0);
    troch.add(mesh(cylZ(0.02, 0.044, 16), LM.gun));
    coxa.add(troch);
    const femur = reg(new THREE.Group(), 'legs', `FEMUR ${leg.id}`, {dist: 0.04, dir: [1, 0, 0]});
    femur.add(segment(L.femur, 0.03, 0.034, LM, {drum: false}));
    troch.add(femur);
    const guard = reg(new THREE.Group(), 'legs', `KNEE GUARD ${leg.id}`, {dist: 0.03, dir: [0, 1, 0]});
    guard.position.set(L.femur, 0, 0);
    guard.add(mesh(cylZ(0.021, 0.04, 16), LM.steel));
    guard.add(mesh(rbox(0.03, 0.008, 0.034, 0.003), LM.accent, 0.0, 0.022, 0));
    femur.add(guard);
    const tibia = reg(new THREE.Group(), 'legs', `TIBIA ${leg.id}`, {dist: 0.04, dir: [1, 0, 0]});
    tibia.position.set(L.femur, 0, 0);
    tibia.add(segment(L.tibia, 0.022, 0.024, LM, {drum: false, skin: 'gun'}));
    femur.add(tibia);
    const spurs = [];
    for (const z of [-1, 1]) {
      const sp = reg(new THREE.Group(), 'legs', `TIBIAL SPUR ${leg.id}${z < 0 ? 'a' : 'b'}`, {dist: 0.02, dir: [0.3, -1, z]});
      sp.position.set(L.tibia - 0.004, -0.008, z * 0.008);
      sp.add(mesh(spineGeo(0.018, 0.0028), LM.chrome));
      tibia.add(sp);
      spurs.push(sp);
    }
    const tars = [];
    let tp = tibia;
    for (let i = 0; i < 5; i++) {
      const g = reg(new THREE.Group(), 'legs', `TARSUS ${leg.id}${i + 1}`, {dist: 0.014});
      g.position.set(i === 0 ? L.tibia : L.tarsus, 0, 0);
      g.add(mesh(cylX(0.0075 - i * 0.0006, 0.0065 - i * 0.0006, L.tarsus * 0.9, 8), i === 4 ? LM.accent : LM.steel));
      tp.add(g);
      tars.push(g);
      tp = g;
    }
    const claws = [];
    for (const z of [-1, 1]) {
      const c = reg(new THREE.Group(), 'legs', `CLAW ${leg.id}${z < 0 ? 'a' : 'b'}`, {dist: 0.015, dir: [1, -0.5, z]});
      c.position.set(L.tarsus, 0, z * 0.003);
      c.add(mesh(new THREE.ConeGeometry(0.0032, 0.016, 6).rotateZ(Math.PI / 2 + 0.9).translate(0.006, -0.004, 0), LM.chrome));
      tp.add(c);
      claws.push(c);
    }
    const act = (par, Aa, name, cl, rl) => {
      const cyl = reg(new THREE.Group(), 'legs', `${name} CYLINDER ${leg.id}`, {dist: 0.025, dir: [0, 0, s]});
      cyl.add(mesh(cylX(0.0068, 0.0068, cl, 10), LM.steel));
      const rod = reg(new THREE.Group(), 'legs', `${name} ROD ${leg.id}`, {dist: 0.025, dir: [0, 0, s]});
      rod.add(mesh(cylX(0.0036, 0.0036, rl, 8), LM.chrome));
      cyl.position.set(Aa[0], Aa[1], -s * 0.022);
      rod.position.set(0, 0, -s * 0.022);
      par.add(cyl, rod);
      return {cyl, rod, A: Aa};
    };
    const a1 = act(coxa, [-0.01, 0.03], 'LIFT', 0.07, 0.08);
    const a2 = act(femur, [0.06, 0.028], 'KNEE', L.femur * 0.42, L.femur * 0.42);
    legs.push({leg, L, hip, coxa, troch, femur, guard, tibia, spurs, tars, claws, a1, a2});
    if (leg.id === 'R3') anchor('legR3', femur, L.femur, 0.02, 0);
    if (leg.id === 'L2') anchor('legL2', femur, L.femur, 0.02, 0);
  }

  // ------------------------------------------------------------ wings: tegmina over a fan of hindwing ribs
  const WM = M.wings;
  const W = DIM.wing;
  const wings = [];
  const ribLen = (j) => 0.47 - 0.13 * (j / (W.ribs - 1)) ** 2;
  const STEP = (W.spanDeg / (W.ribs - 1)) * D2R;
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const rootW = reg(new THREE.Group(), 'wings', `WING HINGE ${tag}`, {dist: 0.06, dir: [0, 1, s]});
    rootW.position.set(0.1, 0.058, s * 0.024);
    rootW.add(mesh(cylX(0.012, 0.012, 0.03, 12), WM.steel, -0.015, 0, 0));
    body.add(rootW);
    const teg = reg(new THREE.Group(), 'wings', `TEGMEN ${tag}`, {dist: 0.07, dir: [0, 1, 0]});
    {
      const sh = new THREE.Shape();
      const len = W.tegmen;
      sh.moveTo(0, 0);
      sh.bezierCurveTo(-len * 0.25, 0.062, -len * 0.75, 0.062, -len, 0.012);
      sh.bezierCurveTo(-len * 0.8, -0.03, -len * 0.3, -0.04, 0, 0);
      const g = new THREE.ExtrudeGeometry(sh, {depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 18});
      g.rotateX(Math.PI / 2);
      if (s < 0) g.scale(1, 1, -1);
      teg.add(mesh(g, WM.gun, 0, 0.004, s * 0.006));
      // the vein: a lime line down the middle
      const vein = new THREE.ExtrudeGeometry(
        (() => {
          const v = new THREE.Shape();
          v.moveTo(-0.02, 0.012);
          v.bezierCurveTo(-len * 0.3, 0.03, -len * 0.7, 0.03, -len * 0.95, 0.012);
          v.lineTo(-len * 0.95, 0.008);
          v.bezierCurveTo(-len * 0.7, 0.024, -len * 0.3, 0.024, -0.02, 0.008);
          v.closePath();
          return v;
        })(),
        {depth: 0.001, bevelEnabled: false, curveSegments: 16},
      );
      vein.rotateX(Math.PI / 2);
      if (s < 0) vein.scale(1, 1, -1);
      teg.add(mesh(vein, WM.accent, 0, 0.0095, s * 0.006));
    }
    rootW.add(teg);
    const fan = new THREE.Group();
    fan.position.set(-0.01, -0.01, 0);
    rootW.add(fan);
    const ribs = [];
    const panels = [];
    for (let j = 0; j < W.ribs; j++) {
      const r = reg(new THREE.Group(), 'wings', `WING RIB ${tag}${j + 1}`, {dist: 0.02, dir: [-1, 0, s * 0.2]});
      r.add(mesh(cylX(0.0032, 0.0018, ribLen(j), 6).clone().rotateY(Math.PI).translate(0, 0, 0), j === 0 ? WM.accent : WM.steel));
      fan.add(r);
      ribs.push(r);
      if (j < W.ribs - 1) {
        const p = reg(new THREE.Group(), 'wings', `WING PANEL ${tag}${j + 1}`, {joint: false, dist: 0.02, dir: [0, 1, 0]});
        const a = ribLen(j);
        const b = ribLen(j + 1);
        const geo = new THREE.BufferGeometry();
        // the panel spans rib j to where rib j+1 sits when the fan is open; scale.z folds it with the fan
        const bx = -b * Math.cos(STEP);
        const bz = s * b * Math.sin(STEP);
        const mid = 0.55;
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -a, 0, 0, bx, 0, bz, -a * mid, 0, 0, -a, 0, 0, bx * 1.0, 0, bz * 1.0], 3));
        geo.computeVertexNormals();
        const pm = new THREE.Mesh(geo, M.membrane);
        pm.renderOrder = 2;
        p.add(pm);
        r.add(p);
        panels.push(p);
      }
    }
    wings.push({s, rootW, teg, fan, ribs, panels});
    if (s < 0) anchor('wing', ribs[4], -ribLen(4) * 0.8, 0, 0);
  }

  // ------------------------------------------------------------ abdomen: 10 segments, sternites, vents, cerci
  const AB = DIM.abdomen;
  const XM = M.abdomen;
  const segs = [];
  const sterns = [];
  const louvers = [];
  let ap = body;
  for (let j = 0; j < AB.segs; j++) {
    const k = j / (AB.segs - 1);
    const w = 0.165 - 0.085 * k ** 1.3;
    const h = 0.1 - 0.045 * k;
    const g = reg(new THREE.Group(), 'abdomen', `TERGITE ${j + 1}`, {dist: 0.035, dir: [-1, 0, 0]});
    g.position.set(j === 0 ? -0.16 : -AB.segLen, j === 0 ? 0.0 : 0, 0);
    g.add(mesh(rbox(AB.segLen * 1.05, h * 0.62, w, 0.02), XM.armour, -AB.segLen / 2, h * 0.16, 0));
    g.add(mesh(box(AB.segLen * 0.7, 0.004, w * 0.2), XM.accent, -AB.segLen / 2, h * 0.47 + 0.001, 0));
    g.add(mesh(rbox(AB.segLen * 0.9, h * 0.5, w * 0.82, 0.015), XM.steel, -AB.segLen / 2, -h * 0.1, 0));
    ap.add(g);
    segs.push({g, w, h});
    const st = reg(new THREE.Group(), 'abdomen', `STERNITE ${j + 1}`, {joint: false, dist: 0.04, dir: [0, -1, 0]});
    st.position.set(-AB.segLen / 2, -h * 0.38, 0);
    st.add(mesh(rbox(AB.segLen * 0.94, 0.016, w * 0.78, 0.006), XM.gun));
    g.add(st);
    sterns.push(st);
    for (const s of [-1, 1]) {
      const l = reg(new THREE.Group(), 'abdomen', `VENT ${j + 1}${s < 0 ? 'L' : 'R'}`, {dist: 0.03, dir: [0, 0, s]});
      l.position.set(-AB.segLen / 2, h * 0.02, s * (w * 0.5 + 0.002));
      l.add(mesh(box(AB.segLen * 0.62, h * 0.32, 0.004), XM.steel, 0, -h * 0.16, 0));
      l.add(mesh(box(AB.segLen * 0.5, 0.004, 0.005), XM.accent, 0, -h * 0.02, 0));
      l.userData.s = s;
      g.add(l);
      louvers.push(l);
    }
    ap = g;
  }
  anchor('abdomen', segs[5].g, -AB.segLen / 2, 0.05, 0);
  const tip = reg(new THREE.Group(), 'abdomen', 'TIP PLATE', {dist: 0.03, dir: [-1, -0.5, 0]});
  tip.position.set(-AB.segLen, -0.012, 0);
  tip.add(mesh(rbox(0.04, 0.02, 0.05, 0.008), XM.gun, -0.018, 0, 0));
  ap.add(tip);
  const cerci = [];
  for (const s of [-1, 1]) {
    let cp = ap;
    const ch = [];
    for (let i = 0; i < 5; i++) {
      const c = reg(new THREE.Group(), 'abdomen', `CERCUS ${s < 0 ? 'L' : 'R'}${i + 1}`, {dist: 0.012});
      if (i === 0) c.position.set(-AB.segLen, 0.014, s * 0.022);
      else c.position.set(-0.016, 0, 0);
      c.add(mesh(cylX(0.004 - i * 0.0005, 0.0034 - i * 0.0005, 0.015, 7).clone().rotateY(Math.PI), i === 4 ? XM.accent : XM.steel));
      cp.add(c);
      ch.push(c);
      cp = c;
    }
    cerci.push({ch, s});
  }

  // ------------------------------------------------------------ rest poses, explode axes, seating order
  // The rest pose for the explode axes and the order: pose once at the default state, read each part's position.
  for (const p of parts) {
    p.userData.p0 = p.position.clone();
    p.userData.q0 = p.quaternion.clone();
    const d = p.userData.part.dir ? new V3(...p.userData.part.dir) : p.position.clone();
    if (d.lengthSq() < 1e-8) d.set(0, 1, 0);
    p.userData.ex = d.normalize();
  }
  root.updateMatrixWorld(true);
  const wp = new V3();
  const dists = parts.map((p) => p.getWorldPosition(wp).length() + p.userData.part.dist * 0.5);
  const sorted = dists.map((d, i) => [d, i]).sort((a, b) => a[0] - b[0]);
  sorted.forEach(([, i], r) => (parts[i].userData.order = r / (parts.length - 1)));

  const joints = parts.filter((p) => p.userData.part.joint).length;
  const bySub = Object.fromEntries(SUBS.map((s) => [s, parts.filter((p) => p.userData.part.sub === s).length]));

  // ------------------------------------------------------------ pose
  const tmpA = new THREE.Vector2();
  const rotPt = (jx, jy, ang, px, py) => tmpA.set(jx + px * Math.cos(ang) - py * Math.sin(ang), jy + px * Math.sin(ang) + py * Math.cos(ang));
  // point a cylinder from A to B and its rod from B back to A, in the parent's frame
  const aim = (a, B, cl, rl) => {
    const dx = B.x - a.A[0];
    const dy = B.y - a.A[1];
    const ang = Math.atan2(dy, dx);
    a.cyl.position.x = a.A[0];
    a.cyl.position.y = a.A[1];
    a.cyl.rotation.set(0, 0, ang);
    a.rod.position.x = B.x;
    a.rod.position.y = B.y;
    a.rod.rotation.set(0, 0, ang + Math.PI);
    return Math.hypot(dx, dy);
  };
  const out = {stroke: {}};

  const update = (S) => {
    for (const p of parts) {
      p.position.copy(p.userData.p0);
      p.quaternion.copy(p.userData.q0);
    }
    body.position.set(0, DIM.rideHeight + S.bob, 0);
    body.rotation.z = 0.012 * S.amp * Math.sin(S.phase * Math.PI * 4 + 0.6);
    body.rotation.x = 0.01 * S.amp * Math.sin(S.phase * Math.PI * 2);
    meta.rotation.z = 0.025 * S.amp * Math.sin(S.phase * Math.PI * 4) - 0.03 * S.curl;

    // thorax bay
    for (const h of plates) h.rotation.x = h.userData.side * S.plates * 112 * D2R;
    sled.position.y = -0.076 + S.coreLift * 0.25;
    sled.rotation.y = S.spin * 0.25;
    pistons.forEach((p, i) => (p.position.y = 0.006 + 0.011 * (0.5 + 0.5 * Math.sin(S.spin * 3 + (i * Math.PI) / 4)) * (0.3 + 0.7 * S.coreLift)));
    g1.rotation.x = S.spin * 0.9;
    g2.rotation.z = S.spin * 1.35;
    g3.rotation.y = S.spin * 1.9;
    rotor.rotation.y = S.spin * 6.5;

    // neck: the raise spread over the vertebrae, the head levelled, then pan and tilt
    let pitch = 0;
    verts.forEach((v, j) => {
      const r = (j === 0 ? P.pitchDeg : 0) + S.neckRaise / P.segs + 0.6 * Math.sin(S.t * 0.9 + j * 0.5) * (1 - S.lock);
      v.rotation.z = r * D2R;
      pitch += r;
      vplates[j].rotation.z = (-2 + 6 * S.armed + 4 * S.wings) * D2R;
    });
    neckMount.rotation.z = -pitch * D2R;
    pan.rotation.y = S.headYaw * D2R;
    tilt.rotation.z = S.headPitch * D2R;
    irises.forEach(({blades, pupil}) => {
      for (const b of blades) b.rotation.z = b.userData.a + Math.PI / 2 + (0.25 + S.iris * 0.95);
      pupil.scale.setScalar(0.6 + 0.6 * S.iris);
    });
    ocelli.forEach((o, i) => (o.rotation.z = 0.3 + 0.5 * Math.sin(S.t * 1.7 + i * 2) * (0.3 + 0.7 * S.iris)));
    antennae.forEach((ch, side) => {
      const s = side ? 1 : -1;
      ch.forEach((a, i) => {
        if (i === 0) {
          a.rotation.set(0, -s * (24 - 10 * S.lock + 6 * Math.sin(S.sweep * D2R)) * D2R, (62 - 22 * S.lock - 8 * S.armed) * D2R);
        } else {
          a.rotation.z = (-3.2 + 2.4 * S.lock + 1.6 * Math.sin(S.t * 1.4 + i * 0.42 + side * 1.3)) * D2R;
          a.rotation.y = 0.9 * Math.sin(S.t * 1.1 + i * 0.3 + side) * D2R;
        }
      });
    });
    mands.forEach((m, i) => (m.rotation.y = (i ? -1 : 1) * (8 + 26 * S.chew + 6 * S.lock) * D2R));
    palps.forEach(({ch, s, kind}) =>
      ch.forEach((g, i) => {
        const tw = Math.sin(S.t * 2.1 + i + s) * 6 + S.chew * 18 * Math.sin(S.t * 14 + i);
        if (i === 0) g.rotation.set(0, -s * 0.4, (kind === 'MAXILLARY' ? -70 : -58) * D2R + tw * D2R);
        else g.rotation.z = (kind === 'MAXILLARY' ? 26 : 30) * D2R + tw * 0.5 * D2R;
      }),
    );

    // raptorial arms from the absolute side angles of the pose, converted to the parent chain
    const shoulderPitch = (() => {
      let p = 0;
      for (let j = 0; j <= 6; j++) p += verts[j].rotation.z;
      return p;
    })();
    arms.forEach((a) => {
      const pose = S.arm;
      const c = pose.coxa * D2R - shoulderPitch;
      const f = (pose.femur - pose.coxa) * D2R;
      const tb = pose.tibia * D2R;
      a.ring.rotation.y = -a.s * pose.yaw * D2R;
      a.coxa.rotation.z = c;
      a.troch.rotation.z = f;
      a.tibia.rotation.z = tb;
      const flare = smoother(S.spines);
      a.fsp.forEach((sp, i) => (sp.rotation.z = (-62 + 62 * flare + (i % 3 === 1 ? 6 : 0) * flare) * D2R));
      a.tsp.forEach((sp) => (sp.rotation.z = (-58 + 50 * flare) * D2R));
      a.tars.forEach((g, i) => (g.rotation.z = (i === 0 ? 38 : 9) * D2R + 0.05 * Math.sin(S.t * 1.3 + i)));
      out.stroke[`f${a.s}`] = aim(a.a1, rotPt(DIM.arm.coxa, 0, f, 0.05, 0.03), 0.11, 0.13);
      out.stroke[`t${a.s}`] = aim(a.a2, rotPt(DIM.arm.femur, 0, tb, -0.03, 0.02), 0.12, 0.12);
    });

    // walking legs by IK to their foot targets
    out.legs = legs.map((l) => {
      const ft = footTarget(l.leg, S.phase, S.amp, S.turn);
      const k = legIK(l.leg, ft, S.bob);
      l.hip.rotation.y = k.yaw;
      l.coxa.rotation.z = k.coxa;
      l.troch.rotation.z = k.femur;
      l.guard.rotation.z = k.tibia * 0.5;
      l.tibia.rotation.z = k.tibia;
      l.tars[0].rotation.z = k.tarsus - k.tibiaAbs;
      for (let i = 1; i < 5; i++) l.tars[i].rotation.z = (-3 + (ft[1] > -0.395 ? -6 : 0)) * D2R;
      l.spurs.forEach((sp) => (sp.rotation.z = 0.2 * Math.sin(S.phase * 6.283)));
      l.claws.forEach((c, i) => (c.rotation.y = (i ? 1 : -1) * 0.35));
      aim(l.a1, rotPt(l.L.coxa, 0, k.femur, 0.08, 0.025), 0.07, 0.08);
      aim(l.a2, rotPt(l.L.femur, 0, k.tibia, -0.035, 0.02), 0, 0);
      return {foot: ft, k};
    });

    // wings: the hinge lifts and swings out for the bay or the display, the fan spreads and rolls up
    const lift = Math.max(S.plates * 0.85, S.wings);
    wings.forEach((w) => {
      const s = w.s;
      w.rootW.rotation.set(0, 0, 0);
      w.rootW.rotateY(s * (lift * 34) * D2R);
      w.rootW.rotateZ((3 - lift * 36) * D2R);
      w.teg.rotation.set(s * (5 - S.wings * 35) * D2R, 0, -S.wings * 14 * D2R);
      const spread = smoother(S.wings);
      w.fan.rotation.set(-s * spread * 72 * D2R, 0, 0);
      w.ribs.forEach((r, j) => (r.rotation.y = s * spread * j * STEP + s * 0.02 * j));
      w.panels.forEach((p) => (p.scale.z = Math.max(0.03, spread)));
    });

    // abdomen: a droop that curls up for the display, breathing in the sternites, vents opening
    segs.forEach(({g}, j) => {
      const droop = [-2, 1.5, 2.5, 3.5, 4.5, 5, 5.5, 6, 6.5, 7][j];
      g.rotation.z = (droop - S.curl * (3 + j * 1.3) + 0.5 * Math.sin(S.t * 1.2 - j * 0.4)) * D2R;
      g.rotation.y = 0.8 * Math.sin(S.t * 0.7 - j * 0.35) * S.amp * D2R;
    });
    sterns.forEach((st, j) => (st.position.y += 0.003 * Math.sin(S.t * 2.2 - j * 0.5)));
    louvers.forEach((l) => (l.rotation.x = -l.userData.s * S.vents * 70 * D2R));
    tip.rotation.z = 0.08 * Math.sin(S.t * 1.5);
    cerci.forEach(({ch, s}) => ch.forEach((c, i) => (c.rotation.set(0, s * (i ? 0.08 : 0.5), (i ? -0.08 : 0.35) + 0.12 * Math.sin(S.t * 2 + i + s)))));

    // the exploded view over the pose
    for (const p of parts) {
      const e = S.explodeK(p.userData.order);
      if (e > 1e-4) {
        p.position.addScaledVector(p.userData.ex, p.userData.part.dist * EXPLODE * e);
      }
    }
    // seated: parts not displaced
    out.seated = parts.reduce((n, p) => n + (S.explodeK(p.userData.order) < 0.02 ? 1 : 0), 0);
  };

  // subsystem glow: the working subsystem's lime goes up, its armour picks up a little of it
  const setActive = (act) => {
    for (const s of SUBS) {
      const a = clamp(act[s] ?? 0, 0, 1);
      M[s].accent.emissiveIntensity = 0.42 + 0.5 * a;
      M[s].armour.emissiveIntensity = 0.07 * a;
    }
  };

  return {root, body, parts, joints, bySub, anchors, update, setActive, out, M, legs, arms, wings, plates, sled};
}
