// ---------- the Bay Region: Neon Bay (the original island city) + three mainland cities joined by highways ----------
// Every city sits on one global road lattice (roads at tiles 4 + 12k), so highways line up with city streets.
// Neon Bay keeps its exact old layout (tiles 0..95, node ids 0..63) so saves, missions and the campaign still fit.
(function () {
  const T = G.TILE, N0 = 96, N = 216, NB = 17; // N0: Neon Bay island size; NB: lattice blocks per side
  const W = (G.world = { N, N0, NB, SIZE: N * T });
  const TT = (W.TT = { WATER: 0, SAND: 1, GRASS: 2, ROAD: 3, WALK: 4, LOT: 5, PARK: 6, PLAZA: 7, PARKING: 8, DIRT: 9 });
  const LAT = (W.LAT = (k) => 4 + 12 * k); // tile of lattice road k
  W.CITIES = [
    { id: "bay", name: "Neon Bay", bx0: 0, bx1: 6, by0: 0, by1: 6, color: "#ff3df2" },
    { id: "highgate", name: "Highgate", bx0: 11, bx1: 15, by0: 2, by1: 6, color: "#22d3ee", style: "metro" },
    { id: "calder", name: "Port Calder", bx0: 1, bx1: 5, by0: 11, by1: 15, color: "#ffa028", style: "port" },
    { id: "vista", name: "Sierra Vista", bx0: 11, bx1: 15, by0: 11, by1: 15, color: "#ffd60a", style: "desert" },
  ];
  W.CITIES.forEach((c) => { c.x0 = LAT(c.bx0) * T; c.y0 = LAT(c.by0) * T; c.x1 = (LAT(c.bx1 + 1) + 2) * T; c.y1 = (LAT(c.by1 + 1) + 2) * T; c.cx = (c.x0 + c.x1) / 2; c.cy = (c.y0 + c.y1) / 2; });
  // highways along a lattice line k, from lattice road a to b
  W.HIGHWAYS = [
    { h: true, k: 3, a: 7, b: 11, name: "Route 1 · Bay Bridge" },
    { h: false, k: 3, a: 7, b: 11, name: "Route 2 · Calder Causeway" },
    { h: false, k: 14, a: 7, b: 11, name: "Route 9 · Mesa Pass" },
    { h: true, k: 14, a: 6, b: 11, name: "Route 5 · Desert Line" },
  ];
  W.cityAt = (x, y) => W.CITIES.find((c) => x >= c.x0 - 200 && x <= c.x1 + 200 && y >= c.y0 - 200 && y <= c.y1 + 200) || null;
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
  // every lattice block in any city -> district id (Neon Bay's 7x7 included)
  const BLOCK = (W.block = new Array(NB * NB).fill(null));
  for (let by = 0; by < 7; by++) for (let bx = 0; bx < 7; bx++) BLOCK[by * NB + bx] = DIST[by * 7 + bx];
  const crng = mulberry32(2026);
  for (const c of W.CITIES) if (c.style) for (let by = c.by0; by <= c.by1; by++) for (let bx = c.bx0; bx <= c.bx1; bx++) {
    const lx = bx - c.bx0, ly = by - c.by0, mid = lx >= 1 && lx <= 3 && ly >= 1 && ly <= 3;
    let d;
    if (c.style === "metro") d = (lx === 2 && ly === 4) || (lx === 0 && ly === 0) ? "hg_park" : mid ? "hg_core" : "hg_mid";
    else if (c.style === "port") d = ly === 4 ? "pc_docks" : lx === 2 && ly === 2 ? "pc_park" : "pc_old";
    else d = ly === 2 ? "sv_strip" : (lx === 0 || lx === 4) && (ly === 0 || ly === 4) ? "sv_ranch" : "sv_town";
    BLOCK[by * NB + bx] = d;
  }
  W.blockAt = (bx, by) => (bx < 0 || by < 0 || bx >= NB || by >= NB ? null : BLOCK[by * NB + bx]);
  W.districtAt = (x, y) => {
    const bx = Math.floor((x / T - 4) / 12), by = Math.floor((y / T - 4) / 12);
    const d = W.blockAt(bx, by);
    if (d) return d;
    const t = W.tileAt(x, y);
    if (t === TT.ROAD && !W.cityAt(x, y)) return "highway";
    if (t === TT.WATER || (x < N0 * T && y < N0 * T)) return "coast";
    return t === TT.DIRT ? "desert" : "country";
  };
  W.DISTRICT_NAMES = { downtown: "Downtown", plaza: "Central Plaza", industrial: "The Docks", beach: "Sunset Beach", park: "Greenway Park", suburb: "Palm Heights", coast: "Coastline",
    hg_core: "Highgate · Financial District", hg_mid: "Highgate · Midtown", hg_park: "Highgate · Riverside Park",
    pc_old: "Port Calder · Old Town", pc_docks: "Port Calder · Container Port", pc_park: "Port Calder · Harbour Green",
    sv_town: "Sierra Vista", sv_strip: "Sierra Vista · The Strip", sv_ranch: "Sierra Vista · Outskirts",
    country: "Green Valley", desert: "Red Mesa Desert", highway: "Interstate" };

  // parking lots: bottom-left 256px cell of some blocks
  const parking = new Set();
  for (let b = 0; b < 49; b++) {
    const d = DIST[b];
    if ((d === "suburb" || d === "downtown") && rng() < 0.35) parking.add(b);
  }
  [8, 22, 30].forEach((b) => parking.add(b)); // guaranteed lots near the start

  // ----- tiles -----
  for (let ty = 0; ty < N0; ty++)
    for (let tx = 0; tx < N0; tx++) {
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
  // ----- mainland: countryside / desert / beaches, then the city grids, then highways (bridges over the water) -----
  const mainland = (tx, ty) => tx < N - 6 && ty < N - 6 && ((tx >= 104 && ty >= 16) || (ty >= 104 && tx >= 6));
  const desertAt = (tx, ty) => tx >= 118 && ty >= 112 && !(tx < 132 && ty < 124);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    if (tx < N0 && ty < N0) continue;
    let t = TT.WATER;
    if (mainland(tx, ty)) {
      let shore = false; for (let k = 1; k <= 2 && !shore; k++) if (!mainland(tx + k, ty) || !mainland(tx - k, ty) || !mainland(tx, ty + k) || !mainland(tx, ty - k)) shore = true;
      t = shore ? TT.SAND : desertAt(tx, ty) ? TT.DIRT : TT.GRASS;
    }
    W.tiles[ty * N + tx] = t;
  }
  const latRoad = new Uint8Array(N); for (let k = 0; k <= NB; k++) { if (LAT(k) < N) latRoad[LAT(k)] = 1; if (LAT(k) + 1 < N) latRoad[LAT(k) + 1] = 1; }
  const newParking = new Set();
  for (const c of W.CITIES) {
    if (!c.style) continue;
    const tx0 = LAT(c.bx0), ty0 = LAT(c.by0), tx1 = LAT(c.bx1 + 1) + 1, ty1 = LAT(c.by1 + 1) + 1;
    for (let by = c.by0; by <= c.by1; by++) for (let bx = c.bx0; bx <= c.bx1; bx++) { const d = W.blockAt(bx, by); if (crng() < 0.3 && d !== "hg_park" && d !== "pc_park" && d !== "pc_docks") newParking.add(by * NB + bx); }
    for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      let t;
      if ((latRoad[tx] && ty >= ty0 && ty <= ty1) || (latRoad[ty] && tx >= tx0 && tx <= tx1)) t = TT.ROAD;
      else if (tx < tx0 || ty < ty0 || tx > tx1 || ty > ty1) t = TT.WALK;
      else {
        const bx = Math.floor((tx - 4) / 12), by = Math.floor((ty - 4) / 12), lx = tx - LAT(bx), ly = ty - LAT(by), d = W.blockAt(bx, by);
        if (lx === 2 || lx === 11 || ly === 2 || ly === 11) t = TT.WALK;
        else if (newParking.has(by * NB + bx) && lx >= 3 && lx <= 6 && ly >= 7 && ly <= 10) t = TT.PARKING;
        else t = d === "hg_core" || d === "sv_strip" ? TT.PLAZA : d === "pc_docks" ? TT.LOT : d === "hg_park" || d === "pc_park" ? TT.PARK : d.startsWith("sv") ? TT.DIRT : TT.GRASS;
      }
      W.tiles[ty * N + tx] = t;
    }
  }
  W.bridges = [];
  for (const h of W.HIGHWAYS) {
    const k0 = LAT(h.k), a = LAT(h.a) + 2, b = LAT(h.b) - 1;
    let run = null;
    for (let u = a; u <= b; u++) {
      const t0 = h.h ? W.tiles[(k0 - 1) * N + u] : W.tiles[u * N + k0 - 1], t1 = h.h ? W.tiles[(k0 + 2) * N + u] : W.tiles[u * N + k0 + 2];
      const wet = t0 === TT.WATER || t1 === TT.WATER;
      if (wet && !run) { run = { h: h.h, k: h.k, u0: u, u1: u }; W.bridges.push(run); } else if (wet) run.u1 = u; else run = null;
      for (let w = 0; w < 2; w++) { const tx = h.h ? u : k0 + w, ty = h.h ? k0 + w : u; W.tiles[ty * N + tx] = TT.ROAD; }
    }
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
  // ----- the three mainland cities: same 2x2-cell blocks as Neon Bay, each city with its own look -----
  {
    const r = crng, Rr = (a, b) => a + r() * (b - a), Pk = (arr) => arr[Math.floor(r() * arr.length)];
    // own random stream so Neon Bay's layout (which shares rng) stays exactly as it was
    const addB = (x, y, w, h, height, o = {}) => { const b = Object.assign({ kind: "rect", x, y, w, h, height, color: "#555", roof: "#444", windows: true }, o); b.seed = Math.floor(r() * 1e9); buildings.push(b); solids.push(b); return b; };
    const CASINOS = ["GOLDEN MIRAGE", "LUCKY STAR", "DUNE PALACE", "CACTUS ROYALE", "SILVER SPUR"];
    let casino = 0;
    const tree = (x, y, kind) => { const t = { kind: "circle", x, y, r: kind === "palm" ? 8 : kind === "cactus" ? 6 : 10, height: 30, tree: kind, size: kind === "palm" ? Rr(18, 24) : kind === "cactus" ? Rr(14, 22) : Rr(18, 28), hue: r() }; trees.push(t); solids.push(t); };
    const B = (x, y, w, h, h3, o) => { const b = addB(x, y, w, h, Math.min(400, h3 / 2.2), o); b.h3set = h3; return b; };
    for (const c of W.CITIES) {
      if (!c.style) continue;
      for (let by = c.by0; by <= c.by1; by++) for (let bx = c.bx0; bx <= c.bx1; bx++) {
        const d = W.blockAt(bx, by), X0 = (LAT(bx) + 3) * T, Y0 = (LAT(by) + 3) * T, hasPark = newParking.has(by * NB + bx);
        if (hasPark) for (let i = 0; i < 4; i++) W.parkingSpots.push({ x: X0 + 38 + i * 60, y: Y0 + 256 + 150, a: Math.PI / 2 });
        if (d === "hg_park" || d === "pc_park") {
          decor.push({ type: "pond", x: X0 + 256 + Rr(-60, 60), y: Y0 + 256 + Rr(-60, 60), rx: Rr(90, 130), ry: Rr(60, 90) });
          const pd = decor[decor.length - 1];
          for (let i = 0; i < 24; i++) { const x = X0 + Rr(20, 492), y = Y0 + Rr(20, 492); if (((x - pd.x) / (pd.rx + 30)) ** 2 + ((y - pd.y) / (pd.ry + 30)) ** 2 < 1) continue; tree(x, y, "tree"); }
          continue;
        }
        if (d === "hg_core" && r() < 0.45 && !hasPark) { // one landmark skyscraper filling the whole block
          const h3 = Rr(380, 620), col = Pk(["#9ab4cf", "#6f8fb0", "#b7c9d9", "#5d7590", "#8aa2b8"]);
          B(X0 + 24, Y0 + 24, 464, 464, h3, { color: col, roof: "#2a3240", glass: true, neon: r() < 0.5 ? Pk(["#22d3ee", "#c77dff", "#ffffff"]) : null, spire: true });
          continue;
        }
        if (d === "pc_docks") {
          for (let cx = 0; cx < 2; cx++) {
            const x = X0 + cx * 256, y = Y0;
            if (cx === 0) addB(x + 16, y + 26, 480, 196, Rr(40, 58), { color: "#7a5a48", roof: Pk(["#585d65", "#4f5560"]), windows: false, ridges: true });
            for (let row = 0; row < 3; row++) for (let k = 0; k < 3; k++) { const cc = Pk(["#d62828", "#f77f00", "#1d3557", "#2a9d8f", "#6a4c93", "#3d5a80"]); const bx2 = addB(x + 24 + k * 74, y + 266 + row * 70, 64, 26, 24, { color: cc, roof: cc, windows: false, container: true }); if (r() < 0.5) bx2.stack = 2; }
          }
          decor.push({ type: "crane", x: X0 + 256, y: Y0 + 470 });
          continue;
        }
        if (d === "sv_strip" && !hasPark) { // casinos fill the block
          const name = CASINOS[casino++ % CASINOS.length], neon = Pk(["#ffd60a", "#ff3df2", "#22d3ee", "#ff7b00", "#19f5a0"]);
          B(X0 + 30, Y0 + 40, 452, 300, Rr(110, 180), { color: Pk(["#f2e3c6", "#e9c9a0", "#d9b38c", "#f5d5b5"]), roof: "#8a5a3c", sign: name, neon });
          decor.push({ type: "pool", x: X0 + 60, y: Y0 + 380, w: 150, h: 70 });
          for (let i = 0; i < 6; i++) tree(X0 + 30 + i * 85, Y0 + 488, "palm");
          continue;
        }
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
          if (hasPark && cx === 0 && cy === 1) continue;
          const x = X0 + cx * 256, y = Y0 + cy * 256;
          if (d === "hg_core") {
            const m = 14; B(x + m, y + m, 256 - 2 * m, 256 - 2 * m, Rr(220, 430), { color: Pk(["#7d93ad", "#a7b8c9", "#53667f", "#8c9db3", "#6b7f99", "#b0bccb"]), roof: "#262d3d", glass: r() < 0.6, neon: r() < 0.25 ? Pk(["#22d3ee", "#ffffff", "#c77dff"]) : null });
          } else if (d === "hg_mid") {
            const m = 18; B(x + m, y + m, 256 - 2 * m, 256 - 2 * m, Rr(90, 200), { color: Pk(["#b8a99a", "#9a8c7e", "#c9c2b8", "#7f8c99", "#a39488", "#d4cbbd"]), roof: "#33363d", neon: r() < 0.2 ? Pk(["#ff3df2", "#22d3ee", "#ffd60a"]) : null });
          } else if (d === "pc_old") {
            // two narrow brick buildings per cell, like an old harbour high street
            const h3a = Rr(44, 96), h3b = Rr(44, 96), brick = () => Pk(["#8b3a2b", "#9c4a32", "#7a3324", "#a65d3f", "#6e4b3a", "#b5651d"]);
            B(x + 14, y + 16, 108, 224, h3a, { color: brick(), roof: "#2d2a2a", brick: true, neon: r() < 0.15 ? Pk(["#ffa028", "#19f5a0"]) : null });
            B(x + 134, y + 16, 108, 224, h3b, { color: brick(), roof: "#2d2a2a", brick: true });
          } else if (d === "sv_town") {
            const w = Rr(130, 180), h = Rr(110, 160);
            B(x + (256 - w) / 2, y + (256 - h) / 2, w, h, Rr(30, 48), { color: Pk(["#e3b98f", "#d9a679", "#c98b5b", "#efd2b0", "#d77a61", "#e8c39e"]), roof: Pk(["#b5653d", "#a0522d", "#c97c5d"]), windows: false, adobe: true });
            if (r() < 0.6) tree(x + Rr(15, 40), y + Rr(200, 240), r() < 0.5 ? "palm" : "cactus");
            if (r() < 0.5) tree(x + Rr(215, 240), y + Rr(15, 40), "cactus");
          } else if (d === "sv_ranch") {
            if (cx === 0 && cy === 0) B(x + 50, y + 50, 170, 140, 40, { color: "#c9a27a", roof: "#7a4a2a", windows: false, house: true });
            for (let k = 0; k < 3; k++) tree(x + Rr(20, 236), y + Rr(20, 236), "cactus");
          }
        }
      }
    }
    // landmark signs at each city's main entrance, gas stations along the long highways
    W.gas = [];
    const station = (x, y) => { const b = addB(x, y, 120, 70, 14, { color: "#e9ecef", roof: "#d62828", sign: "FUEL · 24/7", neon: "#ff4d6d", windows: true }); b.h3set = 30; W.gas.push({ x: x + 60, y: y + 35, b }); };
    station((LAT(14) - 4) * T, (LAT(9) + 1) * T); // Route 9
    station((LAT(8) + 2) * T, (LAT(14) - 3) * T); // Route 5
    // countryside trees and desert cactus/boulders, kept clear of roads
    const tr = mulberry32(777);
    const clearOfRoads = (x, y, pad) => { for (const [dx, dy] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) { const t = W.tileAt(x + dx, y + dy); if (t === TT.ROAD || t === TT.WALK || t === TT.WATER || t === TT.PARKING) return false; } return !W.cityAt(x, y); };
    for (let i = 0; i < 2600; i++) {
      const x = tr() * W.SIZE, y = tr() * W.SIZE, t = W.tileAt(x, y);
      if (x < N0 * T && y < N0 * T) continue;
      if (t === TT.GRASS && clearOfRoads(x, y, 90)) {
        // forests clump together: keep a tree only where low-frequency noise says "woods"
        const n = Math.sin(x * 0.0011) * Math.cos(y * 0.0013) + Math.sin((x + y) * 0.0007);
        if (n > 0.35 || tr() < 0.06) tree(x, y, "tree");
      } else if (t === TT.DIRT && clearOfRoads(x, y, 70) && tr() < 0.45) {
        if (tr() < 0.35) { const rk = { kind: "circle", x, y, r: Rr(10, 22), height: 20, rock: true, hue: tr() }; rk.h3set = rk.r * 1.1; solids.push(rk); W.rocks = W.rocks || []; W.rocks.push(rk); }
        else tree(x, y, "cactus");
      }
    }
    // farm fields (painted on the ground) in the valley
    for (let i = 0; i < 26; i++) {
      const x = (104 + tr() * 100) * T, y = (16 + tr() * 190) * T, w = (4 + tr() * 6) * T, h = (4 + tr() * 6) * T;
      let ok = true; for (let k = 0; k < 9 && ok; k++) { const px = x + (k % 3) / 2 * w, py = y + Math.floor(k / 3) / 2 * h; if (W.tileAt(px, py) !== TT.GRASS || !clearOfRoads(px, py, 40)) ok = false; }
      if (ok) decor.push({ type: "field", x, y, w, h, crop: Math.floor(tr() * 3), a: tr() < 0.5 ? 0 : 1 });
    }
  }
  W.rocks = W.rocks || [];
  // ----- 3D heights (visual + rooftop gameplay); 2D `height` stays for car physics -----
  for (const b of buildings) {
    if (b.container) b.h3 = 26;
    else if (b.house) b.h3 = Math.max(46, b.height * 1.7);
    else if (b.ridges) b.h3 = b.height * 1.6;
    else if (b.poi) b.h3 = Math.max(60, b.height * 1.8);
    else b.h3 = b.height * 2.2;
    if (b.h3set) b.h3 = b.h3set;
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
  // the sea is solid (you can't drive into it): merge water tiles into as few rectangles as possible
  const S = W.SIZE;
  {
    const open = new Map();
    const flush = (keep) => { for (const [k, r] of open) if (!keep.has(k)) { solids.push({ kind: "rect", x: r.x0 * T, y: r.y0 * T, w: (r.x1 - r.x0 + 1) * T, h: (r.y1 - r.y0 + 1) * T, height: 9999, water: true }); open.delete(k); } };
    for (let ty = 0; ty < N; ty++) {
      const runs = new Set();
      for (let tx = 0; tx < N; tx++) {
        if (W.tiles[ty * N + tx] !== TT.WATER) continue;
        let e = tx; while (e + 1 < N && W.tiles[ty * N + e + 1] === TT.WATER) e++;
        const k = tx + "," + e; runs.add(k);
        if (open.has(k)) open.get(k).y1 = ty; else open.set(k, { x0: tx, x1: e, y0: ty, y1: ty });
        tx = e;
      }
      flush(runs);
    }
    flush(new Set());
  }
  [[-600, -600, S + 1200, 600], [-600, -600, 600, S + 1200], [S, -600, 600, S + 1200], [-600, S, S + 1200, 600]].forEach(([x, y, w, h]) => solids.push({ kind: "rect", x, y, w, h, height: 9999, water: true }));

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
  W.top3 = (s) => (s.water ? 9999 : s.h3 !== undefined ? s.h3 : s.h3set !== undefined ? s.h3set : s.fountain ? 14 : s.tree ? 58 : s.height);
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
  // nodes sit on lattice intersections (i, j = lattice road indices). Neon Bay's 8x8 come first (ids 0..63, unchanged).
  const nodes = (W.nodes = []), latNode = new Map();
  const mkNode = (i, j) => { const k = j * 64 + i; if (latNode.has(k)) return latNode.get(k); const n = { id: nodes.length, i, j, x: (LAT(i) + 1) * T, y: (LAT(j) + 1) * T, nb: [] }; nodes.push(n); latNode.set(k, n); return n; };
  const link = (a, b) => { if (!a.nb.includes(b.id)) a.nb.push(b.id); if (!b.nb.includes(a.id)) b.nb.push(a.id); };
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) mkNode(i, j);
  const gridLinks = (i0, i1, j0, j1) => { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const n = latNode.get(j * 64 + i); if (i < i1) link(n, latNode.get(j * 64 + i + 1)); if (j < j1) link(n, latNode.get((j + 1) * 64 + i)); } };
  // Neon Bay keeps its neighbour order (left, right, up, down) so traffic behaves exactly as before
  nodes.forEach((n) => { if (n.i > 0) n.nb.push(n.id - 1); if (n.i < 7) n.nb.push(n.id + 1); if (n.j > 0) n.nb.push(n.id - 8); if (n.j < 7) n.nb.push(n.id + 8); });
  for (const c of W.CITIES) if (c.style) { for (let j = c.by0; j <= c.by1 + 1; j++) for (let i = c.bx0; i <= c.bx1 + 1; i++) mkNode(i, j); gridLinks(c.bx0, c.bx1 + 1, c.by0, c.by1 + 1); }
  W.highwayNodes = [];
  for (const h of W.HIGHWAYS) {
    // a junction every 2 lattice steps so traffic, GPS and the police can use the highway like any street
    let prev = h.h ? mkNode(h.a, h.k) : mkNode(h.k, h.a);
    for (let u = h.a + 1; u <= h.b; u++) {
      if (u !== h.b && (u - h.a) % 2) continue;
      const n = h.h ? mkNode(u, h.k) : mkNode(h.k, u); n.hwy = n.hwy || (u !== h.b); if (n.hwy) W.highwayNodes.push(n);
      link(prev, n); prev = n;
    }
  }
  W.node = (i, j) => latNode.get(j * 64 + i);
  W.nearestNode = (x, y) => {
    if (x < N0 * T && y < N0 * T) { // inside Neon Bay: the old exact lattice snap
      let bi = 0, bj = 0;
      for (let k = 1; k < 8; k++) { if (Math.abs((ROADS[k] + 1) * T - x) < Math.abs((ROADS[bi] + 1) * T - x)) bi = k; if (Math.abs((ROADS[k] + 1) * T - y) < Math.abs((ROADS[bj] + 1) * T - y)) bj = k; }
      return nodes[bj * 8 + bi];
    }
    let best = nodes[0], bd = Infinity;
    for (const n of nodes) { const d = Math.abs(n.x - x) + Math.abs(n.y - y); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  W.nodePath = (a, b) => {
    const prev = new Int16Array(nodes.length).fill(-1); prev[a] = a; const q = [a];
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
    const pool = nodes.filter((n) => Math.abs(n.x - nearX) < maxD + 1600 && Math.abs(n.y - nearY) < maxD + 1600);
    if (!pool.length) return null;
    for (let k = 0; k < 40; k++) {
      const n = pool[Math.floor(Math.random() * pool.length)];
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
  nodes.forEach((n) => { if (!n.hwy) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => W.lights.push({ x: n.x + sx * (T + 24), y: n.y + sy * (T + 24) })); });
  for (const h of W.HIGHWAYS) { // highway lamps, alternating sides
    const c0 = (LAT(h.k) + 1) * T;
    for (let u = LAT(h.a) + 4, s = 1; u < LAT(h.b) - 2; u += 5, s = -s) { const along = (u + 0.5) * T, off = s * (T + 22); W.lights.push(h.h ? { x: along, y: c0 + off, hwy: 1 } : { x: c0 + off, y: along, hwy: 1 }); }
  }
  W.ramps = [];
  const rampSeg = (i1, j1, i2, j2, dir) => {
    const a = W.node(i1, j1), b = W.node(i2, j2);
    const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
    const ang = Math.atan2(dy, dx) + (dir < 0 ? Math.PI : 0);
    W.ramps.push({ x: (a.x + b.x) / 2 + dy * 34 * dir * -1 * 0, y: (a.y + b.y) / 2, a: ang, w: 70, h: 56, found: false });
  };
  rampSeg(0, 1, 1, 1, 1); rampSeg(3, 0, 4, 0, -1); rampSeg(7, 2, 7, 3, 1); rampSeg(1, 7, 2, 7, 1); rampSeg(5, 6, 5, 7, 1); rampSeg(2, 3, 2, 4, -1);
  W.ramps.push({ x: 92 * T, y: 48 * T, a: Math.PI / 2, w: 70, h: 56 });
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
