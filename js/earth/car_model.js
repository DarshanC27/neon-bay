// The player's car for Real UK mode: the same lofted body as the main game (render.js carShape / carGeo), built with
// the ES-module three.js that the Google 3D tiles renderer needs. Built in game units (10 per metre) and scaled to metres.
import * as THREE from "three";

const BODY = { sedan: [7.5, 6], sports: [6, 5.1], super: [5.5, 4.9], hatch: [7.4, 6.4], suv: [10, 7.2] };
const CAB = { sports: [0.4, -0.05, 0.42, 0.3], super: [0.4, -0.05, 0.42, 0.3], hatch: [0.57, -0.13, 0.32, 0.05], suv: [0.62, -0.1, 0.24, 0.05] };
const SIZE = { sedan: [44, 22], sports: [45, 21], super: [47, 21], hatch: [38, 20], suv: [48, 23] };
export const CAR_TYPES = Object.keys(SIZE);
const cabOf = (t) => CAB[t] || [0.48, -0.08, 0.3, 0.16];
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

function monoCurve(pts) { // monotone cubic through [x, y] points (x ascending)
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const hh = xs[i + 1] - xs[i], t = (x - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
  };
}

function carShape(ty, L, Wd, bh) {
  const sporty = ty === "sports" || ty === "super", tall = ty === "suv";
  const y0 = 3, h = L / 2, W2 = Wd / 2, wy = tall ? 4.2 : sporty ? 3.6 : 3.45;
  const pe = tall ? 7 : sporty ? 4.2 : 5.5, pr = tall ? 8 : sporty ? 4.8 : 6.5;
  const planU = (az, p) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, az / W2), p)), 1 / p);
  return { y0, top: y0 + bh, h, W2, wx: L * 0.32, wy, ra: wy + (sporty ? 0.9 : 1.1), pe, pr, sporty, tall,
    noseX: (z) => h * planU(Math.abs(z), pe), tailX: (z) => -h * planU(Math.abs(z), pr) };
}

