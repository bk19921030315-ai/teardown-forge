// CALLINECTES CB-9, the geometry. Built from code: extruded shell plates, rounded boxes, cones, tubes. Every rigid part
// that moves is registered once (reg) with its subsystem, so the console's part count is the length of that list and
// nothing else. update(state) poses all of them from kin.js's state for the frame, then lays the exploded view over
// the pose: each part slides out along its own mount axis, in the order it reseats.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {clamp, D2R, DIM, footTarget, legIK, LEGS, smoother} from './kin.js';

const V3 = THREE.Vector3;
export const SUBS = ['claws', 'eyes', 'core', 'paddles', 'mouth', 'legs', 'body'];
export const ACCENT = '#c6f135';
const EXPLODE = 2.6;
// repeated parts, tuned so the registry lands on the requested count
export const COUNTS = {teeth: 11, antenna: DIM.antenna.segs, lamellae: 7, gills: 8, apron: 9};

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
  // the shell is the biggest flat surface facing the key light: matte, a step darker than the armour
  M.shell = new THREE.MeshStandardMaterial({color: '#8f958e', roughness: 0.78, metalness: 0.08, envMapIntensity: 0.3});
  M.shellTop = new THREE.MeshStandardMaterial({color: '#a9aea6', roughness: 0.74, metalness: 0.06, envMapIntensity: 0.3});
  M.gill = new THREE.MeshStandardMaterial({color: '#3a4419', emissive: lime.clone(), emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.2});
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
// a cone whose tip points along local +x, base at the origin
const coneX = (len, r, seg = 7) => (G[`kx${len},${r},${seg}`] ??= new THREE.ConeGeometry(r, len, seg).rotateZ(-Math.PI / 2).translate(len / 2, 0, 0));
// a cone whose tip points down local -y
const coneDown = (len, r) => (G[`kd${len},${r}`] ??= new THREE.ConeGeometry(r, len, 7).rotateZ(Math.PI).translate(0, -len / 2, 0));
const coneUp = (len, r) => (G[`ku${len},${r}`] ??= new THREE.ConeGeometry(r, len, 7).translate(0, len / 2, 0));
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
// a limb segment along +x from the joint: a rounded slab, a lime strip on top, a joint drum at the root
const segment = (len, w, h, M, {strip = true, drum = true, skin = 'armour', drumAxis = 'z'} = {}) => {
  const g = new THREE.Group();
  g.add(mesh(rbox(len, h, w, Math.min(w, h) * 0.38), M[skin], len / 2, 0, 0));
  if (strip) g.add(mesh(box(len * 0.62, 0.004, w * 0.3), M.accent, len * 0.52, h / 2 + 0.0015, 0));
  if (drum) g.add(drumAxis === 'z' ? mesh(cylZ(Math.max(w, h) * 0.5, w * 1.15, 18), M.steel) : mesh(cylY(Math.max(w, h) * 0.5, h * 1.15, 18), M.steel));
  return g;
};
/** A flat plate from a polygon in the body's x-z plane (y up), top face at y = 0, `depth` thick, bevelled. */
const plate = (pts, depth, bevel) => {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8});
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
};

