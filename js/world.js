// ---------- Neon Bay: procedural island city ----------
(function () {
  const T = G.TILE, N = 96;
  const W = (G.world = { N, SIZE: N * T });
  const TT = (W.TT = { WATER: 0, SAND: 1, GRASS: 2, ROAD: 3, WALK: 4, LOT: 5, PARK: 6, PLAZA: 7, PARKING: 8 });
  const ROADS = (W.ROADS = [4, 16, 28, 40, 52, 64, 76, 88]); // road occupies tiles r and r+1
  const roadAt = new Uint8Array(N);
  ROADS.forEach((r) => { roadAt[r] = 1; roadAt[r + 1] = 1; });
  W.tiles = new Uint8Array(N * N);
  const rng = mulberry32(1337);
  const R = (a, b) => a + rng() * (b - a);
  const RP = (arr) => arr[Math.floor(rng() * arr.length)];

  W.tileAt = (x, y) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return TT.WATER;
    return W.tiles[ty * N + tx];
  };
  W.isRoad = (x, y) => W.tileAt(x, y) === TT.ROAD;

  // ----- districts (7x7 blocks) -----
  const DIST = (W.dist = []);
  for (let by = 0; by < 7; by++)
    for (let bx = 0; bx < 7; bx++) {
      let d = "suburb";
      if (bx >= 2 && bx <= 4 && by >= 2 && by <= 4) d = "downtown";
      if (bx === 5 && by === 3) d = "downtown";
      if (bx === 3 && by === 3) d = "plaza";
      if (by === 6 && bx <= 3) d = "industrial";
      if (bx === 6) d = "beach";
      if ((bx === 1 && by === 4) || (bx === 5 && by === 1) || (bx === 0 && by === 0)) d = "park";
      DIST[by * 7 + bx] = d;
    }
  W.districtAt = (x, y) => {
    const bx = Math.floor((x / T - 4) / 12), by = Math.floor((y / T - 4) / 12);
    if (bx < 0 || by < 0 || bx > 6 || by > 6) return "coast";
    return DIST[by * 7 + bx];
  };
  W.DISTRICT_NAMES = { downtown: "Downtown", plaza: "Central Plaza", industrial: "The Docks", beach: "Sunset Beach", park: "Greenway Park", suburb: "Palm Heights", coast: "Coastline" };

  // parking lots: bottom-left 256px cell of some blocks
  const parking = new Set();
  for (let b = 0; b < 49; b++) {
    const d = DIST[b];
    if ((d === "suburb" || d === "downtown") && rng() < 0.35) parking.add(b);
  }
  [8, 22, 30].forEach((b) => parking.add(b)); // guaranteed lots near the start

  // ----- tiles -----
  for (let ty = 0; ty < N; ty++)
    for (let tx = 0; tx < N; tx++) {
      let t;
      const inBox = tx >= 3 && tx <= 90 && ty >= 3 && ty <= 90;
      if (inBox && ((roadAt[tx] && ty >= 4 && ty <= 89) || (roadAt[ty] && tx >= 4 && tx <= 89))) t = TT.ROAD;
      else if (inBox && (tx === 3 || ty === 3 || tx === 90 || ty === 90)) t = TT.WALK;
      else if (!inBox) t = tx >= 1 && ty >= 1 && tx <= 93 && ty <= 94 ? TT.SAND : TT.WATER;
      else {
        const bx = Math.floor((tx - 4) / 12), by = Math.floor((ty - 4) / 12);
        const lx = tx - (4 + 12 * bx), ly = ty - (4 + 12 * by);
        const d = DIST[by * 7 + bx];
        if (lx === 2 || lx === 11 || ly === 2 || ly === 11) t = TT.WALK;
        else if (parking.has(by * 7 + bx) && lx >= 3 && lx <= 6 && ly >= 7 && ly <= 10) t = TT.PARKING;
        else t = d === "downtown" || d === "plaza" ? TT.PLAZA : d === "industrial" ? TT.LOT : d === "park" ? TT.PARK : TT.GRASS;
      }
      W.tiles[ty * N + tx] = t;
    }

  // ----- solids, trees, decor -----
  const buildings = (W.buildings = []);
  const trees = (W.trees = []);
  const decor = (W.decor = []);
  const solids = (W.solids = []);
  W.parkingSpots = [];
  function addB(x, y, w, h, height, o = {}) {
    const b = Object.assign({ kind: "rect", x, y, w, h, height, color: "#555", roof: "#444", windows: true }, o);
    b.seed = Math.floor(rng() * 1e9);
    buildings.push(b); solids.push(b); return b;
  }
  function addTree(x, y, kind = "tree") {
    const t = { kind: "circle", x, y, r: kind === "palm" ? 8 : 10, height: 30, tree: kind, size: kind === "palm" ? R(18, 24) : R(18, 28), hue: R(0, 1) };
    trees.push(t); solids.push(t);
  }
  const POIS = (W.pois = {});
  const POI_DEF = {
    "1,1,0,0": { id: "safehouse", name: "YOUR CRIB", icon: "🏠", color: "#19f5a0" },
    "4,1,1,0": { id: "spray", name: "SPRAY SHACK", icon: "🎨", color: "#ff3df2" },
    "5,5,0,0": { id: "dealer", name: "TURBO MOTORS", icon: "🚗", color: "#22d3ee" },
    "4,4,1,0": { id: "velvet", name: "THE VELVET", icon: "★", color: "#ffd60a" },
    "1,6,0,0": { id: "depot", name: "BAYSIDE FREIGHT", icon: "📦", color: "#ffa028" },
    "0,3,0,0": { id: "hospital", name: "ST. MARIS HOSPITAL", icon: "✚", color: "#ff4d6d" },
    "3,5,1,0": { id: "police", name: "BAY PD", icon: "🛡", color: "#4cc9f0" },
    "2,1,1,0": { id: "burger", name: "NEON BITES", icon: "🍔", color: "#ff9f1c" },
  };

  for (let by = 0; by < 7; by++)
    for (let bx = 0; bx < 7; bx++) {
      const d = DIST[by * 7 + bx];
      const X0 = (4 + 12 * bx + 3) * T, Y0 = (4 + 12 * by + 3) * T;
      const walkN = (4 + 12 * by + 2.5) * T; // north sidewalk center line
      const hasPark = parking.has(by * 7 + bx);
      if (hasPark) {
        for (let i = 0; i < 4; i++) W.parkingSpots.push({ x: X0 + 38 + i * 60, y: Y0 + 256 + 150, a: Math.PI / 2 }); // nose to the street
      }
      if (d === "park") {
        decor.push({ type: "pond", x: X0 + 256 + R(-60, 60), y: Y0 + 256 + R(-60, 60), rx: R(90, 130), ry: R(60, 90) });
        for (let i = 0; i < 26; i++) {
          const x = X0 + R(20, 492), y = Y0 + R(20, 492);
          const p = decor[decor.length - 1];
          if (((x - p.x) / (p.rx + 30)) ** 2 + ((y - p.y) / (p.ry + 30)) ** 2 < 1) continue;
          addTree(x, y);
        }
        continue;
      }
      if (d === "plaza") {
        const f = { kind: "circle", x: X0 + 256, y: Y0 + 256, r: 62, height: 12, fountain: true };
        solids.push(f); decor.push({ type: "fountain", x: f.x, y: f.y, r: 62 });
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; addTree(X0 + 256 + Math.cos(a) * 200, Y0 + 256 + Math.sin(a) * 200); }
        continue;
      }
      for (let cy = 0; cy < 2; cy++)
        for (let cx = 0; cx < 2; cx++) {
          if (hasPark && cx === 0 && cy === 1) continue;
          const key = `${bx},${by},${cx},${cy}`;
          const x = X0 + cx * 256, y = Y0 + cy * 256;
          const poi = POI_DEF[key];
          if (poi) {
            const o = { color: "#3a3f55", roof: "#262a38", windows: true, sign: poi.name, neon: poi.color, poi: poi.id };
            let b;
            if (poi.id === "safehouse") b = addB(x + 50, y + 40, 160, 150, 34, { ...o, color: "#d8c3a5", roof: "#8e5b3c", windows: false });
            else if (poi.id === "police") b = addB(x + 20, y + 20, 216, 200, 120, { ...o, color: "#2b3a55", roof: "#1b2333", helipad: true });
            else if (poi.id === "hospital") b = addB(x + 20, y + 20, 216, 210, 96, { ...o, color: "#e9ecef", roof: "#ced4da", cross: true });
            else if (poi.id === "velvet") b = addB(x + 24, y + 30, 200, 190, 70, { ...o, color: "#2a1a3a", roof: "#1a0f26" });
            else if (poi.id === "dealer") b = addB(x + 20, y + 40, 216, 170, 40, { ...o, color: "#9ad1ff", roof: "#5a7fa8", glass: true });
            else if (poi.id === "depot") b = addB(x + 16, y + 30, 224, 200, 52, { ...o, color: "#6b6f76", roof: "#585d65", windows: false, ridges: true });
            else b = addB(x + 30, y + 40, 196, 160, 36, o);
            POIS[poi.id] = Object.assign({}, poi, { x: x + 128, y: walkN, b });
            continue;
          }
          if (d === "downtown") {
            const m = 14;
            addB(x + m, y + m, 256 - 2 * m, 256 - 2 * m, R(90, 230), { color: RP(["#3b4a6b", "#4b5d7a", "#2f3e57", "#5a4e7a", "#355c6b", "#40506e"]), roof: RP(["#1f2633", "#262d3d", "#2c2438"]), neon: rng() < 0.35 ? RP(["#ff3df2", "#22d3ee", "#ffd60a", "#19f5a0"]) : null });
          } else if (d === "suburb") {
            const w = R(120, 165), h = R(110, 160);
            addB(x + (256 - w) / 2 + R(-20, 20), y + (256 - h) / 2 + R(-15, 15), w, h, R(24, 38), { color: RP(["#d8c3a5", "#e8d5b7", "#c9ada7", "#b8c5d6", "#e0e1dd"]), roof: RP(["#b5523b", "#8d5a3b", "#6b7f8f", "#a0763d", "#7a4a5a"]), windows: false, house: true });
            if (rng() < 0.35) decor.push({ type: "pool", x: x + R(30, 60), y: y + R(180, 200), w: 60, h: 36 });
            addTree(x + R(15, 40), y + R(15, 40));
            if (rng() < 0.5) addTree(x + R(215, 240), y + R(200, 240));
          } else if (d === "beach") {
            const w = R(130, 170), h = R(110, 150);
            addB(x + (256 - w) / 2, y + (256 - h) / 2, w, h, R(26, 44), { color: RP(["#f4a6c1", "#9ad1d4", "#f6d58e", "#b8e0a8", "#c9b6e4", "#ffd6a5"]), roof: RP(["#ffffff", "#f1f1f1", "#e6e6e6"]), windows: false, house: true });
            addTree(x + R(10, 30), y + R(200, 240), "palm");
            addTree(x + R(220, 245), y + R(10, 40), "palm");
            if (rng() < 0.5) decor.push({ type: "pool", x: x + 150, y: y + 205, w: 70, h: 34 });
          } else if (d === "industrial") {
            if (cx === 1) continue; // warehouses span both cells
            addB(x + 16, y + 26, 480, 196, R(40, 58), { color: "#6b6f76", roof: RP(["#585d65", "#4f5560", "#5f6670"]), windows: false, ridges: true });
            for (let k = 0; k < 3; k++) {
              const cc = RP(["#d62828", "#f77f00", "#1d3557", "#2a9d8f", "#6a4c93"]);
              const box = addB(x + 30 + k * 70, y + 232 - 4, 60, 22, 22, { color: cc, roof: cc, windows: false, container: true });
              box.y = y + 230; if (box.y + box.h > y + 254) box.h = 20;
            }
          }
        }
    }
  // ----- 3D heights (visual + rooftop gameplay); 2D `height` stays for car physics -----
  for (const b of buildings) {
    if (b.container) b.h3 = 26;
    else if (b.house) b.h3 = Math.max(46, b.height * 1.7);
    else if (b.ridges) b.h3 = b.height * 1.6;
    else if (b.poi) b.h3 = Math.max(60, b.height * 1.8);
    else b.h3 = b.height * 2.2;
  }
  // hay carts + soft landing spots (for leap-of-faith dives)
  W.hay = [];
  for (let by = 0; by < 7; by++)
    for (let bx = 0; bx < 7; bx++) {
      const d = DIST[by * 7 + bx]; if (d !== "downtown" && d !== "industrial") continue;
      const X0 = (4 + 12 * bx + 3) * T, Y0 = (4 + 12 * by + 3) * T;
      for (let cx = 0; cx < 2; cx++) if (rng() < 0.7) W.hay.push({ x: X0 + 70 + cx * 256 + R(0, 110), y: Y0 - 30, r: 22 });
    }

  // coast palms
  for (let i = 0; i < 40; i++) addTree(R(91.3, 93) * T, R(4, 90) * T, "palm");
  for (let i = 0; i < 14; i++) addTree(R(4, 88) * T, R(91.3, 93.5) * T, "palm");
  // water walls (map edge)
  const S = W.SIZE;
  [[-200, -200, S + 400, 200 + T * 0.6], [-200, -200, 200 + T * 0.6, S + 400], [T * 94.2, -200, 400, S + 400], [-200, T * 95.2, S + 400, 400]].forEach(([x, y, w, h]) =>
    solids.push({ kind: "rect", x, y, w, h, height: 9999, water: true }));

  // ----- spatial hash -----
  const CELL = 256, CN = Math.ceil(S / CELL) + 2;
  const grid = Array.from({ length: CN * CN }, () => []);
  const cellIdx = (cx, cy) => clamp(cy + 1, 0, CN - 1) * CN + clamp(cx + 1, 0, CN - 1);
  solids.forEach((s, i) => {
    s.i = i;
    const x0 = s.kind === "rect" ? s.x : s.x - s.r, y0 = s.kind === "rect" ? s.y : s.y - s.r;
    const x1 = s.kind === "rect" ? s.x + s.w : s.x + s.r, y1 = s.kind === "rect" ? s.y + s.h : s.y + s.r;
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++)
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) grid[cellIdx(cx, cy)].push(s);
  });
  let stamp = 1; const seen = new Uint32Array(solids.length);
  W.query = (x, y, r) => {
    stamp++; const out = [];
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++)
      for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
        for (const s of grid[cellIdx(cx, cy)]) if (seen[s.i] !== stamp) { seen[s.i] = stamp; out.push(s); }
    return out;
  };
  W.pointBlocked = (x, y, pad = 0) => {
    for (const s of W.query(x, y, pad + 1)) {
      if (s.kind === "rect") { if (x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad) return s; }
      else if (dist(x, y, s.x, s.y) < s.r + pad) return s;
    }
    return null;
  };

  // 3D helpers: top of whatever solid is under (x,y); soft landing spots
  W.top3 = (s) => (s.water ? 9999 : s.h3 !== undefined ? s.h3 : s.fountain ? 14 : s.tree ? 58 : s.height);
  W.groundAt = (x, y, pad = 0) => {
    let h = 0, hit = null;
    for (const s of W.query(x, y, pad + 1)) {
      if (s.water || s.tree) continue;
      const inside = s.kind === "rect" ? x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad : dist(x, y, s.x, s.y) < s.r + pad;
      if (inside && W.top3(s) > h) { h = W.top3(s); hit = s; }
    }
    return [h, hit];
  };
  W.softAt = (x, y) => {
    for (const h of W.hay) if (dist(x, y, h.x, h.y) < h.r + 6) return "hay";
    for (const d of W.decor) {
      if (d.type === "pond" && ((x - d.x) / d.rx) ** 2 + ((y - d.y) / d.ry) ** 2 < 1) return "water";
      if (d.type === "pool" && x > d.x && x < d.x + d.w && y > d.y && y < d.y + d.h) return "water";
      if (d.type === "fountain" && dist(x, y, d.x, d.y) < d.r - 8) return "water";
    }
    return null;
  };

  // ----- road graph -----
  const nodes = (W.nodes = []);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) nodes.push({ id: j * 8 + i, i, j, x: (ROADS[i] + 1) * T, y: (ROADS[j] + 1) * T, nb: [] });
  nodes.forEach((n) => {
    if (n.i > 0) n.nb.push(n.id - 1);
    if (n.i < 7) n.nb.push(n.id + 1);
    if (n.j > 0) n.nb.push(n.id - 8);
    if (n.j < 7) n.nb.push(n.id + 8);
  });
  W.node = (i, j) => nodes[j * 8 + i];
  W.nearestNode = (x, y) => {
    let bi = 0, bj = 0;
    for (let k = 1; k < 8; k++) { if (Math.abs((ROADS[k] + 1) * T - x) < Math.abs((ROADS[bi] + 1) * T - x)) bi = k; if (Math.abs((ROADS[k] + 1) * T - y) < Math.abs((ROADS[bj] + 1) * T - y)) bj = k; }
    return nodes[bj * 8 + bi];
  };
  W.nodePath = (a, b) => {
    const prev = new Int16Array(64).fill(-1); prev[a] = a; const q = [a];
    while (q.length) { const c = q.shift(); if (c === b) break; for (const n of nodes[c].nb) if (prev[n] < 0) { prev[n] = c; q.push(n); } }
    if (prev[b] < 0) return [a];
    const path = [b]; while (path[0] !== a) path.unshift(prev[path[0]]);
    return path;
  };
  // GPS polyline from (x,y) to (tx,ty) along roads
  W.route = (x, y, tx, ty) => {
    const a = W.nearestNode(x, y).id, b = W.nearestNode(tx, ty).id;
    const pts = [{ x, y }];
    W.nodePath(a, b).forEach((id) => pts.push({ x: nodes[id].x, y: nodes[id].y }));
    pts.push({ x: tx, y: ty });
    return pts;
  };
  W.randomLanePoint = (nearX, nearY, minD, maxD) => {
    for (let k = 0; k < 40; k++) {
      const n = nodes[Math.floor(Math.random() * 64)];
      const nbId = pick(n.nb), m = nodes[nbId];
      const t = rand(0.2, 0.8);
      const dx = Math.sign(m.x - n.x), dy = Math.sign(m.y - n.y);
      const x = lerp(n.x, m.x, t) - dy * 34, y = lerp(n.y, m.y, t) + dx * 34;
      const d = dist(x, y, nearX, nearY);
      if (d >= minD && d <= maxD) return { x, y, from: n.id, to: nbId, a: Math.atan2(dy, dx) };
    }
    return null;
  };

  // ----- streetlights, ramps, tokens, race routes -----
  W.lights = [];
  nodes.forEach((n) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => W.lights.push({ x: n.x + sx * (T + 24), y: n.y + sy * (T + 24) })));
  W.ramps = [];
  const rampSeg = (i1, j1, i2, j2, dir) => {
    const a = W.node(i1, j1), b = W.node(i2, j2);
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    const ang = Math.atan2(dy, dx) + (dir < 0 ? Math.PI : 0);
    W.ramps.push({ x: (a.x + b.x) / 2 + dy * 34 * dir * -1 * 0, y: (a.y + b.y) / 2, a: ang, w: 70, h: 56, found: false });
  };
  rampSeg(0, 1, 1, 1, 1); rampSeg(3, 0, 4, 0, -1); rampSeg(7, 2, 7, 3, 1); rampSeg(1, 7, 2, 7, 1); rampSeg(5, 6, 5, 7, 1); rampSeg(2, 3, 2, 4, -1);
  W.ramps.push({ x: 92 * T, y: 40 * T, a: Math.PI / 2, w: 70, h: 56 });
  W.ramps.push({ x: 60 * T, y: 93 * T, a: 0, w: 70, h: 56 });

  W.tokens = [];
  const trng = mulberry32(99);
  while (W.tokens.length < 25) {
    const x = (4 + trng() * 86) * T, y = (4 + trng() * 86) * T, t = W.tileAt(x, y);
    if ((t === TT.WALK || t === TT.PARK || t === TT.SAND || t === TT.GRASS) && !W.pointBlocked(x, y, 18)) W.tokens.push({ x, y, got: false });
  }
  W.raceRoutes = [
    { name: "Harbor Loop", reward: 2000, nodes: [9, 13, 45, 41, 9], color: "#22d3ee" },
    { name: "Downtown Dash", reward: 3000, nodes: [18, 21, 37, 34, 18], color: "#ff3df2" },
    { name: "Coastal Run", reward: 4500, nodes: [7, 63, 56, 0, 7], color: "#ffd60a" },
  ];
  W.raceRoutes.forEach((r) => {
    r.path = [];
    for (let k = 0; k < r.nodes.length - 1; k++) { const p = W.nodePath(r.nodes[k], r.nodes[k + 1]); if (k > 0) p.shift(); r.path.push(...p); }
    r.checkpoints = r.path.filter((_, i) => i > 0).map((id) => ({ x: nodes[id].x, y: nodes[id].y }));
    const s = nodes[r.nodes[0]], s2 = nodes[r.path[1]];
    r.start = { x: s.x, y: s.y, a: Math.atan2(s2.y - s.y, s2.x - s.x) };
  });
})();