const NA = 12, NB = 10, KP = 6;
const geoCache = {};
function carGeo(ty, L, Wd, bh, ch) {
  const key = ty; if (geoCache[key]) return geoCache[key];
  const S = carShape(ty, L, Wd, bh), { y0, top, h, W2, wx, wy, ra, sporty, tall } = S;
  const roof = top + ch + 0.6;
  const cb = cabOf(ty), cl = L * cb[0], cx = L * cb[1], b0 = cx - cl / 2, b1 = cx + cl / 2, wt = b1 - cl * cb[2], rt = b0 + cl * cb[3];
  const nose = sporty ? 0.56 : tall ? 0.8 : 0.66, deck = sporty ? 0.86 : ty === "hatch" ? 0.97 : tall ? 0.95 : 0.9;
  const raw = [[-h, y0 + bh * 0.72], [-h + 1.4, y0 + bh * deck - 0.2]];
  if (b0 - (-h + 1.4) > 5) raw.push([(-h + 1.4 + b0) / 2, top - (1 - deck) * bh * 0.25]);
  raw.push([b0, top + 0.35], [rt, roof - 0.35], [(rt + wt) / 2, roof], [wt, roof - 0.3], [b1, top + 0.3], [b1 + 2.2, top + 0.12],
    [h - L * 0.08, y0 + bh * nose + (top - y0 - bh * nose) * 0.72], [h, y0 + bh * nose]);
  const tp = []; for (const p of raw) if (!tp.length || p[0] > tp[tp.length - 1][0] + 0.4) tp.push(p);
  const gz = [b0, rt, wt, b1, wt - (wt - rt) * (sporty ? 0.62 : 0.46)];
  const topC = monoCurve(tp);
  const kg = sporty ? 0.82 : 0.86, nb = 5.5, ng = sporty ? 2.6 : 3.2, flare = sporty ? 0.8 : tall ? 0.6 : 0.45;
  const fo = wx + ra * 0.55, ro = -wx - ra * 0.55, tuck = bh * (tall ? 0.3 : 0.26) + 1.4;
  const NS = 84, M = NA + NB, RS = 2 * M, pos = [], uv = [], st = [];
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1), u = -Math.cos(Math.PI * t) * 0.55 + (2 * t - 1) * 0.45, x = u * h;
    const yTop = topC(x), belt = top - x / h * 0.3, ys = Math.min(belt, yTop);
    let w = W2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), u > 0 ? S.pe : S.pr)), 1 / (u > 0 ? S.pe : S.pr));
    let yb = y0 - 0.5;
    for (const c of [wx, -wx]) { const dx = x - c; w += flare * Math.exp(-dx * dx / (ra * ra) * 1.6) * Math.min(1, w / W2 * 3); if (Math.abs(dx) < ra) yb = Math.max(yb, wy + Math.sqrt(ra * ra - dx * dx) * 0.93); }
    if (x > fo) yb = Math.max(yb, y0 - 0.5 + Math.pow((x - fo) / (h - fo), 1.7) * tuck);
    if (x < ro) yb = Math.max(yb, y0 - 0.5 + Math.pow((ro - x) / (ro + h), 1.7) * tuck * 1.1);
    yb = Math.min(yb, ys - (sporty ? 0.7 : 1.1));
    const ymid = (yb + ys) / 2, hb = (ys - yb) / 2, wg = w * kg, thg = Math.acos(Math.min(1, Math.pow(kg, nb / 2)));
    const yB = ymid + hb * spow(Math.sin(thg), 2 / nb), gh = Math.max(yTop, yB) - yB;
    const half = [];
    for (let k = 0; k <= NA; k++) { const th = -Math.PI / 2 + (thg + Math.PI / 2) * k / NA; half.push([w * spow(Math.cos(th), 2 / nb), ymid + hb * spow(Math.sin(th), 2 / nb)]); }
    for (let k = 1; k <= NB; k++) { const ph = Math.PI / 2 * k / NB; half.push([wg * spow(Math.cos(ph), 2 / ng), yB + gh * spow(Math.sin(ph), 2 / ng)]); }
    for (let j = 0; j < RS; j++) { const [z, y] = half[j <= M ? j : RS - j], zz = j <= M ? z : -z; pos.push(x, y, zz); uv.push(x + zz * 0.35, y); }
    st.push({ x, gh });
  }
  const idx = { paint: [], glass: [], trim: [] }, all = [];
  for (let i = 0; i < NS - 1; i++) {
    const xm = (st[i].x + st[i + 1].x) / 2, gh = Math.min(st[i].gh, st[i + 1].gh);
    for (let j = 0; j < RS; j++) {
      const s = j < M ? j : RS - 1 - j, a = i * RS + j, b = (i + 1) * RS + j, c = i * RS + (j + 1) % RS, d = (i + 1) * RS + (j + 1) % RS;
      let g = "paint";
      if (s <= 2) g = "trim";
      else if (s >= NA) {
        const q = s - NA, inCab = xm > gz[0] + 0.3 && xm < gz[3] - 0.2 && gh > 1.3 && q > 0;
        if (inCab) {
          if (xm > gz[2]) g = q === KP ? "paint" : "glass";
          else if (xm < gz[1]) g = q === KP || q === KP - 1 ? "paint" : "glass";
          else g = q < KP && Math.abs(xm - gz[4]) > 0.9 ? "glass" : "paint";
        }
      }
      idx[g].push(a, b, c, b, d, c); all.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(all); geo.computeVertexNormals();
  const part = (list) => { const g = new THREE.BufferGeometry(); for (const k of ["position", "normal", "uv"]) g.setAttribute(k, geo.attributes[k]); g.setIndex(list); g.computeBoundingSphere(); return g; };
  return (geoCache[key] = { S, body: part(idx.paint), glass: part(idx.glass), trim: part(idx.trim) });
}

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const TAU = Math.PI * 2;
let shared = null;
function sharedParts() {
  if (shared) return shared;
  const rimTex = canvasTex(128, 128, (g) => {
    g.fillStyle = "#131313"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#2a2a2a"; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill();
    g.fillStyle = "#c9cdd3"; g.beginPath(); g.arc(64, 64, 44, 0, TAU); g.fill();
    g.fillStyle = "#1c1d20"; g.beginPath(); g.arc(64, 64, 38, 0, TAU); g.fill();
    g.fillStyle = "#d9dde3"; for (let k = 0; k < 5; k++) { g.save(); g.translate(64, 64); g.rotate((k / 5) * TAU); g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.lineTo(4, 40); g.lineTo(-4, 40); g.fill(); g.restore(); }
    g.fillStyle = "#e8ebef"; g.beginPath(); g.arc(64, 64, 11, 0, TAU); g.fill();
  });
  const plateTex = canvasTex(128, 32, (g) => { g.fillStyle = "#f2c94c"; g.fillRect(0, 0, 128, 32); g.fillStyle = "#111"; g.font = "bold 20px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("NB26 UKR", 64, 17); });
  const prof = [[0.001, -0.5], [1.0, -0.62], [2.3, -0.88], [2.6, -1.12], [2.78, -1.26], [3.2, -1.4], [3.6, -1.32], [3.8, -1.02], [3.87, -0.4],
    [3.87, 0.4], [3.8, 1.02], [3.6, 1.32], [3.2, 1.4], [2.78, 1.26], [2.6, 1.12], [2.3, 0.88], [1.0, 0.62], [0.001, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const wheelGeo = new THREE.LatheGeometry(prof, 28), p = wheelGeo.attributes.position, uv = wheelGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 7.6, 0.5 + p.getZ(i) / 7.6);
  wheelGeo.rotateX(Math.PI / 2);
  shared = {
    wheelGeo,
    rim: new THREE.MeshStandardMaterial({ map: rimTex, metalness: 0.6, roughness: 0.36 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0e151d, metalness: 0.9, roughness: 0.06 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.5, roughness: 0.4 }),
    lens: new THREE.SphereGeometry(1, 14, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    plateGeo: new THREE.PlaneGeometry(5.2, 1.3),
  };
  return shared;
}

// Returns { root, tilt, wheels, steer, head, tail, length } with the car's nose along +X, in metres.
export function buildCar(type = "sports", color = "#c1121f") {
  const ty = SIZE[type] ? type : "sports", [L, Wd] = SIZE[ty], [bh, ch] = BODY[ty] || [7.5, 6];
  const sh = sharedParts(), shell = carGeo(ty, L, Wd, bh, ch), S = shell.S;
  const root = new THREE.Group(), tilt = new THREE.Group(), scaled = new THREE.Group();
  scaled.scale.setScalar(0.1); root.add(scaled); scaled.add(tilt);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 });
  const add = (geo, mat, x, y, z, par = tilt) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
  add(shell.body, paint, 0, 0, 0); add(shell.trim, sh.trim, 0, 0, 0); add(shell.glass, sh.glass, 0, 0, 0);
  const noseY = S.y0 + 0.9 + bh * (S.tall ? 0.3 : 0.26) + 0.5, lampY = S.y0 + bh * (S.sporty ? 0.5 : 0.56), tailY = S.y0 + bh * 0.6;
  const gH = Math.max(0.8, (lampY - noseY) * 1.3);
  add(sh.box, sh.grille, S.noseX(0) - 0.15, noseY + gH * 0.35, 0).scale.set(0.6, gH, Wd * 0.42);
  add(sh.plateGeo, sh.plate, S.noseX(0) + 0.12, noseY - 0.2, 0).rotation.y = Math.PI / 2;
  add(sh.plateGeo, sh.plate, S.tailX(0) - 0.12, S.y0 + bh * 0.46, 0).rotation.y = -Math.PI / 2;
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  for (const sd of [-1, 1]) {
    const zh = sd * (S.W2 - (S.sporty ? 3.6 : 3.4));
    add(sh.lens, head, S.noseX(zh) - 0.7, lampY, zh).scale.set(0.85, S.sporty ? 0.6 : 0.85, S.sporty ? 2.9 : 2.3);
    const zt = sd * (S.W2 - 3.4);
    const tl = add(sh.box, tail, S.tailX(zt) + 0.45, tailY, zt); tl.scale.set(1, S.sporty ? 1 : 1.5, 5.2);
    tl.rotation.y = Math.atan((S.tailX(zt + 0.3) - S.tailX(zt - 0.3)) / 0.6);
  }
  const wheels = [], steer = [], wsc = S.wy / 3.8;
  for (const [wx, wz] of [[S.wx, S.W2 - 1.9], [S.wx, -S.W2 + 1.9], [-S.wx, S.W2 - 1.9], [-S.wx, -S.W2 + 1.9]]) {
    const holder = new THREE.Group(); holder.position.set(wx, S.wy, wz); scaled.add(holder);
    const w = add(sh.wheelGeo, sh.rim, 0, 0, 0, holder); w.scale.set(wsc, wsc, 1);
    wheels.push(w); if (wx > 0) steer.push(holder);
  }
  return { root, tilt, wheels, steer, head, tail, paint, length: L / 10, width: Wd / 10, wheelR: S.wy / 10 };
}
