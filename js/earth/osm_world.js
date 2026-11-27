// The real UK from open data, with no API key: OpenStreetMap buildings (real footprints and heights), roads, rivers,
// parks and land use from OpenFreeMap vector tiles, on real terrain from AWS Terrain Tiles. Tiles (z14, about 1.5 km
// square) are built in workers (osm_worker.js) and streamed around the player. Ground height and building walls are
// kept as plain arrays, so the car's ground and collision checks are cheap lookups, not ray casts.
//
// Local frame: x east, z south, y up (metres). The origin is a lat/lon; recenter() moves it under the player.
import * as THREE from "three";

const C = 40075016.686, Z = 14, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const lonToU = (lon) => (lon + 180) / 360;
const latToV = (lat) => { const s = Math.sin(lat * D2R); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const uToLon = (u) => u * 360 - 180;
const vToLat = (v) => Math.atan(Math.sinh(Math.PI * (1 - 2 * v))) * R2D;

export function createOsmWorld({ scene, renderer, isTouch }) {
  const nW = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
  const workers = [], pending = new Map();
  let jobId = 0, rr = 0;
  for (let i = 0; i < nW; i++) {
    const w = new Worker(new URL("./osm_worker.js", import.meta.url));
    w.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    workers.push(w);
  }
  const run = (msg) => new Promise((res) => { const id = ++jobId; pending.set(id, res); workers[rr++ % workers.length].postMessage({ ...msg, id }); });

  // shared materials
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const winTex = (() => { // one 4 m x 3.5 m facade bay: plain wall with a window; tinted per building by vertex colour
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "#f2f0ec"; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#d9d6d0"; g.fillRect(0, 0, 128, 6);
    g.fillStyle = "#cfcbc4"; g.fillRect(24, 22, 80, 74);
    const gr = g.createLinearGradient(0, 26, 0, 92); gr.addColorStop(0, "#5d7286"); gr.addColorStop(1, "#1d2733");
    g.fillStyle = gr; g.fillRect(28, 26, 72, 66);
    g.fillStyle = "#cfcbc4"; g.fillRect(62, 26, 4, 66); g.fillRect(28, 56, 72, 3);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  })();
  const bldMat = new THREE.MeshStandardMaterial({ map: winTex, vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 3, 6).translate(0, 1.5, 0);
  const crownGeo = (() => { const g = new THREE.IcosahedronGeometry(2.6, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const s = 1 + Math.sin(i * 12.9898) * 0.12; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 1.15 + 4.6, p.getZ(i) * s); } g.computeVertexNormals(); return g; })();
  const deckMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2c }), crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), q0 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();

  let ou = 0, ov = 0, k = 1, scale = C; // origin in mercator units, metres per mercator unit = C * k
  const tiles = new Map(); // "x/y" -> tile
  let gen = 0; // bumps on setOrigin so stale worker results are dropped
  const CELL = 24;

  function tileOrigin(tx, ty) { return new THREE.Vector3((tx / 2 ** Z - ou) * scale, 0, (ty / 2 ** Z - ov) * scale); }
  function tileAtLocal(x, z) { const u = ou + x / scale, v = ov + z / scale; return [Math.floor(u * 2 ** Z), Math.floor(v * 2 ** Z)]; }

  function setOrigin(lat, lon) {
    for (const t of tiles.values()) disposeTile(t);
    tiles.clear(); gen++;
    ou = lonToU(lon); ov = latToV(lat); k = Math.cos(lat * D2R); scale = C * k;
  }
  // move the origin to the player's position; returns the offset to add to everything else in the scene
  function recenter(pos) {
    const d = new THREE.Vector3(-pos.x, 0, -pos.z);
    ou += pos.x / scale; ov += pos.z / scale;
    for (const t of tiles.values()) if (t.group) t.group.position.add(d);
    return new THREE.Matrix4().makeTranslation(d.x, 0, d.z);
  }

  function disposeTile(t) {
    if (!t.group) return;
    scene.remove(t.group);
    t.group.traverse((o) => { if (o.geometry && o.geometry !== trunkGeo && o.geometry !== crownGeo) o.geometry.dispose(); if (o.material && o.material.map && o.material !== bldMat) { o.material.map.dispose(); o.material.dispose(); } });
    if (t.tex) t.tex.close && t.tex.close();
  }

  function want(tx, ty, ring) {
    const key = tx + "/" + ty; if (tiles.has(key)) return;
    const t = { key, tx, ty, ready: false, group: null, myGen: gen };
    tiles.set(key, t);
    const texSize = ring === 0 ? (isTouch ? 1024 : 2048) : isTouch ? 512 : 1024;
    run({ z: Z, x: tx, y: ty, k, texSize, detail: ring <= 1 }).then((r) => {
      if (t.myGen !== gen || tiles.get(key) !== t) { if (r.texture && r.texture.close) r.texture.close(); return; }
      if (r.error) { t.failed = true; t.error = r.error; return; }
      buildTile(t, r);
    });
  }

  function buildTile(t, r) {
    const group = new THREE.Group(); group.position.copy(tileOrigin(t.tx, t.ty));
    // ground
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(r.ground.pos, 3)); gg.setAttribute("uv", new THREE.BufferAttribute(r.ground.uv, 2));
    gg.setIndex(new THREE.BufferAttribute(r.ground.idx, 1)); gg.computeVertexNormals();
    const tex = new THREE.Texture(r.texture); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso; tex.flipY = false; tex.needsUpdate = true;
    const ground = new THREE.Mesh(gg, new THREE.MeshLambertMaterial({ map: tex })); ground.receiveShadow = true; group.add(ground);
    // buildings
    if (r.buildings.idx.length) {
      const bg = new THREE.BufferGeometry(), b = r.buildings;
      bg.setAttribute("position", new THREE.BufferAttribute(b.pos, 3)); bg.setAttribute("normal", new THREE.BufferAttribute(b.nor, 3));
      bg.setAttribute("uv", new THREE.BufferAttribute(b.uv, 2)); bg.setAttribute("color", new THREE.BufferAttribute(b.col, 3));
      bg.setIndex(new THREE.BufferAttribute(b.idx, 1)); bg.computeBoundingSphere();
      group.add(new THREE.Mesh(bg, bldMat));
    }
    // bridge decks (double-sided: both sides of the parapets show)
    if (r.decks.idx.length) {
      const dg = new THREE.BufferGeometry(), d = r.decks;
      dg.setAttribute("position", new THREE.BufferAttribute(d.pos, 3)); dg.setAttribute("normal", new THREE.BufferAttribute(d.nor, 3)); dg.setAttribute("color", new THREE.BufferAttribute(d.col, 3));
      dg.setIndex(new THREE.BufferAttribute(d.idx, 1)); dg.computeBoundingSphere(); group.add(new THREE.Mesh(dg, deckMat));
    }
    // trees
    const nT = r.trees.length / 4;
    if (nT) {
      const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, nT), cm = new THREE.InstancedMesh(crownGeo, crownMat, nT);
      for (let i = 0; i < nT; i++) {
        const s = r.trees[i * 4 + 3]; tmpM.compose(pv.set(r.trees[i * 4], r.trees[i * 4 + 1], r.trees[i * 4 + 2]), q0, sv.set(s, s, s));
        tm.setMatrixAt(i, tmpM); cm.setMatrixAt(i, tmpM);
        cm.setColorAt(i, tmpC.setHSL(0.24 + (i * 0.618 % 1) * 0.08, 0.38, 0.22 + (i * 0.37 % 1) * 0.1));
      }
      tm.computeBoundingSphere(); cm.computeBoundingSphere(); group.add(tm, cm);
    }
    // collision: building wall segments in a 24 m grid
    const grid = new Map(), W = r.walls;
    for (let i = 0; i < W.length; i += 5) {
      const x0 = Math.floor(Math.min(W[i], W[i + 2]) / CELL), x1 = Math.floor(Math.max(W[i], W[i + 2]) / CELL), z0 = Math.floor(Math.min(W[i + 1], W[i + 3]) / CELL), z1 = Math.floor(Math.max(W[i + 1], W[i + 3]) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const key = cx * 4096 + cz; let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(i); }
    }
    Object.assign(t, { group, tex: r.texture, T: r.T, N: r.N, H: r.heights, walls: W, grid, names: r.names, roadLines: r.roadLines, bridges: r.bridges, ready: true, buildings: r.buildings.count });
    scene.add(group);
  }

  function update(pos, flying) {
    const [cx, cy] = tileAtLocal(pos.x, pos.z), R = flying ? 2 : 1;
    const list = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) list.push([dx * dx + dy * dy, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy))]);
    list.sort((a, b) => a[0] - b[0]);
    for (const [, x, y, ring] of list) want(x, y, ring);
    for (const t of tiles.values()) if (Math.max(Math.abs(t.tx - cx), Math.abs(t.ty - cy)) > R + 1) { disposeTile(t); tiles.delete(t.key); }
  }

  const tileFor = (x, z) => { const [tx, ty] = tileAtLocal(x, z), t = tiles.get(tx + "/" + ty); return t && t.ready ? t : null; };
  function ground(x, z, yTop = Infinity) {
    const t = tileFor(x, z); if (!t) return null;
    const lx = x - t.group.position.x, lz = z - t.group.position.z;
    const terrain = terrainAt(t, lx, lz);
    let best = terrain;
    for (const b of t.bridges) { // a deck counts only if we're at or above it (so you can still drive under a bridge)
      const p = b.p, hw2 = (b.w / 2) ** 2;
      for (let i = 0; i < p.length - 3; i += 3) {
        const ax = p[i], az = p[i + 2], bx = p[i + 3], bz = p[i + 5], dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
        let s = l ? ((lx - ax) * dx + (lz - az) * dz) / l : 0; s = Math.max(0, Math.min(1, s));
        const cx = ax + dx * s, cz = az + dz * s; if ((lx - cx) ** 2 + (lz - cz) ** 2 > hw2) continue;
        const y = p[i + 1] + (p[i + 4] - p[i + 1]) * s; if (y > best && y <= yTop + 0.3) best = y;
      }
    }
    return best;
  }
  function terrainAt(t, lx, lz) {
    const N = t.N, Wd = N + 1, H = t.H;
    const gx = Math.max(0, Math.min(N, lx / t.T * N)), gz = Math.max(0, Math.min(N, lz / t.T * N)), i = Math.min(N - 1, Math.floor(gx)), j = Math.min(N - 1, Math.floor(gz)), fx = gx - i, fz = gz - j;
    // match the rendered triangles (a, c, b / b, c, d) so the car sits exactly on the drawn ground
    const a = H[j * Wd + i], b = H[j * Wd + i + 1], c = H[(j + 1) * Wd + i], d = H[(j + 1) * Wd + i + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  // first building wall hit by a ray (origin o, unit direction dir) within far metres, or null. 2D test against
  // wall segments whose tops are above the ray's height there.
  function ray(o, dir, far) {
    let best = null;
    const ex = o.x + dir.x * far, ez = o.z + dir.z * far, seen = new Set();
    for (const t of new Set([tileFor(o.x, o.z), tileFor(ex, ez)])) {
      if (!t) continue;
      const gx = t.group.position.x, gz = t.group.position.z, ax = o.x - gx, az = o.z - gz, bx = ex - gx, bz = ez - gz;
      const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL), z0 = Math.floor(Math.min(az, bz) / CELL), z1 = Math.floor(Math.max(az, bz) / CELL);
      const W = t.walls, rx = bx - ax, rz = bz - az;
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const cell = t.grid.get(cx * 4096 + cz); if (!cell) continue;
        for (const i of cell) {
          if (seen.has(t.key + i)) continue; seen.add(t.key + i);
          const sx = W[i + 2] - W[i], sz = W[i + 3] - W[i + 1], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
          const qx = W[i] - ax, qz = W[i + 1] - az, s = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
          if (s < 0 || s > 1 || u < 0 || u > 1) continue;
          const dist = s * far, y = o.y + dir.y * dist; if (y > W[i + 4]) continue;
          if (best === null || dist < best) best = dist;
        }
      }
    }
    return best;
  }
  function toLatLon(v) { return { lat: vToLat(ov + v.z / scale), lon: uToLon(ou + v.x / scale) }; }
  // nearest named street within 30 m, for the HUD
  function streetAt(p) {
    const t = tileFor(p.x, p.z); if (!t) return null;
    const lx = p.x - t.group.position.x, lz = p.z - t.group.position.z; let best = null, bd = 900;
    for (const s of t.names) { const a = s.p; for (let i = 0; i < a.length - 2; i += 2) { const d = segDist2(lx, lz, a[i], a[i + 1], a[i + 2], a[i + 3]); if (d < bd) { bd = d; best = s.n; } } }
    return best;
  }
  // nearest drivable road point (prefers bigger roads) to spawn the car on, with the road's direction
  function nearestRoad(x, z) {
    const t = tileFor(x, z); if (!t) return null;
    const lx = x - t.group.position.x, lz = z - t.group.position.z; let best = null, bd = Infinity;
    for (const r of t.roadLines) { const a = r.p, pen = (8 - r.rank) * 400; for (let i = 0; i < a.length - 2; i += 2) {
      const d = segDist2(lx, lz, a[i], a[i + 1], a[i + 2], a[i + 3]) + pen;
      if (d < bd) { bd = d; const [px, pz] = segClosest(lx, lz, a[i], a[i + 1], a[i + 2], a[i + 3]); best = { x: px + t.group.position.x, z: pz + t.group.position.z, yaw: Math.atan2(a[i + 2] - a[i], a[i + 3] - a[i + 1]) }; }
    } }
    return best;
  }
  function centreReady(pos) { const t = tileFor(pos.x, pos.z); return !!t; }
  function busy() { let n = 0; for (const t of tiles.values()) if (!t.ready && !t.failed) n++; return n; }
  function failed() { for (const t of tiles.values()) if (t.failed) return t.error; return null; }
  function stats() { let b = 0, n = 0; for (const t of tiles.values()) if (t.ready) { n++; b += t.buildings; } return { tiles: n, buildings: b }; }
  return {
    kind: "osm", axes: { east: new THREE.Vector3(1, 0, 0), north: new THREE.Vector3(0, 0, -1) },
    setOrigin, recenter, update, ground, ray, toLatLon, streetAt, nearestRoad, centreReady, busy, failed, stats,
    attribution: () => "© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles · terrain: AWS Terrain Tiles",
    recenterAt: 1200,
    dispose() { for (const t of tiles.values()) disposeTile(t); tiles.clear(); gen++; for (const w of workers) w.terminate(); },
  };
}
function segClosest(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); return [ax + dx * t, az + dz * t]; }
function segDist2(px, pz, ax, az, bx, bz) { const [x, z] = segClosest(px, pz, ax, az, bx, bz); return (px - x) ** 2 + (pz - z) ** 2; }
