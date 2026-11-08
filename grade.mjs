#!/usr/bin/env node
// Grades a build against its reference picture: the still loop of the reference-picture method (docs/method/).
//
//   node grade.mjs still <name> --t 10.6 --ref ref.png --out teardown-out/<name>-r1.png
//       [--cam '{"az":-40,"el":12,"d":3.2,"px":0,"py":0.3}'] [--backdrop '#f1f1ee'] [--size 1600x900]
//     Renders sims/<name>-shared at scene time t without the console: the floor, trails and props hidden, bloom off,
//     on a flat backdrop the colour of the reference's background (or --backdrop). --cam poses the camera the same
//     way the debug pages do: az/el in degrees around the body, d in metres, px/py the aim point in the body frame.
//
//   node grade.mjs compare ref.png still.png [approved.png] [--out teardown-out/<name>-r1] [--thresh 40]
//     Stacks reference | still | approved at one height (<out>-stack.png) plus the same stack 900 px wide
//     (<out>-stack-900.png), and measures each picture: the subject's box, height / length, the dark share (luma
//     under 80) inside the box and a 10-slice silhouette profile. Prints the still's numbers next to the reference's
//     with the two grades the method uses: dark share at least 0.8 of the reference's, profile within 0.05.
//
//   node grade.mjs compare ref.png ref.png      measures the picture alone, before the first line of code.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, DIST, FFMPEG, FFPROBE, OUT, playwright} from './paths.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [cmd, ...rest] = process.argv.slice(2);
const pos = [];
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i];
  else pos.push(rest[i]);
}

// ---------- pixels ----------
function readRGB(file) {
  const [w, h] = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], {encoding: 'utf8'})
    .trim().split(',').map(Number);
  const data = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {maxBuffer: w * h * 3 + 1024});
  return {w, h, data};
}
const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

// The background is the median of a thin band along the border; the subject is every pixel that differs from it by
// more than `thresh` on some channel. The box drops rows and columns with only a few stray pixels.
function backdropOf({w, h, data}) {
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const ch = [[], [], []];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x >= band && x < w - band && y >= band && y < h - band) continue;
    const i = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) ch[c].push(data[i + c]);
  }
  return ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
}
function measure(img, thresh) {
  const {w, h, data} = img;
  const bg = backdropOf(img);
  const mask = new Uint8Array(w * h);
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2])) > thresh) {
      mask[y * w + x] = 1;
      rows[y]++;
      cols[x]++;
    }
  }
  const edge = (arr, min) => {
    let a = 0;
    let b = arr.length - 1;
    while (a < b && arr[a] < min) a++;
    while (b > a && arr[b] < min) b--;
    return [a, b];
  };
  const [x0, x1] = edge(cols, Math.max(2, h * 0.004));
  const [y0, y1] = edge(rows, Math.max(2, w * 0.004));
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  let dark = 0;
  let fill = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (luma(data, (y * w + x) * 3) < 80) dark++;
    fill += mask[y * w + x];
  }
  // silhouette: the subject's height in 10 slices along its length, as shares of the length
  const profile = [];
  for (let s = 0; s < 10; s++) {
    let top = Infinity;
    let bot = -1;
    for (let x = x0 + Math.floor((s * bw) / 10); x < x0 + Math.floor(((s + 1) * bw) / 10); x++) {
      for (let y = y0; y <= y1; y++) if (mask[y * w + x]) { top = Math.min(top, y); bot = Math.max(bot, y); }
    }
    profile.push(bot < 0 ? 0 : (bot - top + 1) / bw);
  }
  return {bg, box: [x0, y0, bw, bh], aspect: bh / bw, dark: dark / (bw * bh), fill: fill / (bw * bh), profile};
}
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const f2 = (v) => v.toFixed(2);

