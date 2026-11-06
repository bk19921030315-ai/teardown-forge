// The HX-6 stage: a dark studio after the reference film. A graphite floor drawn in a shader (rings and radial ticks
// centred under the machine, a faint grid, everything melting into the backdrop), a warm key with soft shadows, a cool
// rim, a prefiltered room for the chrome, and a gentle bloom that only the lime catches. frame(S, cam) poses the
// machine from kin.js's state and draws one frame.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ACCENT, buildMantis} from './mantis.js';
import {DIM, TARGET} from './kin.js';

const V3 = THREE.Vector3;
export const BG = '#0c0e10';

const FLOOR_VERT = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `uniform vec3 uBase; uniform vec3 uBg; uniform vec3 uLine; uniform vec3 uAcc; uniform vec3 uC; uniform vec3 uCam; varying vec3 vW;
  float line(float x, float w){ float d = abs(fract(x - 0.5) - 0.5); float fw = fwidth(x) * 1.2; return (1.0 - smoothstep(w, w + fw, d)) * (1.0 - smoothstep(0.08, 0.3, fw)); }
  void main(){
    vec2 p = vW.xz - uC.xz;
    float r = length(p);
    float a = atan(p.y, p.x);
    // rings every 0.6 m, a bright one at 1.2 m, dashed ticks round the 1.8 m ring
    float rings = line(r / 0.6, 0.012) * (1.0 - smoothstep(2.4, 4.2, r));
    float hero = (1.0 - smoothstep(0.0, 0.006 + fwidth(r), abs(r - 1.2)));
    float ticks = line(a / 6.28318 * 72.0, 0.06) * smoothstep(1.74, 1.76, r) * (1.0 - smoothstep(1.86, 1.88, r));
    float spokes = line(a / 6.28318 * 12.0, 0.004) * smoothstep(0.35, 0.6, r) * (1.0 - smoothstep(2.0, 3.6, r));
    vec2 g = vW.xz / 0.3;
    float grid = max(line(g.x, 0.015), line(g.y, 0.015)) * 0.35;
    vec3 col = uBase;
    col = mix(col, uLine, clamp(rings * 0.5 + spokes * 0.3 + grid * 0.5, 0.0, 1.0));
    col = mix(col, uAcc, hero * 0.35 + ticks * 0.25);
    // a soft pool of light under the machine
    col *= 1.0 + 0.35 * (1.0 - smoothstep(0.0, 1.6, r));
    float fade = smoothstep(2.2, 6.5, length(vW.xz - uCam.xz * 0.0 - uC.xz));
    gl_FragColor = vec4(mix(col, uBg, fade), 1.0);
  }`;

