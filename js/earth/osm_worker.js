// Builds one map tile of the real UK for Real UK mode, off the main thread.
// Input: a z14 tile (about 1.5 km square in the UK). It fetches
//   - OpenFreeMap vector tiles (OpenStreetMap data: building footprints and heights, roads, water, parks, land use)
//   - AWS Terrain Tiles (Terrarium elevation PNGs)
// and returns ready-to-upload arrays: the ground mesh with its heights, a painted ground texture (roads with
// markings, pavements, parks, water), extruded buildings from their real footprints, trees for parks and woods,
// building walls for collision and named road lines for the HUD. Coordinates are metres, relative to the tile's
// north-west corner: x east, z south, y up.
/* global importScripts, earcut */
importScripts("https://cdn.jsdelivr.net/npm/earcut@2.2.4/dist/earcut.min.js");

const C = 40075016.686; // Web Mercator circumference (m)
let VECTOR_URL = null;

// ---------- minimal Mapbox Vector Tile decoder ----------
function Reader(buf) { this.b = buf; this.p = 0; }
Reader.prototype.varint = function () { let r = 0, s = 1, b; do { b = this.b[this.p++]; r += (b & 0x7f) * s; s *= 128; } while (b & 0x80); return r; };
Reader.prototype.skip = function (wt) { if (wt === 0) this.varint(); else if (wt === 1) this.p += 8; else if (wt === 2) this.p += this.varint(); else if (wt === 5) this.p += 4; };
const td = new TextDecoder();
function decodeTile(buf) {
  const r = new Reader(new Uint8Array(buf)), layers = {};
  while (r.p < r.b.length) {
    const tag = r.varint(), f = tag >> 3, wt = tag & 7;
    if (f === 3 && wt === 2) { const len = r.varint(), end = r.p + len, L = decodeLayer(r, end); layers[L.name] = L; r.p = end; } else r.skip(wt);
  }
  return layers;
}
function decodeLayer(r, end) {
  const L = { name: "", extent: 4096, keys: [], values: [], feats: [] };
  while (r.p < end) {
    const tag = r.varint(), f = tag >> 3, wt = tag & 7;
    if (f === 1) { const n = r.varint(); L.name = td.decode(r.b.subarray(r.p, r.p + n)); r.p += n; }
    else if (f === 2) { const n = r.varint(); L.feats.push([r.p, r.p + n]); r.p += n; }
    else if (f === 3) { const n = r.varint(); L.keys.push(td.decode(r.b.subarray(r.p, r.p + n))); r.p += n; }
    else if (f === 4) { const n = r.varint(), e = r.p + n; L.values.push(decodeValue(r, e)); r.p = e; }
    else if (f === 5) L.extent = r.varint();
    else r.skip(wt);
  }
  L.read = (i) => decodeFeature(r, L, L.feats[i]);
  return L;
}
function decodeValue(r, end) {
  let v = null;
  while (r.p < end) {
    const tag = r.varint(), f = tag >> 3;
    if (f === 1) { const n = r.varint(); v = td.decode(r.b.subarray(r.p, r.p + n)); r.p += n; }
    else if (f === 2) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 4).getFloat32(0, true); r.p += 4; }
    else if (f === 3) { v = new DataView(r.b.buffer, r.b.byteOffset + r.p, 8).getFloat64(0, true); r.p += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) { const n = r.varint(); v = n % 2 ? -(n + 1) / 2 : n / 2; }
    else if (f === 7) v = !!r.varint();
    else r.skip(tag & 7);
  }
  return v;
}
function decodeFeature(r, L, [start, end]) {
  r.p = start; const props = {}; let type = 0, geomStart = 0, geomEnd = 0;
  while (r.p < end) {
    const tag = r.varint(), f = tag >> 3, wt = tag & 7;
    if (f === 2) { const n = r.varint(), e = r.p + n; while (r.p < e) { const k = r.varint(), v = r.varint(); props[L.keys[k]] = L.values[v]; } }
    else if (f === 3) type = r.varint();
    else if (f === 4) { const n = r.varint(); geomStart = r.p; geomEnd = r.p + n; r.p += n; }
    else r.skip(wt);
  }
  // geometry: rings / lines as flat [x, y, x, y, ...] in tile units
  const rings = []; let cur = null, x = 0, y = 0; r.p = geomStart;
  while (r.p < geomEnd) {
    const ci = r.varint(), cmd = ci & 7, count = ci >> 3;
    if (cmd === 7) { if (cur && cur.length >= 4) cur.push(cur[0], cur[1]); continue; }
    for (let i = 0; i < count; i++) {
      const dx = r.varint(), dy = r.varint(); x += dx % 2 ? -(dx + 1) / 2 : dx / 2; y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
      if (cmd === 1) { cur = [x, y]; rings.push(cur); } else cur.push(x, y);
    }
  }
  return { type, props, rings };
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 2; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1]; return a / 2; };
// group polygon rings: exterior (positive area in tile coords) followed by its holes
function polygons(rings) {
  const out = []; let cur = null;
  for (const r of rings) { const a = ringArea(r); if (a > 0 || !cur) { cur = [r]; out.push(cur); } else cur.push(r); }
  return out;
}