// ---------- compare ----------
function compare() {
  const [ref, still, approved] = pos;
  if (!ref || !still) throw new Error('usage: node grade.mjs compare ref.png still.png [approved.png] [--out prefix]');
  const thresh = Number(opt.thresh ?? 40);
  const files = ref === still ? [ref] : [ref, still, approved].filter(Boolean);
  const m = files.map((f) => measure(readRGB(f), thresh));
  const names = ['reference', 'still', 'approved'];
  const line = (label, fn) => console.log(label.padEnd(14) + m.map((x) => fn(x).padEnd(14)).join(''));
  console.log(''.padEnd(14) + files.map((_, i) => names[i].padEnd(14)).join(''));
  line('backdrop', (x) => hex(x.bg));
  line('box px', (x) => `${x.box[2]}x${x.box[3]}`);
  line('height/len', (x) => f2(x.aspect));
  line('dark share', (x) => f2(x.dark));
  line('fill', (x) => f2(x.fill));
  console.log('profile (height per tenth of the length, as shares of the length)');
  m.forEach((x, i) => console.log('  ' + names[i].padEnd(12) + x.profile.map(f2).join(' ')));
  if (files.length > 1 && ref !== still) {
    const [r, s] = m;
    const ratio = s.dark / Math.max(1e-6, r.dark);
    const diff = (a, b) => a.reduce((acc, v, i) => acc + Math.abs(v - b[i]), 0) / a.length;
    const straight = diff(r.profile, s.profile);
    const mirrored = diff(r.profile, [...s.profile].reverse());
    const pd = Math.min(straight, mirrored);
    console.log(`\ndark share   ${f2(s.dark)} / ${f2(r.dark)} = ${f2(ratio)} of the reference's  → ${ratio >= 0.8 ? 'yes' : 'no'} (needs 0.80)`);
    console.log(`height/len   ${f2(s.aspect)} against ${f2(r.aspect)}  (off by ${f2(Math.abs(s.aspect - r.aspect))})`);
    console.log(`profile      mean difference ${pd.toFixed(3)}${mirrored < straight ? ' (still faces the other way)' : ''}  → ${pd <= 0.05 ? 'yes' : 'no'} (needs ≤ 0.05)`);
  }
  if (opt.out && files.length > 1 && ref !== still) {
    const H = 720;
    const inputs = files.flatMap((f) => ['-i', f]);
    const scaled = files.map((_, i) => `[${i}:v]scale=-2:${H}:flags=lanczos,format=rgb24[s${i}]`).join(';');
    const stack = `${scaled};${files.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${files.length}`;
    fs.mkdirSync(path.dirname(path.resolve(opt.out)), {recursive: true});
    execFileSync(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', stack, '-frames:v', '1', `${opt.out}-stack.png`]);
    execFileSync(FFMPEG, ['-y', '-v', 'error', '-i', `${opt.out}-stack.png`, '-vf', 'scale=900:-2:flags=lanczos', `${opt.out}-stack-900.png`]);
    console.log(`\n→ ${opt.out}-stack.png  (${files.map((_, i) => names[i]).join(' | ')})\n→ ${opt.out}-stack-900.png`);
  }
}

// ---------- still ----------
async function still() {
  const [name] = pos;
  const shared = path.join(ROOT, 'sims', `${name}-shared`);
  if (!name || !fs.existsSync(path.join(shared, 'stage.js'))) throw new Error(`no sims/${name}-shared/stage.js`);
  const t = Number(opt.t ?? 0);
  const [W, H] = (opt.size ?? '1600x900').split('x').map(Number);
  const out = path.resolve(opt.out ?? path.join(OUT, `${name}-grade-${t}.png`));
  const backdrop = opt.backdrop ?? (opt.ref ? hex(backdropOf(readRGB(opt.ref))) : '#f1f1ee');
  const cam = JSON.parse(opt.cam ?? '{}');

  // a one-off entry next to the build output, bundled like any machine
  const entry = path.join(OUT, 'grade', `${name}-grade`);
  fs.mkdirSync(entry, {recursive: true});
  const rel = (f) => JSON.stringify(path.relative(entry, path.join(shared, f)).split(path.sep).join('/'));
  fs.writeFileSync(path.join(entry, 'main.js'), `import * as THREE from 'three';
import {runSim} from 'teardown-kit/runtime.js';
import * as STAGE from ${rel('stage.js')};
import * as KIN from ${rel('kin.js')};
const create = Object.entries(STAGE).find(([k, f]) => typeof f === 'function' && /^create\\w*Stage$/.test(k))[1];
const EV = KIN.toEvents(KIN.SCRIPT);
const I = KIN.makeIntegrals(EV, -2, KIN.DURATION + 1);
runSim({duration: KIN.DURATION, fps: 30, hud: {enabled: false}, director: {enabled: false}}, async ({canvas}) => {
  const st = create({canvas});
  const resize = () => st.resize(innerWidth, innerHeight, devicePixelRatio || 1);
  resize();
  const subject = Object.values(st).map((v) => (v && v.isObject3D ? v : v && v.root && v.root.isObject3D ? v.root : null))
    .find((o) => o && !o.isScene && !o.isCamera);
  return {resize, render(t) {
    const S = KIN.stateAt(t, EV, I);
    const c = window.CAM || {};
    const p = st.toWorld(S, [c.px ?? 0, c.py ?? 0.3, 0]);
    st.frame(S, {tx: p.x, ty: p.y, tz: p.z, az: (c.az ?? 40) * Math.PI / 180 + (S.psi || 0), el: (c.el ?? 14) * Math.PI / 180, d: c.d ?? 3.2, sx: c.sx ?? 0, sy: c.sy ?? 0});
    const keep = new Set();
    if (subject) subject.traverse((o) => keep.add(o));
    st.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && !keep.has(o)) o.visible = false; });
    st.scene.background = new THREE.Color(window.BACKDROP);
    st.scene.fog = null;
    st.renderer.render(st.scene, st.camera);
    return {};
  }};
});
`);
  execFileSync(process.execPath, [path.join(ROOT, 'sims', 'build.mjs'), entry], {stdio: 'inherit'});

  const {chromium} = playwright();
  const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.addInitScript(() => { window.__CAPTURE = true; });
  await page.goto(pathToFileURL(path.join(DIST, `${name}-grade.html`)).href);
  await page.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 60000});
  await page.evaluate(([t, cam, bd]) => { window.CAM = cam; window.BACKDROP = bd; window.SIM.render(t); }, [t, cam, backdrop]);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  await page.screenshot({path: out});
  await browser.close();
  console.log(`→ ${out}  (t=${t}, backdrop ${backdrop})`);
}

if (cmd === 'compare') compare();
else if (cmd === 'still') await still();
else {
  console.error('usage:\n  node grade.mjs still <name> --t <s> [--ref ref.png | --backdrop #rrggbb] [--cam json] [--size WxH] [--out file.png]\n  node grade.mjs compare ref.png still.png [approved.png] [--out prefix] [--thresh 40]');
  process.exit(1);
}