export function createMantisStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 6, 14);
  const camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.03, 60);

  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.5, 0.4, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // a dark room with three soft panels, prefiltered, for the chrome and the eye domes
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#0e1013');
    const panel = (w, h, pos, k, tint = [1, 0.97, 0.93]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel(10, 4, new V3(-8, 9, 7), 2.2);
    panel(6, 6, new V3(9, 7, -8), 1.4, [0.85, 0.92, 1]);
    panel(14, 1.6, new V3(0, 4, 12), 0.9);
    const g = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({color: '#15181b', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -1;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.75;
    pm.dispose();
  }
  const KEY_DIR = new V3(0.55, 0.85, -0.45).normalize();
  const key = new THREE.DirectionalLight('#fff1e2', 2.2);
  key.castShadow = true;
  const EXT = 1.7;
  Object.assign(key.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.5, far: 12});
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.004;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#cfe1ff', 1.7);
  scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight('#b8c4d0', 0.5);
  scene.add(fill, fill.target);
  scene.add(new THREE.HemisphereLight('#a3abb5', '#0a0b0d', 0.45));

  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
      uBase: {value: new THREE.Color('#141719')},
      uBg: {value: new THREE.Color(BG)},
      uLine: {value: new THREE.Color('#3a4046')},
      uAcc: {value: new THREE.Color(ACCENT)},
      uC: {value: new V3()},
      uCam: {value: new V3()},
    },
    toneMapped: false,
  });
  floorMat.extensions = {derivatives: true};
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({color: '#000000', opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.0005;
  shade.receiveShadow = true;
  scene.add(shade);

  const mantis = buildMantis();
  scene.add(mantis.root);

  // the target: a small drone the optics lock onto and the arms take
  const target = new THREE.Group();
  {
    const lime = new THREE.Color(ACCENT);
    const oct = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.03)), new THREE.LineBasicMaterial({color: lime, toneMapped: false}));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshBasicMaterial({color: lime, toneMapped: false}));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0012, 6, 48), new THREE.MeshBasicMaterial({color: lime, toneMapped: false, transparent: true, opacity: 0.6}));
    ring.rotation.x = Math.PI / 2;
    target.add(oct, core, ring);
    target.userData = {oct, ring};
  }
  const flashM = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({color: ACCENT, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}));
  scene.add(target, flashM);

  // gait trails: the four feet over the last seconds, laid on the floor
  const TRAIL_N = 90;
  const trails = [0, 1, 2, 3].map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    const l = new THREE.Points(g, new THREE.PointsMaterial({vertexColors: true, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false}));
    l.frustumCulled = false;
    l.renderOrder = 3;
    scene.add(l);
    return l;
  });
  const lime = new THREE.Color(ACCENT);
  const bgc = new THREE.Color(ACCENT).multiplyScalar(0.18);
  const setTrails = (list, amt) => {
    trails.forEach((l, i) => {
      l.visible = amt > 0.02;
      if (!l.visible) return;
      const pts = list[i];
      const P = l.geometry.attributes.position.array;
      const Cc = l.geometry.attributes.color.array;
      for (let k = 0; k < TRAIL_N; k++) {
        const q = pts[Math.min(k, pts.length - 1)];
        P[k * 3] = q[0];
        P[k * 3 + 1] = Math.max(0.002, q[1]);
        P[k * 3 + 2] = q[2];
        const c = bgc.clone().lerp(lime, (k / (TRAIL_N - 1)) * amt);
        Cc[k * 3] = c.r;
        Cc[k * 3 + 1] = c.g;
        Cc[k * 3 + 2] = c.b;
      }
      l.geometry.attributes.position.needsUpdate = true;
      l.geometry.attributes.color.needsUpdate = true;
    });
  };

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tmp = new V3();
  const tq = new V3();
  // body frame → world for the state's body pose
  const toWorld = (S, p, out = new V3()) => {
    const c = Math.cos(S.psi);
    const s = Math.sin(S.psi);
    return out.set(S.x + p[0] * c + p[2] * s, p[1], S.z - p[0] * s + p[2] * c);
  };

  // cam: {tx, ty, tz, az, el, d, sx, sy} in world metres and radians; sx, sy shift the picture in CSS px
  const frame = (S, cam) => {
    mantis.root.position.set(S.x, 0, S.z);
    mantis.root.rotation.y = S.psi;
    mantis.update(S);

    // target hovering ahead of the head, bobbing, gone once caught; a lime flash where it was taken
    toWorld(S, [TARGET[0], DIM.rideHeight + TARGET[1] + 0.012 * Math.sin(S.t * 3.1), TARGET[2] + 0.01 * Math.sin(S.t * 1.7)], tq);
    target.position.copy(tq);
    target.visible = S.targetOn > 0.01;
    target.scale.setScalar(Math.max(0.001, S.targetOn));
    target.userData.oct.rotation.set(S.t * 0.9, S.t * 1.3, 0);
    target.userData.ring.scale.setScalar(1 + 0.25 * Math.sin(S.t * 4));
    flashM.position.copy(tq);
    flashM.scale.setScalar(0.03 + 0.16 * (1 - S.flash));
    flashM.material.opacity = S.flash * 0.9;
    flashM.visible = S.flash > 0.01;

    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.cos(az), ty + d * Math.sin(el), tz - d * Math.cos(el) * Math.sin(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    flashM.quaternion.copy(camera.quaternion);

    floorMat.uniforms.uC.value.set(S.x, 0, S.z);
    floor.position.set(Math.round(S.x), 0, Math.round(S.z));
    shade.position.x = floor.position.x;
    shade.position.z = floor.position.z;
    tmp.set(S.x, 0.4, S.z);
    key.target.position.copy(tmp);
    key.position.copy(tmp).addScaledVector(KEY_DIR, 5);
    rim.target.position.copy(tmp);
    rim.position.copy(tmp).add(new V3(-Math.cos(az) * 4, 2.2, Math.sin(az) * 4));
    fill.target.position.copy(tmp);
    fill.position.copy(tmp).add(new V3(Math.cos(az + 1.2) * 4, 0.6, -Math.sin(az + 1.2) * 4));
    composer.render();
  };

  const pv = new V3();
  /** A world point to CSS px on the canvas, null behind the camera. */
  const project = (p) => {
    pv.copy(p).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const anchorPx = (key2) => {
    const a = mantis.anchors[key2];
    if (!a) return null;
    a.getWorldPosition(pv);
    return project(pv.clone());
  };
  const setQuality = ({samples, shadow, bloomOn}) => {
    if (samples !== undefined) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    }
    if (shadow !== undefined) {
      key.shadow.mapSize.set(shadow, shadow);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    if (bloomOn !== undefined) bloom.enabled = bloomOn;
  };
  return {renderer, scene, camera, composer, mantis, resize, frame, project, anchorPx, toWorld, setTrails, size, setQuality, target};
}