export function buildCrab() {
  const M = makeMaterials();
  const parts = [];
  // reg: one rigid moving part. joint: it turns or slides against its parent (false: it rides along, like a tooth on
  // a finger). dir: the axis it slides out along in the exploded view (default: from its parent's joint to its own).
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

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ------------------------------------------------------------ chassis: the body under the shell
  const B = M.body;
  const chassis = reg(new THREE.Group(), 'body', 'CHASSIS', {joint: false, dist: 0});
  chassis.add(mesh(rbox(0.46, 0.11, 0.56, 0.04), B.armour, 0, -0.045, 0));
  chassis.add(mesh(rbox(0.4, 0.02, 0.48, 0.008), B.black, 0, -0.105, 0));
  chassis.add(mesh(rbox(0.07, 0.09, 0.26, 0.02), B.steel, 0.215, -0.02, 0));
  for (const s of [-1, 1]) {
    // the gill chambers: dark trays either side of the pump
    chassis.add(mesh(rbox(0.32, 0.012, 0.22, 0.006), B.black, -0.04, 0.012, s * 0.17));
    chassis.add(mesh(box(0.36, 0.01, 0.004), B.accent, -0.02, -0.03, s * 0.282));
  }
  body.add(chassis);

  // ------------------------------------------------------------ carapace: two halves on a hinge down the middle
  const C = M.core;
  // the right half's outline in the body's x-z plane; the left half mirrors it
  const HALF = [[0.25, 0.0], [0.24, 0.1], [0.19, 0.22], [0.11, 0.35], [0.02, 0.42], [-0.08, 0.36], [-0.18, 0.24], [-0.24, 0.12], [-0.25, 0.0]];
  const INNER = HALF.map(([x, z]) => [x * 0.72 - 0.01, z * 0.7]);
  const halves = [];
  const spines = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const h = reg(new THREE.Group(), 'core', `CARAPACE ${tag}`, {dist: 0.16, dir: [0, 1, s * 0.5]});
    h.position.set(0, 0.075, 0);
    const pts = HALF.map(([x, z]) => [x, s * z]);
    h.add(mesh(plate(pts, 0.022, 0.012), M.shell, 0, 0, 0));
    h.add(mesh(plate(INNER.map(([x, z]) => [x, s * z]), 0.012, 0.01), M.shellTop, 0, 0.026, 0));
    // a lime line along the front margin and a dark groove across the shell
    for (let i = 1; i < 4; i++) {
      const [x0, z0] = HALF[i];
      const [x1, z1] = HALF[i + 1];
      const m = mesh(box(Math.hypot(x1 - x0, z1 - z0), 0.004, 0.006), C.accent, (x0 + x1) / 2, 0.016, s * ((z0 + z1) / 2) * 0.96);
      m.rotation.y = -Math.atan2(s * (z1 - z0), x1 - x0);
      h.add(m);
    }
    h.add(mesh(box(0.004, 0.006, 0.26), C.black, -0.06, 0.038, s * 0.14));
    h.add(mesh(cylX(0.009, 0.009, 0.5, 10), C.steel, -0.25, -0.004, 0));
    body.add(h);
    halves.push(h);
    // nine anterolateral spines on the margin, the last one the long lateral spine; three teeth on the front
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      // walk the margin from HALF[1] to HALF[4]
      const segF = k * 3;
      const j = Math.min(2, Math.floor(segF));
      const f = segF - j;
      const [xa, za] = HALF[1 + j];
      const [xb, zb] = HALF[2 + j];
      const x = xa + (xb - xa) * f;
      const z = za + (zb - za) * f;
      const nx = zb - za;
      const nz = -(xb - xa);
      const ang = Math.atan2(s * nz, nx) * 0 + Math.atan2(nz, nx);
      const last = i === 8;
      const sp = reg(new THREE.Group(), 'core', `LATERAL SPINE ${tag}${i + 1}`, {joint: false, dist: 0.04, dir: [nx, 0, s * nz]});
      sp.position.set(x, 0.002, s * z);
      sp.rotation.y = -s * ang + (s < 0 ? 0 : 0);
      sp.add(mesh(coneX(last ? DIM.carapace.spine : 0.04 + 0.006 * (i % 2), last ? 0.026 : 0.014, 8), last ? C.chrome : C.armour));
      h.add(sp);
      spines.push(sp);
    }
    for (let i = 0; i < 3; i++) {
      const t = reg(new THREE.Group(), 'core', `FRONT TOOTH ${tag}${i + 1}`, {joint: false, dist: 0.03, dir: [1, 0, s * 0.3]});
      t.position.set(0.25 - i * 0.004, 0.0, s * (0.025 + i * 0.03));
      t.add(mesh(coneX(0.03, 0.011, 6), C.armour));
      h.add(t);
      spines.push(t);
    }
  }
  anchor('shell', halves[1], -0.02, 0.04, 0.22);

  // ------------------------------------------------------------ gill chambers and the pump
  const gills = [];
  for (const s of [-1, 1]) {
    for (let g = 0; g < COUNTS.gills; g++) {
      const a = (-30 + g * 14) * D2R;
      const st = reg(new THREE.Group(), 'core', `GILL ${s < 0 ? 'L' : 'R'}${g + 1}`, {dist: 0.05, dir: [Math.sin(a) * 0.3, 0.6, s]});
      st.position.set(0.1 - Math.cos(a) * 0.05 - g * 0.028, 0.018, s * (0.09 + Math.abs(Math.sin(a)) * 0.04));
      st.rotation.y = -s * (60 + g * 6) * D2R;
      st.add(mesh(cylY(0.004, 0.06, 8), C.steel, 0, 0.03, 0));
      chassis.add(st);
      const lam = [];
      for (let k = 0; k < COUNTS.lamellae; k++) {
        const l = reg(new THREE.Group(), 'core', `LAMELLA ${s < 0 ? 'L' : 'R'}${g + 1}.${k + 1}`, {dist: 0.012, dir: [0, 1, 0]});
        l.position.set(0, 0.006 + k * 0.0075, 0);
        l.add(mesh(rbox(0.13 - k * 0.006, 0.0035, 0.034, 0.0015), M.gill, 0.065, 0, 0));
        st.add(l);
        lam.push(l);
      }
      gills.push({st, lam, g, s});
    }
  }
  anchor('gills', gills[COUNTS.gills + 3].st, 0.06, 0.04, 0);
  const bailers = [];
  for (const s of [-1, 1]) {
    const b = reg(new THREE.Group(), 'core', `BAILER ${s < 0 ? 'L' : 'R'}`, {dist: 0.04, dir: [1, 0.5, s]});
    b.position.set(0.15, 0.03, s * 0.14);
    b.add(mesh(rbox(0.012, 0.035, 0.07, 0.004), C.gun, 0, 0, s * 0.03));
    chassis.add(b);
    bailers.push(b);
  }
  const housing = reg(new THREE.Group(), 'core', 'PUMP HOUSING', {joint: false, dist: 0.05, dir: [0, 1, 0]});
  housing.position.set(-0.03, 0.012, 0);
  housing.add(mesh(cylY(0.05, 0.016, 32), C.steel, 0, 0.008, 0));
  housing.add(mesh(torus(0.05, 0.0035), C.accent, 0, 0.016, 0).rotateX(Math.PI / 2));
  chassis.add(housing);
  const rotor = reg(new THREE.Group(), 'core', 'PUMP ROTOR', {dist: 0.06, dir: [0, 1, 0]});
  rotor.position.set(0, 0.026, 0);
  rotor.add(mesh(cylY(0.022, 0.008, 24), C.chrome));
  for (let k = 0; k < 4; k++) rotor.add(mesh(box(0.04, 0.006, 0.006), C.accent, 0, 0.005, 0).rotateY((k * Math.PI) / 4));
  rotor.add(mesh(torus(0.022, 0.0025, 24), M.glow, 0, 0.002, 0).rotateX(Math.PI / 2));
  housing.add(rotor);
  const pistons = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = reg(new THREE.Group(), 'core', `PUMP PISTON ${i + 1}`, {dist: 0.05, dir: [Math.cos(a), 0.6, Math.sin(a)]});
    p.position.set(Math.cos(a) * 0.038, 0.016, Math.sin(a) * 0.038);
    p.add(mesh(cylY(0.0055, 0.028, 10), C.chrome, 0, 0.014, 0));
    p.add(mesh(cylY(0.008, 0.006, 12), C.accent, 0, 0.03, 0));
    housing.add(p);
    pistons.push(p);
  }
  const valves = [];
  for (const s of [-1, 1]) {
    const v = reg(new THREE.Group(), 'core', `PUMP VALVE ${s < 0 ? 'L' : 'R'}`, {dist: 0.04, dir: [0, 1, s]});
    v.position.set(0, 0.018, s * 0.05);
    v.add(mesh(rbox(0.04, 0.004, 0.024, 0.002), C.gun, 0, 0, s * 0.012));
    housing.add(v);
    valves.push(v);
  }
  anchor('pump', housing, 0, 0.05, 0);

  // ------------------------------------------------------------ eyes, antennules, antennae
  const E = M.eyes;
  const eyes = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const sock = reg(new THREE.Group(), 'eyes', `EYE SOCKET ${tag}`, {dist: 0.04, dir: [1, 0.3, s]});
    sock.position.set(0.255, 0.055, s * 0.075);
    sock.add(mesh(cylY(0.018, 0.016, 16), E.steel));
    sock.add(mesh(torus(0.018, 0.0025, 24), E.accent, 0, 0.008, 0).rotateX(Math.PI / 2));
    chassis.add(sock);
    const stalk = reg(new THREE.Group(), 'eyes', `EYESTALK ${tag}`, {dist: 0.04, dir: [0, 1, 0]});
    stalk.position.set(0, 0.006, 0);
    stalk.add(mesh(cylY(0.0105, DIM.eye.stalk, 12), E.armour, 0, DIM.eye.stalk / 2, 0));
    stalk.add(mesh(box(0.004, DIM.eye.stalk * 0.6, 0.004), E.accent, 0.011, DIM.eye.stalk * 0.5, 0));
    sock.add(stalk);
    const dome = reg(new THREE.Group(), 'eyes', `EYE DOME ${tag}`, {joint: false, dist: 0.03, dir: [0.5, 1, 0]});
    dome.position.set(0, DIM.eye.stalk + DIM.eye.r * 0.7, 0);
    dome.add(mesh(sph(DIM.eye.r, 22), M.eye));
    dome.add(mesh(torus(DIM.eye.r * 0.98, 0.0025, 32), E.steel).rotateX(Math.PI / 2));
    stalk.add(dome);
    const ir = new THREE.Group();
    ir.position.set(DIM.eye.r * 0.93, 0, 0);
    ir.quaternion.setFromUnitVectors(new V3(0, 0, 1), new V3(1, 0, 0));
    dome.add(ir);
    const pupil = mesh(sph(0.0065, 12), M.pupil, 0, 0, -0.0015);
    ir.add(pupil);
    const blades = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = reg(new THREE.Group(), 'eyes', `IRIS ${tag}${i + 1}`, {dist: 0.02, dir: [Math.cos(a), Math.sin(a), 1]});
      b.position.set(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.001);
      b.userData.a = a;
      b.add(mesh(box(0.016, 0.0055, 0.0018), E.steel, -0.008, 0, 0));
      ir.add(b);
      blades.push(b);
    }
    eyes.push({s, sock, stalk, dome, blades, pupil});
  }
  anchor('eyes', eyes[1].dome, 0.01, 0.02, 0.01);
  const antennules = [];
  const antennae = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    let p = chassis;
    const ch = [];
    for (let i = 0; i < 6; i++) {
      const a = reg(new THREE.Group(), 'eyes', `ANTENNULE ${tag}${i + 1}`, {dist: 0.012});
      if (i === 0) a.position.set(0.255, 0.02, s * 0.025);
      else a.position.set(0.014, 0, 0);
      a.add(mesh(cylX(0.004 - i * 0.0004, 0.0035 - i * 0.0004, 0.013, 7), i === 5 ? E.accent : E.gun));
      p.add(a);
      ch.push(a);
      p = a;
    }
    antennules.push(ch);
    p = chassis;
    const an = [];
    for (let i = 0; i < COUNTS.antenna; i++) {
      const a = reg(new THREE.Group(), 'eyes', `ANTENNA ${tag}${i + 1}`, {dist: 0.012});
      if (i === 0) a.position.set(0.255, 0.0, s * 0.05);
      else a.position.set(DIM.antenna.segLen, 0, 0);
      const r = 0.0036 - (i / COUNTS.antenna) * 0.0022;
      a.add(mesh(cylX(r, r * 0.85, DIM.antenna.segLen * 0.94, 6), i % 4 === 3 ? E.accent : E.steel));
      p.add(a);
      an.push(a);
      p = a;
    }
    antennae.push(an);
  }
  anchor('antenna', antennae[1][12], 0.01, 0, 0);

  // ------------------------------------------------------------ mouthparts: three pairs of maxillipeds, mandibles
  const MO = M.mouth;
  const mouth = {doors: [], inner: [], first: [], mands: []};
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const door = reg(new THREE.Group(), 'mouth', `MAXILLIPED 3 ISCHIUM ${tag}`, {dist: 0.04, dir: [1, 0, s * 0.5]});
    door.position.set(0.253, -0.05, s * 0.05);
    door.add(mesh(rbox(0.008, 0.032, 0.048, 0.003), MO.armour, 0, 0, -s * 0.024));
    door.add(mesh(box(0.003, 0.026, 0.004), MO.accent, 0.005, 0, -s * 0.04));
    chassis.add(door);
    const upper = reg(new THREE.Group(), 'mouth', `MAXILLIPED 3 MERUS ${tag}`, {dist: 0.03, dir: [0, 1, 0]});
    upper.position.set(0, 0.032, 0);
    upper.add(mesh(rbox(0.008, 0.03, 0.044, 0.003), MO.armour, 0, 0, -s * 0.022));
    door.add(upper);
    let pp = upper;
    const palp = [];
    for (let i = 0; i < 3; i++) {
      const g = reg(new THREE.Group(), 'mouth', `MAXILLIPED 3 PALP ${tag}${i + 1}`, {dist: 0.012});
      if (i === 0) g.position.set(0.006, 0.012, -s * 0.042);
      else g.position.set(0.016, 0, 0);
      g.add(mesh(cylX(0.0035, 0.003, 0.015, 7), i === 2 ? MO.accent : MO.gun));
      pp.add(g);
      palp.push(g);
      pp = g;
    }
    mouth.doors.push({s, door, upper, palp});
    // second maxillipeds: three segments behind the doors; first maxillipeds: two flat lobes
    let ip = chassis;
    const inner = [];
    for (let i = 0; i < 3; i++) {
      const g = reg(new THREE.Group(), 'mouth', `MAXILLIPED 2 ${tag}${i + 1}`, {dist: 0.015});
      if (i === 0) g.position.set(0.245, -0.025, s * 0.02);
      else g.position.set(0.015, 0, 0);
      g.add(mesh(rbox(0.016, 0.006, 0.01, 0.002), MO.steel, 0.008, 0, 0));
      ip.add(g);
      inner.push(g);
      ip = g;
    }
    mouth.inner.push({s, ch: inner});
    let fp = chassis;
    const first = [];
    for (let i = 0; i < 2; i++) {
      const g = reg(new THREE.Group(), 'mouth', `MAXILLIPED 1 ${tag}${i + 1}`, {dist: 0.015});
      if (i === 0) g.position.set(0.24, -0.06, s * 0.012);
      else g.position.set(0.014, 0, 0);
      g.add(mesh(rbox(0.014, 0.004, 0.016, 0.0015), MO.gun, 0.007, 0, 0));
      fp.add(g);
      first.push(g);
      fp = g;
    }
    mouth.first.push({s, ch: first});
    const md = reg(new THREE.Group(), 'mouth', `MANDIBLE ${tag}`, {dist: 0.025, dir: [0.5, -0.5, s]});
    md.position.set(0.238, -0.042, s * 0.014);
    md.add(mesh(rbox(0.018, 0.012, 0.01, 0.003), MO.chrome, 0.008, 0, -s * 0.003));
    chassis.add(md);
    mouth.mands.push({s, md});
  }
  anchor('mouth', mouth.doors[1].door, 0.01, 0.01, -0.02);

  // ------------------------------------------------------------ claws: crusher on the right, cutter on the left
  const CM = M.claws;
  const CL = DIM.claw;
  const claws = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const k = s > 0 ? 1.18 : 0.88; // the crusher is the heavier claw
    const ring = reg(new THREE.Group(), 'claws', `CLAW SHOULDER ${tag}`, {dist: 0.05, dir: [0.3, 0, s]});
    ring.position.set(0.17, -0.025, s * 0.27);
    ring.rotation.order = 'YZX';
    ring.add(mesh(cylY(0.03, 0.03, 18), CM.steel));
    ring.add(mesh(torus(0.03, 0.003, 24), CM.accent, 0, 0.016, 0).rotateX(Math.PI / 2));
    chassis.add(ring);
    const coxa = reg(new THREE.Group(), 'claws', `CLAW COXA ${tag}`, {dist: 0.03});
    coxa.add(segment(CL.coxa, 0.05, 0.05, CM, {strip: false, drum: false}));
    ring.add(coxa);
    const basis = reg(new THREE.Group(), 'claws', `CLAW BASIS ${tag}`, {dist: 0.03});
    basis.position.set(CL.coxa, 0, 0);
    basis.add(mesh(cylY(0.028, 0.055, 16), CM.gun));
    coxa.add(basis);
    const merus = reg(new THREE.Group(), 'claws', `CLAW MERUS ${tag}`, {dist: 0.05, dir: [1, 0, 0]});
    merus.add(mesh(rbox(CL.merus, 0.06 * k, 0.05 * k, 0.018), CM.armour, CL.merus / 2, 0, 0));
    merus.add(mesh(box(CL.merus * 0.6, 0.004, 0.016), CM.accent, CL.merus * 0.52, 0.03 * k + 0.002, 0));
    basis.add(merus);
    const mSp = [];
    for (let i = 0; i < 4; i++) {
      const sp = reg(new THREE.Group(), 'claws', `MERUS SPINE ${tag}${i + 1}`, {joint: false, dist: 0.025, dir: [0, 0, -s]});
      sp.position.set(0.06 + i * 0.05, 0.012, -s * 0.026 * k);
      sp.rotation.y = s * (90 - 20) * D2R;
      sp.add(mesh(coneX(0.026, 0.006, 6), CM.chrome));
      merus.add(sp);
      mSp.push(sp);
    }
    const carpus = reg(new THREE.Group(), 'claws', `CLAW CARPUS ${tag}`, {dist: 0.045, dir: [1, 0, 0]});
    carpus.position.set(CL.merus, 0, 0);
    carpus.add(mesh(cylY(0.034 * k, 0.07 * k, 18), CM.steel));
    carpus.add(mesh(rbox(CL.carpus, 0.065 * k, 0.06 * k, 0.02), CM.armour, CL.carpus / 2, 0, 0));
    merus.add(carpus);
    const cSp = [];
    for (let i = 0; i < 2; i++) {
      const sp = reg(new THREE.Group(), 'claws', `CARPUS SPINE ${tag}${i + 1}`, {joint: false, dist: 0.025, dir: [0, 0, s]});
      sp.position.set(0.04 + i * 0.05, 0.02, s * 0.03 * k);
      sp.rotation.y = -s * 70 * D2R;
      sp.add(mesh(coneX(0.032 - i * 0.01, 0.007, 6), CM.chrome));
      carpus.add(sp);
      cSp.push(sp);
    }
    const palm = reg(new THREE.Group(), 'claws', `CLAW PALM ${tag}`, {dist: 0.05, dir: [1, 0, 0]});
    palm.position.set(CL.carpus, 0, 0);
    palm.rotation.order = 'YXZ';
    palm.add(mesh(rbox(CL.palm, 0.125 * k, 0.062 * k, 0.028), CM.armour, CL.palm / 2, 0.006, 0));
    palm.add(mesh(box(CL.palm * 0.7, 0.004, 0.02), CM.accent, CL.palm * 0.5, 0.05 * k + 0.002, 0));
    // the fixed finger (pollex) runs on from the lower half of the palm
    palm.add(mesh(rbox(CL.finger, 0.035 * k, 0.04 * k, 0.012), CM.armour, CL.palm + CL.finger / 2 - 0.01, -0.025 * k, 0));
    palm.add(mesh(coneX(0.04, 0.016 * k, 8), CM.chrome, CL.palm + CL.finger - 0.02, -0.025 * k, 0));
    carpus.add(palm);
    const dactyl = reg(new THREE.Group(), 'claws', `DACTYL ${tag}`, {dist: 0.05, dir: [0.5, 1, 0]});
    dactyl.position.set(CL.palm - 0.012, 0.022 * k, 0);
    dactyl.add(mesh(cylZ(0.018 * k, 0.05 * k, 16), CM.steel));
    dactyl.add(mesh(rbox(CL.finger, 0.032 * k, 0.036 * k, 0.012), CM.armour, CL.finger / 2, 0, 0));
    dactyl.add(mesh(coneX(0.045, 0.014 * k, 8), CM.chrome, CL.finger - 0.008, -0.004, 0));
    palm.add(dactyl);
    const teeth = [];
    for (let i = 0; i < 11; i++) {
      // dactyl teeth on its lower edge, pollex teeth on the fixed finger's upper edge; crusher teeth are blunt molars
      const dt = reg(new THREE.Group(), 'claws', `DACTYL TOOTH ${tag}${i + 1}`, {joint: false, dist: 0.015, dir: [0, -1, 0]});
      dt.position.set(0.02 + i * 0.012, -0.016 * k, 0);
      dt.add(mesh(s > 0 ? sph(0.0055 + (i % 3 === 0 ? 0.002 : 0), 8) : coneDown(0.012, 0.0035), CM.chrome));
      dactyl.add(dt);
      teeth.push(dt);
      const pt = reg(new THREE.Group(), 'claws', `POLLEX TOOTH ${tag}${i + 1}`, {joint: false, dist: 0.015, dir: [0, 1, 0]});
      pt.position.set(CL.palm + 0.006 + i * 0.012, -0.008 * k, 0);
      pt.add(mesh(s > 0 ? sph(0.0055 + (i % 3 === 1 ? 0.002 : 0), 8) : coneUp(0.012, 0.0035), CM.chrome));
      palm.add(pt);
      teeth.push(pt);
    }
    // three rams: merus → carpus, carpus → palm (both in the horizontal plane), palm → dactyl (in the claw's plane)
    const ram = (par, Aa, name, cl, rl, plane) => {
      const cyl = reg(new THREE.Group(), 'claws', `${name} CYLINDER ${tag}`, {dist: 0.025, dir: [0, 1, 0]});
      cyl.add(mesh(cylX(0.0075, 0.0075, cl, 10), CM.steel));
      cyl.add(mesh(cylX(0.0085, 0.0085, 0.007, 10), CM.accent, cl - 0.007, 0, 0));
      const rod = reg(new THREE.Group(), 'claws', `${name} ROD ${tag}`, {dist: 0.025, dir: [0, 1, 0]});
      rod.add(mesh(cylX(0.004, 0.004, rl, 8), CM.chrome));
      par.add(cyl, rod);
      return {cyl, rod, A: Aa, plane};
    };
    const r1 = ram(merus, [0.06, 0.036 * k, s * 0.012], 'MERUS', 0.13, 0.14, 'xz');
    const r2 = ram(carpus, [0.0, 0.04 * k, -s * 0.0], 'CARPUS', 0.07, 0.09, 'xz');
    const r3 = ram(palm, [0.03, 0.04 * k, 0], 'DACTYL', 0.1, 0.1, 'xy');
    claws.push({s, k, ring, coxa, basis, merus, carpus, palm, dactyl, teeth, rams: [r1, r2, r3]});
  }
  anchor('crusher', claws[1].palm, CL.palm * 0.5, 0.06, 0);
  anchor('cutter', claws[0].palm, CL.palm * 0.5, 0.05, 0);

  // ------------------------------------------------------------ walking legs
  const LM = M.legs;
  const LL = DIM.leg;
  const legs = [];
  for (const leg of LEGS) {
    const s = leg.side;
    const hip = reg(new THREE.Group(), 'legs', `HIP SERVO ${leg.id}`, {dist: 0.06, dir: [0, -0.3, s]});
    hip.position.set(...leg.hip);
    hip.add(mesh(cylY(0.026, 0.04, 18), LM.steel));
    hip.add(mesh(torus(0.026, 0.003, 24), LM.accent, 0, -0.019, 0).rotateX(Math.PI / 2));
    chassis.add(hip);
    const coxa = reg(new THREE.Group(), 'legs', `COXA ${leg.id}`, {dist: 0.035, dir: [1, 0, 0]});
    coxa.add(segment(LL.coxa, 0.034, 0.038, LM, {strip: false}));
    hip.add(coxa);
    const basis = reg(new THREE.Group(), 'legs', `BASIS ${leg.id}`, {dist: 0.03});
    basis.position.set(LL.coxa, 0, 0);
    basis.add(mesh(cylZ(0.019, 0.04, 16), LM.gun));
    coxa.add(basis);
    const merus = reg(new THREE.Group(), 'legs', `MERUS ${leg.id}`, {dist: 0.04, dir: [1, 0, 0]});
    merus.add(segment(LL.merus, 0.022, 0.046, LM, {drum: false}));
    basis.add(merus);
    const mSp = [];
    for (let i = 0; i < 3; i++) {
      const sp = reg(new THREE.Group(), 'legs', `MERUS SPINE ${leg.id}${i + 1}`, {joint: false, dist: 0.02, dir: [0, -1, 0]});
      sp.position.set(0.1 + i * 0.08, -0.022, 0);
      sp.rotation.z = -0.5;
      sp.add(mesh(coneDown(0.018, 0.0035), LM.chrome));
      merus.add(sp);
      mSp.push(sp);
    }
    const carpus = reg(new THREE.Group(), 'legs', `CARPUS ${leg.id}`, {dist: 0.04, dir: [1, 0, 0]});
    carpus.position.set(LL.merus, 0, 0);
    carpus.add(mesh(cylZ(0.02, 0.03, 16), LM.steel));
    carpus.add(segment(LL.carpus, 0.02, 0.036, LM, {drum: false, strip: false, skin: 'gun'}));
    merus.add(carpus);
    const prop = reg(new THREE.Group(), 'legs', `PROPODUS ${leg.id}`, {dist: 0.035, dir: [1, 0, 0]});
    prop.position.set(LL.carpus, 0, 0);
    prop.add(segment(LL.propodus, 0.018, 0.03, LM, {drum: false}));
    carpus.add(prop);
    const combs = [];
    for (let i = 0; i < 2; i++) {
      const cb = reg(new THREE.Group(), 'legs', `SETAE COMB ${leg.id}${i + 1}`, {dist: 0.015, dir: [0, 1, 0]});
      cb.position.set(0.05 + i * 0.07, 0.016, 0);
      cb.add(mesh(box(0.05, 0.006, 0.012), LM.black, 0.0, 0.003, 0));
      prop.add(cb);
      combs.push(cb);
    }
    const dact = reg(new THREE.Group(), 'legs', `DACTYL ${leg.id}`, {dist: 0.03, dir: [1, 0, 0]});
    dact.position.set(LL.propodus, 0, 0);
    dact.add(mesh(cylZ(0.012, 0.024, 12), LM.steel));
    dact.add(mesh(coneX(LL.dactyl, 0.011, 8), LM.armour));
    prop.add(dact);
    const tip = reg(new THREE.Group(), 'legs', `DACTYL TIP ${leg.id}`, {dist: 0.015, dir: [1, 0, 0]});
    tip.position.set(LL.dactyl - 0.025, 0, 0);
    tip.add(mesh(coneX(0.03, 0.006, 8), LM.accent));
    dact.add(tip);
    const ram = (par, Aa, name, cl, rl) => {
      const cyl = reg(new THREE.Group(), 'legs', `${name} CYLINDER ${leg.id}`, {dist: 0.025, dir: [0, 0, s]});
      cyl.add(mesh(cylX(0.0065, 0.0065, cl, 10), LM.steel));
      const rod = reg(new THREE.Group(), 'legs', `${name} ROD ${leg.id}`, {dist: 0.025, dir: [0, 0, s]});
      rod.add(mesh(cylX(0.0034, 0.0034, rl, 8), LM.chrome));
      cyl.position.z = -0.018;
      rod.position.z = -0.018;
      par.add(cyl, rod);
      return {cyl, rod, A: Aa};
    };
    const a1 = ram(coxa, [-0.01, 0.03], 'LIFT', 0.07, 0.08);
    const a2 = ram(merus, [0.08, 0.034], 'KNEE', 0.14, 0.14);
    legs.push({leg, hip, coxa, basis, merus, carpus, prop, dact, tip, combs, mSp, a1, a2});
    if (leg.id === 'R3') anchor('legR3', merus, LL.merus, 0.03, 0);
    if (leg.id === 'L2') anchor('legL2', merus, LL.merus, 0.03, 0);
  }

  // ------------------------------------------------------------ swimming paddles (pereiopod 5)
  const PM = M.paddles;
  const PL = DIM.paddle;
  const paddles = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const hip = reg(new THREE.Group(), 'paddles', `PADDLE HIP ${tag}`, {dist: 0.06, dir: [-0.5, 0, s]});
    hip.position.set(-0.22, -0.03, s * 0.27);
    hip.add(mesh(cylY(0.024, 0.04, 18), PM.steel));
    chassis.add(hip);
    const coxa = reg(new THREE.Group(), 'paddles', `PADDLE COXA ${tag}`, {dist: 0.03});
    coxa.add(segment(PL.coxa, 0.032, 0.036, PM, {strip: false}));
    hip.add(coxa);
    const basis = reg(new THREE.Group(), 'paddles', `PADDLE BASIS ${tag}`, {dist: 0.03});
    basis.position.set(PL.coxa, 0, 0);
    basis.add(mesh(cylZ(0.018, 0.038, 16), PM.gun));
    coxa.add(basis);
    const merus = reg(new THREE.Group(), 'paddles', `PADDLE MERUS ${tag}`, {dist: 0.04, dir: [1, 0, 0]});
    merus.add(segment(PL.merus, 0.022, 0.042, PM, {drum: false}));
    basis.add(merus);
    const carpus = reg(new THREE.Group(), 'paddles', `PADDLE CARPUS ${tag}`, {dist: 0.035, dir: [1, 0, 0]});
    carpus.position.set(PL.merus, 0, 0);
    carpus.add(mesh(cylZ(0.019, 0.03, 16), PM.steel));
    carpus.add(segment(PL.carpus, 0.02, 0.034, PM, {drum: false, strip: false, skin: 'gun'}));
    merus.add(carpus);
    const prop = reg(new THREE.Group(), 'paddles', `PADDLE PROPODUS ${tag}`, {dist: 0.035, dir: [1, 0, 0]});
    prop.position.set(PL.carpus, 0, 0);
    prop.add(mesh(rbox(PL.propodus, 0.05, 0.012, 0.005), PM.armour, PL.propodus / 2, 0, 0));
    carpus.add(prop);
    const blade = reg(new THREE.Group(), 'paddles', `PADDLE BLADE ${tag}`, {dist: 0.04, dir: [1, 0, 0]});
    blade.position.set(PL.propodus, 0, 0);
    {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.02);
      sh.bezierCurveTo(0.04, -0.05, 0.11, -0.045, PL.blade, 0);
      sh.bezierCurveTo(0.11, 0.045, 0.04, 0.05, 0, 0.02);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 12});
      g.translate(0, 0, -0.003);
      blade.add(mesh(g, PM.armour));
      blade.add(mesh(box(PL.blade * 0.8, 0.003, 0.008), PM.accent, PL.blade * 0.45, 0, 0));
    }
    prop.add(blade);
    const slats = [];
    for (let i = 0; i < 8; i++) {
      const up = i % 2 ? 1 : -1;
      const sl = reg(new THREE.Group(), 'paddles', `PADDLE SLAT ${tag}${i + 1}`, {dist: 0.015, dir: [0, up, 0]});
      sl.position.set(0.02 + Math.floor(i / 2) * 0.03, up * 0.04, 0);
      sl.add(mesh(rbox(0.026, 0.024, 0.003, 0.001), PM.gun, 0, up * 0.012, 0));
      sl.add(mesh(box(0.02, 0.002, 0.004), PM.accent, 0, up * 0.022, 0));
      blade.add(sl);
      slats.push({sl, up});
    }
    const ram = (par, Aa, name, cl, rl) => {
      const cyl = reg(new THREE.Group(), 'paddles', `${name} CYLINDER ${tag}`, {dist: 0.025, dir: [0, 0, s]});
      cyl.add(mesh(cylX(0.006, 0.006, cl, 10), PM.steel));
      const rod = reg(new THREE.Group(), 'paddles', `${name} ROD ${tag}`, {dist: 0.025, dir: [0, 0, s]});
      rod.add(mesh(cylX(0.0032, 0.0032, rl, 8), PM.chrome));
      cyl.position.z = -0.016;
      rod.position.z = -0.016;
      par.add(cyl, rod);
      return {cyl, rod, A: Aa};
    };
    const a1 = ram(coxa, [-0.01, 0.028], 'PADDLE LIFT', 0.06, 0.07);
    const a2 = ram(merus, [0.06, 0.03], 'PADDLE KNEE', 0.1, 0.1);
    paddles.push({s, hip, coxa, basis, merus, carpus, prop, blade, slats, a1, a2});
  }
  anchor('paddle', paddles[1].blade, PL.blade * 0.5, 0, 0);

  // ------------------------------------------------------------ apron: the abdomen folded under the body
  const AP = M.body;
  const apron = [];
  let ap = chassis;
  for (let i = 0; i < COUNTS.apron; i++) {
    const g = reg(new THREE.Group(), 'body', i === COUNTS.apron - 1 ? 'TELSON' : `APRON ${i + 1}`, {dist: 0.03, dir: [0, -1, 0]});
    if (i === 0) g.position.set(-0.2, -0.112, 0);
    else g.position.set(0.04, 0, 0);
    const w = 0.2 - i * 0.017;
    g.add(mesh(rbox(0.042, 0.01, w, 0.004), i % 2 ? AP.gun : AP.steel, 0.02, 0, 0));
    ap.add(g);
    apron.push(g);
    ap = g;
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
  const dists = parts.map((p) => p.getWorldPosition(wp).length() + p.userData.part.dist * 0.5);
  dists
    .map((d, i) => [d, i])
    .sort((a, b) => a[0] - b[0])
    .forEach(([, i], r) => (parts[i].userData.order = r / (parts.length - 1)));
  const joints = parts.filter((p) => p.userData.part.joint).length;
  const bySub = Object.fromEntries(SUBS.map((s) => [s, parts.filter((p) => p.userData.part.sub === s).length]));

  // ------------------------------------------------------------ pose
  const tmpA = new THREE.Vector2();
  const rotZ = (jx, jy, ang, px, py) => tmpA.set(jx + px * Math.cos(ang) - py * Math.sin(ang), jy + px * Math.sin(ang) + py * Math.cos(ang));
  // a cylinder from A to B and its rod from B back to A, in the parent's x-y plane
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
    return Math.hypot(dx, dy);
  };
  // the same in the parent's x-z plane (a yaw joint), at the ram's height
  const aimXZ = (a, bx, bz) => {
    const dx = bx - a.A[0];
    const dz = bz - a.A[2];
    const ang = Math.atan2(-dz, dx);
    a.cyl.position.set(a.A[0], a.A[1], a.A[2]);
    a.cyl.rotation.set(0, ang, 0);
    a.rod.position.set(bx, a.A[1], bz);
    a.rod.rotation.set(0, ang + Math.PI, 0);
  };
  const out = {};

  const update = (S) => {
    for (const p of parts) {
      p.position.copy(p.userData.p0);
      p.quaternion.copy(p.userData.q0);
    }
    body.position.set(0, DIM.rideHeight + S.bob, 0);
    body.rotation.x = 0.014 * S.amp * Math.sin(S.phase * Math.PI * 2);
    body.rotation.z = 0.008 * S.amp * Math.sin(S.phase * Math.PI * 4 + 0.6) + 0.012 * S.threat;

    // shell halves open gull-wing about the middle hinge
    halves.forEach((h, i) => (h.rotation.x = (i ? -1 : 1) * S.shell * 74 * D2R));
    // gills flutter with the pump, the bailers beat, the pump turns
    const beat = 0.15 + 0.85 * S.pump;
    gills.forEach(({lam, g, s}) => lam.forEach((l, k) => (l.rotation.z = (2 + 6 * beat * Math.sin(S.spin * 2.2 - g * 0.6 - k * 0.5)) * D2R * (k % 2 ? 1 : -1) * 0.6)));
    bailers.forEach((b, i) => (b.rotation.y = (i ? -1 : 1) * (10 + 25 * beat * Math.sin(S.spin * 3)) * D2R));
    rotor.rotation.y = S.spin * 3;
    pistons.forEach((p, i) => (p.position.y = 0.016 + 0.01 * (0.5 + 0.5 * Math.sin(S.spin * 3 + (i * Math.PI) / 3)) * beat));
    valves.forEach((v, i) => (v.rotation.x = (i ? -1 : 1) * (5 + 30 * Math.max(0, Math.sin(S.spin * 3 + i * Math.PI))) * beat * D2R));

    // eyes: the stalks fold out into their sockets or stand up, then each turns on its own
    eyes.forEach(({s, sock, stalk, blades, pupil}, i) => {
      sock.rotation.y = S.eyeYaw[i] * D2R;
      stalk.rotation.set(s * (78 * (1 - S.eyes)) * D2R, 0, (-12 - 8 * S.lock) * D2R);
      for (const b of blades) b.rotation.z = b.userData.a + Math.PI / 2 + (0.25 + S.iris * 0.95);
      pupil.scale.setScalar(0.6 + 0.6 * S.iris);
    });
    antennules.forEach((ch, side) => {
      const s = side ? 1 : -1;
      ch.forEach((a, i) => {
        // antennules flick: a quick twitch every ~1.3 s
        const flick = Math.pow(Math.max(0, Math.sin(S.t * 4.8 + side * 1.7)), 8) * 25;
        if (i === 0) a.rotation.set(0, -s * 10 * D2R, (55 + flick) * D2R);
        else a.rotation.z = (-18 + (i === 1 ? -flick * 0.6 : 0)) * D2R;
      });
    });
    antennae.forEach((ch, side) => {
      const s = side ? 1 : -1;
      ch.forEach((a, i) => {
        if (i === 0) a.rotation.set(0, -s * (32 - 12 * S.lock) * D2R, (14 + 4 * Math.sin(S.t * 0.9 + side)) * D2R);
        else {
          a.rotation.y = -s * (2.6 + 1.2 * Math.sin(S.t * 1.3 + i * 0.4 + side)) * D2R;
          a.rotation.z = (-1.6 + 1.0 * Math.sin(S.t * 1.1 + i * 0.35)) * D2R;
        }
      });
    });

    // mouthparts: the outer doors swing open, the inner pairs beat while it feeds
    const feed = S.mouth;
    mouth.doors.forEach(({s, door, upper, palp}) => {
      door.rotation.y = -s * feed * 62 * D2R;
      upper.rotation.y = -s * feed * 18 * D2R;
      palp.forEach((g, i) => (g.rotation.z = (i ? 30 : -40) * D2R + 0.3 * Math.sin(S.t * 3 + i) * (0.3 + feed)));
    });
    mouth.inner.forEach(({ch}, side) => ch.forEach((g, i) => (g.rotation.z = (i ? 25 : -60) * D2R + (0.08 + 0.35 * feed) * Math.sin(S.t * 9 + i + side * 2))));
    mouth.first.forEach(({ch}, side) => ch.forEach((g, i) => (g.rotation.z = (i ? 15 : -70) * D2R + (0.05 + 0.3 * feed) * Math.sin(S.t * 11 + i + side))));
    const chew = feed * Math.abs(Math.sin(S.t * 7)) + (S.sinceCatch > 0 && S.sinceCatch < 1.5 ? Math.abs(Math.sin(S.sinceCatch * 10)) * 0.6 : 0);
    mouth.mands.forEach(({s, md}) => (md.rotation.y = s * (6 + 18 * chew) * D2R));

    // claws from their poses: yaw joints mirrored per side, pitch at the shoulder, the dactyl opening
    claws.forEach((c) => {
      const P = c.s > 0 ? S.crusher : S.cutter;
      const s = c.s;
      c.ring.rotation.set(0, -s * P.coxa * D2R, P.pitch * D2R);
      c.basis.rotation.y = -s * (P.merus - P.coxa) * D2R;
      c.carpus.rotation.y = -s * P.carpus * D2R;
      c.palm.rotation.set(s * P.roll * D2R, -s * P.palm * D2R, 0);
      c.dactyl.rotation.z = P.open * D2R;
      const cb = -s * P.carpus * D2R;
      aimXZ(c.rams[0], DIM.claw.merus - 0.02 * Math.cos(cb), 0.02 * Math.sin(cb) + s * 0.02);
      const pb = -s * P.palm * D2R;
      aimXZ(c.rams[1], DIM.claw.carpus + 0.03 * Math.cos(pb), -0.03 * Math.sin(pb));
      aim(c.rams[2], rotZ(DIM.claw.palm - 0.012, 0.022 * c.k, P.open * D2R, -0.03, 0.025));
    });
    out.gap = [clawGapOf(S.cutter), clawGapOf(S.crusher)];

    // walking legs by IK to their foot targets
    out.legs = legs.map((l) => {
      const ft = footTarget(l.leg, S.phase, S.amp, S.turn);
      const k = legIK(l.leg, ft, S.bob);
      l.hip.rotation.y = k.yaw;
      l.coxa.rotation.z = k.coxa;
      l.basis.rotation.z = k.merus;
      l.carpus.rotation.z = k.carpus;
      l.prop.rotation.z = 0;
      l.dact.rotation.z = k.dactyl;
      l.tip.rotation.z = 0;
      l.combs.forEach((cb, i) => (cb.rotation.x = 0.15 * Math.sin(S.t * 2 + i)));
      aim(l.a1, rotZ(DIM.leg.coxa, 0, k.merus, 0.09, 0.025));
      aim(l.a2, rotZ(DIM.leg.merus, 0, k.carpus, -0.03, 0.022));
      return {foot: ft, k};
    });

    // swimming paddles: held up over the back; sculling turns the blades and sweeps the merus
    const sc = S.paddle;
    paddles.forEach((p) => {
      const s = p.s;
      const sw = Math.sin(S.scull);
      p.hip.rotation.y = -s * (125 + 14 * sc * sw) * D2R;
      p.coxa.rotation.z = -12 * D2R;
      p.basis.rotation.z = (25 + 6 * sc) * D2R;
      p.carpus.rotation.z = (-20 + 10 * sc * Math.cos(S.scull)) * D2R;
      p.prop.rotation.set(s * 70 * sc * sw * D2R, 0, 18 * D2R);
      p.blade.rotation.set(s * 25 * sc * Math.sin(S.scull - 0.6) * D2R, 0, 12 * D2R);
      p.slats.forEach(({sl, up}, i) => (sl.rotation.x = up * (0.1 + 0.5 * sc * Math.max(0, up * Math.sin(S.scull - 0.4 * i)))));
      aim(p.a1, rotZ(DIM.paddle.coxa, 0, p.basis.rotation.z, 0.08, 0.022));
      aim(p.a2, rotZ(DIM.paddle.merus, 0, p.carpus.rotation.z, -0.03, 0.02));
    });

    apron.forEach((g, i) => (g.rotation.z = (i ? 0 : 0.02) + 0.02 * Math.sin(S.t * 1.4 - i * 0.5)));

    // the exploded view over the pose
    for (const p of parts) {
      const e = S.explodeK(p.userData.order);
      if (e > 1e-4) p.position.addScaledVector(p.userData.ex, p.userData.part.dist * EXPLODE * e);
    }
    out.seated = parts.reduce((n, p) => n + (S.explodeK(p.userData.order) < 0.02 ? 1 : 0), 0);
  };
  const clawGapOf = (P) => 2 * DIM.claw.finger * Math.sin((P.open * D2R) / 2);

  const setActive = (act) => {
    for (const s of SUBS) {
      const a = clamp(act[s] ?? 0, 0, 1);
      M[s].accent.emissiveIntensity = 0.42 + 0.5 * a;
      M[s].armour.emissiveIntensity = 0.07 * a;
    }
  };

  return {root, body, parts, joints, bySub, anchors, update, setActive, out, M, legs, claws, paddles, halves};
}
