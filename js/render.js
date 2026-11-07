// ---------- 3D renderer (Three.js): city, vehicles, people, heroes, lighting, weather, particles, camera ----------
// 2D sim coords (x, y) + height z  ->  three.js (X = x, Y = z, Z = y).
(function () {
  const T = G.TILE, W = G.world, TT = W.TT, P = G.player;
  const R = (G.render = {});
  const cam = (G.cam = { x: 0, y: 0, zoom: 1, tz: 1, shake: 0 });
  const cam3 = (G.cam3 = { yaw: -Math.PI / 2, pitch: 0.3, lastMouse: -99, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 62 });
  G.fx = []; G.skids = [];
  G.shake = (a) => { cam.shake = Math.max(cam.shake, a); };
  let renderer, scene, camera, sun, hemi, canvasEl, Wd = 0, Hd = 0;
  const HM = () => G.humanoid;
  const V = (x, y, z = 0) => new THREE.Vector3(x, z, y);

  // ---------- small texture helpers ----------
  function canvasTex(w, h, fn, srgb = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  const radialTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  const coneTex = canvasTex(128, 256, (g) => { const r = g.createLinearGradient(0, 256, 0, 0); r.addColorStop(0, "rgba(255,250,225,0.9)"); r.addColorStop(1, "rgba(255,250,225,0)"); g.fillStyle = r; g.beginPath(); g.moveTo(54, 256); g.lineTo(74, 256); g.lineTo(128, 0); g.lineTo(0, 0); g.fill(); });
  const beamTex = canvasTex(32, 128, (g) => { const r = g.createLinearGradient(0, 128, 0, 0); r.addColorStop(0, "rgba(255,255,255,0.85)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 128); });
  const iconCache = {};
  function iconTex(s, color = "#fff") {
    const k = s + color; if (iconCache[k]) return iconCache[k];
    return (iconCache[k] = canvasTex(128, 128, (g) => { g.font = "92px 'Segoe UI Emoji','Apple Color Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = color; g.shadowColor = "#000"; g.shadowBlur = 8; g.fillText(s, 64, 70); }));
  }
  function textTex(text, color, w = 512, h = 96, font = "bold 54px Bahnschrift, 'Segoe UI', sans-serif", bg = "rgba(10,10,20,0.85)") {
    return canvasTex(w, h, (g) => {
      if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 18); g.fill(); }
      g.font = font; g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2); g.shadowBlur = 0; g.fillText(text, w / 2, h / 2 + 2);
    });
  }
  const r01 = mulberry32(7);
  const speck = (g, s, cols, n, rmax) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r01() * cols.length)]; g.globalAlpha = 0.25 + r01() * 0.5; const r = 0.5 + r01() * rmax; g.fillRect(r01() * s, r01() * s, r, r); } g.globalAlpha = 1; };

  // ---------- init ----------
  R.init = function (canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    const mob = !!(G.settings && G.settings.mobile); // phones/tablets: lighter profile
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mob ? 1.25 : 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = mob ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x8fb8e8, 700, 3800);
    camera = new THREE.PerspectiveCamera(62, 1, 2, 12000);
    hemi = new THREE.HemisphereLight(0xbfdcff, 0x40384a, 0.8); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
    sun.shadow.mapSize.set(mob ? 1024 : 2048, mob ? 1024 : 2048); const sc = sun.shadow.camera; sc.left = -700; sc.right = 700; sc.top = 700; sc.bottom = -700; sc.near = 10; sc.far = 4000;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    scene.add(sun); scene.add(sun.target);
    R.scene = scene; R.camera = camera; R.renderer = renderer;
    R.project = (x, y, z = 0) => { const v = new THREE.Vector3(x, z, y).project(camera); return { sx: ((v.x + 1) / 2) * Wd, sy: ((1 - v.y) / 2) * Hd, behind: v.z > 1 }; };
    buildGround(); buildSky(); buildCity(); buildTrees(); buildStreetlights(); buildProps(); buildFx(); buildRain(); buildDynamic(); buildEnv(); buildClouds(); carShared();
    R.resize(); addEventListener("resize", R.resize);
    // mouse look (pointer lock while playing)
    canvas.addEventListener("mousedown", () => { if (G.state.mode === "play" && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ } } });
    // fallback when pointer lock is unavailable: hold the right mouse button and drag to look
    let rdrag = false;
    canvas.addEventListener("mousedown", (e) => { if (e.button === 2) rdrag = true; });
    addEventListener("mouseup", (e) => { if (e.button === 2) rdrag = false; });
    document.addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== canvas && !rdrag) return;
      const sn = (G.settings && G.settings.sens) || 1; cam3.yaw += e.movementX * 0.0026 * sn; cam3.pitch = clamp(cam3.pitch + e.movementY * 0.0022 * sn * (G.settings && G.settings.invertY ? -1 : 1), -0.2, 1.15); cam3.lastMouse = G.time;
    });
    const hint = document.getElementById("mousehint");
    document.addEventListener("pointerlockchange", () => { if (hint) hint.style.display = document.pointerLockElement === canvas ? "none" : ""; });
  };
  R.releaseMouse = () => { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); };
  R.resize = function () {
    Wd = innerWidth; Hd = innerHeight; renderer.setSize(Wd, Hd); camera.aspect = Wd / Hd; camera.updateProjectionMatrix();
  };
  R.size = () => [Wd, Hd];
  R.screenToWorld = (sx, sy) => [cam.x, cam.y];

  // ---------- ground ----------
  let groundMat, seaMat, seaTex;
  function buildGround() {
    const S = 0.5, N = W.N, size = W.SIZE * S;
    const tex = canvasTex(size, size, (g) => {
      const pat = (base, cols, n, r, sz = 64) => { const c = document.createElement("canvas"); c.width = c.height = sz; const x = c.getContext("2d"); x.fillStyle = base; x.fillRect(0, 0, sz, sz); speck(x, sz, cols, n, r); return g.createPattern(c, "repeat"); };
      const PAT = {
        [TT.GRASS]: pat("#3f7d3a", ["#356b31", "#4c9145", "#2e5e2a", "#5aa04f"], 260, 1.4), [TT.PARK]: pat("#468a3f", ["#3a7735", "#56a14c", "#6bb35e"], 260, 1.5),
        [TT.SAND]: pat("#e6d3a3", ["#d9c28c", "#f0e2bd", "#cdb37a"], 200, 1), [TT.ROAD]: pat("#2c2f36", ["#25282e", "#353840", "#1f2227"], 300, 0.9),
        [TT.WALK]: pat("#9a9ca3", ["#8c8e95", "#a8aab0"], 80, 1), [TT.PLAZA]: pat("#a59f96", ["#968f86", "#b5afa6"], 80, 1),
        [TT.LOT]: pat("#4a4d54", ["#3f4249", "#565961"], 220, 1), [TT.PARKING]: pat("#33363d", ["#2b2e34", "#3b3e45"], 200, 1), [TT.WATER]: "#0f4c75",
      };
      g.scale(S, S);
      for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) { g.fillStyle = PAT[W.tiles[ty * N + tx]]; g.fillRect(tx * T, ty * T, T + 1, T + 1); }
      for (let ty = 1; ty < N - 1; ty++) for (let tx = 1; tx < N - 1; tx++) {
        const t = W.tiles[ty * N + tx];
        if (t === TT.WALK) {
          g.fillStyle = "rgba(255,255,255,0.22)";
          if (W.tiles[ty * N + tx + 1] === TT.ROAD) g.fillRect(tx * T + T - 4, ty * T, 4, T);
          if (W.tiles[ty * N + tx - 1] === TT.ROAD) g.fillRect(tx * T, ty * T, 4, T);
          if (W.tiles[(ty + 1) * N + tx] === TT.ROAD) g.fillRect(tx * T, ty * T + T - 4, T, 4);
          if (W.tiles[(ty - 1) * N + tx] === TT.ROAD) g.fillRect(tx * T, ty * T, T, 4);
          g.strokeStyle = "rgba(0,0,0,0.1)"; g.lineWidth = 2; g.strokeRect(tx * T + 1, ty * T + 1, 31, 31); g.strokeRect(tx * T + 33, ty * T + 33, 30, 30);
        }
        if (t === TT.SAND && [W.tiles[ty * N + tx + 1], W.tiles[(ty + 1) * N + tx], W.tiles[ty * N + tx - 1], W.tiles[(ty - 1) * N + tx]].includes(TT.WATER)) { g.fillStyle = "rgba(255,255,255,0.3)"; g.fillRect(tx * T, ty * T, T, T); }
      }
      g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 3;
      for (const s of W.parkingSpots) g.strokeRect(s.x - 24, s.y - 44, 48, 88);
      // road markings
      const RD = W.ROADS;
      const zebra = (x, y, w, h, v) => { g.fillStyle = "rgba(255,255,255,0.7)"; if (v) for (let k = 0; k < h; k += 14) g.fillRect(x, y + k, w, 7); else for (let k = 0; k < w; k += 14) g.fillRect(x + k, y, 7, h); };
      g.lineWidth = 3;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 7; i++) {
        const hy = (RD[j] + 1) * T, hx0 = (RD[i] + 2) * T, hx1 = RD[i + 1] * T;
        g.strokeStyle = "#f2c94c"; g.setLineDash([26, 18]); g.beginPath(); g.moveTo(hx0 + 30, hy - 3); g.lineTo(hx1 - 30, hy - 3); g.moveTo(hx0 + 30, hy + 3); g.lineTo(hx1 - 30, hy + 3); g.stroke();
        g.moveTo(0, 0); g.beginPath(); g.moveTo(hy - 3, hx0 + 30); g.lineTo(hy - 3, hx1 - 30); g.moveTo(hy + 3, hx0 + 30); g.lineTo(hy + 3, hx1 - 30); g.stroke(); g.setLineDash([]);
        g.strokeStyle = "rgba(255,255,255,0.55)"; g.beginPath(); g.moveTo(hx0, hy - T + 6); g.lineTo(hx1, hy - T + 6); g.moveTo(hx0, hy + T - 6); g.lineTo(hx1, hy + T - 6);
        g.moveTo(hy - T + 6, hx0); g.lineTo(hy - T + 6, hx1); g.moveTo(hy + T - 6, hx0); g.lineTo(hy + T - 6, hx1); g.stroke();
        zebra(hx0 + 4, hy - T + 8, 22, 2 * T - 16, true); zebra(hx1 - 26, hy - T + 8, 22, 2 * T - 16, true);
        zebra(hy - T + 8, hx0 + 4, 2 * T - 16, 22, false); zebra(hy - T + 8, hx1 - 26, 2 * T - 16, 22, false);
      }
      for (const d of W.decor) {
        if (d.type === "pool") { g.fillStyle = "#e9ecef"; g.beginPath(); g.roundRect(d.x - 5, d.y - 5, d.w + 10, d.h + 10, 8); g.fill(); g.fillStyle = "#3cc1ee"; g.beginPath(); g.roundRect(d.x, d.y, d.w, d.h, 6); g.fill(); }
        if (d.type === "pond") { g.fillStyle = "#c2b280"; g.beginPath(); g.ellipse(d.x, d.y, d.rx + 9, d.ry + 9, 0, 0, TAU); g.fill(); g.fillStyle = "#1f6f8b"; g.beginPath(); g.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); g.fill(); }
      }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
    groundMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W.SIZE, W.SIZE), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(W.SIZE / 2, 0, W.SIZE / 2); ground.receiveShadow = true; scene.add(ground);
    seaTex = canvasTex(256, 256, (g) => { g.fillStyle = "#808080"; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, rand(4, 14), rand(1, 3), 0, 0, TAU); g.fill(); } }, false);
    seaTex.repeat.set(60, 60);
    seaMat = new THREE.MeshStandardMaterial({ color: 0x115f8e, roughness: 0.18, metalness: 0.35, bumpMap: seaTex, bumpScale: 1.2 });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(W.SIZE / 2, -1.5, W.SIZE / 2); sea.receiveShadow = true; scene.add(sea);
  }

  // ---------- sky ----------
  let skyMat, stars, sunSprite, moonSprite;
  function buildSky() {
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3b8cff) }, hor: { value: new THREE.Color(0xbfe3ff) }, bot: { value: new THREE.Color(0x1b3a5a) } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0),0.6)) : mix(hor, bot, clamp(-h*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }",
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; R.sky = sky; scene.add(sky);
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1400; i++) { const u = Math.random() * TAU, v = Math.random() * 0.9 + 0.08; const r = 8500; sp.push(Math.cos(u) * Math.cos(Math.asin(v)) * r, v * r, Math.sin(u) * Math.cos(Math.asin(v)) * r); }
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.frustumCulled = false; sky.add(stars);
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0xfff1c0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
    sunSprite.scale.set(1500, 1500, 1); sky.add(sunSprite);
    moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0xc8d8ff, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
    moonSprite.scale.set(600, 600, 1); sky.add(moonSprite);
  }

  // ---------- city ----------
  const windowMats = []; let neonMats = [];
  function boxUV(w, h, d, uw, uh) {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * faces[f][0] / uw, uv.getY(i) * faces[f][1] / uh); }
    return geo;
  }
  function facade(kind) {
    const lit = mulberry32(kind.length * 31 + 5);
    if (kind === "tower") return [
      canvasTex(128, 96, (g) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 96); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = "#c9ced8"; g.fillRect(c * 32 + 3, r * 24 + 3, 26, 18); g.fillStyle = "#1c2a3f"; g.fillRect(c * 32 + 5, r * 24 + 5, 22, 14); g.fillStyle = "rgba(160,210,255,0.35)"; g.fillRect(c * 32 + 5, r * 24 + 5, 9, 14); } }),
      canvasTex(128, 96, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 128, 96); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (lit() < 0.45) { g.fillStyle = lit() < 0.8 ? "#ffd27a" : "#9fe8ff"; g.fillRect(c * 32 + 5, r * 24 + 5, 22, 14); } }),
    ];
    if (kind === "house") return [
      canvasTex(128, 64, (g) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#e3e3e3"; for (let y = 0; y < 64; y += 6) g.fillRect(0, y, 128, 1); g.fillStyle = "#f4f4f4"; g.fillRect(20, 14, 30, 26); g.fillRect(78, 14, 30, 26); g.fillStyle = "#2a3448"; g.fillRect(23, 17, 24, 20); g.fillRect(81, 17, 24, 20); g.fillStyle = "#e9e9e9"; g.fillRect(34, 17, 2, 20); g.fillRect(92, 17, 2, 20); }),
      canvasTex(128, 64, (g) => { g.fillStyle = "#000"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#ffcf7a"; g.fillRect(23, 17, 24, 20); if (lit() < 0.5) g.fillRect(81, 17, 24, 20); }),
    ];
    if (kind === "ware") return [canvasTex(64, 64, (g) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 64, 64); for (let x = 0; x < 64; x += 8) { g.fillStyle = "#d4d4d4"; g.fillRect(x, 0, 3, 64); } g.fillStyle = "#bdbdbd"; g.fillRect(0, 60, 64, 4); }), null];
    return [null, null];
  }
  const roofTex = canvasTex(128, 128, (g) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128); speck(g, 128, ["#cfcfcf", "#e6e6e6", "#b9b9b9"], 500, 2); g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2; g.strokeRect(4, 4, 120, 120); });
  function buildCity() {
    const F = { tower: facade("tower"), house: facade("house"), ware: facade("ware") };
    const matCache = {};
    const wallMat = (b, kind) => {
      const k = b.color + kind + (b.glass ? "g" : "");
      if (matCache[k]) return matCache[k];
      const [map, em] = F[kind] || [null, null];
      const m = new THREE.MeshStandardMaterial({ color: b.color, map, roughness: b.glass ? 0.15 : 0.8, metalness: b.glass ? 0.6 : 0.05, emissiveMap: em, emissive: em ? 0xffffff : 0x000000, emissiveIntensity: 0 });
      if (em) windowMats.push(m);
      return (matCache[k] = m);
    };
    const roofMat = (c) => matCache["r" + c] || (matCache["r" + c] = new THREE.MeshStandardMaterial({ color: c, map: roofTex, roughness: 0.9 }));
    const acGeo = new THREE.BoxGeometry(14, 8, 10), acMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.6, metalness: 0.4 });
    const acs = [];
    for (const b of W.buildings) {
      const H = b.h3, cx = b.x + b.w / 2, cz = b.y + b.h / 2;
      if (b.house) {
        const wallH = H * 0.6, kind = "house";
        const walls = new THREE.Mesh(boxUV(b.w, wallH, b.h, 64, 32), wallMat(b, kind)); walls.position.set(cx, wallH / 2, cz); walls.castShadow = walls.receiveShadow = true; scene.add(walls);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1), roofMat(b.roof)); roof.rotation.y = Math.PI / 4;
        roof.scale.set((b.w * 1.08) / Math.SQRT2, H - wallH, (b.h * 1.08) / Math.SQRT2); roof.position.set(cx, wallH + (H - wallH) / 2, cz); roof.castShadow = true; scene.add(roof);
        const door = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 1), HM().mat("#5a3b28")); door.position.set(cx, 11, b.y + b.h + 0.4); scene.add(door);
        continue;
      }
      const kind = b.container || b.ridges ? "ware" : b.windows !== false || b.poi ? "tower" : "ware";
      const mats = [wallMat(b, kind), wallMat(b, kind), roofMat(b.roof), roofMat(b.roof), wallMat(b, kind), wallMat(b, kind)];
      const m = new THREE.Mesh(kind === "tower" ? boxUV(b.w, H, b.h, 128, 96) : boxUV(b.w, H, b.h, 64, 64), mats);
      m.position.set(cx, H / 2, cz); m.castShadow = m.receiveShadow = true; scene.add(m);
      if (!b.container && !b.ridges && !b.poi) { const rr = mulberry32(b.seed); for (let k = 0; k < 3; k++) acs.push([b.x + 20 + rr() * (b.w - 40), H + 4, b.y + 20 + rr() * (b.h - 40), rr() * 3]); }
      if (!b.container && H > 60) { // parapet ledge
        const lm = HM().mat(G.shade(b.color, 0.7).replace(/rgb\((\d+),(\d+),(\d+)\)/, (_, r, g, bb) => "#" + [r, g, bb].map((v) => (+v).toString(16).padStart(2, "0")).join("")));
        for (const [w, d, x, z] of [[b.w, 3, cx, b.y + 1.5], [b.w, 3, cx, b.y + b.h - 1.5], [3, b.h, b.x + 1.5, cz], [3, b.h, b.x + b.w - 1.5, cz]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), lm); p.position.set(x, H + 2, z); scene.add(p); }
      }
      if (b.helipad) { const hp = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshStandardMaterial({ map: textTex("H", "#ffd60a", 128, 128, "bold 90px Bahnschrift", "rgba(40,40,40,1)"), roughness: 0.8 })); hp.rotation.x = -Math.PI / 2; hp.position.set(cx, H + 0.3, cz); scene.add(hp); }
      if (b.cross) { const cm = new THREE.MeshStandardMaterial({ color: 0xe63946, emissive: 0xe63946, emissiveIntensity: 0.6 }); for (const [w, d] of [[60, 20], [20, 60]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), cm); c.position.set(cx, H + 1.5, cz); scene.add(c); } }
      if (b.neon) {
        const nm = new THREE.MeshBasicMaterial({ color: b.neon, toneMapped: false, transparent: true });
        nm.userData.base = new THREE.Color(b.neon); nm.userData.seed = b.seed % 100; neonMats.push(nm);
        for (const [w, d, x, z] of [[b.w + 2, 2.5, cx, b.y], [b.w + 2, 2.5, cx, b.y + b.h], [2.5, b.h + 2, b.x, cz], [2.5, b.h + 2, b.x + b.w, cz]]) { const n = new THREE.Mesh(new THREE.BoxGeometry(w, 2.5, d), nm); n.position.set(x, H + 5, z); scene.add(n); }
        for (const [x, z] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) { const n = new THREE.Mesh(new THREE.BoxGeometry(2, H, 2), nm); n.position.set(x, H / 2, z); scene.add(n); }
      }
      if (b.sign) {
        const tt = textTex(b.sign, b.neon || "#fff"), tw = Math.min(b.w - 10, b.sign.length * 11 + 30);
        const sm = new THREE.MeshBasicMaterial({ map: tt, toneMapped: false, transparent: true });
        const front = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw * 96 / 512), sm); front.rotation.y = Math.PI; front.position.set(cx, Math.min(H - 10, 34), b.y - 0.8); scene.add(front);
        const top = new THREE.Mesh(new THREE.PlaneGeometry(tw * 1.3, tw * 1.3 * 96 / 512), sm.clone()); top.material.side = THREE.DoubleSide; top.position.set(cx, H + 20, b.y + 6); scene.add(top);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(220, 120), new THREE.MeshBasicMaterial({ map: radialTex, color: b.neon, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
        glow.rotation.x = -Math.PI / 2; glow.position.set(cx, 0.6, b.y - 40); scene.add(glow); signGlows.push(glow);
      }
    }
    const ac = new THREE.InstancedMesh(acGeo, acMat, acs.length), d = new THREE.Object3D();
    acs.forEach(([x, y, z, r], i) => { d.position.set(x, y, z); d.rotation.y = r; d.updateMatrix(); ac.setMatrixAt(i, d.matrix); });
    ac.castShadow = true; scene.add(ac);
    // fountain
    for (const s of W.decor) if (s.type === "fountain") {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r + 2, 12, 32, 1, true), HM().mat("#cfc7bb")); basin.position.set(s.x, 6, s.y); basin.castShadow = true; scene.add(basin);
      const water = new THREE.Mesh(new THREE.CircleGeometry(s.r - 1, 32), new THREE.MeshStandardMaterial({ color: 0x3aa6d6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.9 })); water.rotation.x = -Math.PI / 2; water.position.set(s.x, 10, s.y); scene.add(water);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 30, 12), HM().mat("#e9ecef")); col.position.set(s.x, 15, s.y); scene.add(col);
      R.fountain = s;
    }
  }
  const signGlows = [];

  // ---------- trees ----------
  function buildTrees() {
    const d = new THREE.Object3D(), trees = W.trees.filter((t) => t.tree !== "palm"), palms = W.trees.filter((t) => t.tree === "palm");
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.8, 2.6, 1, 6), HM().mat("#6b4f2a"), trees.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees.length * 2);
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      d.position.set(t.x, 11, t.y); d.scale.set(1, 22, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
      const s = t.size * 1.05;
      d.position.set(t.x, 22 + s * 0.6, t.y); d.scale.set(s, s * 0.95, s); d.rotation.y = t.hue * 6; d.updateMatrix(); crown.setMatrixAt(i * 2, d.matrix);
      d.position.set(t.x + s * 0.3, 22 + s * 1.2, t.y - s * 0.2); d.scale.set(s * 0.65, s * 0.6, s * 0.65); d.updateMatrix(); crown.setMatrixAt(i * 2 + 1, d.matrix);
      col.setHSL((105 + t.hue * 35) / 360, 0.5, 0.3 + t.hue * 0.08); crown.setColorAt(i * 2, col); col.offsetHSL(0, 0, 0.06); crown.setColorAt(i * 2 + 1, col);
    });
    trunk.castShadow = crown.castShadow = true; crown.receiveShadow = true; scene.add(trunk, crown);
    const ptrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 2.2, 1, 6), HM().mat("#8a6a3d"), palms.length);
    const frond = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x2f8f46, roughness: 0.8 }), palms.length * 7);
    palms.forEach((t, i) => {
      const h = 40 + t.size, lean = (t.hue - 0.5) * 0.25;
      d.position.set(t.x + Math.sin(lean) * h / 2, h / 2, t.y); d.scale.set(1, h, 1); d.rotation.set(0, 0, -lean); d.updateMatrix(); ptrunk.setMatrixAt(i, d.matrix);
      const tx = t.x + Math.sin(lean) * h, ty = h;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + t.hue * 5, L = t.size * 1.1;
        d.position.set(tx + Math.cos(a) * L * 0.45, ty - 2, t.y + Math.sin(a) * L * 0.45); d.rotation.set(0, -a + Math.PI / 2, 0); d.rotateX(0.5); d.scale.set(L * 0.28, 1, L / 5); d.updateMatrix(); frond.setMatrixAt(i * 7 + k, d.matrix);
      }
    });
    ptrunk.castShadow = frond.castShadow = true; scene.add(ptrunk, frond);
  }

  // ---------- streetlights ----------
  let poolMat, lampMat;
  function buildStreetlights() {
    const n = W.lights.length, d = new THREE.Object3D();
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.4, 50, 6), HM().mat("#2a2d35", { metalness: 0.6, roughness: 0.4 }), n);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(22, 1.6, 1.6), HM().mat("#2a2d35", { metalness: 0.6, roughness: 0.4 }), n);
    lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffc070, emissiveIntensity: 0 });
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(8, 2.5, 5), lampMat, n);
    poolMat = new THREE.MeshBasicMaterial({ map: radialTex, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(190, 190), poolMat, n);
    W.lights.forEach((l, i) => {
      const nd = W.nearestNode(l.x, l.y), a = Math.atan2(nd.y - l.y, nd.x - l.x);
      d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.position.set(l.x, 25, l.y); d.updateMatrix(); pole.setMatrixAt(i, d.matrix);
      d.position.set(l.x + Math.cos(a) * 10, 49, l.y + Math.sin(a) * 10); d.rotation.y = -a; d.updateMatrix(); arm.setMatrixAt(i, d.matrix);
      d.position.set(l.x + Math.cos(a) * 20, 47.5, l.y + Math.sin(a) * 20); d.updateMatrix(); lamp.setMatrixAt(i, d.matrix);
      d.position.set(l.x + Math.cos(a) * 24, 0.5, l.y + Math.sin(a) * 24); d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix(); pool.setMatrixAt(i, d.matrix);
    });
    pole.castShadow = true; scene.add(pole, arm, lamp, pool);
  }

  // ---------- props: ramps, tokens, hay ----------
  const tokenMeshes = [];
  function buildProps() {
    const stripe = canvasTex(128, 64, (g) => { g.fillStyle = "#ffd60a"; g.fillRect(0, 0, 128, 64); g.fillStyle = "#111"; for (let x = -64; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 16, 64); g.lineTo(x + 48, 0); g.lineTo(x + 32, 0); g.fill(); } });
    stripe.repeat.set(2, 1);
    const rm = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
    for (const r of W.ramps) {
      const sh = new THREE.Shape(); sh.moveTo(-r.w / 2, 0); sh.lineTo(r.w / 2, 0); sh.lineTo(r.w / 2, 16); sh.lineTo(-r.w / 2, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: r.h, bevelEnabled: false }); geo.translate(0, 0, -r.h / 2);
      const m = new THREE.Mesh(geo, rm); m.position.set(r.x, 0, r.y); m.rotation.y = -r.a; m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    const tm = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.25, map: textTex("N", "#083344", 128, 128, "bold 100px Bahnschrift", "#7ff0ff") });
    const tg = new THREE.CylinderGeometry(9, 9, 2.4, 24); tg.rotateX(Math.PI / 2);
    for (const t of W.tokens) {
      const m = new THREE.Mesh(tg, tm); m.position.set(t.x, 14, t.y);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex, color: 0x22d3ee, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
      glow.scale.set(60, 60, 1); m.add(glow); scene.add(m); tokenMeshes.push([t, m]);
    }
    const hayM = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 1, flatShading: true }), cartM = HM().mat("#7a4e2d");
    for (const h of W.hay) {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(46, 8, 34), cartM); cart.position.set(h.x, 7, h.y); cart.castShadow = true; scene.add(cart);
      const hay = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hayM); hay.scale.set(23, 12, 17); hay.position.set(h.x, 13, h.y); hay.castShadow = true; scene.add(hay);
      for (const sx of [-16, 16]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 2, 10), HM().mat("#3b2a1a")); w.rotation.x = Math.PI / 2; w.position.set(h.x + sx, 5, h.y + 18); scene.add(w); }
    }
  }

  // ---------- particles ----------
  const MAXP = 1600;
  let pSmoke, pSpark;
  function makePoints(blending) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
    geo.setAttribute("size", new THREE.BufferAttribute(new Float32Array(MAXP), 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(MAXP), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending, uniforms: { scale: { value: 800 } },
      vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }",
      fragmentShader: "varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.1, r)); }",
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts); return pts;
  }
  const textSprites = new Map();
  function buildFx() { pSmoke = makePoints(THREE.NormalBlending); pSpark = makePoints(THREE.AdditiveBlending); }
  G.spawnFx = function (kind, x, y, o = {}) {
    if (G.fx.length > 1400) G.fx.shift();
    const p = Object.assign({ kind, x, y, vx: rand(-20, 20), vy: rand(-20, 20), life: 1, max: 1, size: 6, color: "#999" }, o);
    if (p.z === undefined) p.z = kind === "smoke" ? 4 : kind === "text" ? (P.car ? 30 : P.z + 30) : 6;
    if (p.vz === undefined) p.vz = kind === "smoke" ? rand(8, 22) : kind === "spark" ? rand(40, 220) : kind === "text" ? 30 : 0;
    G.fx.push(p);
  };
  G.floatText = (x, y, text, color = "#19f5a0") => G.spawnFx("text", x, y, { vx: 0, vy: 0, life: 1.6, max: 1.6, text, color });
  R.updateFx = function (dt) {
    for (const p of G.fx) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === "smoke") { p.size += dt * 16; p.vx *= 0.97; p.vy *= 0.97; p.vz *= 0.99; }
      if (p.kind === "spark") { p.vx *= 0.93; p.vy *= 0.93; p.vz -= 420 * dt; if (p.z < 0.5) { p.z = 0.5; p.vz *= -0.35; } }
      if (p.kind === "fw") { const f = Math.pow(0.35, dt); p.vx *= f; p.vy *= f; p.vz = p.vz * f - 55 * dt; }
    }
    G.fx = G.fx.filter((p) => p.life > 0);
  };
  const tmpC = new THREE.Color();
  function drawFx() {
    const fill = (pts, list) => {
      const g = pts.geometry, pos = g.attributes.position.array, col = g.attributes.color.array, size = g.attributes.size.array, al = g.attributes.alpha.array;
      let n = 0;
      for (const p of list) {
        if (n >= MAXP) break;
        const a = clamp(p.life / p.max, 0, 1);
        pos[n * 3] = p.x; pos[n * 3 + 1] = p.z; pos[n * 3 + 2] = p.y;
        tmpC.set(p.color); col[n * 3] = tmpC.r; col[n * 3 + 1] = tmpC.g; col[n * 3 + 2] = tmpC.b;
        size[n] = p.kind === "smoke" ? p.size * 2.2 : p.size * 1.6 * (0.4 + a); al[n] = p.kind === "smoke" ? a * 0.5 : a;
        n++;
      }
      g.setDrawRange(0, n);
      for (const k of ["position", "color", "size", "alpha"]) g.attributes[k].needsUpdate = true;
    };
    fill(pSmoke, G.fx.filter((p) => p.kind === "smoke")); fill(pSpark, G.fx.filter((p) => p.kind === "spark" || p.kind === "fw"));
    pSmoke.material.uniforms.scale.value = pSpark.material.uniforms.scale.value = Hd / (2 * Math.tan((camera.fov * Math.PI) / 360));
    // floating text sprites
    const live = new Set();
    for (const p of G.fx) if (p.kind === "text") {
      live.add(p); let s = textSprites.get(p);
      if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(p.text, p.color, 512, 96, "bold 60px Bahnschrift, sans-serif", null), transparent: true, depthTest: false })); s.scale.set(64, 12, 1); s.renderOrder = 10; scene.add(s); textSprites.set(p, s); }
      s.position.set(p.x, p.z, p.y); s.material.opacity = clamp(p.life / p.max * 2, 0, 1);
    }
    for (const [p, s] of textSprites) if (!live.has(p)) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); textSprites.delete(p); }
  }

  // ---------- rain ----------
  let rain; const RAIN_N = 1800;
  function buildRain() {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RAIN_N * 6), 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd2ff, transparent: true, opacity: 0 })); rain.frustumCulled = false; scene.add(rain);
    rain.userData.drops = Array.from({ length: RAIN_N }, () => [rand(-600, 600), rand(0, 500), rand(-600, 600), rand(0.8, 1.2)]);
  }
  function drawRain(dt) {
    const r = G.weather.rain; rain.visible = r > 0.02; if (!rain.visible) return;
    rain.material.opacity = 0.45 * r;
    const pos = rain.geometry.attributes.position.array, c = cam3.tgt, n = Math.floor(RAIN_N * r);
    rain.userData.drops.forEach((d, i) => {
      d[1] -= 700 * d[3] * dt; if (d[1] < 0) { d[1] += 500; d[0] = rand(-600, 600); d[2] = rand(-600, 600); }
      const x = c.x + d[0], y = d[1], z = c.z + d[2], on = i < n;
      pos[i * 6] = x; pos[i * 6 + 1] = on ? y : -999; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x + 3; pos[i * 6 + 4] = on ? y + 16 * d[3] : -999; pos[i * 6 + 5] = z + 2;
    });
    rain.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- dynamic objects (cars, people, heli, markers, ropes) ----------
  let playerSpot, heliSpot, sirenLights = [], heliMesh, rope, webMeshes = [], shockMeshes = [], markerPool = [], tagPool = [], chargeRing;
  function buildDynamic() {
    playerSpot = new THREE.SpotLight(0xfff2d6, 0, 700, 0.5, 0.5, 1); scene.add(playerSpot, playerSpot.target);
    heliSpot = new THREE.SpotLight(0xe8f0ff, 0, 900, 0.22, 0.4, 1); scene.add(heliSpot, heliSpot.target);
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xff2040, 0, 320, 1); scene.add(l); sirenLights.push(l); }
    rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xeafffd }));
    rope.frustumCulled = false; rope.visible = false; scene.add(rope);
    chargeRing = new THREE.Mesh(new THREE.RingGeometry(10, 14, 32), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    chargeRing.rotation.x = -Math.PI / 2; chargeRing.visible = false; scene.add(chargeRing);
    // helicopter
    const h = (heliMesh = new THREE.Group()), body = HM().mat("#1b263b", { metalness: 0.5, roughness: 0.4 });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), body); hull.scale.set(26, 13, 13); h.add(hull);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), HM().mat("#7fb7ff", { metalness: 0.8, roughness: 0.1 })); glass.scale.set(11, 9, 10); glass.position.set(14, 2, 0); h.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(44, 4, 4), body); tail.position.set(-40, 3, 0); h.add(tail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(6, 13.5, 13.5), HM().mat("#e9ecef")); h.add(stripe);
    for (const z of [-9, 9]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(40, 1.5, 1.5), HM().mat("#111")); sk.position.set(0, -15, z); h.add(sk); }
    h.userData.rotor = new THREE.Group(); h.userData.rotor.position.y = 15; h.add(h.userData.rotor);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(56, 0.6, 3.5), HM().mat("#333")); b.position.x = 28; const p = new THREE.Group(); p.rotation.y = (k * Math.PI) / 2; p.add(b); h.userData.rotor.add(p); }
    h.userData.trotor = new THREE.Mesh(new THREE.BoxGeometry(1, 16, 2), HM().mat("#333")); h.userData.trotor.position.set(-62, 4, 3); h.add(h.userData.trotor);
    h.userData.beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2040 })); h.userData.beacon.position.set(-60, 8, 0); h.add(h.userData.beacon);
    h.userData.cone = new THREE.Mesh(new THREE.ConeGeometry(70, 260, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(h.userData.cone); h.userData.cone.visible = false;
    h.traverse((m) => m.isMesh && (m.castShadow = true)); h.visible = false; scene.add(h);
  }
  // ---------- realism: reflections, clouds, wet roads ----------
  // A tiny "reflection world" (the same sky + sun + a band of city neon) is turned into an environment map every
  // couple of seconds. Car paint, glass, chrome, the sea and rain-soaked roads reflect it.
  let pmrem, envRT, envScene, envGlow, envSun, envT = 0, clouds, cloudTex, wet = 0;
  const envMats = new Set();
  const withEnv = (m, k = 1) => { m.envMapIntensity = k; if (envRT) m.envMap = envRT.texture; envMats.add(m); return m; };
  function buildEnv() {
    pmrem = new THREE.PMREMGenerator(renderer);
    envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), skyMat));
    const glowTex = canvasTex(1024, 64, (g) => {
      for (let i = 0; i < 260; i++) { g.fillStyle = pick(["#ff3df2", "#22d3ee", "#ffd60a", "#c77dff", "#ff7b00", "#fff4d6", "#fff4d6", "#9fd8ff"]); g.globalAlpha = 0.35 + Math.random() * 0.65; const w = 2 + Math.random() * 14, h = 6 + Math.random() * 50; g.fillRect(Math.random() * 1024, 64 - h, w, h); }
    });
    envGlow = new THREE.Mesh(new THREE.CylinderGeometry(36, 36, 9, 48, 1, true), new THREE.MeshBasicMaterial({ map: glowTex, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false }));
    envGlow.position.y = 2; envScene.add(envGlow);
    envSun = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); envScene.add(envSun);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(39, 24), new THREE.MeshBasicMaterial({ color: 0x26282d })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.5; envScene.add(gnd);
    withEnv(groundMat, 0.12); withEnv(seaMat, 1.2);
    refreshEnv();
  }
  function refreshEnv() {
    const old = envRT; envRT = pmrem.fromScene(envScene, 0.015, 0.1, 100);
    for (const m of envMats) { const had = !!m.envMap; m.envMap = envRT.texture; if (!had) m.needsUpdate = true; }
    if (old) old.dispose();
  }
  function updateEnv(dt, n01, sunDir, sunCol, dusk) {
    envGlow.material.opacity = Math.min(1, n01 * 1.1);
    envSun.visible = sunDir.y > -0.05; envSun.position.copy(sunDir).multiplyScalar(30); envSun.material.color.copy(sunCol).multiplyScalar(1.5 + dusk);
    envT -= dt; if (envT <= 0) { envT = 2; refreshEnv(); }
  }
  function buildClouds() {
    cloudTex = canvasTex(512, 512, (g) => {
      g.clearRect(0, 0, 512, 512);
      for (let i = 0; i < 140; i++) {
        const x = Math.random() * 512, y = Math.random() * 512, r = 18 + Math.random() * 70;
        for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { // tileable
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, "rgba(255,255,255,0.38)"); gr.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill();
        }
      }
    });
    cloudTex.repeat.set(6, 6);
    clouds = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    clouds.rotation.x = Math.PI / 2; clouds.position.y = 1600; clouds.renderOrder = -5; scene.add(clouds);
  }
  function updateWeatherLook(dt, n01, hor, dayK) {
    const rain = G.weather.rain;
    wet = rain > wet ? Math.min(rain, wet + dt * 0.25) : Math.max(rain, wet - dt * 0.012); // roads soak fast, dry slowly
    groundMat.roughness = lerp(0.92, 0.22, wet); groundMat.envMapIntensity = lerp(0.12, 1.25, wet);
    groundMat.color.setScalar(lerp(1, 0.62, wet));
    const t = cam3.tgt; clouds.position.x = t.x; clouds.position.z = t.z;
    cloudTex.offset.x = (G.time * 0.0016 + t.x / 24000 * 6) % 1; cloudTex.offset.y = (G.time * 0.0007 - t.z / 24000 * 6) % 1;
    clouds.material.opacity = lerp(0.5, 0.95, rain) * (1 - n01 * 0.45);
    clouds.material.color.copy(hor).lerp(new THREE.Color(0xffffff), dayK * (1 - rain) * 0.75).multiplyScalar(lerp(1, 0.55, rain));
  }
  R.wetness = () => wet;

  // ----- cars -----
  const carMeshes = new Map();
  const BODY = { compact: [7.5, 6], sedan: [7.5, 6], taxi: [7.5, 6], police: [7.5, 6.2], van: [15, 0], muscle: [7.5, 5.5], sports: [6, 4.6], super: [5.5, 4.2] };
  const wheelGeo = new THREE.CylinderGeometry(3.8, 3.8, 2.8, 14); wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(2.2, 2.2, 3, 8); hubGeo.rotateX(Math.PI / 2);
  function buildCar(c) {
    const s = c.s, L = s.w, Wd = s.h, [bh, ch] = BODY[c.type] || [7.5, 6];
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const paint = withEnv(new THREE.MeshPhysicalMaterial({ color: c.color, metalness: 0.35, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.08 }), 0.55);
    const glass = carGlass;
    const add = (geo, mat, x, y, z, par = tilt) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    if (c.type === "van") add(new THREE.BoxGeometry(L, bh, Wd), paint, 0, 3 + bh / 2, 0);
    else add(carGeo(c.type, "body", L, Wd, bh, ch), paint, 0, 0, 0);
    add(new THREE.BoxGeometry(L + 0.6, 1.6, Wd + 0.6), HM().mat("#15161a"), 0, 3.4, 0); // bumper/skirt band
    if (c.type === "van") { add(new THREE.BoxGeometry(2, 6, Wd - 3), glass, L / 2 - 0.6, 3 + bh - 4, 0); add(new THREE.BoxGeometry(L * 0.5, 4, 0.4), glass, L * 0.1, 3 + bh - 4, Wd / 2); add(new THREE.BoxGeometry(L * 0.5, 4, 0.4), glass, L * 0.1, 3 + bh - 4, -Wd / 2); }
    else {
      const cl = L * (c.type === "sports" || c.type === "super" ? 0.4 : 0.48), cx = c.type === "sports" || c.type === "super" ? -L * 0.05 : -L * 0.08;
      add(carGeo(c.type, "cabin", L, Wd, bh, ch, cl, cx), glass, 0, 0, 0);
      add(carGeo(c.type, "roof", L, Wd, bh, ch, cl, cx), paint, 0, 0, 0);
      if (c.type === "muscle") for (const z of [-1.8, 1.8]) add(new THREE.BoxGeometry(L * 0.3, 0.3, 1.6), HM().mat("#f5f5f5"), L * 0.32, 3 + bh + 0.1, z);
      if (c.type === "sports" || c.type === "super") { add(new THREE.BoxGeometry(3, 0.8, Wd), paint, -L / 2 + 2, 3 + bh + 4, 0); for (const z of [-Wd / 3, Wd / 3]) add(new THREE.BoxGeometry(1, 3.5, 1), HM().mat("#111"), -L / 2 + 2, 3 + bh + 2, z); }
      if (s.taxi) add(new THREE.BoxGeometry(5, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffd000, emissiveIntensity: 0.6 }), cx, 3 + bh + ch + 2, 0);
    }
    const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.4 });
    const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.3 });
    for (const z of [-Wd / 2 + 3, Wd / 2 - 3]) { const lx = c.type === "van" ? 0.1 : 0.55; add(new THREE.BoxGeometry(1.2, 2, 4), head, L / 2 + lx, 3 + bh * 0.55, z); add(new THREE.BoxGeometry(1.2, 2, 4.5), tail, -L / 2 - lx, 3 + bh * 0.6, z); }
    const o = { root, tilt, paint, head, tail, wheels: [], steer: [], spin: 0, pvF: 0, pitch: 0, roll: 0, type: c.type };
    for (const [wx, wz] of [[L * 0.32, Wd / 2 - 1.2], [L * 0.32, -Wd / 2 + 1.2], [-L * 0.32, Wd / 2 - 1.2], [-L * 0.32, -Wd / 2 + 1.2]]) {
      const holder = new THREE.Group(); holder.position.set(wx, 3.8, wz); root.add(holder);
      const w = add(wheelGeo, HM().mat("#121212", { roughness: 0.9 }), 0, 0, 0, holder); add(hubGeo, carChrome, 0, 0, 0, w);
      add(new THREE.BoxGeometry(5, 0.6, 0.4), HM().mat("#555"), 0, 0, wz > 0 ? 1.6 : -1.6, w);
      o.wheels.push(w); if (wx > 0) o.steer.push(holder);
    }
    if (s.police) {
      const bar = new THREE.Group(); bar.position.set(-L * 0.08, 3 + bh + ch + 1.2, 0); tilt.add(bar);
      o.red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2040, emissiveIntensity: 0 }); o.blue = new THREE.MeshStandardMaterial({ color: 0x000040, emissive: 0x2070ff, emissiveIntensity: 0 });
      add(new THREE.BoxGeometry(3, 1.6, 5), o.red, 0, 0, -3, bar); add(new THREE.BoxGeometry(3, 1.6, 5), o.blue, 0, 0, 3, bar);
      for (const z of [Wd / 2 + 0.05, -Wd / 2 - 0.05]) add(new THREE.BoxGeometry(L * 0.34, bh * 0.75, 0.2), HM().mat("#e9ecef"), -L * 0.05, 3 + bh / 2, z);
    }
    if (c.type === "super") { const glow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.4, Wd * 1.8), new THREE.MeshBasicMaterial({ map: radialTex, color: c.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.7; root.add(glow); }
    const cone = new THREE.Mesh(new THREE.PlaneGeometry(90, 170), new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    cone.rotation.x = -Math.PI / 2; cone.rotation.z = -Math.PI / 2; cone.position.set(L / 2 + 85, 0.8, 0); root.add(cone); o.cone = cone;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.25, Wd * 1.55), blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.45; blob.renderOrder = 1; root.add(blob); o.blob = blob;
    scene.add(root); return o;
  }
  let carGlass, carChrome, blobMat;
  // Car bodies: a side profile (bumper, sloped hood, raked windshield, tapered cabin, trunk) extruded across the
  // car's width with rounded edges. Built once per car type and part, then shared by every car of that type.
  const carGeoCache = {};
  function extrudeProfile(pts, depth, bevel) {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -(depth - bevel * 2) / 2); g.computeVertexNormals(); return g;
  }
  function carGeo(type, part, L, Wd, bh, ch, cl, cx) {
    const key = type + part; if (carGeoCache[key]) return carGeoCache[key];
    const sporty = type === "sports" || type === "super", y0 = 3, top = y0 + bh, h = L / 2;
    let g;
    if (part === "body") {
      const nose = sporty ? 0.55 : 0.68, deck = sporty ? 0.85 : 0.9;
      const e = h - 1.15, t2 = top - 1.1, b = y0 + 1.3; // keep inside the rounded edge so lights stay visible
      g = extrudeProfile([[-e, b], [e - 1.5, b], [e, y0 + bh * 0.35], [e, t2 * nose + y0 * (1 - nose)], [e - L * 0.2, t2], [-e + L * 0.1, t2],
        [-e + 0.4, y0 + (t2 - y0) * deck], [-e, y0 + bh * 0.4]], Wd, 1.4);
    } else {
      const b0 = cx - cl / 2, b1 = cx + cl / 2, rake = sporty ? 0.42 : 0.3, back = sporty ? 0.3 : 0.16;
      if (part === "cabin") g = extrudeProfile([[b0, top - 0.3], [b1, top - 0.3], [b1 - cl * rake, top + ch], [b0 + cl * back, top + ch]], Wd * 0.86, 0.8);
      else g = extrudeProfile([[b0 + cl * back - 0.4, top + ch - 0.2], [b1 - cl * rake + 0.4, top + ch - 0.2], [b1 - cl * rake - 0.6, top + ch + 0.8], [b0 + cl * back + 0.6, top + ch + 0.8]], Wd * 0.86, 0.6);
    }
    return (carGeoCache[key] = g);
  }
  function carShared() {
    carGlass = withEnv(new THREE.MeshStandardMaterial({ color: 0x0e151d, metalness: 0.9, roughness: 0.06 }), 1.4);
    carChrome = withEnv(new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 1, roughness: 0.18 }), 1.2);
    blobMat = new THREE.MeshBasicMaterial({ map: radialTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  }
  function updateCars(dt, n01, time) {
    const seen = new Set(), tgt = cam3.tgt;
    const cops = [];
    const allCars = G.net && G.net.peers.size ? G.cars.concat(G.net.cars()) : G.cars;
    for (const c of allCars) {
      if (Math.abs(c.x - tgt.x) > 1700 || Math.abs(c.y - tgt.z) > 1700) continue;
      seen.add(c);
      let o = carMeshes.get(c); if (!o) { o = buildCar(c); carMeshes.set(c, o); }
      if (o.color !== c.color || o.wrecked !== c.wrecked) { o.color = c.color; o.wrecked = c.wrecked; o.paint.color.set(c.wrecked ? "#262626" : c.color); o.paint.roughness = c.wrecked ? 1 : 0.32; }
      o.root.position.set(c.x, c.z * 0.9, c.y); o.root.rotation.y = -c.a;
      o.blob.position.y = 0.45 - c.z * 0.9; o.blob.visible = c.z < 120;
      const vF = c.vF || 0;
      o.spin += (vF / 3.8) * dt; for (const w of o.wheels) w.rotation.z = -o.spin;
      for (const s of o.steer) s.rotation.y += (-c.ctrl.s * 0.45 - s.rotation.y) * Math.min(1, dt * 10);
      const acc = (vF - o.pvF) / Math.max(dt, 1e-3); o.pvF = vF;
      const tp = c.z > 0 ? clamp(c.vz * 0.0009, -0.35, 0.35) : clamp(acc * 0.00005, -0.07, 0.06);
      const tr = c.z > 0 ? 0 : clamp(c.ctrl.s * Math.min(1, Math.abs(vF) / 320) * 0.07 + (c.slip || 0) * 0.0002 * Math.sign(c.ctrl.s), -0.12, 0.12);
      o.pitch += (tp - o.pitch) * Math.min(1, dt * 6); o.roll += (tr - o.roll) * Math.min(1, dt * 6);
      o.tilt.rotation.set(o.roll, 0, o.pitch);
      if (c.wrecked) o.tilt.rotation.set(0.12, 0, -0.05);
      const driven = !!c.driver && !c.wrecked;
      o.head.emissiveIntensity = driven ? 0.6 + n01 * 3 : 0.1;
      o.tail.emissiveIntensity = c.wrecked ? 0 : c.braking ? 4 : driven ? 0.4 + n01 * 1.2 : 0.1;
      o.cone.material.opacity = driven && n01 > 0.15 ? n01 * 0.55 : 0;
      if (o.red) { const on = c.siren && Math.floor(time * 8) % 2 === 0; o.red.emissiveIntensity = c.siren ? (on ? 5 : 0.2) : 0; o.blue.emissiveIntensity = c.siren ? (!on ? 5 : 0.2) : 0; if (c.siren) cops.push(c); }
    }
    for (const [c, o] of carMeshes) if (!seen.has(c)) { scene.remove(o.root); o.root.traverse((m) => { if (m.isMesh && m.material.dispose && m.material !== o.paint) { /* shared mats kept */ } }); o.paint.dispose(); envMats.delete(o.paint); o.head.dispose(); o.tail.dispose(); carMeshes.delete(c); }
    cops.sort((a, b) => dist(a.x, a.y, tgt.x, tgt.z) - dist(b.x, b.y, tgt.x, tgt.z));
    sirenLights.forEach((l, i) => { const c = cops[i]; if (!c) { l.intensity = 0; return; } const on = Math.floor(time * 8) % 2 === 0; l.color.set(on ? 0xff2040 : 0x2070ff); l.intensity = 900 * (0.4 + n01); l.position.set(c.x, 26, c.y); });
    const pc = P.car;
    if (pc && n01 > 0.1 && !pc.wrecked) { const fx = Math.cos(pc.a), fy = Math.sin(pc.a); let hit = 220; for (let d = 25; d < 220; d += 15) { if (W.groundAt(pc.x + fx * d, pc.y + fy * d)[0] > 6) { hit = d; break; } }
      playerSpot.intensity = 3500 * n01 * Math.min(1, Math.max(0.08, (hit - 20) / 160)); playerSpot.position.set(pc.x + fx * 20, 9 + pc.z, pc.y + fy * 20); playerSpot.target.position.set(pc.x + fx * 220, 0, pc.y + fy * 220); }
    else playerSpot.intensity = 0;
  }
  // ----- people -----
  const rigs = new Map();
  function rigFor(key, outfit) {
    let r = rigs.get(key);
    if (r && r.outfitKey !== outfit) { scene.remove(r.root); rigs.delete(key); r = null; }
    if (!r) { const o = typeof outfit === "string" ? JSON.parse(outfit) : outfit; r = HM().build(o); r.outfitKey = typeof outfit === "string" ? outfit : JSON.stringify(outfit); scene.add(r.root); rigs.set(key, r); }
    return r;
  }
  const outfitCache = {}; const heroOutfit = (id) => outfitCache[id] || (outfitCache[id] = JSON.stringify((G.heroes.LIST[id] || G.heroes.LIST.kai).outfit));
  const pedOutfit = (p) => p._of || (p._of = JSON.stringify({ style: "civ", skin: p.skin, shirt: p.shirt, pants: p.pants, hair: p.hair }));
  function updatePeople(dt, time) {
    const seen = new Set(), tgt = cam3.tgt, near = (x, y, r) => Math.abs(x - tgt.x) < r && Math.abs(y - tgt.z) < r;
    for (const p of G.peds) {
      if (!near(p.x, p.y, 1000)) continue;
      seen.add(p); const r = rigFor(p, pedOutfit(p));
      const st = p.state, a = r.pa || (r.pa = {});
      a.mode = st === "down" ? "down" : st === "flee" || st === "fleeAway" ? "flee" : st === "wait" ? (p.fare ? "wave" : "idle") : "walk";
      a.speed = st === "flee" || st === "fleeAway" ? 170 : st === "cross" ? p.speed * 1.2 : st === "wait" ? 0 : p.speed;
      HM().animate(r, a, dt); r.root.position.set(p.x, 0, p.y); r.root.rotation.y = -p.a;
      tag(p.fare && st === "wait" ? "🙋" : p.bubble > 0 && st !== "wait" ? "❗" : null, p.x, 30, p.y);
    }
    for (const e of G.gang) {
      if (!near(e.x, e.y, 1100)) continue;
      seen.add(e); const r = rigFor(e, e._of || (e._of = JSON.stringify(e.outfit)));
      HM().animate(r, e.anim, dt); r.root.position.set(e.x, e.z, e.y); r.root.rotation.y = -e.a;
      if (e.state === "webbed") { if (!r.cocoon) { r.cocoon = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 17, 10), new THREE.MeshStandardMaterial({ color: 0xf2fffd, roughness: 1, transparent: true, opacity: 0.85 })); r.cocoon.position.y = 10; r.root.add(r.cocoon); } r.cocoon.visible = true; }
      else if (r.cocoon) r.cocoon.visible = false;
      if (e.aware && e.state !== "down") tag("🔻", e.x, e.z + 30, e.y);
    }
    // player hero
    if (G.state.started && !P.car) {
      seen.add(P); const r = rigFor(P, JSON.stringify(G.heroes.LIST[P.hero].outfit));
      HM().animate(r, P.anim || { mode: "idle" }, dt);
      r.root.position.set(P.x, P.z || 0, P.y); r.root.rotation.y = -P.a;
      if (P.hitCd > 0.3) r.root.position.x += Math.sin(time * 80) * 0.6;
      // grapple line
      if (P.swing) { const h = new THREE.Vector3(); r.R.hand.getWorldPosition(h); const pa = rope.geometry.attributes.position; pa.setXYZ(0, h.x, h.y, h.z); pa.setXYZ(1, P.swing.x, P.swing.z, P.swing.y); pa.needsUpdate = true; rope.visible = true; }
      else rope.visible = false;
      chargeRing.visible = P.charge > 0.2; if (chargeRing.visible) { chargeRing.position.set(P.x, (P.z || 0) + 0.8, P.y); chargeRing.scale.setScalar(0.6 + P.charge * 1.8); chargeRing.material.opacity = 0.4 + Math.sin(time * 30) * 0.3; }
    } else { rope.visible = false; chargeRing.visible = false; }
    // other online players
    if (G.net && G.net.peers.size) for (const p of G.net.avatars()) {
      if (!near(p.x, p.y, 2500)) continue;
      seen.add(p.key); const r = rigFor(p.key, heroOutfit(p.hero));
      r.root.position.set(p.x, p.z, p.y); r.root.rotation.y = -p.a; HM().animate(r, p.anim, dt);
    }
    for (const [k, r] of rigs) if (!seen.has(k)) { scene.remove(r.root); rigs.delete(k); }
    // web projectiles & shockwaves
    while (webMeshes.length < G.webs.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xeafffd })); scene.add(m); webMeshes.push(m); }
    webMeshes.forEach((m, i) => { const w = G.webs[i]; m.visible = !!w; if (w) m.position.set(w.x, w.z, w.y); });
    while (shockMeshes.length < G.shocks.length) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); shockMeshes.push(m); }
    shockMeshes.forEach((m, i) => { const s = G.shocks[i]; m.visible = !!s; if (s) { const k = s.t / 0.7; m.position.set(s.x, s.z + 1, s.y); m.scale.setScalar(20 + k * (90 + s.power * 90)); m.material.opacity = 1 - k; } });
  }
  // ----- floating tags (emoji above heads) -----
  let tagN = 0;
  function tag(icon, x, z, y) {
    if (!icon) return;
    let s = tagPool[tagN];
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); s.scale.set(12, 12, 1); s.renderOrder = 9; scene.add(s); tagPool.push(s); }
    const t = iconTex(icon); if (s.material.map !== t) { s.material.map = t; s.material.needsUpdate = true; }
    s.visible = true; s.position.set(x, z + Math.sin(G.time * 5 + x) * 1.2, y); tagN++;
  }
  // ----- markers -----
  function marker(i) {
    if (markerPool[i]) return markerPool[i];
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.8;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true })); icon.scale.set(26, 26, 1);
    g.add(ring, disc, beam, icon); scene.add(g);
    return (markerPool[i] = { g, ring, disc, beam, icon });
  }
  function updateMarkers(list, time) {
    markerPool.forEach((m) => (m.g.visible = false));
    list.forEach((m, i) => {
      const o = marker(i), p = (Math.sin(time * 4) + 1) / 2;
      o.g.visible = true; o.g.position.set(m.x, W.groundAt(m.x, m.y)[0] * 0, m.y);
      for (const k of [o.ring, o.disc, o.beam]) k.material.color.set(m.color);
      o.ring.scale.setScalar(m.r * (0.88 + p * 0.12)); o.disc.scale.setScalar(m.r); o.ring.material.opacity = m.dim ? 0.35 : 0.95;
      const hgt = m.cp ? 260 : 150; o.beam.visible = !m.dim; o.beam.scale.set(m.cp ? m.r * 0.9 : 13, hgt, m.cp ? m.r * 0.9 : 13); o.beam.position.y = hgt / 2; o.beam.material.opacity = m.cp ? 0.35 : 0.75;
      o.icon.visible = !m.dim; const t = iconTex(m.icon, m.color); if (o.icon.material.map !== t) { o.icon.material.map = t; o.icon.material.needsUpdate = true; }
      o.icon.position.y = 70 + Math.sin(time * 3) * 6;
    });
  }

  // ---------- time of day ----------
  R.darkness = function (h) {
    if (h >= 7.5 && h <= 17.5) return 0;
    if (h > 17.5 && h < 20.5) return ((h - 17.5) / 3) * 0.68;
    if (h >= 20.5 || h <= 4.5) return 0.68;
    return (1 - (h - 4.5) / 3) * 0.68;
  };
  const C = (h) => new THREE.Color(h);
  const SKY = { day: [C(0x3b8cff), C(0xbfe3ff)], dusk: [C(0x2a1b5a), C(0xff7b54)], night: [C(0x03040c), C(0x161c40)] };
  function lighting(h, time) {
    const n01 = R.darkness(h) / 0.68, rain = G.weather.rain;
    const dusk = h > 16.5 && h < 20.5 ? Math.sin(((h - 16.5) / 4) * Math.PI) : h > 4.5 && h < 8 ? Math.sin(((h - 4.5) / 3.5) * Math.PI) : 0;
    const top = SKY.day[0].clone().lerp(SKY.night[0], n01).lerp(SKY.dusk[0], dusk * 0.6), hor = SKY.day[1].clone().lerp(SKY.night[1], n01).lerp(SKY.dusk[1], dusk * 0.75);
    const grey = C(0x5a6270).lerp(C(0x101420), n01); top.lerp(grey, rain * 0.7); hor.lerp(grey, rain * 0.6);
    skyMat.uniforms.top.value.copy(top); skyMat.uniforms.hor.value.copy(hor); skyMat.uniforms.bot.value.copy(hor).multiplyScalar(0.5);
    scene.fog.color.copy(hor); scene.fog.near = lerp(700, 300, rain); scene.fog.far = lerp(4200, 2000, rain) * (1 - n01 * 0.25);
    const az = (h / 24) * TAU - Math.PI / 2, el = Math.sin(((h - 6) / 12) * Math.PI);
    const dayK = clamp(el * 1.6, 0, 1);
    const dir = el > 0.05 ? new THREE.Vector3(Math.cos(az) * Math.cos(el * 1.2), Math.max(0.25, el), Math.sin(az) * 0.6).normalize() : new THREE.Vector3(-0.4, 0.85, 0.35).normalize();
    const t = cam3.tgt;
    sun.target.position.set(t.x, 0, t.z); sun.position.set(t.x + dir.x * 1500, dir.y * 1500, t.z + dir.z * 1500);
    sun.intensity = (el > 0.05 ? 0.4 + dayK * 2.4 : 0.35) * (1 - rain * 0.6);
    sun.color.set(el > 0.05 ? 0xffffff : 0x9fb4ff).lerp(C(0xff9a5c), dusk * 0.7);
    hemi.intensity = (0.35 + dayK * 0.65) * (1 - rain * 0.3) + G.state.flash * 3;
    hemi.color.copy(hor).lerp(C(0xffffff), 0.4); hemi.groundColor.set(n01 > 0.5 ? 0x2a1840 : 0x4a4038);
    renderer.toneMappingExposure = 1.05 + n01 * 0.25;
    stars.material.opacity = n01 * (1 - rain);
    sunSprite.visible = el > -0.05; sunSprite.position.copy(new THREE.Vector3(Math.cos(az), Math.max(0.02, el), Math.sin(az) * 0.6).normalize().multiplyScalar(8500)); sunSprite.material.color.set(0xfff1c0).lerp(C(0xff6a3d), dusk);
    moonSprite.visible = n01 > 0.3; moonSprite.position.set(-3400, 7400, 3000); moonSprite.material.opacity = n01 * (1 - rain);
    R.sky.position.copy(camera.position);
    updateEnv(frameDt, n01, el > -0.05 ? new THREE.Vector3(Math.cos(az), Math.max(0.02, el), Math.sin(az) * 0.6).normalize() : new THREE.Vector3(0, -1, 0), sun.color, dusk);
    updateWeatherLook(frameDt, n01, hor, dayK);
    for (const m of windowMats) m.emissiveIntensity = n01 * 1.4 + 0.02;
    lampMat.emissiveIntensity = n01 * 4; poolMat.opacity = n01 * 0.75;
    for (const g of signGlows) g.material.opacity = n01 * 0.6;
    for (const m of neonMats) { const k = n01 > 0.15 ? 0.7 + 0.3 * Math.abs(Math.sin(time * 2 + m.userData.seed)) : 0.35; m.color.copy(m.userData.base).multiplyScalar(k * (n01 > 0.15 ? 1.6 : 1)); }
    groundMat.roughness = lerp(0.92, 0.35, rain); groundMat.metalness = rain * 0.25;
    seaTex.offset.set(time * 0.004, time * 0.0025);
    return n01;
  }

  // ---------- camera ----------
  function blockedAt(x, y, z) { const [g] = W.groundAt(x, y); return g > z; }
  R.updateCamera = function (dt, attract) {
    const fc = G.finale && G.finale.cam;
    if (fc) {
      camera.position.set(fc.px, fc.pz, fc.py); camera.lookAt(fc.lx, fc.lz, fc.ly);
      camera.fov = fc.fov; camera.updateProjectionMatrix(); cam3.tgt.set(fc.lx, fc.lz, fc.ly); cam.x = fc.lx; cam.y = fc.ly; return;
    }
    const k = 1 - Math.exp(-dt * 7);
    if (attract) {
      const t = G.time * 0.05, cx = 40 * 64 + Math.cos(t) * 1400, cy = 40 * 64 + Math.sin(t * 1.3) * 1200;
      cam3.tgt.set(cx, 0, cy); P.x = cx; P.y = cy; cam.x = cx; cam.y = cy;
      camera.position.set(cx + Math.cos(t * 2) * 700, 420, cy + Math.sin(t * 2) * 700); camera.lookAt(cx, 40, cy);
      camera.fov = 58; camera.updateProjectionMatrix(); return;
    }
    const c = P.car, zm = G.state.zoomMul || 1;
    let tx, ty, tz, distc, wantYaw = null, fov = 62;
    if (c) {
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      tx = c.x + fx * c.speed * 0.04; ty = c.y + fy * c.speed * 0.04; tz = 12 + c.z * 0.9;
      distc = (82 + c.speed * 0.06) / zm; wantYaw = c.a;
      fov = 62 + Math.min(18, c.speed / 36) + (c.ctrl.boost ? 6 : 0);
    } else {
      tx = P.x; ty = P.y; tz = (P.z || 0) + 15;
      distc = (P.mode === "swing" ? 105 : P.mode === "climb" ? 80 : 66) / zm;
      const sp = Math.hypot(P.vx || 0, P.vy || 0);
      if (sp > 60) { const md = Math.atan2(P.vy, P.vx); if (Math.abs(angDiff(cam3.yaw, md)) < 2.2) wantYaw = md; }
      if (P.mode === "climb" && P.wall) wantYaw = Math.atan2(-P.wall.ny, -P.wall.nx);
      fov = 62 + Math.min(14, sp / 40) + (G.timeScale < 1 ? 10 : 0);
    }
    const mouseRecent = G.time - cam3.lastMouse < 1.6;
    if (wantYaw !== null && !mouseRecent) cam3.yaw += angDiff(cam3.yaw, wantYaw) * Math.min(1, dt * (c ? 3.2 : 1.6));
    if (!mouseRecent) cam3.pitch += ((c ? 0.3 : P.mode === "swing" ? 0.35 : 0.28) - cam3.pitch) * Math.min(1, dt * 1.5);
    cam3.tgt.lerp(new THREE.Vector3(tx, tz, ty), c ? 1 : k * 2.2 > 1 ? 1 : k * 2.2);
    const t = cam3.tgt, cp = Math.cos(cam3.pitch), sp2 = Math.sin(cam3.pitch);
    let px = t.x - Math.cos(cam3.yaw) * cp * distc, py = t.z - Math.sin(cam3.yaw) * cp * distc, pz = t.y + sp2 * distc + 6;
    // keep the camera out of buildings
    // if a building sits between the target and the camera: rise over it when it's low enough, otherwise pull in (never closer than 45%)
    for (let i = 1; i <= 12; i++) {
      const f = i / 12, x = lerp(t.x, px, f), y = lerp(t.z, py, f), z = lerp(t.y, pz, f), [g] = W.groundAt(x, y);
      if (g > z) {
        if (g - t.y < 140 && f > 0.25) { pz = Math.max(pz, g + 18 + (pz - z)); }
        else {
          // pull in to just before the wall, then lift the camera so it looks down at the hero instead of jamming into them
          let f2 = Math.max(0.05, f - 1 / 12);
          for (; f2 > 0.05; f2 -= 0.02) if (!blockedAt(lerp(t.x, px, f2), lerp(t.z, py, f2), t.y)) break;
          px = lerp(t.x, px, f2); py = lerp(t.z, py, f2); pz = t.y + 34 + (1 - f2) * 26; break;
        }
      }
    }
    pz = Math.max(pz, W.groundAt(px, py)[0] + 4, 4);
    const desired = new THREE.Vector3(px, pz, py);
    if (cam3.pos.lengthSq() === 0 || cam3.snap) { cam3.pos.copy(desired); cam3.snap = false; } else cam3.pos.lerp(desired, Math.min(1, dt * (c ? 9 : 10)));
    camera.position.copy(cam3.pos);
    if (cam.shake > 0.1) { camera.position.x += rand(-cam.shake, cam.shake) * 0.4; camera.position.y += rand(-cam.shake, cam.shake) * 0.4; }
    cam.shake *= Math.pow(0.02, dt);
    camera.lookAt(t.x, t.y + 4, t.z);
    cam3.fov += (fov - cam3.fov) * Math.min(1, dt * 3); camera.fov = cam3.fov; camera.updateProjectionMatrix();
    cam.x = t.x; cam.y = t.z;
  };
  R.snapCamera = () => {
    cam3.snap = true; cam3.tgt.set(P.x, (P.z || 0) + 15, P.y);
    if (P.car) { cam3.yaw = P.car.a; return; }
    // on foot: pick the facing whose camera line is clear of buildings (camera sits behind the hero, so test the opposite side)
    const z = (P.z || 0) + 30, base = cam3.yaw;
    for (let k = 0; k < 16; k++) {
      const yaw = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      let clear = true;
      for (const d of [36, 66]) if (blockedAt(P.x - Math.cos(yaw) * d, P.y - Math.sin(yaw) * d, z + 10)) clear = false;
      if (clear) { cam3.yaw = yaw; cam3.pitch = 0.28; return; }
    }
  };

  // ---------- frame ----------
  let lastT = 0, frameDt = 1 / 60;
  R.draw = function (time, opts = {}) {
    const dt = clamp(time - lastT, 0, 0.1); lastT = time; frameDt = dt;
    const n01 = lighting(G.state.hour, time);
    tagN = 0; tagPool.forEach((s) => (s.visible = false));
    updateCars(dt, n01, time);
    updatePeople(dt, time);
    updateMarkers(opts.markers || [], time);
    for (const [t, m] of tokenMeshes) { m.visible = !t.got && Math.abs(t.x - cam3.tgt.x) < 1500 && Math.abs(t.y - cam3.tgt.z) < 1500; if (m.visible) { m.rotation.y = time * 2 + t.x; m.position.y = 14 + Math.sin(time * 2 + t.y) * 3; } }
    // helicopter
    const h = G.heli; heliMesh.visible = !!h; heliMesh.userData.cone.visible = false; heliSpot.intensity = 0;
    if (h) {
      heliMesh.position.set(h.x, 230 + Math.sin(time * 0.8) * 8, h.y); heliMesh.rotation.set(0, -h.a, 0.08);
      heliMesh.userData.rotor.rotation.y = time * 30; heliMesh.userData.trotor.rotation.z = time * 40;
      heliMesh.userData.beacon.material.color.set(Math.floor(time * 4) % 2 ? 0xff2040 : 0x2080ff);
      const tg = P.car || P; heliSpot.position.copy(heliMesh.position); heliSpot.target.position.set(tg.x, 0, tg.y); heliSpot.intensity = 3200 * (0.3 + n01);
      const cone = heliMesh.userData.cone, top = heliMesh.position, bot = new THREE.Vector3(tg.x, 0, tg.y), mid = top.clone().add(bot).multiplyScalar(0.5);
      cone.visible = n01 > 0.2; cone.position.copy(mid); cone.scale.set(1, top.distanceTo(bot) / 260, 1); cone.lookAt(bot); cone.rotateX(-Math.PI / 2);
    }
    // fountain spray
    if (R.fountain && Math.random() < 0.6 && Math.abs(R.fountain.x - cam3.tgt.x) < 900 && Math.abs(R.fountain.y - cam3.tgt.z) < 900) G.spawnFx("spark", R.fountain.x + rand(-3, 3), R.fountain.y + rand(-3, 3), { z: 30, vx: rand(-40, 40), vy: rand(-40, 40), vz: rand(80, 140), size: 2.5, life: 0.9, max: 0.9, color: "#bfe9ff" });
    drawFx(); drawRain(dt);
    renderer.render(scene, camera);
    // screen-space overlays
    const vg = document.getElementById("vignette");
    if (vg) { const sp = P.car ? P.car.speed : Math.hypot(P.vx || 0, P.vy || 0); vg.style.opacity = clamp(0.55 + (sp - 380) / 600, 0.55, 1); }
    const fl = document.getElementById("flash"); if (fl) fl.style.opacity = G.state.flash || 0;
  };
})();
