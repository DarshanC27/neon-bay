// ---------- AGENTS: original tactical heroes with 3 abilities + an ultimate, agent select, ability HUD, 3D ability effects ----------
(function () {
  const A = (G.agents = {}), P = G.player, HZ = G.heroes;
  const ULT_MAX = 6;
  // sim (x, y, z-up) -> three (x, z, y)
  const V3 = (x, y, z) => new THREE.Vector3(x, z, y);

  const ROSTER = (A.ROSTER = {
    blaze: { name: "BLAZE", role: "Duelist", color: "#ff6b2b", tag: "Burns the street down and dashes through the flames.",
      stats: { walk: 92, run: 215, jump: 225, accel: 12, climb: 110, fallSafe: 220, str: 1.5 },
      outfit: { style: "agent", skin: "#e0ac69", shirt: "#4a1f12", pants: "#1d1d24", shoes: "#111", vest: "#2a1712", accent: "#ff6b2b", hair: "#ff9a3c", hairStyle: "spiky", gloves: "#1b1110" },
      ab: [["🔥", "FIREWALL", 11, "A wall of fire that burns anyone who crosses it"], ["💨", "HEAT DASH", 5, "Dash forward through enemies, leaving a fire trail"], ["✨", "FLASHPOINT", 9, "A flare that blinds every enemy that sees it"], ["☄️", "INFERNO", 0, "Leap and slam: a ring of fire knocks out everything nearby"]] },
    volt: { name: "VOLT", role: "Duelist", color: "#3df2ff", tag: "Teleports through fights and chains lightning between targets.",
      stats: { walk: 96, run: 230, jump: 235, accel: 13, climb: 100, fallSafe: 200, str: 1.3 },
      outfit: { style: "agent", skin: "#8d5524", shirt: "#10263a", pants: "#141a24", shoes: "#0c0f14", vest: "#1a2b3d", accent: "#3df2ff", hair: "#111", hairStyle: "helmet", visor: true, pad: "#3df2ff", gloves: "#0f1720" },
      ab: [["⚡", "BLINK", 4, "Teleport straight ahead"], ["🌩️", "ARC CHAIN", 7, "Lightning jumps between up to five enemies"], ["🌀", "STATIC FIELD", 13, "A charged zone that slows and shocks enemies"], ["⛈️", "THUNDERSTRIKE", 0, "Call lightning down on every enemy around you"]] },
    haze: { name: "HAZE", role: "Controller", color: "#b07cff", tag: "Owns the battlefield with smoke, poison and stealth.",
      stats: { walk: 86, run: 200, jump: 215, accel: 12, climb: 120, fallSafe: 200, str: 1.2 },
      outfit: { style: "agent", skin: "#c68642", shirt: "#241838", pants: "#18121f", shoes: "#0d0a12", vest: "#2e1f47", accent: "#b07cff", hairStyle: "hood", mask: true, eyes: "#d9b8ff", gloves: "#140f1c", padSide: -1 },
      ab: [["☁️", "SMOKE DOME", 9, "A smoke dome that dazes enemies and hides you from the cops"], ["☠️", "TOXIC ORB", 8, "Lob an orb that bursts into a poison cloud"], ["👻", "PHASE STEP", 14, "Turn invisible: enemies lose track of you"], ["🌑", "NIGHT VEIL", 0, "Wipe your wanted level and daze every enemy nearby"]] },
    aegis: { name: "AEGIS", role: "Sentinel", color: "#19f5a0", tag: "Builds turrets and walls, and patches up the squad.",
      stats: { walk: 84, run: 195, jump: 205, accel: 11, climb: 95, fallSafe: 180, str: 1.4 },
      outfit: { style: "agent", skin: "#f1c27d", shirt: "#e8ecef", pants: "#2b3036", shoes: "#1a1d21", vest: "#3a4149", accent: "#19f5a0", hair: "#3b2416", hairStyle: "bun", eyes: "#19f5a0", gloves: "#2b3036" },
      ab: [["🛰️", "SENTRY", 18, "Deploy a turret that shoots nearby enemies"], ["🧱", "BARRIER", 11, "An energy wall that throws enemies back"], ["💚", "NANO HEAL", 14, "Heal yourself fast (also patches up your car)"], ["🔒", "LOCKDOWN", 0, "A huge field that locks every enemy in place"]] },
    echo: { name: "ECHO", role: "Initiator", color: "#ffd60a", tag: "Scouts the area, then grapples onto the rooftops.",
      stats: { walk: 92, run: 220, jump: 230, accel: 12, climb: 130, fallSafe: 260, str: 1.3 },
      outfit: { style: "agent", skin: "#e0ac69", shirt: "#3a3214", pants: "#1f1d17", shoes: "#14130f", vest: "#4a3f12", accent: "#ffd60a", hair: "#f4f1de", hairStyle: "long", gloves: "#1f1d17" },
      ab: [["📡", "RECON PULSE", 11, "Reveal every enemy in a huge radius"], ["🎯", "SHOCK DART", 6, "A dart that bursts in an electric blast"], ["🪝", "GRAPPLE", 5, "Zip up onto the nearest rooftop ahead"], ["🏹", "HUNTER'S SIGHT", 0, "Slow time and auto-fire at every target in sight"]] },
  });
  A.ORDER = Object.keys(ROSTER);
  for (const id of A.ORDER) {
    const r = ROSTER[id];
    HZ.LIST[id] = Object.assign({ name: r.name, color: r.color, agent: true, outfit: r.outfit,
      hint: r.ab.map((a, i) => `${["1", "2", "3", "ULT"][i]} ${a[1]}`).join(" · ") }, r.stats);
  }
  A.isAgent = () => !!ROSTER[P.hero];
  const st = (A.state = { cd: [0, 0, 0], ult: 0, kos: 0, ultT: 0 });

  // ---------- world objects ----------
  const objs = []; // {kind, x, y, z, t, life, ...}
  let scene = null;
  const mat = (color, op = 0.35) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  function addMesh(o, mesh) { o.mesh = mesh; scene.add(mesh); return o; }
  function beam(pts, color, life = 0.22, width = 1) {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => V3(p[0], p[1], p[2])));
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
    scene.add(m); objs.push({ kind: "beam", t: 0, life, mesh: m });
  }
  function bolt(x1, y1, z1, x2, y2, z2, color) {
    const pts = []; const n = 9;
    for (let i = 0; i <= n; i++) { const f = i / n, j = i === 0 || i === n ? 0 : 9; pts.push([lerp(x1, x2, f) + rand(-j, j), lerp(y1, y2, f) + rand(-j, j), lerp(z1, z2, f) + rand(-j, j)]); }
    beam(pts, color, 0.25); beam(pts.map((p) => [p[0] + rand(-2, 2), p[1] + rand(-2, 2), p[2] + rand(-2, 2)]), "#ffffff", 0.12);
  }
  const alive = (r, x = P.x, y = P.y) => G.gang.filter((e) => e.state !== "down" && dist(e.x, e.y, x, y) < r);
  const hurt = (e, dmg, fx, fy, knock = 200, lift = 60) => { HZ.hurtEnemy(e, dmg, knock, fx, fy, lift); e.aware = true; };
  const burst = (x, y, z, n, colors, sp = 200, life = 0.7, size = 3) => { for (let k = 0; k < n; k++) { const a = rand(TAU), s = rand(sp * 0.3, sp); G.spawnFx("spark", x, y, { z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-60, sp * 0.8), size: rand(size * 0.6, size * 1.3), life, max: life, color: pick(colors) }); } };
  const aim = () => (document.pointerLockElement || (G.time - G.cam3.lastMouse < 2) ? G.cam3.yaw : P.a);

  // ---------- abilities ----------
  const FX = {
    blaze: [
      () => { // FIREWALL: a 200-long wall along the aim direction
        const a = aim(), x0 = P.x + Math.cos(a) * 20, y0 = P.y + Math.sin(a) * 20, len = 220, x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 30, 3), mat("#ff6b2b", 0.45)); m.position.copy(V3((x0 + x1) / 2, (y0 + y1) / 2, 15)); m.rotation.y = -a;
        objs.push(addMesh({ kind: "firewall", x0, y0, x1, y1, t: 0, life: 6, hit: new Map() }, m)); G.audio.sfx("whoosh"); G.shake(3);
      },
      () => { // HEAT DASH
        const a = aim(); P.a = a; P.vx = Math.cos(a) * 640; P.vy = Math.sin(a) * 640; P.act = { name: "dash", t: 0, dur: 0.34, hits: new Set() };
        objs.push({ kind: "trail", t: 0, life: 0.34, color: ["#ff6b2b", "#ffb703", "#ff3d00"] }); G.audio.sfx("stunt");
      },
      () => { // FLASHPOINT
        const a = aim(), o = { kind: "flare", x: P.x, y: P.y, z: 20, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, vz: 120, t: 0, life: 0.6 };
        const m = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff6c2" })); objs.push(addMesh(o, m)); G.audio.sfx("whoosh");
      },
      () => { // INFERNO
        ultSplash("INFERNO"); P.mode = "air"; P.vz = 330; P.vx *= 0.2; P.vy *= 0.2;
        setTimeout(() => { objs.push(ring(P.x, P.y, "#ff6b2b", 320, 0.9)); for (const e of alive(320)) hurt(e, 140, P.x, P.y, 420, 220); burst(P.x, P.y, 4, 120, ["#ff6b2b", "#ffb703", "#ff3d00", "#fff"], 380, 1.1, 4); G.shake(18); G.audio.sfx("boom"); }, 650);
      },
    ],
    volt: [
      () => { // BLINK
        const a = aim(); let d = 180, x, y;
        for (; d > 20; d -= 10) { x = P.x + Math.cos(a) * d; y = P.y + Math.sin(a) * d; if (!G.world.pointBlocked(x, y, 12)) break; }
        burst(P.x, P.y, 12, 30, ["#3df2ff", "#ffffff"], 160, 0.5); bolt(P.x, P.y, 12, x, y, 12, "#3df2ff");
        P.x = x; P.y = y; P.a = a; burst(x, y, 12, 30, ["#3df2ff", "#ffffff"], 160, 0.5); G.audio.sfx("whoosh");
      },
      () => { // ARC CHAIN
        let from = { x: P.x, y: P.y, z: 14 }; const hit = new Set();
        for (let k = 0; k < 5; k++) {
          const c = alive(k ? 200 : 320, from.x, from.y).filter((e) => !hit.has(e)).sort((p, q) => dist(p.x, p.y, from.x, from.y) - dist(q.x, q.y, from.x, from.y))[0];
          if (!c) break; hit.add(c); bolt(from.x, from.y, from.z, c.x, c.y, c.z + 12, "#3df2ff"); hurt(c, 45, from.x, from.y, 120, 40); c.state = c.state === "down" ? "down" : "dazed"; c.t = 1.4;
          from = { x: c.x, y: c.y, z: c.z + 12 };
        }
        if (!hit.size) bolt(P.x, P.y, 14, P.x + Math.cos(aim()) * 200, P.y + Math.sin(aim()) * 200, 6, "#3df2ff");
        G.audio.sfx("crash", 0.4); G.shake(3);
      },
      () => { // STATIC FIELD
        objs.push(dome(P.x, P.y, 130, "#3df2ff", 6, "static"));
        G.audio.sfx("whoosh");
      },
      () => { // THUNDERSTRIKE
        ultSplash("THUNDERSTRIKE"); const list = alive(520).slice(0, 10);
        list.forEach((e, i) => setTimeout(() => { bolt(e.x, e.y, 500, e.x, e.y, e.z, "#9ff8ff"); hurt(e, 110, e.x + 1, e.y, 160, 200); burst(e.x, e.y, 4, 30, ["#3df2ff", "#fff"], 220); G.shake(8); G.audio.sfx("boom", 0.6); }, 150 + i * 160));
        if (!list.length) for (let i = 0; i < 6; i++) setTimeout(() => { const x = P.x + rand(-300, 300), y = P.y + rand(-300, 300); bolt(x, y, 500, x, y, 0, "#9ff8ff"); G.shake(5); }, i * 140);
      },
    ],
    haze: [
      () => { // SMOKE DOME
        const a = aim(); objs.push(dome(P.x + Math.cos(a) * 110, P.y + Math.sin(a) * 110, 115, "#7a5cc4", 10, "smoke")); G.audio.sfx("whoosh");
      },
      () => { // TOXIC ORB
        const a = aim(), o = { kind: "orb", x: P.x, y: P.y, z: 20, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, vz: 160, t: 0, life: 3 };
        objs.push(addMesh(o, new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), new THREE.MeshBasicMaterial({ color: "#9dff5c" })))); G.audio.sfx("whoosh");
      },
      () => { // PHASE STEP
        st.phase = 5; burst(P.x, P.y, 12, 50, ["#b07cff", "#e2d1ff"], 120, 0.8); G.audio.sfx("whoosh"); G.ui.toast("Phased: enemies can't see you for 5s", "#b07cff");
      },
      () => { // NIGHT VEIL
        ultSplash("NIGHT VEIL"); G.clearWanted && G.clearWanted(); for (const e of alive(600)) { e.state = "dazed"; e.t = 6; e.aware = false; }
        objs.push(ring(P.x, P.y, "#b07cff", 600, 1.4)); st.veil = 2.5; G.timeScale = 0.5; setTimeout(() => (G.timeScale = 1), 900); G.audio.sfx("boom", 0.5);
      },
    ],
    aegis: [
      () => { // SENTRY
        const a = aim(), x = P.x + Math.cos(a) * 30, y = P.y + Math.sin(a) * 30, g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 8, 8), new THREE.MeshStandardMaterial({ color: "#3a4149", metalness: 0.6, roughness: 0.4 })); base.position.y = 4; g.add(base);
        const head = new THREE.Group(); head.position.y = 11; g.add(head);
        head.add(new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), new THREE.MeshStandardMaterial({ color: "#e8ecef", metalness: 0.4, roughness: 0.4 })));
        const eye = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshBasicMaterial({ color: "#19f5a0" })); eye.position.x = 4.8; head.add(eye);
        g.position.copy(V3(x, y, G.world.groundAt(x, y)[0] || 0));
        objs.push(addMesh({ kind: "sentry", x, y, z: (G.world.groundAt(x, y)[0] || 0) + 11, t: 0, life: 16, fire: 0, head }, g)); G.audio.sfx("job");
      },
      () => { // BARRIER
        const a = aim(), cx = P.x + Math.cos(a) * 60, cy = P.y + Math.sin(a) * 60, n = a + Math.PI / 2, len = 170;
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 34, 2.5), mat("#19f5a0", 0.4)); m.position.copy(V3(cx, cy, 17)); m.rotation.y = -n;
        objs.push(addMesh({ kind: "barrier", x0: cx - Math.cos(n) * len / 2, y0: cy - Math.sin(n) * len / 2, x1: cx + Math.cos(n) * len / 2, y1: cy + Math.sin(n) * len / 2, nx: Math.cos(a), ny: Math.sin(a), t: 0, life: 8 }, m)); G.audio.sfx("job");
      },
      () => { // NANO HEAL
        st.heal = 3; objs.push(ring(P.x, P.y, "#19f5a0", 70, 0.8)); G.audio.sfx("cash");
        if (P.car) P.car.hp = Math.min(P.car.s.hp, P.car.hp + P.car.s.hp * 0.6);
      },
      () => { // LOCKDOWN
        ultSplash("LOCKDOWN"); const d = dome(P.x, P.y, 20, "#19f5a0", 2.2, "lock"); d.grow = 360; objs.push(d); G.audio.sfx("stunt");
        setTimeout(() => { for (const e of alive(360, d.x, d.y)) { e.state = "webbed"; e.t = 8; e.hp -= 40; e.aware = true; G.floatText(e.x, e.y, "LOCKED", "#19f5a0"); if (e.hp <= 0) HZ.knockOut(e); } G.shake(12); G.audio.sfx("boom"); }, 1500);
      },
    ],
    echo: [
      () => { // RECON PULSE
        objs.push(ring(P.x, P.y, "#ffd60a", 700, 1.2)); let n = 0;
        for (const e of alive(700)) { e.revealed = 9; n++; }
        G.ui.toast(n ? `Recon: ${n} enemies revealed` : "Recon: area clear", "#ffd60a"); G.audio.sfx("job");
      },
      () => { // SHOCK DART
        const a = aim(), o = { kind: "dart", x: P.x, y: P.y, z: 16, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, vz: 60, t: 0, life: 1.6, bounces: 1 };
        objs.push(addMesh(o, new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 6), new THREE.MeshBasicMaterial({ color: "#ffd60a" })))); G.audio.sfx("whoosh");
      },
      () => { // GRAPPLE: find the tallest roof ahead and zip onto it
        const a = aim(); let best = null;
        for (let d = 40; d <= 340; d += 12) { const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d, [g] = G.world.groundAt(x, y); if (g > (P.z || 0) + 15 && (!best || g > best.g)) best = { x, y, g, d }; }
        if (!best) { const x = P.x + Math.cos(a) * 160, y = P.y + Math.sin(a) * 160; best = { x, y, g: 0, d: 160 }; }
        const tx = best.x + Math.cos(a) * 14, ty = best.y + Math.sin(a) * 14, T = 0.75, dz = best.g + 30 - (P.z || 0);
        P.mode = "air"; P.vx = (tx - P.x) / T; P.vy = (ty - P.y) / T; P.vz = dz / T + 0.5 * 520 * T; P.airCap = Math.hypot(P.vx, P.vy) + 10; P.a = a;
        beam([[P.x, P.y, (P.z || 0) + 14], [tx, ty, best.g + 2]], "#ffd60a", 0.6); G.audio.sfx("whoosh");
      },
      () => { // HUNTER'S SIGHT
        ultSplash("HUNTER'S SIGHT"); st.hunt = 6; st.huntT = 0; G.timeScale = 0.4;
      },
    ],
  };
  function ring(x, y, color, R, life) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), mat(color, 0.8)); m.rotation.x = -Math.PI / 2; m.position.copy(V3(x, y, 3));
    return addMesh({ kind: "ring", x, y, R, t: 0, life }, m);
  }
  function dome(x, y, r, color, life, type) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, TAU, 0, Math.PI / 2), mat(color, type === "smoke" ? 0.55 : 0.28));
    if (type === "smoke") { m.material.blending = THREE.NormalBlending; m.material.color.set("#4b3c6e"); }
    m.position.copy(V3(x, y, G.world.groundAt(x, y)[0] || 0)); m.scale.setScalar(0.01);
    return addMesh({ kind: "dome", type, x, y, r, t: 0, life }, m);
  }
  function segDist(px, py, o) { const vx = o.x1 - o.x0, vy = o.y1 - o.y0, l2 = vx * vx + vy * vy, t = clamp(((px - o.x0) * vx + (py - o.y0) * vy) / l2, 0, 1); return dist(px, py, o.x0 + vx * t, o.y0 + vy * t); }

  // ---------- update ----------
  A.update = function (dt) {
    if (!scene) return;
    const agent = A.isAgent();
    for (let i = 0; i < 3; i++) st.cd[i] = Math.max(0, st.cd[i] - dt);
    // ult charge: knockouts + slow passive trickle
    const kos = G.stats.kos || 0; if (kos > st.kos) { if (agent) st.ult = Math.min(ULT_MAX, st.ult + (kos - st.kos)); st.kos = kos; }
    st.ultT += dt; if (st.ultT > 25) { st.ultT = 0; if (agent) st.ult = Math.min(ULT_MAX, st.ult + 1); }
    if (agent && G.state.mode === "play" && !P.car && P.stun <= 0) {
      const R = ROSTER[P.hero], keys = ["A_ab1", "A_ab2", "A_ab3"];
      for (let i = 0; i < 3; i++) if (Input.hit(keys[i])) {
        if (st.cd[i] > 0) { G.audio.sfx("fail"); flashSlot(i, true); continue; }
        FX[P.hero][i](); st.cd[i] = R.ab[i][2]; flashSlot(i); G.controls.rumble(0.4, 90);
        P.act = P.act && P.act.name === "dash" ? P.act : { name: "shoot", t: 0, dur: 0.25 };
      }
      if (Input.hit("A_ult")) {
        if (st.ult < ULT_MAX) { G.audio.sfx("fail"); G.ui.toast(`Ultimate ${st.ult}/${ULT_MAX} · earn points with takedowns`, R.color); }
        else { st.ult = 0; FX[P.hero][3](); flashSlot(3); G.controls.rumble(1, 400); G.stats.ults = (G.stats.ults || 0) + 1; }
      }
    } else if (agent && P.car && Input.hit("A_ab3") && P.hero === "aegis" && st.cd[2] <= 0) { FX.aegis[2](); st.cd[2] = ROSTER.aegis.ab[2][2]; }
    // status effects on the player
    if (st.heal > 0) { st.heal -= dt; P.hp = Math.min(100, P.hp + 22 * dt); if (Math.random() < 0.5) G.spawnFx("spark", P.x + rand(-8, 8), P.y + rand(-8, 8), { z: rand(0, 6), vz: 50, vx: 0, vy: 0, size: 2.5, life: 0.7, max: 0.7, color: "#19f5a0" }); }
    if (st.phase > 0) { st.phase -= dt; for (const e of G.gang) if (e.state === "chase") { e.state = "idle"; e.aware = false; } if (Math.random() < 0.6) G.spawnFx("spark", P.x + rand(-7, 7), P.y + rand(-7, 7), { z: rand(0, 20), vz: 15, vx: 0, vy: 0, size: 2, life: 0.5, max: 0.5, color: "#c9a7ff" }); }
    if (st.veil > 0) st.veil -= dt;
    if (st.hunt > 0) {
      st.hunt -= dt / Math.max(0.2, G.timeScale); st.huntT -= dt;
      if (st.huntT <= 0) { st.huntT = 0.12; const t = alive(520).sort((p, q) => dist(p.x, p.y, P.x, P.y) - dist(q.x, q.y, P.x, P.y))[0]; if (t) { beam([[P.x, P.y, (P.z || 0) + 16], [t.x, t.y, t.z + 12]], "#ffd60a", 0.2); hurt(t, 60, P.x, P.y, 220, 80); burst(t.x, t.y, t.z + 10, 14, ["#ffd60a", "#fff"], 160, 0.4); G.audio.sfx("crash", 0.25); } }
      if (st.hunt <= 0) G.timeScale = 1;
    }
    if (P.act && P.act.name === "dash" && P.hero === "blaze") for (let k = 0; k < 3; k++) G.spawnFx("spark", P.x + rand(-6, 6), P.y + rand(-6, 6), { z: rand(1, 10), vz: rand(30, 90), vx: 0, vy: 0, size: rand(2.5, 4), life: 0.8, max: 0.8, color: pick(["#ff6b2b", "#ffb703", "#ff3d00"]) });
    for (const e of G.gang) if (e.revealed > 0) e.revealed -= dt;
    // objects
    for (const o of objs) {
      o.t += dt; const k = o.t / o.life;
      if (o.kind === "beam") o.mesh.material.opacity = 1 - k;
      else if (o.kind === "ring") { const s = o.R * Math.min(1, k * 1.6); o.mesh.scale.set(s, s, s); o.mesh.material.opacity = 0.9 * (1 - k); }
      else if (o.kind === "firewall") {
        o.mesh.material.opacity = 0.35 + Math.sin(o.t * 30) * 0.08; o.mesh.scale.y = 0.8 + Math.sin(o.t * 17) * 0.15;
        for (let n = 0; n < 4; n++) { const f = Math.random(); G.spawnFx("spark", lerp(o.x0, o.x1, f), lerp(o.y0, o.y1, f), { z: rand(0, 6), vz: rand(60, 140), vx: rand(-15, 15), vy: rand(-15, 15), size: rand(3, 5), life: rand(0.5, 0.9), max: 0.9, color: pick(["#ff6b2b", "#ffb703", "#ff3d00", "#ffd166"]) }); }
        for (const e of G.gang) if (e.state !== "down" && segDist(e.x, e.y, o) < 14) { const last = o.hit.get(e) || -9; if (o.t - last > 0.5) { o.hit.set(e, o.t); hurt(e, 22, e.x - 1, e.y, 90, 40); G.floatText(e.x, e.y, "BURN", "#ff6b2b"); } }
      } else if (o.kind === "trail") { /* handled above */ }
      else if (o.kind === "flare" || o.kind === "orb" || o.kind === "dart") {
        o.vz -= (o.kind === "dart" ? 200 : 420) * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        const [g] = G.world.groundAt(o.x, o.y), hitWall = G.world.pointBlocked(o.x, o.y) && o.z < g;
        o.mesh.position.copy(V3(o.x, o.y, o.z)); if (o.kind === "dart") o.mesh.rotation.z = -Math.PI / 2;
        if (o.kind === "dart") { G.spawnFx("spark", o.x, o.y, { z: o.z, vx: 0, vy: 0, size: 2, life: 0.3, max: 0.3, color: "#ffe680" }); if (alive(16, o.x, o.y).length) o.t = o.life; }
        if (o.kind === "dart" && (o.z <= g || hitWall) && o.bounces > 0 && o.t < o.life) { o.bounces--; o.vz = Math.abs(o.vz) * 0.6; if (hitWall) { o.vx *= -0.6; o.vy *= -0.6; } o.z = g + 1; }
        if (o.kind === "flare" && o.t >= 0.6) {
          o.t = o.life; burst(o.x, o.y, o.z, 40, ["#ffffff", "#fff6c2"], 260, 0.4, 4); G.spectacle && G.spectacle.flash && G.spectacle.flash(o.x, o.y, o.z, "#ffffff");
          let n = 0; for (const e of alive(190, o.x, o.y)) { e.state = "dazed"; e.t = 3.2; e.aware = true; n++; G.floatText(e.x, e.y, "BLINDED", "#fff6c2"); }
          if (dist(o.x, o.y, P.x, P.y) < 120) A.whiteout(0.35);
        }
        if ((o.kind === "orb" && (o.z <= g || hitWall)) || (o.kind === "orb" && o.t >= o.life)) { o.t = o.life; objs.push(Object.assign(dome(o.x, o.y, 90, "#9dff5c", 8, "toxic"), {})); }
        if (o.kind === "dart" && o.t >= o.life) { burst(o.x, o.y, o.z, 50, ["#ffd60a", "#fff", "#ffe680"], 300, 0.5); objs.push(ring(o.x, o.y, "#ffd60a", 80, 0.4)); for (const e of alive(80, o.x, o.y)) hurt(e, 55, o.x, o.y, 260, 120); G.shake(5); G.audio.sfx("boom", 0.4); }
      } else if (o.kind === "dome") {
        const s = o.grow ? lerp(20, o.grow, Math.min(1, o.t / 1.5)) : o.r * Math.min(1, o.t * 4), fade = o.t > o.life - 0.6 ? (o.life - o.t) / 0.6 : 1;
        o.mesh.scale.set(s, s * (o.type === "smoke" ? 0.85 : 0.7), s); o.mesh.material.opacity = (o.type === "smoke" ? 0.6 : 0.25) * fade + (o.type === "static" ? Math.sin(o.t * 40) * 0.05 : 0);
        if (o.type === "smoke" && Math.random() < 0.6) G.spawnFx("smoke", o.x + rand(-o.r, o.r) * 0.7, o.y + rand(-o.r, o.r) * 0.7, { z: rand(0, 50), vz: rand(2, 12), vx: rand(-10, 10), vy: rand(-10, 10), size: rand(14, 24), life: 2, max: 2, color: pick(["#5d4a85", "#3f325c", "#6c5a92"]) });
        if (o.type === "smoke") { for (const e of alive(o.r, o.x, o.y)) if (e.state !== "dazed") { e.state = "dazed"; e.t = 1.2; } if (dist(P.x, P.y, o.x, o.y) < o.r && G.wanted.stars) { o.hide = (o.hide || 0) + dt; if (o.hide > 2.5) { o.hide = 0; G.wanted.stars = Math.max(0, G.wanted.stars - 1); if (!G.wanted.stars) G.clearWanted(); G.ui.toast("The smoke hides you from the cops", "#b07cff"); } } }
        if (o.type === "static") { if (Math.random() < 0.4) { const a = rand(TAU), r = rand(0, o.r); bolt(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, 2, o.x + Math.cos(a) * r + rand(-25, 25), o.y + Math.sin(a) * r + rand(-25, 25), rand(10, 40), "#3df2ff"); } for (const e of alive(o.r, o.x, o.y)) { e.vx *= 0.8; e.vy *= 0.8; o.acc = (o.acc || 0) + dt; if (o.acc > 0.5) { o.acc = 0; hurt(e, 10, o.x, o.y, 40, 20); } } }
        if (o.type === "toxic") { if (Math.random() < 0.7) G.spawnFx("smoke", o.x + rand(-o.r, o.r) * 0.6, o.y + rand(-o.r, o.r) * 0.6, { z: rand(0, 20), vz: rand(5, 18), vx: 0, vy: 0, size: rand(10, 18), life: 1.6, max: 1.6, color: pick(["#6fbf3a", "#9dff5c", "#4c8c2b"]) }); o.acc = (o.acc || 0) + dt; if (o.acc > 0.5) { o.acc = 0; for (const e of alive(o.r, o.x, o.y)) { hurt(e, 14, o.x, o.y, 20, 0); G.floatText(e.x, e.y, "POISON", "#9dff5c"); } } }
      } else if (o.kind === "sentry") {
        o.fire -= dt; const tgt = alive(280, o.x, o.y).sort((p, q) => dist(p.x, p.y, o.x, o.y) - dist(q.x, q.y, o.x, o.y))[0];
        if (tgt) { const a = Math.atan2(tgt.y - o.y, tgt.x - o.x); o.head.rotation.y = -a; if (o.fire <= 0) { o.fire = 0.45; beam([[o.x, o.y, o.z], [tgt.x, tgt.y, tgt.z + 12]], "#19f5a0", 0.15); hurt(tgt, 16, o.x, o.y, 120, 30); G.audio.sfx("click"); } }
        else o.head.rotation.y += dt * 1.5;
        if (o.t > o.life - 0.3) o.mesh.scale.setScalar(Math.max(0.01, (o.life - o.t) / 0.3));
      } else if (o.kind === "barrier") {
        o.mesh.material.opacity = 0.3 + Math.sin(o.t * 6) * 0.08;
        for (const e of G.gang) if (e.state !== "down" && segDist(e.x, e.y, o) < 16) { const side = Math.sign((e.x - o.x0) * o.nx + (e.y - o.y0) * o.ny) || 1; e.x += o.nx * side * 6; e.y += o.ny * side * 6; e.vx = o.nx * side * 260; e.vy = o.ny * side * 260; e.state = "stagger"; e.t = 0.5; }
      }
      if (o.t >= o.life) { o.dead = true; if (o.mesh) { scene.remove(o.mesh); o.mesh.traverse && o.mesh.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material.dispose) m.material.dispose(); }); } }
    }
    for (let i = objs.length - 1; i >= 0; i--) if (objs[i].dead) objs.splice(i, 1);
    updateReveal();
    updateHUD();
  };
  // a soft light in the hero's colour so suits read clearly at night
  let heroLight = null;
  A.light = function () {
    if (!heroLight) return;
    const h = HZ.LIST[P.hero], hr = G.state.hour, night = hr > 19.5 || hr < 6 ? 1 : hr > 17.5 ? (hr - 17.5) / 2 : hr < 7.5 ? (7.5 - hr) / 1.5 : 0;
    heroLight.color.set(h.color).lerp(new THREE.Color("#ffffff"), 0.45); heroLight.intensity = G.state.started && !P.car ? 1500 * night + 80 : 0;
    const cp = G.render.camera.position, hp = V3(P.x, P.y, (P.z || 0) + 14); heroLight.position.copy(hp).lerp(cp, Math.min(0.6, 30 / Math.max(1, hp.distanceTo(cp)))); heroLight.position.y += 14;
    document.body.classList.toggle("agentOn", hud.classList.contains("on"));
  };
  A.clear = () => { for (const o of objs) if (o.mesh) scene.remove(o.mesh); objs.length = 0; };

  // revealed enemies: floating diamonds
  const diamonds = [];
  function updateReveal() {
    const list = G.gang.filter((e) => e.revealed > 0 && e.state !== "down");
    while (diamonds.length < list.length) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(4), new THREE.MeshBasicMaterial({ color: "#ff3355", transparent: true, opacity: 0.9, depthTest: false })); m.renderOrder = 999; scene.add(m); diamonds.push(m); }
    diamonds.forEach((m, i) => { const e = list[i]; m.visible = !!e; if (e) { m.position.copy(V3(e.x, e.y, e.z + 34 + Math.sin(G.time * 5 + i) * 2)); m.rotation.y = G.time * 3; } });
  }

  // ---------- HUD ----------
  let hud = null, slots = [], ultSplashEl = null, whiteEl = null, lastHero = null;
  function flashSlot(i, bad) { const s = slots[i]; if (!s) return; s.classList.remove("fire", "bad"); void s.offsetWidth; s.classList.add(bad ? "bad" : "fire"); }
  function updateHUD() {
    const agent = A.isAgent() && G.state.started;
    hud.classList.toggle("on", agent && G.state.mode === "play" && !document.body.classList.contains("cine"));
    if (!agent) return;
    const R = ROSTER[P.hero];
    if (lastHero !== P.hero) {
      lastHero = P.hero; hud.style.setProperty("--ac", R.color);
      hud.querySelector(".an").textContent = R.name; hud.querySelector(".ar").textContent = R.role;
      slots.forEach((s, i) => { s.querySelector(".ic").textContent = R.ab[i][0]; s.querySelector(".nm").textContent = R.ab[i][1]; s.title = R.ab[i][3]; });
    }
    const ids = ["ab1", "ab2", "ab3", "ult"];
    slots.forEach((s, i) => {
      s.querySelector(".ky").textContent = (G.controls.binding(ids[i])[0] && G.controls.keyName(G.controls.binding(ids[i])[0])) || "—";
      if (i < 3) { const f = st.cd[i] / R.ab[i][2]; s.style.setProperty("--cd", `${(f * 360).toFixed(1)}deg`); s.querySelector(".cdn").textContent = st.cd[i] > 0 ? Math.ceil(st.cd[i]) : ""; s.classList.toggle("ready", st.cd[i] <= 0); }
      else { s.style.setProperty("--cd", `${((1 - st.ult / ULT_MAX) * 360).toFixed(1)}deg`); s.querySelector(".cdn").textContent = st.ult < ULT_MAX ? `${st.ult}/${ULT_MAX}` : ""; s.classList.toggle("ready", st.ult >= ULT_MAX); }
    });
  }
  function ultSplash(name) {
    const R = ROSTER[P.hero];
    ultSplashEl.innerHTML = `<div class="band" style="--ac:${R.color}"><span class="who">${R.name}</span><span class="what">${name}</span></div>`;
    ultSplashEl.classList.remove("show"); void ultSplashEl.offsetWidth; ultSplashEl.classList.add("show");
    G.audio.sfx("stunt"); G.shake(6);
  }
  A.whiteout = (s) => { whiteEl.style.animationDuration = `${s + 0.5}s`; whiteEl.classList.remove("show"); void whiteEl.offsetWidth; whiteEl.classList.add("show"); };

  // ---------- agent select ----------
  let sel = null;
  const CLASSIC = ["kai", "spindle", "wraith", "nova", "crimson"];
  A.openSelect = function () {
    if (P.car) { G.ui.toast("Get out of the car to switch heroes", "#ff4d6d"); return; }
    sel = { i: Math.max(0, [...A.ORDER, ...CLASSIC].indexOf(P.hero)), prev: G.state.mode, orig: P.hero, spin: 0 };
    document.body.classList.add("cine");
    G.state.mode = "agents"; G.render.releaseMouse && G.render.releaseMouse();
    selEl.classList.add("on"); renderSelect(); G.audio.sfx("click");
  };
  function renderSelect() {
    const all = [...A.ORDER, ...CLASSIC], id = all[sel.i], H = HZ.LIST[id], R = ROSTER[id];
    if (P.hero !== id) { P.hero = id; } // live 3D preview
    selEl.querySelector(".cards").innerHTML = all.map((k, i) => {
      const h = HZ.LIST[k], r = ROSTER[k];
      return `<div class="card ${i === sel.i ? "sel" : ""} ${k === P.hero ? "cur" : ""}" data-i="${i}" style="--ac:${h.color}"><div class="cr">${r ? r.role : k === "crimson" ? "Web-slinger" : "Classic"}</div><div class="cn">${h.name}</div><div class="cg"></div></div>`;
    }).join("");
    selEl.querySelectorAll(".card").forEach((c) => { c.onmouseenter = () => { sel.i = +c.dataset.i; renderSelect(); }; c.onclick = () => { sel.i = +c.dataset.i; lockIn(); }; });
    selEl.querySelector(".detail").style.setProperty("--ac", H.color);
    selEl.querySelector(".detail").innerHTML = `<div class="dn">${H.name}</div><div class="dr">${R ? R.role.toUpperCase() + " · " + R.tag : H.hint}</div>` +
      (R ? `<div class="abs">${R.ab.map((a, i) => `<div class="ab"><div class="ai">${a[0]}</div><div><b>${a[1]}</b> <i>${["1", "2", "3", "ULT"][i]}${i < 3 ? ` · ${a[2]}s` : ` · ${ULT_MAX} pts`}</i><br><span>${a[3]}</span></div></div>`).join("")}</div>` : `<div class="abs"><div class="ab"><div class="ai">🦸</div><div><b>SPECIAL</b> <i>K / RMB</i><br><span>${H.hint}</span></div></div></div>`);
  }
  function lockIn() {
    const all = [...A.ORDER, ...CLASSIC], id = all[sel.i];
    const lk = selEl.querySelector(".lock"); lk.textContent = `${HZ.LIST[id].name} LOCKED IN`; lk.style.color = HZ.LIST[id].color;
    lk.classList.remove("show"); void lk.offsetWidth; lk.classList.add("show"); G.audio.sfx("success");
    setTimeout(() => {
      closeSelect();
      if (id !== P.hero) { if (id === "crimson") { HZ.crimson(); } else { P.act = { name: "transform", t: 0, dur: 0.8, next: id, swapped: false }; G.audio.sfx("stunt"); } st.cd = [0, 0, 0]; }
    }, 650);
  }
  function closeSelect() { selEl.classList.remove("on"); G.state.mode = "play"; if (sel) P.hero = sel.orig; sel = null; G.finale.cam = null; document.body.classList.remove("cine"); G.render.snapCamera(); }
  A.updateSelect = function (dt = 0.016) {
    if (!sel) return;
    sel.spin += dt * 0.35; // slow orbit around the previewed hero
    const a = P.a + Math.sin(sel.spin) * 0.5, z = (P.z || 0), side = a + Math.PI / 2;
    G.finale.cam = { px: P.x + Math.cos(a) * 52, py: P.y + Math.sin(a) * 52, pz: z + 17, lx: P.x + Math.cos(side) * 14, ly: P.y + Math.sin(side) * 14, lz: z + 12, fov: 42 };
    const n = A.ORDER.length + CLASSIC.length;
    if (Input.hit("ArrowRight", "KeyD")) { sel.i = (sel.i + 1) % n; renderSelect(); G.audio.sfx("click"); }
    if (Input.hit("ArrowLeft", "KeyA")) { sel.i = (sel.i - 1 + n) % n; renderSelect(); G.audio.sfx("click"); }
    if (Input.hit("Enter", "Space", "KeyE")) lockIn();
    if (Input.hit("Escape", "Backspace", "A_agent")) closeSelect();
  };
  A.select = (id) => { if (HZ.LIST[id]) { HZ.setHero(id); st.cd = [0, 0, 0]; } };

  let selEl = null;
  A.init = function () {
    scene = G.render.scene;
    heroLight = new THREE.PointLight(0xffffff, 0, 150, 1.3); scene.add(heroLight);
    const css = document.createElement("style");
    css.textContent = `
    #abilityBar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(140%);display:flex;gap:12px;align-items:flex-end;z-index:30;transition:transform .45s cubic-bezier(.2,1,.3,1);pointer-events:none}
    #abilityBar.on{transform:translateX(-50%)}
    #abilityBar .who{display:flex;flex-direction:column;align-items:flex-end;margin-right:6px;text-shadow:0 2px 6px #000}
    #abilityBar .an{font:900 italic 26px sans-serif;color:var(--ac);letter-spacing:3px;text-shadow:0 0 14px var(--ac)}
    #abilityBar .ar{font-size:11px;letter-spacing:4px;color:#ccc}
    .aslot{position:relative;width:64px;height:64px;border-radius:12px;background:rgba(10,10,18,.75);border:2px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .aslot.ult{width:78px;height:78px;border-radius:50%}
    .aslot::before{content:"";position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.72) var(--cd,0deg),transparent 0)}
    .aslot.ready{border-color:var(--ac);box-shadow:0 0 16px var(--ac)}
    .aslot.ult.ready{animation:ultGlow 1s infinite alternate}
    @keyframes ultGlow{from{box-shadow:0 0 10px var(--ac)}to{box-shadow:0 0 34px var(--ac),inset 0 0 18px var(--ac)}}
    .aslot .ic{font-size:30px;position:relative}
    .aslot .ky{position:absolute;top:3px;left:5px;font:700 11px monospace;color:#fff;background:rgba(0,0,0,.6);padding:0 4px;border-radius:4px}
    .aslot .nm{position:absolute;bottom:2px;left:0;right:0;text-align:center;font:700 8px sans-serif;letter-spacing:1px;color:#ddd}
    .aslot .cdn{position:absolute;font:900 22px sans-serif;color:#fff;text-shadow:0 0 6px #000}
    .aslot.fire{animation:aFire .45s}
    .aslot.bad{animation:aBad .3s}
    @keyframes aFire{0%{transform:scale(1.35);background:var(--ac)}100%{transform:scale(1)}}
    @keyframes aBad{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
    #ultSplash{position:fixed;left:0;right:0;top:36%;z-index:41;pointer-events:none;opacity:0}
    #ultSplash.show{animation:ultIn 1.7s ease forwards}
    #ultSplash .band{margin:0 auto;background:linear-gradient(90deg,transparent,var(--ac) 20%,var(--ac) 80%,transparent);padding:10px 0;text-align:center;transform:skewY(-4deg)}
    #ultSplash .who{font:700 14px sans-serif;letter-spacing:8px;color:#000;display:block}
    #ultSplash .what{font:900 italic 64px sans-serif;letter-spacing:6px;color:#fff;text-shadow:0 4px 0 rgba(0,0,0,.35)}
    @keyframes ultIn{0%{opacity:0;transform:scaleX(0)}12%{opacity:1;transform:scaleX(1.05)}20%{transform:scaleX(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-30px)}}
    #whiteout{position:fixed;inset:0;background:#fff;z-index:42;pointer-events:none;opacity:0}
    #whiteout.show{animation:wOut 1s ease-out forwards}
    @keyframes wOut{0%{opacity:.95}100%{opacity:0}}
    body.agentOn #prompt{bottom:128px}
    #agentSel{position:fixed;inset:0;z-index:55;display:none;flex-direction:column;justify-content:flex-end;background:linear-gradient(0deg,rgba(6,4,14,.96) 0%,rgba(6,4,14,.55) 26%,rgba(6,4,14,0) 48%),linear-gradient(90deg,rgba(6,4,14,.85) 0%,rgba(6,4,14,.3) 38%,rgba(6,4,14,0) 55%)}
    #agentSel.on{display:flex;animation:kIn .35s}
    #agentSel .ttl{position:absolute;top:5vh;left:5vw;font:900 italic 54px sans-serif;letter-spacing:6px;color:#fff}
    #agentSel .ttl small{display:block;font:600 13px sans-serif;letter-spacing:5px;color:#99a}
    #agentSel .detail{position:absolute;top:18vh;left:5vw;width:min(560px,60vw);color:#ddd}
    #agentSel .dn{font:900 italic 86px sans-serif;color:var(--ac);letter-spacing:4px;text-shadow:0 0 40px var(--ac);animation:dnIn .4s cubic-bezier(.2,1,.3,1)}
    @keyframes dnIn{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}
    #agentSel .dr{font-size:14px;letter-spacing:2px;margin-bottom:14px;color:#ccc}
    #agentSel .ab{display:flex;gap:12px;align-items:center;margin:8px 0;background:rgba(255,255,255,.05);border-left:3px solid var(--ac);padding:8px 12px;border-radius:6px;font-size:13px}
    #agentSel .ab .ai{font-size:28px} #agentSel .ab i{color:var(--ac);font-style:normal;font-size:11px} #agentSel .ab span{color:#aab}
    #agentSel .cards{display:flex;gap:10px;justify-content:center;padding:0 3vw 5vh;flex-wrap:wrap}
    #agentSel .card{width:118px;height:150px;border-radius:12px;position:relative;cursor:pointer;background:linear-gradient(160deg,color-mix(in srgb,var(--ac) 45%,#000) 0%,#0b0a12 75%);border:2px solid rgba(255,255,255,.12);transition:all .2s;overflow:hidden}
    #agentSel .card .cg{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,var(--ac),transparent 60%);opacity:.25}
    #agentSel .card.sel{transform:translateY(-12px) scale(1.06);border-color:var(--ac);box-shadow:0 0 28px var(--ac)}
    #agentSel .card.cur::after{content:"EQUIPPED";position:absolute;top:6px;right:6px;font:700 8px sans-serif;letter-spacing:1px;background:#fff;color:#000;padding:2px 4px;border-radius:3px}
    #agentSel .cr{position:absolute;top:8px;left:8px;font:700 9px sans-serif;letter-spacing:2px;color:#ddd}
    #agentSel .cn{position:absolute;bottom:10px;left:0;right:0;text-align:center;font:900 italic 17px sans-serif;color:#fff;letter-spacing:1px}
    #agentSel .hint{position:absolute;right:4vw;top:6vh;color:#889;font-size:13px}
    #agentSel .lock{position:absolute;left:0;right:0;top:42%;text-align:center;font:900 italic 72px sans-serif;letter-spacing:8px;opacity:0;text-shadow:0 0 40px currentColor}
    #agentSel .lock.show{animation:lockIn .8s ease forwards}
    @keyframes lockIn{0%{opacity:0;transform:scale(2.2)}30%{opacity:1;transform:scale(1)}100%{opacity:1}}`;
    document.head.appendChild(css);
    hud = document.createElement("div"); hud.id = "abilityBar";
    hud.innerHTML = `<div class="who"><span class="an"></span><span class="ar"></span></div>` + [0, 1, 2, 3].map((i) => `<div class="aslot ${i === 3 ? "ult" : ""}"><span class="ic"></span><span class="ky"></span><span class="nm"></span><span class="cdn"></span></div>`).join("");
    document.body.appendChild(hud); slots = [...hud.querySelectorAll(".aslot")];
    ultSplashEl = document.createElement("div"); ultSplashEl.id = "ultSplash"; document.body.appendChild(ultSplashEl);
    whiteEl = document.createElement("div"); whiteEl.id = "whiteout"; document.body.appendChild(whiteEl);
    selEl = document.createElement("div"); selEl.id = "agentSel";
    selEl.innerHTML = `<div class="ttl"><small>CHOOSE YOUR HERO</small>SELECT AGENT</div><div class="hint">← → choose · Enter lock in · Esc back</div><div class="detail"></div><div class="cards"></div><div class="lock"></div>`;
    document.body.appendChild(selEl);
  };
})();
