// ---------- UK world, first slice: real central London from OpenStreetMap ----------
// Everything here is built from map data, not invented: every road follows its real centre-line at its real width,
// every building stands on its real footprint at its real height (from OSM height / floor counts), parks and the
// Thames are their real shapes. 1 three.js unit = 1 metre in this slice.
// Map data (c) OpenStreetMap contributors, ODbL. Drive: W/S throttle and brake, A/D steer, Shift boost, mouse to look.
(function () {
  const canvas = document.getElementById("c"), hud = document.getElementById("hud");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, 0.3, 6000);
  scene.fog = new THREE.Fog(0xbfd1e5, 400, 2600);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 v; void main(){ float h = max(v.y, 0.0); vec3 c = mix(vec3(0.75,0.82,0.9), vec3(0.32,0.52,0.82), pow(h, 0.6)); gl_FragColor = vec4(c, 1.0); }" }));
  scene.add(sky);
  { const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(sky.clone()); const gnd = new THREE.Mesh(new THREE.CircleGeometry(4000, 24), new THREE.MeshBasicMaterial({ color: 0x5b5d61 })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -20; es.add(gnd); scene.environment = pm.fromScene(es, 0.02).texture; }
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x6b6257, 0.9));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 1, far: 1600 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener("resize", resize); resize();

  const tex = (w, h, fn) => { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const noise = (g, w, h, cols, n, r) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.25 + Math.random() * 0.4; g.fillRect(Math.random() * w, Math.random() * h, r, r); } g.globalAlpha = 1; };

  // ---------- geometry helpers ----------
  // a ribbon along a polyline (x, y pairs; y is map-south = three +Z), width w, at height y, u along the length in metres
  function ribbon(pts, w, y, out, uScale = 1) {
    const n = pts.length / 2; if (n < 2) return;
    let len = 0; const base = out.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1], a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      if (i) len += Math.hypot(x - pts[i * 2 - 2], z - pts[i * 2 - 1]);
      const nx = -dz * w / 2, nz = dx * w / 2;
      out.pos.push(x + nx, y, z + nz, x - nx, y, z - nz); out.uv.push(len * uScale, 0, len * uScale, 1);
      if (i) { const k = base + (i - 1) * 2; out.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
  }
  const newBuf = () => ({ pos: [], uv: [], idx: [] });
  function meshOf(buf, mat) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2)); g.setIndex(buf.idx);
    g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
  }
  // a polyline with `d` metres cut off each end (null if nothing is left)
  function trim(p, d) {
    const n = p.length / 2; let len = 0; for (let i = 1; i < n; i++) len += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    if (len < d * 2 + 4) return null;
    const at = (s) => { let acc = 0; for (let i = 1; i < n; i++) { const L = Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]); if (acc + L >= s) { const f = (s - acc) / L; return [i, p[i * 2 - 2] + (p[i * 2] - p[i * 2 - 2]) * f, p[i * 2 - 1] + (p[i * 2 + 1] - p[i * 2 - 1]) * f]; } acc += L; } return [n - 1, p[n * 2 - 2], p[n * 2 - 1]]; };
    const [i0, x0, y0] = at(d), [i1, x1, y1] = at(len - d), out = [x0, y0];
    for (let i = i0; i < i1; i++) out.push(p[i * 2], p[i * 2 + 1]);
    out.push(x1, y1); return out;
  }
  const shapeOf = (p) => { const s = new THREE.Shape(); for (let i = 0; i < p.length; i += 2) (i ? s.lineTo(p[i], p[i + 1]) : s.moveTo(p[i], p[i + 1])); return s; };

  // ---------- materials ----------
  const asphalt = tex(256, 256, (g) => { g.fillStyle = "#3a3c41"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, ["#2f3136", "#45474c", "#34363b", "#50525a"], 5000, 1.6); });
  const pave = tex(256, 256, (g) => { g.fillStyle = "#a9a59d"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, ["#9c988f", "#b5b1a8"], 1500, 1.5); g.strokeStyle = "rgba(60,55,50,0.35)"; g.lineWidth = 2; for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); } });
  const grass = tex(256, 256, (g) => { g.fillStyle = "#4f7d3c"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, ["#44702f", "#5b8c45", "#3f6a2c", "#6a9a4f"], 6000, 2); });
  // lane markings: UK white centre dashes (2 m dash, 7 m gap on town roads) and edge lines, drawn as a texture along u
  const marks = tex(128, 64, (g) => { g.clearRect(0, 0, 128, 64); g.fillStyle = "rgba(240,240,235,0.92)"; g.fillRect(0, 30, 30, 4); g.fillRect(0, 0, 128, 2); g.fillRect(0, 62, 128, 2); });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const markMat = new THREE.MeshStandardMaterial({ map: marks, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const paveMat = new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xb9b5ab, roughness: 0.85 });
  const grassMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3b5866, roughness: 0.12, metalness: 0.5, side: THREE.DoubleSide });
  // London facades, drawn procedurally in world space: storeys every 3.4 m, sash windows every ~2.6 m, a darker
  // ground-floor band (shopfronts), recessed dark glass that catches the sky. One shader for every building.
  function facadeMat(base, glassy) {
    const m = new THREE.MeshStandardMaterial({ color: base, roughness: glassy ? 0.25 : 0.85, metalness: glassy ? 0.4 : 0.0 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vW; varying vec3 vN;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vW; varying vec3 vN;").replace("#include <map_fragment>", `#include <map_fragment>
        float wall = 1.0 - step(0.7, abs(vN.y));
        if (wall > 0.5) {
          vec2 t = normalize(vec2(-vN.z, vN.x)); float u = dot(vW.xz, t), v = vW.y;
          float floorH = 3.4, bay = ${glassy ? "1.6" : "2.6"};
          vec2 c = vec2(fract(u / bay), fract(v / floorH)); vec2 id = vec2(floor(u / bay), floor(v / floorH));
          float win = step(0.22, c.x) * step(c.x, 0.78) * step(0.25, c.y) * step(c.y, 0.86);
          if (${glassy ? "true" : "false"}) win = step(0.06, c.x) * step(c.y, 0.92);
          float shop = step(v, 4.2);                                           // ground floor: shopfront glass
          float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.92 + 0.12 * h * (1.0 - win);
          if (shop > 0.5) { float sf = step(0.08, fract(u / 4.5)) * step(0.6, v) * step(v, 3.6); diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vec3(0.08, 0.1, 0.12), sf); }
          else diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.09, 0.11) + 0.06 * h, win);
          diffuseColor.rgb *= 1.0 - 0.18 * step(0.94, c.y) * (1.0 - shop);  // a ledge shadow under each sill line
        } else diffuseColor.rgb *= 0.62;                                       // roofs: darker lead / felt
      `).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        { float wall = 1.0 - step(0.7, abs(vN.y)); vec2 t = normalize(vec2(-vN.z, vN.x)); float u = dot(vW.xz, t), v = vW.y;
          vec2 c = vec2(fract(u / ${glassy ? "1.6" : "2.6"}), fract(v / 3.4)); float win = wall * step(0.22, c.x) * step(c.x, 0.78) * step(0.25, c.y) * step(c.y, 0.86);
          roughnessFactor = mix(roughnessFactor, 0.08, max(win, wall * step(v, 4.2) * 0.8)); }`);
    };
    m.customProgramCacheKey = () => "facade" + (glassy ? "g" : "");
    return m;
  }
  const FACADE = { stone: facadeMat(0xd9cfb8), brick: facadeMat(0xb8915e), red: facadeMat(0x9a4b3a), glass: facadeMat(0x6f8597, true), white: facadeMat(0xe8e4dc) };

  // ---------- collision: building footprints in a spatial hash ----------
  const CELL = 40, grid = new Map(), key = (i, j) => i * 100003 + j;
  function addSolid(b) { const p = b.p; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    b.bb = [x0, y0, x1, y1]; for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); } }
  function inPoly(p, x, y) { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const yi = p[i + 1], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < (p[j] - p[i]) * (y - yi) / (yj - yi) + p[i]) c = !c; } return c; }
  const blocked = (x, y) => { const l = grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL))); if (!l) return false; for (const b of l) if (x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && inPoly(b.p, x, y)) return true; return false; };

  // ---------- build ----------
  let data = null;
  fetch("assets/uk/london_core.json").then((r) => r.json()).then((d) => { data = d; build(d); }).catch((e) => { hud.textContent = "Could not load the map: " + e; });
  function build(d) {
    const [bx0, by0, bx1, by1] = d.bounds, cx = (bx0 + bx1) / 2, cz = (by0 + by1) / 2;
    // base: pavement everywhere in the built-up core, grass in the parks, the Thames
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0 + 600, by1 - by0 + 600), new THREE.MeshStandardMaterial({ map: pave, roughness: 0.95 }));
    ground.material.map = pave.clone(); ground.material.map.repeat.set((bx1 - bx0 + 600) / 4, (by1 - by0 + 600) / 4); ground.material.map.needsUpdate = true;
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); ground.receiveShadow = true; scene.add(ground);
    grass.repeat.set(1 / 6, 1 / 6);
    for (const pk of d.parks) { const g = new THREE.ShapeGeometry(shapeOf(pk.p)); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, grassMat); m.position.y = 0.03; m.receiveShadow = true; scene.add(m); }
    for (const w of d.water) { const g = new THREE.ShapeGeometry(shapeOf(w.p)); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, waterMat); m.position.y = 0.05; scene.add(m); }
    // roads: asphalt ribbons (widest first, so junctions read cleanly), lane markings on top, kerb lips on both edges
    const roads = d.roads.filter((r) => r.k !== "pedestrian").sort((a, b) => b.w - a.w);
    const rb = newBuf(), mb = newBuf(), kb = newBuf(), pb = newBuf();
    asphalt.repeat.set(1 / 8, 1);
    for (const r of roads) { ribbon(r.p, r.w, 0.06, rb, 1); if (r.w >= 6) { const t = trim(r.p, 9); if (t) ribbon(t, r.w - 0.8, 0.08, mb, 1 / 9); } }
    for (const r of d.roads.filter((r) => r.k === "pedestrian")) ribbon(r.p, r.w, 0.07, pb, 0.25);
    for (const p of d.paths) ribbon(p.p, p.w, 0.065, pb, 0.25);
    scene.add(meshOf(rb, roadMat), meshOf(mb, markMat), meshOf(pb, paveMat));
    // buildings: real footprints extruded to real heights, merged per facade material
    const byMat = {};
    for (const b of d.buildings) {
      if (b.p.length < 6) continue;
      const kind = b.h > 45 ? "glass" : /church|cathedral|government|civic|public|palace|museum/.test(b.kind) ? "stone" : b.h > 22 ? (Math.abs(b.p[0] * 7 + b.p[1]) % 3 < 1.6 ? "stone" : "white") : ["brick", "brick", "red", "stone"][Math.abs(Math.round(b.p[0] * 3 + b.p[1])) % 4];
      let g; try { g = new THREE.ExtrudeGeometry(shapeOf(b.p), { depth: b.h, bevelEnabled: false }); } catch (e) { continue; }
      g.rotateX(Math.PI / 2); g.translate(0, b.h, 0);
      (byMat[kind] = byMat[kind] || []).push(g); addSolid(b);
    }
    for (const k in byMat) { const g = mergeGeos(byMat[k]); const m = new THREE.Mesh(g, FACADE[k]); m.castShadow = m.receiveShadow = true; scene.add(m); }
    // start on a real street: the longest primary road, facing along it
    const start = d.roads.filter((r) => r.k === "primary").sort((a, b) => b.p.length - a.p.length)[0] || d.roads[0];
    car.x = start.p[0]; car.z = start.p[1]; car.a = Math.atan2(start.p[3] - start.p[1], start.p[2] - start.p[0]);
    hud.innerHTML = `<b>${d.name}</b> · ${d.buildings.length} real buildings · ${d.roads.length} real roads · ${d.attribution}<br>W/S drive · A/D steer · Shift boost · drag the mouse to look`;
    window.UK = { ready: true, buildings: d.buildings.length, roads: d.roads.length, car };
  }
  function mergeGeos(list) { // non-indexed merge (ExtrudeGeometry is non-indexed)
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); return out;
  }

  // ---------- driving (street-level chase camera; real speed in km/h) ----------
  const car = { x: 0, z: 0, a: 0, v: 0 }, keys = {}, look = { yaw: 0, pitch: 0.12, drag: false };
  addEventListener("keydown", (e) => { keys[e.code] = true; }); addEventListener("keyup", (e) => { keys[e.code] = false; });
  canvas.addEventListener("mousedown", () => (look.drag = true)); addEventListener("mouseup", () => (look.drag = false));
  addEventListener("mousemove", (e) => { if (look.drag) { look.yaw -= e.movementX * 0.004; look.pitch = Math.max(-0.2, Math.min(1.2, look.pitch + e.movementY * 0.003)); } });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.6, 6, 12), new THREE.MeshPhysicalMaterial({ color: 0x8b1e2a, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }));
  body.rotation.z = Math.PI / 2; body.scale.set(0.78, 1, 1); body.castShadow = true; const carG = new THREE.Group(); carG.add(body); body.position.y = 0.75; scene.add(carG);
  let last = performance.now(), fps = 60;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05; window.ukFps = Math.round(fps);
    if (data) {
      const thr = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), st = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
      const top = keys.ShiftLeft ? 60 : 36; // m/s: ~130 km/h, ~215 km/h boosted
      if (thr > 0) car.v += (car.v < 0 ? 12 : 4.2 * (1 - car.v / top)) * dt; else if (thr < 0) car.v -= (car.v > 0 ? 11 : 3) * dt; else car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 1.2 * dt);
      car.a -= st * dt * Math.min(1, Math.abs(car.v) / 6) * (1.4 - Math.min(0.9, Math.abs(car.v) / 50)) * Math.sign(car.v || 1);
      const nx = car.x + Math.cos(car.a) * car.v * dt, nz = car.z + Math.sin(car.a) * car.v * dt;
      if (blocked(nx, nz)) car.v *= -0.25; else { car.x = nx; car.z = nz; }
      carG.position.set(car.x, 0, car.z); carG.rotation.y = -car.a;
      const ya = car.a + look.yaw, dist = 9 + Math.abs(car.v) * 0.08;
      camera.position.set(car.x - Math.cos(ya) * dist * Math.cos(look.pitch), 2.2 + dist * Math.sin(look.pitch), car.z - Math.sin(ya) * dist * Math.cos(look.pitch));
      camera.lookAt(car.x + Math.cos(car.a) * 6, 1.4, car.z + Math.sin(car.a) * 6);
      sun.position.set(car.x + 300, 500, car.z + 180); sun.target.position.set(car.x, 0, car.z); sky.position.copy(camera.position);
      document.getElementById("spd").textContent = Math.round(Math.abs(car.v) * 3.6) + " km/h";
    }
    renderer.render(scene, camera); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