// ---------- palette ----------
const ROAD = { // class: [width m, colour, casing colour, centre line]
  motorway: [22, "#55595f", "#8b8e93", "dash"], trunk: [17, "#585b61", "#8f9297", "dash"], primary: [14, "#5b5e63", "#9a9ca0", "dash"],
  secondary: [12, "#5e6166", "#a0a2a5", "dash"], tertiary: [10, "#606368", "#a6a7a9", "dash"], minor: [8, "#63666a", "#abacad", null],
  service: [5, "#6a6c70", "#b0b0b0", null], track: [3, "#8b7d63", null, null], path: [2, "#b9ab8c", null, null], raceway: [10, "#555", null, null],
  busway: [8, "#6b4a4a", null, null], pier: [6, "#8a7b66", null, null],
};
const GROUND = "#a7ab95";
const LANDCOVER = { grass: "#86a35f", wood: "#5d7f45", farmland: "#a9b27a", sand: "#d8cfa4", wetland: "#7f9a7c", rock: "#9c9a93", ice: "#eef2f4" };
const LANDUSE = { residential: "#b3b0a6", commercial: "#b7aca8", industrial: "#aaa59f", retail: "#b9aca6", railway: "#a49e95", cemetery: "#8fa77a", hospital: "#bfb2ad", school: "#b9b09a", university: "#b9b09a", college: "#b9b09a", stadium: "#8aa65d", pitch: "#7fa857", playground: "#9fb87b", quarry: "#a8a29a", military: "#a6a99a" };
const WALLS = [[0.62, 0.32, 0.25], [0.68, 0.38, 0.29], [0.78, 0.66, 0.47], [0.82, 0.73, 0.58], [0.9, 0.88, 0.83], [0.93, 0.92, 0.88], [0.72, 0.7, 0.66], [0.58, 0.56, 0.54], [0.55, 0.27, 0.22]];
const GLASSY = [[0.56, 0.64, 0.7], [0.62, 0.68, 0.72], [0.45, 0.52, 0.58]];
const ROOFS = [[0.33, 0.33, 0.35], [0.4, 0.38, 0.37], [0.46, 0.3, 0.25], [0.5, 0.5, 0.5], [0.28, 0.29, 0.31]];
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// ---------- terrain ----------
async function terrain(z, x, y) {
  try {
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
    if (!r.ok) throw new Error(r.status);
    const bmp = await createImageBitmap(await r.blob()), c = new OffscreenCanvas(256, 256), g = c.getContext("2d");
    g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(256 * 256);
    for (let i = 0; i < h.length; i++) h[i] = Math.max(-2, d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768);
    return h;
  } catch (e) { return null; }
}

self.onmessage = async (ev) => {
  const { id, z, x, y, k, texSize, detail } = ev.data;
  try {
    if (!VECTOR_URL) { const tj = await (await fetch("https://tiles.openfreemap.org/planet")).json(); VECTOR_URL = tj.tiles[0]; }
    const [vbuf, dem] = await Promise.all([
      fetch(VECTOR_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y)).then((r) => (r.ok ? r.arrayBuffer() : null)),
      terrain(z, x, y),
    ]);
    const T = C * k / Math.pow(2, z); // tile size in metres
    const layers = vbuf ? decodeTile(vbuf) : {};
    const out = build(layers, dem, T, texSize, detail);
    out.id = id;
    self.postMessage(out, out.transfer);
  } catch (e) { self.postMessage({ id, error: String(e && e.message || e) }); }
};

