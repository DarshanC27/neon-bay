// ---------- SPECTACLE: ambient animated world (ferris wheel, blimp, gulls, boats, balloons, searchlights, billboards, airliner, fireworks show) ----------
(function () {
  const W = G.world, T = G.TILE, P = G.player;
  const S = (G.spectacle = {});
  let scene, ready = false, fwLight, fwK = 0;
  const gulls = [], boats = [], balloons = [], lights = [], boards = [], beams = [];
  let wheel, blimp, blimpTex, blimpCtx, plane, planeT = 20;
  const CENTER = W.SIZE / 2;
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, o));
  const glowMat = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
  const dark = () => G.render.darkness(G.state.hour) / 0.68;

  S.init = function () {
    scene = G.render.scene; if (!scene) return;
    fwLight = new THREE.PointLight(0xffffff, 0, 1400, 1.4); scene.add(fwLight);
    buildWheel(); buildBlimp(); buildGulls(); buildBoats(); buildBalloons(); buildSearchlights(); buildBillboards(); buildPlane();
    ready = true;
  };

  // ---------- ferris wheel on Sunset Beach ----------
  function buildWheel() {
    const g = new THREE.Group(); g.position.set(92.3 * T, 0, 30 * T); scene.add(g);
    const steel = mat("#d9dde6", { metalness: 0.7, roughness: 0.3 });
    for (const z of [-26, 26]) for (const s of [-1, 1]) { // A-frame legs
      const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 200, 6), steel); leg.position.set(0, 95, z); leg.rotation.x = 0; leg.rotation.z = 0; leg.rotation.y = 0;
      leg.position.x = s * 40; leg.rotation.z = -s * 0.2; g.add(leg);
    }
    const hub = new THREE.Group(); hub.position.set(0, 190, 0); g.add(hub);
    const R = 150, N = 16;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 3.5, 8, 72), steel); rim.rotation.y = Math.PI / 2; hub.add(rim);
    const rim2 = rim.clone(); rim2.scale.setScalar(0.62); hub.add(rim2);
    const gondolas = [], bulbs = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(2.5, R, 2.5), steel); sp.position.set(0, Math.sin(a) * R / 2, Math.cos(a) * R / 2); sp.rotation.x = -a + Math.PI / 2; hub.add(sp);
      const gd = new THREE.Group(); gd.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 18), mat(["#ff3df2", "#22d3ee", "#ffd60a", "#19f5a0"][k % 4])); cab.position.y = -14; gd.add(cab);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(15, 8, 4), mat("#ffffff")); roof.position.y = -1; roof.rotation.y = Math.PI / 4; gd.add(roof);
      hub.add(gd); gondolas.push(gd);
    }
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * TAU, b = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), glowMat(0xffffff));
      b.position.set(4, Math.sin(a) * R, Math.cos(a) * R); hub.add(b); bulbs.push(b);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(130, 32), new THREE.MeshBasicMaterial({ map: textTex("BAY EYE", "#ff3df2"), transparent: true, toneMapped: false }));
    sign.position.set(-46, 22, 0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    wheel = { g, hub, gondolas, bulbs };
  }
  function textTex(text, color, w = 512, h = 128) {
    const [c, g] = canvas(w, h);
    g.fillStyle = "rgba(8,8,20,0.85)"; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 24); g.fill();
    g.font = "900 78px Bahnschrift, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = color; g.shadowBlur = 26; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4); g.shadowBlur = 0; g.fillStyle = "#fff"; g.globalAlpha = 0.5; g.fillText(text, w / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  // ---------- neon blimp with an animated LED sign ----------
  function buildBlimp() {
    const g = new THREE.Group(); scene.add(g);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat("#e9ecef", { roughness: 0.4 })); body.scale.set(190, 52, 52); g.add(body);
    for (const [y, z, rx] of [[34, 0, 0], [-34, 0, 0], [0, 34, Math.PI / 2], [0, -34, Math.PI / 2]]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(46, 30, 3), mat("#c77dff")); fin.position.set(-170, y, z); fin.rotation.x = rx; g.add(fin); }
    const gond = new THREE.Mesh(new THREE.BoxGeometry(50, 14, 18), mat("#2b2d42")); gond.position.set(10, -56, 0); g.add(gond);
    [blimpTex, blimpCtx] = (() => { const [c, ctx] = canvas(1024, 192); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return [t, ctx]; })();
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(250, 46), new THREE.MeshBasicMaterial({ map: blimpTex, toneMapped: false, side: THREE.DoubleSide })); p.position.set(0, 0, s * 53); if (s < 0) p.rotation.y = Math.PI; g.add(p); }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), glowMat(0xff2040)); beacon.position.set(0, 54, 0); g.add(beacon);
    blimp = { g, beacon, t: 0, msg: 0 };
  }
  const ADS = ["★ WELCOME TO NEON BAY ★", "NEON COLA · TASTE THE GLOW", "RIDEBAY · DRIVE & EARN", "TURBO MOTORS · 0% APR", "BAY EYE · RIDE THE SKY", "WHACK 2026 ★ WARWICK", "VINCE'S VELVET · OPEN LATE"];
  function paintBlimp(t) {
    const g = blimpCtx, w = 1024, h = 192;
    g.fillStyle = "#05060f"; g.fillRect(0, 0, w, h);
    const msg = ADS[Math.floor(t / 6) % ADS.length], hue = (t * 40) % 360;
    g.font = "900 104px Bahnschrift, sans-serif"; g.textBaseline = "middle";
    const tw = g.measureText(msg).width, x = w - ((t * 220) % (tw + w));
    g.shadowColor = `hsl(${hue},100%,60%)`; g.shadowBlur = 30; g.fillStyle = `hsl(${hue},100%,65%)`; g.fillText(msg, x, h / 2 + 6);
    g.shadowBlur = 0; g.fillStyle = "rgba(0,0,0,0.35)"; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2); // LED scanlines
    blimpTex.needsUpdate = true;
  }

  // ---------- seagulls ----------
  function buildGulls() {
    const wingGeo = new THREE.PlaneGeometry(14, 5); wingGeo.translate(7, 0, 0);
    const wm = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, side: THREE.DoubleSide, roughness: 0.8 }), bm = mat("#e9ecef");
    const centers = [[90 * T, 20 * T], [90 * T, 70 * T], [48 * T, 93 * T], [30 * T, 46 * T]];
    for (let k = 0; k < 28; k++) {
      const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 3), bm); g.add(body);
      const l = new THREE.Mesh(wingGeo, wm), r = new THREE.Mesh(wingGeo, wm); l.rotation.x = -Math.PI / 2; r.rotation.x = -Math.PI / 2; r.rotation.y = Math.PI;
      const lw = new THREE.Group(), rw = new THREE.Group(); lw.add(l); rw.add(r); lw.position.z = 1.5; rw.position.z = -1.5; g.add(lw, rw);
      const c = centers[k % centers.length];
      gulls.push({ g, lw, rw, cx: c[0] + rand(-200, 200), cy: c[1] + rand(-200, 200), r: rand(90, 260), h: rand(110, 230), sp: rand(0.25, 0.5) * (Math.random() < 0.5 ? 1 : -1), ph: rand(TAU), flap: rand(8, 12) });
      scene.add(g);
    }
  }

  // ---------- boats circling the island ----------
  function buildBoats() {
    const cols = ["#ffffff", "#e63946", "#ffd60a", "#2a9d8f", "#f72585", "#3a86ff"];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(80, 12, 26), mat(cols[k % cols.length])); hull.position.y = 4; g.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(13, 30, 4), mat(cols[k % cols.length])); bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(54, 4, 0); g.add(bow);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 18), mat("#f1f1f1")); cabin.position.set(-6, 17, 0); g.add(cabin);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(31, 5, 19), new THREE.MeshStandardMaterial({ color: 0x1b2a3a, emissive: 0xffd27a, emissiveIntensity: 0 })); glass.position.set(-6, 19, 0); g.add(glass);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 30, 6), mat("#999")); mast.position.set(-6, 39, 0); g.add(mast);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), glowMat(k % 2 ? 0x19f5a0 : 0xff4d6d)); lamp.position.set(-6, 55, 0); g.add(lamp);
      scene.add(g);
      boats.push({ g, glass, lamp, ang: (k / 7) * TAU, sp: rand(0.012, 0.022) * (k % 2 ? 1 : -1), rx: CENTER + 3600 + rand(-200, 200), ry: CENTER + 3600 + rand(-200, 200) });
    }
  }

  // ---------- hot air balloons ----------
  function buildBalloons() {
    const stripes = [["#ff3df2", "#ffd60a"], ["#22d3ee", "#ffffff"], ["#ff7b00", "#c1121f"], ["#19f5a0", "#3a0ca3"]];
    stripes.forEach(([a, b], k) => {
      const [c, g] = canvas(256, 128);
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, 128); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(48, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 })); env.scale.y = 1.2; grp.add(env);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 16), mat("#8d5a3b")); basket.position.y = -80; grp.add(basket);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), glowMat(0xffa028)); flame.position.y = -66; grp.add(flame);
      for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 4), mat("#333")); rope.position.set(x, -62, z); grp.add(rope); }
      scene.add(grp);
      balloons.push({ g: grp, flame, x: [22, 76, 52, 30][k] * T, y: [18, 26, 62, 76][k] * T, h: rand(320, 520), ph: rand(TAU), drift: rand(6, 14) });
    });
  }

  // ---------- searchlights at the central plaza ----------
  function buildSearchlights() {
    const [c, g] = canvas(64, 256); const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    const plaza = W.decor.find((d) => d.type === "fountain") || { x: CENTER, y: CENTER };
    const cols = [0x22d3ee, 0xff3df2, 0xffd60a, 0xc77dff];
    for (let k = 0; k < 4; k++) {
      const pivot = new THREE.Group(); pivot.position.set(plaza.x + Math.cos(k * 1.57 + 0.78) * 230, 6, plaza.y + Math.sin(k * 1.57 + 0.78) * 230); scene.add(pivot);
      const geo = new THREE.CylinderGeometry(70, 6, 1400, 20, 1, true); geo.translate(0, 700, 0);
      const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: cols[k], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      pivot.add(cone);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 12, 12), mat("#222")); base.position.y = 0; pivot.add(base);
      beams.push({ pivot, cone, ph: k * 1.3 });
    }
  }

  // ---------- animated rooftop billboards ----------
  const BB = [
    { bg: ["#ff3df2", "#3a0ca3"], t1: "NEON COLA", t2: "taste the glow" }, { bg: ["#22d3ee", "#0b132b"], t1: "RIDEBAY", t2: "drive · earn · repeat" },
    { bg: ["#ffd60a", "#ff7b00"], t1: "TURBO MOTORS", t2: "0% APR · 0 questions" }, { bg: ["#19f5a0", "#06402b"], t1: "BAY EYE", t2: "ride the sky tonight" },
    { bg: ["#ef233c", "#2b0a14"], t1: "VOTE NOBODY", t2: "nobody cares" }, { bg: ["#c77dff", "#10002b"], t1: "NEON BITES", t2: "burgers at light speed" },
  ];
  function buildBillboards() {
    const tall = W.buildings.filter((b) => !b.poi && !b.house && !b.container && b.h3 > 160).sort((a, b) => b.h3 - a.h3).slice(0, 6);
    const poleM = mat("#333", { metalness: 0.6 });
    tall.forEach((b, k) => {
      const [c, g] = canvas(512, 224), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const grp = new THREE.Group(); grp.position.set(b.x + b.w / 2, b.h3, b.y + b.h / 2); grp.rotation.y = k % 2 ? 0 : Math.PI / 2; scene.add(grp);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(150, 66), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); board.position.y = 60; grp.add(board);
      for (const x of [-50, 50]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4), poleM); pole.position.set(x, 14, 0); grp.add(pole); }
      boards.push({ g, tex, ad: BB[k % BB.length], ph: k * 1.7 });
    });
  }
  function paintBoard(bd, t) {
    const g = bd.g, w = 512, h = 224, a = bd.ad, s = t + bd.ph;
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, a.bg[0]); gr.addColorStop(1, a.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.18; g.fillStyle = "#fff"; for (let i = 0; i < 6; i++) { const x = ((s * 90 + i * 110) % (w + 200)) - 100; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x - 40, h); g.lineTo(x - 80, h); g.fill(); }
    g.globalAlpha = 1; g.textAlign = "center"; g.textBaseline = "middle";
    const pop = 1 + Math.max(0, Math.sin(s * 3)) * 0.08;
    g.save(); g.translate(w / 2, h * 0.42); g.scale(pop, pop); g.font = "900 70px Bahnschrift, sans-serif"; g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeText(a.t1, 0, 0); g.fillStyle = "#fff"; g.fillText(a.t1, 0, 0); g.restore();
    g.font = "italic 30px Bahnschrift, sans-serif"; g.fillStyle = "rgba(255,255,255,0.9)"; g.fillText(a.t2, w / 2, h * 0.78);
    g.strokeStyle = Math.floor(s * 4) % 2 ? "#fff" : a.bg[0]; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    bd.tex.needsUpdate = true;
  }

  // ---------- airliner ----------
  function buildPlane() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 140, 12), mat("#f1f1f4")); body.rotation.z = Math.PI / 2; g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 160), mat("#d9dde6")); g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(22, 30, 2), mat("#c77dff")); tail.position.set(-62, 16, 0); g.add(tail);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 50), mat("#d9dde6")); stab.position.set(-62, 4, 0); g.add(stab);
    const red = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), glowMat(0xff2040)), grn = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), glowMat(0x19f5a0)), wht = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 6), glowMat(0xffffff));
    red.position.set(0, 0, -80); grn.position.set(0, 0, 80); wht.position.set(-70, 10, 0); g.add(red, grn, wht);
    g.visible = false; scene.add(g);
    plane = { g, wht, red, grn, x: 0, y: 0, a: 0, active: false };
  }

  // ---------- public effects ----------
  S.flash = function (x, y, z, color) { if (!fwLight) return; fwLight.position.set(x, z, y); fwLight.color.set(color); fwK = 1; };

  // ---------- per-frame ----------
  let paintT = 0, showT = 4;
  S.update = function (dt, time) {
    if (!ready) return;
    const n01 = dark();
    // ferris wheel
    wheel.hub.rotation.x = time * 0.12;
    for (const gd of wheel.gondolas) gd.rotation.x = -wheel.hub.rotation.x; // keep cabins upright
    wheel.bulbs.forEach((b, k) => { const on = n01 > 0.15 ? (Math.floor(time * 6 + k / 3) % 3 === 0 ? 1 : 0.35) : 0.15; b.material.color.setHSL(((k / 48) + time * 0.08) % 1, 1, 0.35 + on * 0.35); });
    // blimp
    const bt = time * 0.018; blimp.g.position.set(CENTER + Math.cos(bt) * 2100, 640 + Math.sin(time * 0.3) * 18, CENTER + Math.sin(bt) * 1700);
    blimp.g.rotation.y = -Math.atan2(Math.cos(bt) * 1700, -Math.sin(bt) * 2100) + Math.PI; // nose along the path
    blimp.beacon.material.color.set(Math.floor(time * 2) % 2 ? 0xff2040 : 0x330008);
    paintT -= dt;
    if (paintT <= 0) { paintT = 0.08; paintBlimp(time); for (const bd of boards) paintBoard(bd, time); }
    // gulls
    for (const q of gulls) {
      const a = q.ph + time * q.sp, x = q.cx + Math.cos(a) * q.r, y = q.cy + Math.sin(a) * q.r;
      q.g.position.set(x, q.h + Math.sin(time * 1.3 + q.ph) * 12, y); q.g.rotation.y = -(a + (q.sp > 0 ? Math.PI / 2 : -Math.PI / 2));
      const f = Math.sin(time * q.flap + q.ph) * 0.7; q.lw.rotation.x = f; q.rw.rotation.x = -f;
    }
    // boats + wakes
    const tg = G.cam3 ? G.cam3.tgt : { x: P.x, z: P.y };
    for (const b of boats) {
      b.ang += b.sp * dt; const x = CENTER + Math.cos(b.ang) * (b.rx - CENTER), y = CENTER + Math.sin(b.ang) * (b.ry - CENTER);
      const dx = -Math.sin(b.ang) * Math.sign(b.sp), dy = Math.cos(b.ang) * Math.sign(b.sp);
      b.g.position.set(x, Math.sin(time * 1.6 + b.ang * 10) * 2, y); b.g.rotation.y = -Math.atan2(dy, dx); b.g.rotation.z = Math.sin(time * 1.2 + b.ang * 7) * 0.05;
      b.glass.material.emissiveIntensity = n01 * 1.5;
      if (Math.random() < 0.5 && Math.abs(x - tg.x) < 1800 && Math.abs(y - tg.z) < 1800) G.spawnFx("smoke", x - dx * 50, y - dy * 50, { z: 2, vx: -dx * 30 + rand(-15, 15), vy: -dy * 30 + rand(-15, 15), vz: 2, size: 6, life: 1.6, max: 1.6, color: "#e8f6ff" });
    }
    // balloons
    for (const b of balloons) { b.g.position.set(b.x + Math.sin(time * 0.05 + b.ph) * 200, b.h + Math.sin(time * 0.4 + b.ph) * 20, b.y + Math.cos(time * 0.04 + b.ph) * 160); b.flame.visible = Math.sin(time * 1.7 + b.ph) > 0.2; }
    // searchlights (night only)
    for (const s of beams) { s.cone.material.opacity = n01 * 0.32; s.pivot.rotation.z = Math.sin(time * 0.35 + s.ph) * 0.45; s.pivot.rotation.x = Math.cos(time * 0.27 + s.ph * 1.7) * 0.4; s.pivot.visible = n01 > 0.12; }
    // airliner every so often
    planeT -= dt;
    if (!plane.active && planeT <= 0) { plane.active = true; plane.g.visible = true; const a = rand(TAU); plane.a = a + Math.PI; plane.x = CENTER + Math.cos(a) * 6000; plane.y = CENTER + Math.sin(a) * 6000; }
    if (plane.active) {
      plane.x += Math.cos(plane.a) * 260 * dt; plane.y += Math.sin(plane.a) * 260 * dt;
      plane.g.position.set(plane.x, 1500, plane.y); plane.g.rotation.y = -plane.a;
      const blink = Math.floor(time * 1.5) % 2; plane.wht.visible = blink; plane.red.visible = plane.grn.visible = true;
      if (dist(plane.x, plane.y, CENTER, CENTER) > 6500) { plane.active = false; plane.g.visible = false; planeT = rand(40, 90); }
    }
    // nightly fireworks show over the bay (21:00 - 23:30), plus fireworks light
    showT -= dt;
    const h = G.state.hour;
    if (G.state.started && h > 21 && h < 23.5 && showT <= 0) { showT = rand(1.2, 3); G.campaign.fireworks(rand(91, 99) * T, rand(10, 85) * T, randi(1, 3), 0); }
    G.campaign.updateFireworks(dt);
    fwK = Math.max(0, fwK - dt * 2.2); fwLight.intensity = fwK * 9000 * (0.4 + n01);
  };
})();