function build(layers, dem, T, S, detail) {
  const transfer = [];
  // heights on a 65 x 65 grid (≈ 23 m spacing) used by both the mesh and the car's ground queries
  const N = 64, H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    if (!dem) { H[j * (N + 1) + i] = 0; continue; }
    const px = Math.min(255, i * 256 / N), py = Math.min(255, j * 256 / N), x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), fx = px - x0, fy = py - y0;
    H[j * (N + 1) + i] = (dem[y0 * 256 + x0] * (1 - fx) + dem[y0 * 256 + x1] * fx) * (1 - fy) + (dem[y1 * 256 + x0] * (1 - fx) + dem[y1 * 256 + x1] * fx) * fy;
  }
  const hAt = (mx, mz) => { // metres in tile -> height
    const gx = Math.max(0, Math.min(N, mx / T * N)), gz = Math.max(0, Math.min(N, mz / T * N)), i = Math.min(N - 1, Math.floor(gx)), j = Math.min(N - 1, Math.floor(gz)), fx = gx - i, fz = gz - j, W = N + 1;
    return (H[j * W + i] * (1 - fx) + H[j * W + i + 1] * fx) * (1 - fz) + (H[(j + 1) * W + i] * (1 - fx) + H[(j + 1) * W + i + 1] * fx) * fz;
  };

  // ---------- painted ground ----------
  const cv = new OffscreenCanvas(S, S), g = cv.getContext("2d");
  g.fillStyle = GROUND; g.fillRect(0, 0, S, S);
  const pxPerM = S / T, E = (layers.building || layers.transportation || { extent: 4096 }).extent || 4096, sc = S / E, mPerU = T / E;
  const path = (rings, close) => { g.beginPath(); for (const r of rings) { g.moveTo(r[0] * sc, r[1] * sc); for (let i = 2; i < r.length; i += 2) g.lineTo(r[i] * sc, r[i + 1] * sc); if (close) g.closePath(); } };
  const fillLayer = (L, colorOf) => { if (!L) return; for (let i = 0; i < L.feats.length; i++) { const f = L.read(i); if (f.type !== 3) continue; const c = colorOf(f.props); if (!c) continue; g.fillStyle = c; path(f.rings, true); g.fill("evenodd"); } };
  fillLayer(layers.landcover, (p) => LANDCOVER[p.class] || null);
  fillLayer(layers.landuse, (p) => LANDUSE[p.class] || null);
  fillLayer(layers.park, () => "#7fa35b");
  fillLayer(layers.aeroway, (p) => (p.class === "runway" || p.class === "taxiway" ? "#5f6266" : p.class === "apron" ? "#8c8e90" : null));
  // water: areas and rivers / canals / streams
  g.fillStyle = "#3f6f8f"; fillLayer(layers.water, () => "#3f6f8f");
  if (layers.waterway) for (let i = 0; i < layers.waterway.feats.length; i++) {
    const f = layers.waterway.read(i), w = { river: 18, canal: 12, stream: 3, drain: 2, ditch: 1.5 }[f.props.class] || 3;
    g.strokeStyle = "#3f6f8f"; g.lineWidth = w * pxPerM; g.lineCap = "round"; g.lineJoin = "round"; path(f.rings, false); g.stroke();
  }
  // roads: pavements first, then tarmac, then markings, ordered small to big so main roads sit on top
  const roads = [], names = [];
  if (layers.transportation) for (let i = 0; i < layers.transportation.feats.length; i++) {
    const f = layers.transportation.read(i); if (f.type !== 2) continue;
    const cls = f.props.class; if (cls === "rail" || cls === "transit") { roads.push({ f, rail: true, rank: 0 }); continue; }
    const st = ROAD[cls] || (cls && cls.endsWith("_construction") ? null : ROAD.minor); if (!st) continue;
    const isPath = cls === "path" || cls === "track";
    const rank = ["path", "track", "service", "minor", "tertiary", "secondary", "primary", "trunk", "motorway"].indexOf(cls);
    roads.push({ f, st, rank: rank < 0 ? 1 : rank, bridge: f.props.brunnel === "bridge", tunnel: f.props.brunnel === "tunnel", isPath });
  }
  roads.sort((a, b) => a.rank - b.rank);
  g.lineCap = "round"; g.lineJoin = "round";
  for (const r of roads) if (r.rail) { g.strokeStyle = "#5b5450"; g.lineWidth = 3 * pxPerM; path(r.f.rings, false); g.stroke(); }
  for (const r of roads) if (!r.rail && r.st[2] && !r.tunnel && !r.bridge) { g.strokeStyle = r.st[2]; g.lineWidth = (r.st[0] + 5) * pxPerM; path(r.f.rings, false); g.stroke(); }
  for (const r of roads) if (!r.rail && !r.tunnel && !r.bridge) { g.strokeStyle = r.st[1]; g.lineWidth = r.st[0] * pxPerM; path(r.f.rings, false); g.stroke(); }
  g.setLineDash([3 * pxPerM, 6 * pxPerM]); g.lineCap = "butt";
  for (const r of roads) if (!r.rail && !r.tunnel && !r.bridge && r.st[3]) { g.strokeStyle = "rgba(240,240,235,0.85)"; g.lineWidth = Math.max(1, 0.18 * pxPerM); path(r.f.rings, false); g.stroke(); }
  g.setLineDash([]);
  // edge lines on the big roads
  for (const r of roads) if (!r.rail && !r.tunnel && !r.bridge && r.rank >= 6) {
    g.strokeStyle = "rgba(235,235,225,0.7)"; g.lineWidth = (r.st[0] - 1) * pxPerM; path(r.f.rings, false); g.stroke();
    g.strokeStyle = r.st[1]; g.lineWidth = (r.st[0] - 1.4) * pxPerM; path(r.f.rings, false); g.stroke();
  }
  // street names for the HUD, and drivable centre lines for spawning on a road
  const roadLines = [];
  if (layers.transportation_name) for (let i = 0; i < layers.transportation_name.feats.length; i++) {
    const f = layers.transportation_name.read(i); const nm = f.props["name:en"] || f.props.name; if (!nm || f.type !== 2) continue;
    for (const ring of f.rings) names.push({ n: nm, p: Float32Array.from(ring, (v) => v * mPerU) });
  }
  for (const r of roads) if (!r.rail && !r.isPath && !r.tunnel && r.rank >= 2) for (const ring of r.f.rings) roadLines.push({ rank: r.rank, p: Float32Array.from(ring, (v) => v * mPerU) });

  // ---------- bridge decks ----------
  const bridges = [], dpos = [], dnor = [], dcol = [], didx = [];
  for (const r of roads) if (r.bridge && !r.rail && (!r.isPath || r.st[0] >= 3)) for (const ring of r.f.rings) {
    const n = ring.length / 2; if (n < 2) continue;
    const xs = [], zs = []; let len = 0; const cum = [0];
    for (let q = 0; q < n; q++) { xs.push(ring[q * 2] * mPerU); zs.push(ring[q * 2 + 1] * mPerU); if (q) { len += Math.hypot(xs[q] - xs[q - 1], zs[q] - zs[q - 1]); cum.push(len); } }
    if (len < 4) continue;
    const h0 = hAt(xs[0], zs[0]), h1 = hAt(xs[n - 1], zs[n - 1]), w = Math.max(3, r.st[0]);
    const ys = xs.map((x, q) => Math.max(h0 + (h1 - h0) * (cum[q] / len), hAt(x, zs[q]) + 0.3) + 0.25);
    const pts = []; for (let q = 0; q < n; q++) pts.push(xs[q], ys[q], zs[q]);
    bridges.push({ w, p: Float32Array.from(pts) });
    // mesh: tarmac deck, side faces down 1.2 m and 1 m parapets
    const tar = hexRgb(r.st[1]), stone = [0.62, 0.6, 0.56];
    for (let q = 0; q < n - 1; q++) {
      const ax = xs[q], az = zs[q], bx = xs[q + 1], bz = zs[q + 1], l = Math.hypot(bx - ax, bz - az); if (l < 0.01) continue;
      const px = -(bz - az) / l * w / 2, pz = (bx - ax) / l * w / 2, ya = ys[q], yb = ys[q + 1];
      const quad = (p0, p1, p2, p3, nx, ny, nz, c) => { const v = dpos.length / 3; dpos.push(...p0, ...p1, ...p2, ...p3); for (let t = 0; t < 4; t++) { dnor.push(nx, ny, nz); dcol.push(c[0], c[1], c[2]); } didx.push(v, v + 1, v + 2, v, v + 2, v + 3, v, v + 2, v + 1, v, v + 3, v + 2); };
      quad([ax - px, ya, az - pz], [ax + px, ya, az + pz], [bx + px, yb, bz + pz], [bx - px, yb, bz - pz], 0, 1, 0, tar);
      for (const sd of [-1, 1]) {
        const ox = px * sd, oz = pz * sd, nx = px / (w / 2) * sd, nz = pz / (w / 2) * sd;
        quad([ax + ox, ya - 1.2, az + oz], [bx + ox, yb - 1.2, bz + oz], [bx + ox, yb + 1, bz + oz], [ax + ox, ya + 1, az + oz], nx, 0, nz, stone);
      }
    }
  }

  // ---------- buildings ----------
  const pos = [], nor = [], uv = [], col = [], idx = [], segs = [];
  let nb = 0;
  if (layers.building) for (let i = 0; i < layers.building.feats.length; i++) {
    const f = layers.building.read(i); if (f.type !== 3 || f.props.hide_3d) continue;
    const top = +f.props.render_height || 6, bottom = +f.props.render_min_height || 0;
    if (top - bottom < 0.5) continue;
    for (const poly of polygons(f.rings)) {
      const outer = poly[0]; if (outer.length < 8) continue;
      let cx = 0, cy = 0; const n = outer.length / 2 - 1; for (let q = 0; q < n * 2; q += 2) { cx += outer[q]; cy += outer[q + 1]; } cx /= n; cy /= n;
      if (cx < 0 || cy < 0 || cx >= E || cy >= E) continue; // the neighbouring tile owns it
      const area = Math.abs(ringArea(outer)) * mPerU * mPerU; if (area < 12) continue;
      const seed = hash(Math.round(cx * 7 + cy * 13 + top * 101) | 0);
      const tall = top > 35;
      const wc = f.props.colour && /^#[0-9a-f]{6}$/i.test(f.props.colour) ? hexRgb(f.props.colour) : tall && seed < 0.7 ? GLASSY[Math.floor(seed * 4.2) % 3] : WALLS[Math.floor(seed * WALLS.length)];
      const rc = ROOFS[Math.floor(hash(Math.round(seed * 1e6)) * ROOFS.length)];
      const base = hAt(cx * mPerU, cy * mPerU) + bottom - (bottom ? 0 : 1.5), y1 = base + (top - bottom) + (bottom ? 0 : 1.5);
      // walls: one quad per edge, uv in metres so the shared window texture repeats per floor
      for (const ring of poly) {
        let run = 0;
        for (let q = 0; q < ring.length - 2; q += 2) {
          const ax = ring[q] * mPerU, az = ring[q + 1] * mPerU, bx = ring[q + 2] * mPerU, bz = ring[q + 3] * mPerU, len = Math.hypot(bx - ax, bz - az);
          if (len < 0.05) continue;
          const nx = (bz - az) / len, nz = -(bx - ax) / len, v0 = pos.length / 3;
          pos.push(ax, base, az, bx, base, bz, bx, y1, bz, ax, y1, az);
          for (let t = 0; t < 4; t++) { nor.push(nx, 0, nz); col.push(wc[0], wc[1], wc[2]); }
          const vb = bottom ? bottom / 3.5 : -1.5 / 3.5, vt = (y1 - base) / 3.5 + vb;
          uv.push(run / 4, vb, (run + len) / 4, vb, (run + len) / 4, vt, run / 4, vt);
          idx.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2); // outward-facing
          run += len;
          segs.push(ax, az, bx, bz, y1);
        }
      }
      // roof: earcut over the footprint with its holes
      const flat = [], holes = []; for (const ring of poly) { if (flat.length) holes.push(flat.length / 2); for (let q = 0; q < ring.length - 2; q++) flat.push(ring[q] * mPerU); }
      const tri = earcut(flat, holes.length ? holes : null, 2), v0 = pos.length / 3;
      for (let q = 0; q < flat.length; q += 2) { pos.push(flat[q], y1, flat[q + 1]); nor.push(0, 1, 0); uv.push(0.02, 0.02); col.push(rc[0], rc[1], rc[2]); }
      for (let q = 0; q < tri.length; q += 3) { // keep every roof triangle facing up
        const a = tri[q], b = tri[q + 1], c = tri[q + 2], up = (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]) - (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]);
        if (up >= 0) idx.push(v0 + a, v0 + b, v0 + c); else idx.push(v0 + a, v0 + c, v0 + b);
      }
      nb++;
    }
  }

  // ---------- trees in parks and woods ----------
  const trees = [];
  if (detail) {
    const plant = (L, test, per) => {
      if (!L) return;
      for (let i = 0; i < L.feats.length && trees.length < 4 * 4000; i++) {
        const f = L.read(i); if (f.type !== 3 || !test(f.props)) continue;
        for (const poly of polygons(f.rings)) {
          const o = poly[0]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let q = 0; q < o.length; q += 2) { x0 = Math.min(x0, o[q]); x1 = Math.max(x1, o[q]); y0 = Math.min(y0, o[q + 1]); y1 = Math.max(y1, o[q + 1]); }
          x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(E, x1); y1 = Math.min(E, y1); if (x1 <= x0 || y1 <= y0) continue;
          const areaM = Math.abs(ringArea(o)) * mPerU * mPerU, n = Math.min(1500, Math.floor(areaM / per));
          let seed = (o[0] * 31 + o[1] * 17) | 0;
          for (let t = 0, tries = 0; t < n && tries < n * 4; tries++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const rx = x0 + (seed >>> 0) / 4294967296 * (x1 - x0);
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const ry = y0 + (seed >>> 0) / 4294967296 * (y1 - y0);
            if (!inPoly(poly, rx, ry)) continue;
            const mx = rx * mPerU, mz = ry * mPerU; trees.push(mx, hAt(mx, mz), mz, 0.75 + ((seed >>> 8) & 255) / 255 * 0.7); t++;
          }
        }
      }
    };
    plant(layers.landcover, (p) => p.class === "wood", 90);
    plant(layers.park, () => true, 260);
    plant(layers.landuse, (p) => p.class === "cemetery", 300);
  }

  // ground mesh grid with skirts (hides cracks between neighbouring tiles)
  const W = N + 1, gpos = new Float32Array(W * W * 3), guv = new Float32Array(W * W * 2), gidx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const o = j * W + i; gpos.set([i / N * T, H[o], j / N * T], o * 3); guv.set([i / N, j / N], o * 2); } // ImageBitmaps upload unflipped: canvas top row is v = 0
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; gidx.push(a, c, b, b, c, d); }

  const bmp = cv.transferToImageBitmap();
  const out = {
    T, N, heights: H, ground: { pos: gpos, uv: guv, idx: new Uint32Array(gidx) }, texture: bmp,
    buildings: { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), col: new Float32Array(col), idx: new Uint32Array(idx), count: nb },
    walls: new Float32Array(segs), trees: new Float32Array(trees), names, roadLines, bridges,
    decks: { pos: new Float32Array(dpos), nor: new Float32Array(dnor), col: new Float32Array(dcol), idx: new Uint32Array(didx) },
  };
  out.transfer = [H.buffer, gpos.buffer, guv.buffer, out.ground.idx.buffer, bmp, out.buildings.pos.buffer, out.buildings.nor.buffer, out.buildings.uv.buffer, out.buildings.col.buffer, out.buildings.idx.buffer, out.walls.buffer, out.trees.buffer, out.decks.pos.buffer, out.decks.nor.buffer, out.decks.col.buffer, out.decks.idx.buffer];
  return out;
}
function inPoly(poly, x, y) {
  let inside = false;
  for (const r of poly) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
