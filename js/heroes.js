// ---------- heroes: 3D on-foot movement, parkour, swinging, powers, combat, gang enemies ----------
(function () {
  const W = G.world, P = G.player;
  const HZ = (G.heroes = {});
  const GRAV = 520;
  const HEROES = (HZ.LIST = {
    kai: { name: "KAI", color: "#ff3df2", walk: 72, run: 140, jump: 150, accel: 10, fallSafe: 70, str: 1,
      outfit: { style: "kai", skin: "#c68642", shirt: "#ff3df2", pants: "#1b1b2f", hair: "#111111" },
      hint: "Regular human · LMB/J punch · Space jump" },
    spindle: { name: "SPINDLE", color: "#19e3d0", walk: 90, run: 215, jump: 245, accel: 12, climb: 150, swing: true, fallSafe: 1e9, str: 1.2,
      outfit: { style: "spindle", shirt: "#14213d", pants: "#14213d", shoes: "#0b1020", accent: "#19e3d0" },
      hint: "Hold SPACE in the air to swing · run into walls to climb · K web shot" },
    wraith: { name: "WRAITH", color: "#8b3dff", walk: 82, run: 190, jump: 215, accel: 12, climb: 105, fallSafe: 170, leap: true, str: 1.3,
      outfit: { style: "wraith", shirt: "#2b2b36", pants: "#23232c", shoes: "#141418", accent: "#8b3dff" },
      hint: "Climb anything · K silent takedown / smoke bomb · dive off roofs into hay or water" },
    nova: { name: "NOVA", color: "#ffc83d", walk: 90, run: 200, jump: 260, accel: 11, fallSafe: 1e9, str: 2.2, superJump: 640,
      outfit: { style: "nova", shirt: "#f1f1f4", pants: "#e2e2e8", shoes: "#c9a227", accent: "#ffc83d", skin: "#e0ac69", cape: "#c1121f" },
      hint: "Hold SPACE to charge a super jump · K dash (slow-mo) · K in the air = ground pound" },
    crimson: { name: "CRIMSON SPINDLE", color: "#ff1f3d", walk: 96, run: 245, jump: 270, accel: 13, climb: 175, swing: true, fallSafe: 1e9, str: 1.6, crimson: true,
      outfit: { style: "crimson", shirt: "#c8102e", pants: "#c8102e", shoes: "#111114", accent: "#111114" },
      hint: "X toggles the suit · hold SPACE to swing · K web strike (pulls enemies in) · K in the air = web bomb" },
  });
  HZ.ORDER = ["kai", "spindle", "wraith", "nova"];
  const isWeb = () => !!(HEROES[P.hero] && HEROES[P.hero].swing);
  Object.assign(P, { z: 0, vz: 0, mode: "ground", hero: "kai", peakZ: 0, act: null, combo: 0, lastAtk: -9, atkCd: 0, spCd: 0, swing: null, wall: null,
    charge: 0, stun: 0, lastCombat: -99, anim: { mode: "idle", speed: 0, t: 0 }, landT: 9, flip: 0 });
  G.timeScale = 1; let slowT = 0;
  G.gang = []; G.webs = []; G.shocks = []; G.ropes = [];

  const hero = () => HEROES[P.hero];
  const camYaw = () => (G.cam3 ? G.cam3.yaw : P.a);

  // ---------- 3D collision for walkers (circle vs solids taller than the step height) ----------
  function collide3d(e, r, z) {
    let hit = null;
    for (const s of W.query(e.x, e.y, r + 4)) {
      if (W.top3(s) <= z + 6) continue;
      if (s.tree && z > 40) continue;
      let px, py, inside;
      if (s.kind === "rect") { px = clamp(e.x, s.x, s.x + s.w); py = clamp(e.y, s.y, s.y + s.h); inside = e.x > s.x && e.x < s.x + s.w && e.y > s.y && e.y < s.y + s.h; }
      else { const d = dist(e.x, e.y, s.x, s.y) || 1; px = s.x + ((e.x - s.x) / d) * s.r; py = s.y + ((e.y - s.y) / d) * s.r; inside = d < s.r; }
      let dx = e.x - px, dy = e.y - py, d = Math.hypot(dx, dy);
      if (!inside && d >= r) continue;
      if (inside) {
        if (s.kind === "rect") { const o = [[e.x - s.x, -1, 0], [s.x + s.w - e.x, 1, 0], [e.y - s.y, 0, -1], [s.y + s.h - e.y, 0, 1]].sort((a, b) => a[0] - b[0])[0]; dx = o[1]; dy = o[2]; d = -o[0]; }
        else { dx = e.x - s.x || 1; dy = e.y - s.y; const l = Math.hypot(dx, dy); dx /= l; dy /= l; d = -(s.r - dist(e.x, e.y, s.x, s.y)); }
      } else { dx /= d; dy /= d; }
      e.x += dx * (r - d); e.y += dy * (r - d);
      const vn = e.vx * dx + e.vy * dy; if (vn < 0) { e.vx -= vn * dx; e.vy -= vn * dy; }
      hit = { s, nx: dx, ny: dy };
    }
    return hit;
  }
  HZ.collide3d = collide3d;

  // ---------- suits ----------
  HZ.cycle = function () {
    if (P.car || P.mode !== "ground" || (P.act && P.act.name === "transform")) return;
    const i = (HZ.ORDER.indexOf(P.hero) + 1) % HZ.ORDER.length;
    P.act = { name: "transform", t: 0, dur: 0.8, next: HZ.ORDER[i], swapped: false };
    G.audio.sfx("stunt");
  };
  HZ.crimson = function () {
    if (P.car || (P.act && P.act.name === "transform")) return;
    const next = P.hero === "crimson" ? (P.preCrimson && P.preCrimson !== "crimson" ? P.preCrimson : "spindle") : "crimson";
    if (next === "crimson") P.preCrimson = P.hero;
    P.act = { name: "transform", t: 0, dur: next === "crimson" ? 1.15 : 0.6, next, swapped: false, crimson: next === "crimson" };
    if (next === "crimson") { slowT = 0.9; G.shake(6); G.audio.sfx("stunt"); G.audio.sfx("boom", 0.35); } else G.audio.sfx("whoosh");
  };
  HZ.setHero = function (id) {
    P.hero = id; const h = HEROES[id];
    for (let k = 0; k < 40; k++) G.spawnFx("spark", P.x, P.y, { z: rand(2, 22), vx: rand(-160, 160), vy: rand(-160, 160), vz: rand(-40, 160), size: rand(2, 4), life: 0.8, max: 0.8, color: h.color });
    G.ui.banner(h.name, h.hint, h.color);
  };

  // ---------- targeting ----------
  function nearestEnemy(range, cone = 1.2, from = P) {
    let best = null, bd = range;
    for (const e of G.gang) {
      if (e.state === "down") continue;
      const d = dist(from.x, from.y, e.x, e.y); if (d > bd || Math.abs((e.z || 0) - (P.z || 0)) > 40) continue;
      if (cone < Math.PI && Math.abs(angDiff(P.a, Math.atan2(e.y - P.y, e.x - P.x))) > cone) continue;
      best = e; bd = d;
    }
    return best;
  }

  // ---------- attacks ----------
  function startAttack() {
    if (P.atkCd > 0 || P.stun > 0 || (P.act && P.act.name !== "jab" && P.act.name !== "cross")) return;
    P.combo = G.time - P.lastAtk < 0.7 ? P.combo + 1 : 0; P.lastAtk = G.time;
    const seq = ["jab", "cross", P.hero === "nova" ? "uppercut" : "kick"], name = seq[P.combo % 3];
    const tgt = nearestEnemy(70, 1.6); if (tgt) P.a = Math.atan2(tgt.y - P.y, tgt.x - P.x);
    P.act = { name, t: 0, dur: name === "kick" || name === "uppercut" ? 0.42 : 0.3, hitAt: 0.45, done: false };
    P.atkCd = P.act.dur * 0.75; P.lastCombat = G.time;
    if (tgt) { const step = Math.min(30, dist(P.x, P.y, tgt.x, tgt.y) - 18); if (step > 0) { P.vx += Math.cos(P.a) * step * 6; P.vy += Math.sin(P.a) * step * 6; } }
  }
  function meleeHit(name) {
    const h = hero(), fin = name === "kick" || name === "uppercut";
    const reach = 28 + (fin ? 6 : 0), dmg = (fin ? 34 : name === "cross" ? 22 : 16) * h.str;
    let any = false;
    for (const e of G.gang) {
      if (e.state === "down") continue;
      const d = dist(P.x, P.y, e.x, e.y); if (d > reach || Math.abs(e.z - P.z) > 16) continue;
      if (Math.abs(angDiff(P.a, Math.atan2(e.y - P.y, e.x - P.x))) > 1.1) continue;
      hurtEnemy(e, dmg, fin ? 260 * h.str : 90, P.x, P.y, name === "uppercut" ? 260 : 0); any = true;
    }
    for (const p of G.peds) {
      if (p.state === "down" || dist(P.x, P.y, p.x, p.y) > reach || P.z > 14) continue;
      if (Math.abs(angDiff(P.a, Math.atan2(p.y - P.y, p.x - P.x))) > 1.1) continue;
      p.state = "down"; p.timer = 5; p.x += Math.cos(P.a) * 14; p.y += Math.sin(P.a) * 14; any = true;
      if (G.time - (P.lastAssault || -99) > 6) { G.crime(1, "Assault", 2); P.lastAssault = G.time; }
      for (const q of G.peds) if (q !== p && dist(q.x, q.y, p.x, p.y) < 200) G.scarePed(q, P.x, P.y, 2.5);
    }
    if (G.net && G.net.melee(reach, dmg, fin ? 260 * h.str : 90)) any = true;
    if (any) { G.audio.sfx("crash", fin ? 0.55 : 0.3); G.shake(fin ? 6 : 3); hitstop(fin ? 0.09 : 0.04); }
    else G.audio.sfx("whoosh");
  }
  let stopT = 0; function hitstop(s) { stopT = Math.max(stopT, s); }
  HZ.consumeHitstop = (dt) => { if (stopT > 0) { stopT -= dt; return true; } return false; };

  function hurtEnemy(e, dmg, knock, fx, fy, lift = 0) {
    if (e.state === "down") return;
    e.hp -= dmg; e.aware = true; alertCrew(e.crew);
    const d = dist(e.x, e.y, fx, fy) || 1;
    e.vx = ((e.x - fx) / d) * knock; e.vy = ((e.y - fy) / d) * knock; e.vz = lift || (knock > 150 ? 120 : 0);
    for (let k = 0; k < 6; k++) G.spawnFx("spark", e.x, e.y, { z: e.z + 13, vx: rand(-120, 120), vy: rand(-120, 120), vz: rand(0, 120), size: 2.5, life: 0.3, max: 0.3, color: pick(["#fff", "#ffd60a", "#ff9f1c"]) });
    if (e.hp <= 0) knockOut(e);
    else { e.state = "stagger"; e.t = 0.4; e.windup = 0; }
  }
  function knockOut(e, quiet) {
    if (e.state === "down") return;
    e.state = "down"; e.t = 12; e.hp = 0;
    if (!quiet) G.floatText(e.x, e.y, "K.O.", "#ffd60a");
    G.addMoney(60); G.stats.kos = (G.stats.kos || 0) + 1;
    const crew = G.gang.filter((k) => k.crew === e.crew);
    if (crew.every((k) => k.state === "down")) { G.addMoney(400); G.ui.banner("CREW TAKEN DOWN", "Saltwater Boys cleared  +$400", HEROES[P.hero].color); G.audio.sfx("success"); G.stats.crews = (G.stats.crews || 0) + 1; }
  }
  HZ.hurtEnemy = hurtEnemy; HZ.knockOut = knockOut;
  function alertCrew(c) { for (const k of G.gang) if (k.crew === c && k.state === "idle") { k.state = "chase"; k.aware = true; } }

  function special() {
    if (P.spCd > 0 || P.stun > 0) return;
    const h = P.hero;
    if (h === "crimson" && P.mode === "air" && P.z > 14) { // web bomb: webs every enemy around the landing zone
      P.act = { name: "shoot", t: 0, dur: 0.3 }; P.spCd = 2.2; G.audio.sfx("whoosh"); G.shake(4);
      for (let k = 0; k < 60; k++) { const a = rand(TAU), s = rand(80, 260); G.spawnFx("spark", P.x, P.y, { z: P.z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-200, 40), size: rand(2, 3.5), life: 0.6, max: 0.6, color: k % 3 ? "#f4f4f8" : "#ff1f3d" }); }
      for (const e of G.gang) if (e.state !== "down" && dist(e.x, e.y, P.x, P.y) < 170) { e.state = "webbed"; e.t = 5; e.aware = true; e.hp -= 20; G.floatText(e.x, e.y, "WEBBED", "#ff8a9a"); if (e.hp <= 0) knockOut(e); }
      return;
    }
    if (h === "spindle" || h === "crimson") { // web shot, auto-aimed (crimson: web strike yanks them in)
      const tgt = nearestEnemy(420, 0.8);
      const ox = P.x + Math.cos(P.a) * 8, oy = P.y + Math.sin(P.a) * 8, oz = P.z + 14;
      let vx = Math.cos(P.a) * 700, vy = Math.sin(P.a) * 700, vz = 0;
      if (tgt) { const dx = tgt.x - ox, dy = tgt.y - oy, dz = tgt.z + 10 - oz, l = Math.hypot(dx, dy, dz) || 1; vx = (dx / l) * 700; vy = (dy / l) * 700; vz = (dz / l) * 700; P.a = Math.atan2(dy, dx); }
      G.webs.push({ x: ox, y: oy, z: oz, vx, vy, vz, life: 0.7, sx: ox, sy: oy, sz: oz, yank: h === "crimson" });
      P.act = { name: "shoot", t: 0, dur: 0.28 }; P.spCd = h === "crimson" ? 0.3 : 0.4; G.audio.sfx("whoosh");
    } else if (h === "wraith") {
      const tgt = nearestEnemy(40, Math.PI);
      if (tgt) {
        P.a = Math.atan2(tgt.y - P.y, tgt.x - P.x);
        P.act = { name: "takedown", t: 0, dur: 0.55, target: tgt, hitAt: 0.5 }; P.spCd = 0.6;
        tgt.state = "stagger"; tgt.t = 0.6; tgt.vx = tgt.vy = 0;
      } else { // smoke bomb
        P.act = { name: "smoke", t: 0, dur: 0.35 }; P.spCd = 3.5;
        for (let k = 0; k < 46; k++) G.spawnFx("smoke", P.x + rand(-30, 30), P.y + rand(-30, 30), { z: rand(0, 14), vz: rand(5, 30), vx: rand(-60, 60), vy: rand(-60, 60), size: rand(10, 18), life: rand(1.5, 2.6), max: 2.6, color: pick(["#5d5a6e", "#7a7690", "#3f3c4c"]) });
        for (const e of G.gang) if (e.state !== "down" && dist(e.x, e.y, P.x, P.y) < 110) { e.state = "dazed"; e.t = 3.2; }
        G.audio.sfx("whoosh");
      }
    } else if (h === "nova") {
      if (P.mode === "air" && P.z > 20) { // ground pound
        P.vz = -900; P.vx *= 0.2; P.vy *= 0.2; P.pounding = true; P.act = { name: "pound", t: 0, dur: 2 }; P.spCd = 0.8;
      } else if (P.mode === "ground") { // slow-mo dash
        P.act = { name: "dash", t: 0, dur: 0.32, hits: new Set() }; P.spCd = 1.1; slowT = 0.7; G.audio.sfx("stunt");
        P.vx = Math.cos(P.a) * 620; P.vy = Math.sin(P.a) * 620;
      }
    } else { // Kai: a heavy shove
      startAttack();
    }
  }
  function shockwave(x, y, z, power) {
    G.shocks.push({ x, y, z, t: 0, power });
    G.shake(10 + power * 12); G.audio.sfx("boom");
    for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; G.spawnFx("smoke", x + Math.cos(a) * 12, y + Math.sin(a) * 12, { z: z + 2, vx: Math.cos(a) * 260 * power, vy: Math.sin(a) * 260 * power, vz: 20, size: 9, life: 0.9, max: 0.9, color: "#d8cfa8" }); }
    const R = 80 + power * 70;
    for (const e of G.gang) { const d = dist(x, y, e.x, e.y); if (d < R && Math.abs(e.z - z) < 30) hurtEnemy(e, 70 * power, 340, x, y, 220); }
    for (const p of G.peds) { const d = dist(x, y, p.x, p.y); if (d < R && z < 20) { p.state = "down"; p.timer = 4; } else if (d < R * 2.5) G.scarePed(p, x, y, 2); }
    if (z < 20) for (const c of G.activeCars || []) { const d = dist(x, y, c.x, c.y); if (d < R) { c.vx += ((c.x - x) / (d || 1)) * 320 * power; c.vy += ((c.y - y) / (d || 1)) * 320 * power; c.vz = 180 * power; c.z = 1; c.damage(10 * power); } }
  }

  // ---------- swinging ----------
  function findAnchor() {
    const sp = Math.hypot(P.vx, P.vy), fa = sp > 40 ? Math.atan2(P.vy, P.vx) : P.a;
    const qx = P.x + Math.cos(fa) * 200, qy = P.y + Math.sin(fa) * 200, qz = P.z + 160;
    let best = null, bs = Infinity;
    for (const b of W.buildings) {
      if (b.h3 < P.z + 35 || Math.abs(b.x + b.w / 2 - P.x) > 700 || Math.abs(b.y + b.h / 2 - P.y) > 700) continue;
      // corner/edge point of the roof nearest the desired point
      const ax = clamp(qx, b.x, b.x + b.w), ay = clamp(qy, b.y, b.y + b.h), az = b.h3;
      const L = Math.hypot(ax - P.x, ay - P.y, az - P.z);
      if (L > 460 || L < 60) continue;
      const ahead = Math.cos(angDiff(fa, Math.atan2(ay - P.y, ax - P.x)));
      const score = Math.hypot(ax - qx, ay - qy, (az - qz) * 0.5) - ahead * 120;
      if (score < bs) { bs = score; best = { x: ax, y: ay, z: az }; }
    }
    if (!best) for (const l of W.lights) { // low anchors in the suburbs: streetlights
      const L = Math.hypot(l.x - P.x, l.y - P.y, 48 - P.z);
      if (48 < P.z + 12 || L > 160 || L < 30) continue;
      const score = dist(l.x, l.y, qx, qy); if (score < bs) { bs = score; best = { x: l.x, y: l.y, z: 48 }; }
    }
    return best;
  }
  function startSwing(a) {
    const L = Math.hypot(a.x - P.x, a.y - P.y, a.z - P.z);
    P.swing = { ...a, L: L * 0.94, t: 0 }; P.mode = "swing"; G.audio.sfx("whoosh");
    const sp = Math.hypot(P.vx, P.vy); if (sp < 120) { const fa = Math.atan2(a.y - P.y, a.x - P.x); P.vx += Math.cos(fa) * 120; P.vy += Math.sin(fa) * 120; }
  }
  function releaseSwing() {
    const s = P.swing; P.swing = null; P.mode = "air";
    P.vx *= 1.1; P.vy *= 1.1; P.vz = Math.max(P.vz, 0) * 1.05 + 110;
    const sp = Math.hypot(P.vx, P.vy); if (sp > 260) P.flip = 0.001; // flip trick
    P.swingCd = 0.15;
  }

  // ---------- landing ----------
  function land(groundZ, solid) {
    const fall = P.peakZ - groundZ, h = hero(), soft = W.softAt(P.x, P.y);
    P.z = groundZ; P.vz = 0; P.mode = "ground"; P.flip = 0;
    if (P.pounding) { P.pounding = false; P.act = null; shockwave(P.x, P.y, P.z, clamp(fall / 220, 0.6, 1.6)); P.landT = 0; P.landKind = "land"; return; }
    if (P.diving) {
      P.diving = false;
      if (soft) { G.ui.toast(soft === "hay" ? "Leap of faith! Perfect landing in the hay" : "Leap of faith! Splashdown", h.color); G.addMoney(Math.round(fall)); G.stats.leaps = (G.stats.leaps || 0) + 1; splash(soft); P.landT = 0.2; P.landKind = "crouch"; return; }
    }
    if (soft && fall > 30) { splash(soft); P.landT = 0.3; P.landKind = "crouch"; return; }
    if (fall > h.fallSafe) { const dmg = (fall - h.fallSafe) * 0.55; P.hp -= dmg; G.shake(8); G.audio.sfx("crash", 0.5); if (P.hp <= 0) return G.blackout && G.blackout(); }
    if (fall > 110 && (P.hero === "nova" || isWeb())) { P.landT = 0; P.landKind = "land"; G.shake(P.hero === "nova" ? 7 : 3); if (P.hero === "nova" && fall > 220) shockwave(P.x, P.y, P.z, 0.6); for (let k = 0; k < 10; k++) G.spawnFx("smoke", P.x, P.y, { z: P.z + 1, vx: rand(-90, 90), vy: rand(-90, 90), size: 6, life: 0.6, max: 0.6, color: "#bbb3a0" }); }
    else if (fall > 60 && Math.hypot(P.vx, P.vy) > 100) { P.landT = 0; P.landKind = "roll"; }
    else if (fall > 40) { P.landT = 0.25; P.landKind = "crouch"; }
  }
  function splash(kind) {
    for (let k = 0; k < 24; k++) G.spawnFx(kind === "hay" ? "spark" : "smoke", P.x, P.y, { z: P.z + 2, vx: rand(-80, 80), vy: rand(-80, 80), vz: rand(60, 200), size: kind === "hay" ? 3 : 6, life: 0.9, max: 0.9, color: kind === "hay" ? "#e9c46a" : "#bfe7ff" });
    G.audio.sfx("whoosh");
  }

  // ---------- main on-foot update ----------
  HZ.foot = function (dt) {
    const h = hero();
    P.hitCd = Math.max(0, P.hitCd - dt); P.atkCd = Math.max(0, P.atkCd - dt); P.spCd = Math.max(0, P.spCd - dt); P.stun = Math.max(0, P.stun - dt);
    P.swingCd = Math.max(0, (P.swingCd || 0) - dt); P.landT += dt;
    P.hp = Math.min(100, P.hp + dt * (P.hero !== "kai" && G.time - P.lastCombat > 5 ? 4 : 0.5));
    // input in camera space
    let ix = (Input.down("KeyD", "ArrowRight") ? 1 : 0) - (Input.down("KeyA", "ArrowLeft") ? 1 : 0);
    let iy = (Input.down("KeyW", "ArrowUp") ? 1 : 0) - (Input.down("KeyS", "ArrowDown") ? 1 : 0);
    const il = Math.hypot(ix, iy); if (il > 0) { ix /= il; iy /= il; }
    const yaw = camYaw(), fx = Math.cos(yaw), fy = Math.sin(yaw);
    const dx = fx * iy - fy * ix, dy = fy * iy + fx * ix; // world-space wish direction
    const run = Input.down("ShiftLeft", "ShiftRight");
    // actions in progress
    const act = P.act;
    if (act) {
      act.t += dt;
      if (act.name === "transform" && act.crimson) { // nano-suit: red/black particles spiral up the body
        for (let k = 0; k < 6; k++) { const a = G.time * 14 + k * (TAU / 6), r = 9 - act.t * 4; G.spawnFx("spark", P.x + Math.cos(a) * r, P.y + Math.sin(a) * r, { z: (act.t / act.dur) * 26 + rand(-2, 2), vx: 0, vy: 0, vz: 20, size: rand(2, 3.4), life: 0.45, max: 0.45, color: k % 2 ? "#ff1f3d" : "#1a1a22" }); }
      }
      if (act.name === "transform" && !act.swapped && act.t > act.dur * 0.5) { act.swapped = true; HZ.setHero(act.next);
        if (act.crimson) { G.shake(9); G.audio.sfx("boom", 0.5); for (let k = 0; k < 70; k++) { const a = rand(TAU), s = rand(60, 300); G.spawnFx("spark", P.x, P.y, { z: rand(2, 24), vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(-30, 200), size: rand(2, 4.5), life: 0.9, max: 0.9, color: pick(["#ff1f3d", "#ff5a6e", "#222", "#ffffff"]) }); } G.spectacle && G.spectacle.flash && G.spectacle.flash(P.x, P.y, 30, "#ff1f3d"); }
      }
      if ((act.name === "jab" || act.name === "cross" || act.name === "kick" || act.name === "uppercut") && !act.done && act.t > act.dur * act.hitAt) { act.done = true; meleeHit(act.name); }
      if (act.name === "takedown" && !act.done && act.t > act.dur * act.hitAt) {
        act.done = true; const e = act.target;
        if (e && e.state !== "down") { const silent = !e.aware; knockOut(e, true); G.floatText(e.x, e.y, silent ? "SILENT TAKEDOWN" : "TAKEDOWN", "#c9a7ff"); if (silent) G.addMoney(60); G.audio.sfx("crash", 0.35); hitstop(0.12); }
      }
      if (act.name === "dash") {
        for (const e of G.gang) if (e.state !== "down" && !act.hits.has(e) && dist(e.x, e.y, P.x, P.y) < 30) { act.hits.add(e); hurtEnemy(e, 50, 380, P.x - Math.cos(P.a) * 20, P.y - Math.sin(P.a) * 20, 160); hitstop(0.06); }
        if (Math.random() < 0.8) G.spawnFx("spark", P.x, P.y, { z: rand(4, 18), vx: 0, vy: 0, size: 3, life: 0.35, max: 0.35, color: "#ffe08a" });
      }
      if (act.t >= act.dur && act.name !== "pound") P.act = null;
    }
    const busy = act && (act.name === "transform" || act.name === "takedown" || act.name === "dash");
    if (!busy && P.stun <= 0) {
      if (Input.mouse.clicked || Input.hit("KeyJ")) startAttack();
      if ((Input.mouse.rclicked && document.pointerLockElement) || Input.hit("KeyK")) special();
    }

    // ---- modes ----
    if (P.mode === "climb") return climb(dt, ix, iy);
    if (P.mode === "swing") return swing(dt, dx, dy);

    const onGround = P.mode === "ground";
    const lockMove = busy || P.stun > 0 || (P.landT < 0.32 && P.landKind === "land");
    const maxSp = lockMove ? 0 : run ? h.run : h.walk;
    if (act && act.name === "dash") { /* keep dash velocity */ }
    else if (onGround) {
      const k = Math.min(1, h.accel * dt * (act ? 0.4 : 1));
      P.vx += (dx * maxSp - P.vx) * k; P.vy += (dy * maxSp - P.vy) * k;
    } else { // air control
      P.vx += dx * 260 * dt; P.vy += dy * 260 * dt;
      const sp = Math.hypot(P.vx, P.vy), cap = Math.max(h.run * 1.1, P.airCap || 0);
      if (sp > cap) { P.vx *= cap / sp; P.vy *= cap / sp; }
    }
    const spd = Math.hypot(P.vx, P.vy);
    if (spd > 15 && !(act && (act.name === "jab" || act.name === "cross" || act.name === "kick" || act.name === "takedown"))) P.a += angDiff(P.a, Math.atan2(P.vy, P.vx)) * Math.min(1, dt * 12);

    // jumping / charging
    if (onGround && !lockMove) {
      if (P.hero === "nova" && Input.down("Space")) { P.charge = Math.min(1, P.charge + dt * 1.2); if (P.charge > 0.25 && Math.random() < 0.5) G.spawnFx("spark", P.x + rand(-8, 8), P.y + rand(-8, 8), { z: 1, vz: 60, vx: 0, vy: 0, size: 2.5, life: 0.5, max: 0.5, color: "#ffe08a" }); }
      if (P.hero === "nova" && !Input.down("Space") && P.charge > 0) { const c = P.charge; P.charge = 0; jump(c > 0.25 ? lerp(h.jump, h.superJump, (c - 0.25) / 0.75) : h.jump, c > 0.25); }
      else if (P.hero !== "nova" && Input.hit("Space")) jump(h.jump);
    }
    if (P.mode === "air") {
      P.vz -= GRAV * dt * (isWeb() && P.vz < 0 ? 0.85 : 1);
      if (P.flip > 0) P.flip = Math.min(TAU, P.flip + dt * 11);
      // spindle: hold space to swing
      if (h.swing && Input.down("Space") && P.swingCd <= 0 && P.vz < 120 && !Input.hit("Space") || (h.swing && Input.hit("Space") && P.z > 18)) {
        const a = findAnchor(); if (a) { startSwing(a); P.flip = 0; return; }
      }
      // wraith leap of faith: falling from height with arms spread
      if (h.leap && P.vz < -150 && P.peakZ > 120 && !P.diving) { const s = W.softAt(P.x + P.vx * 0.3, P.y + P.vy * 0.3); P.diving = true; P.divingSoft = !!s; }
    }
    // integrate
    const ox = P.x, oy = P.y;
    P.x += P.vx * dt; P.y += P.vy * dt;
    if (P.mode === "air") { P.z += P.vz * dt; P.peakZ = Math.max(P.peakZ, P.z); }
    const hit = collide3d(P, 6, P.z);
    if (hit && h.climb && !lockMove && (dx * -hit.nx + dy * -hit.ny > 0.5) && W.top3(hit.s) < 9000 && !hit.s.tree) { startClimb(hit); return; }
    const [g] = W.groundAt(P.x, P.y);
    if (P.mode === "ground") {
      if (P.z > g + 2) { P.mode = "air"; P.vz = 0; P.peakZ = P.z; }
      else P.z = g;
    } else if (P.mode === "air" && P.z <= g && P.vz <= 0) land(g);
    // walking into the sea
    if (W.tileAt(P.x, P.y) === W.TT.WATER && P.z <= 0) { P.x = ox; P.y = oy; }
    animState(spd, run);
  };
  function jump(v, superJ) {
    P.mode = "air"; P.vz = v; P.peakZ = P.z; P.airCap = superJ ? 300 : 0;
    G.audio.sfx(superJ ? "boom" : "whoosh", 0.5);
    if (superJ) { shockwave(P.x, P.y, P.z, 0.35); for (let k = 0; k < 20; k++) G.spawnFx("smoke", P.x, P.y, { z: P.z, vx: rand(-120, 120), vy: rand(-120, 120), size: 8, life: 0.8, max: 0.8, color: "#d0c8b0" }); }
  }
  function startClimb(hit) {
    P.mode = "climb"; P.wall = hit; P.vx = P.vy = 0; P.vz = 0; P.a = Math.atan2(-hit.ny, -hit.nx); P.flip = 0; P.diving = false;
  }
  function climb(dt, ix, iy) {
    const h = hero(), w = P.wall, top = W.top3(w.s);
    const up = iy > 0 ? 1 : iy < 0 ? -1 : 0;
    P.vz = up * h.climb * (Input.down("ShiftLeft", "ShiftRight") ? 1.5 : 1);
    P.z += P.vz * dt;
    // lateral along the wall (tangent = (-ny, nx))
    const tx = -w.ny, ty = w.nx; P.x += tx * -ix * h.climb * 0.7 * dt; P.y += ty * -ix * h.climb * 0.7 * dt;
    // stay pressed against the wall
    P.x -= w.nx * 2; P.y -= w.ny * 2; P.vx = -w.nx * 20; P.vy = -w.ny * 20;
    const hit = collide3d(P, 6, P.z);
    P.anim = { mode: "climb", speed: Math.abs(P.vz) + Math.abs(ix) * 60, t: 0 };
    if (Input.hit("Space")) { // wall jump
      P.mode = "air"; P.vx = w.nx * 190; P.vy = w.ny * 190; P.vz = 230; P.peakZ = P.z; P.a = Math.atan2(w.ny, w.nx); P.flip = 0.001; P.wall = null; G.audio.sfx("whoosh"); return;
    }
    if (P.z >= top - 1) { // mantle onto the roof
      P.z = top; P.x -= w.nx * 14; P.y -= w.ny * 14; P.mode = "ground"; P.wall = null; P.landT = 0.2; P.landKind = "crouch"; return;
    }
    const [g] = W.groundAt(P.x + w.nx * 10, P.y + w.ny * 10);
    if (P.z <= g) { P.z = g; P.mode = "ground"; P.wall = null; P.x += w.nx * 4; P.y += w.ny * 4; return; }
    if (!hit) { P.mode = "air"; P.peakZ = P.z; P.wall = null; } // slid off the edge
  }
  function swing(dt, dx, dy) {
    const s = P.swing; s.t += dt;
    P.vz -= GRAV * dt;
    P.vx += dx * 230 * dt; P.vy += dy * 230 * dt; // pump
    P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
    let rx = P.x - s.x, ry = P.y - s.y, rz = P.z - s.z; const len = Math.hypot(rx, ry, rz);
    if (len > s.L) {
      rx /= len; ry /= len; rz /= len;
      P.x = s.x + rx * s.L; P.y = s.y + ry * s.L; P.z = s.z + rz * s.L;
      const vr = P.vx * rx + P.vy * ry + P.vz * rz;
      if (vr > 0) { P.vx -= rx * vr; P.vy -= ry * vr; P.vz -= rz * vr; }
    }
    s.L = Math.max(60, s.L - dt * 18);
    P.peakZ = P.z;
    const sp = Math.hypot(P.vx, P.vy); if (sp > 20) P.a = Math.atan2(P.vy, P.vx);
    if (sp > 650) { P.vx *= 650 / sp; P.vy *= 650 / sp; }
    const hit = collide3d(P, 6, P.z);
    if (hit && W.top3(hit.s) < 9000 && !hit.s.tree) { P.swing = null; startClimb(hit); return; }
    const [g] = W.groundAt(P.x, P.y);
    if (P.z <= g + 2) { P.swing = null; P.mode = "air"; land(g); return; }
    if (!Input.down("Space") || s.t > 4) { releaseSwing(); return; }
    const horiz = Math.hypot(rx, ry);
    P.anim = { mode: "swing", speed: sp, t: 0, swingPitch: Math.atan2(horiz * Math.sign(rx * P.vx + ry * P.vy || 1), -rz) * 0.8 };
  }
  function animState(spd, run) {
    const a = P.anim || (P.anim = {});
    const act = P.act;
    let mode = "idle";
    if (P.mode === "air") mode = P.diving ? "dive" : "air";
    else if (P.landT < 0.45 && P.landKind === "land") mode = "land";
    else if (P.landT < 0.5 && P.landKind === "roll") mode = "roll";
    else if (P.landT < 0.25 && P.landKind === "crouch") mode = "crouch";
    else if (act && act.name === "dash") mode = "dash";
    else if (P.charge > 0.2) mode = "crouch";
    else if (spd > 160 && P.hero !== "kai") mode = "sprint";
    else if (spd > 100) mode = "run";
    else if (spd > 8) mode = "walk";
    a.mode = mode; a.speed = spd; a.vz = P.vz; a.flip = P.flip > 0 && P.flip < TAU ? P.flip : 0;
    a.t = mode === "land" || mode === "roll" || mode === "crouch" ? P.landT : 0;
    a.guard = G.time - P.lastCombat < 3;
    a.action = act ? act.name : null; a.actionT = act ? act.t / act.dur : 0;
    if (act && act.name === "pound") a.action = "pound", a.actionT = 0.5;
  }

  // ---------- gang AI ----------
  let crewId = 1, gangT = 0;
  const GANG_COLORS = ["#1d7fbf", "#0aa39b", "#3a86ff", "#118ab2"];
  function spawnCrew() {
    const n = randi(3, 5), crew = crewId++;
    // rooftops downtown or street corners
    let spot = null, roof = null;
    if (Math.random() < 0.55) {
      const cands = W.buildings.filter((b) => b.h3 > 70 && b.w > 120 && b.h > 120 && !b.poi && dist(b.x + b.w / 2, b.y + b.h / 2, P.x, P.y) > 450 && dist(b.x + b.w / 2, b.y + b.h / 2, P.x, P.y) < 1300);
      if (cands.length) { roof = pick(cands); spot = { x: roof.x + roof.w / 2, y: roof.y + roof.h / 2, z: roof.h3 }; }
    }
    if (!spot) { const lp = W.randomLanePoint(P.x, P.y, 600, 1300); if (!lp) return; const ox = -Math.sin(lp.a) * 70, oy = Math.cos(lp.a) * 70; if (W.pointBlocked(lp.x + ox, lp.y + oy, 10)) return; spot = { x: lp.x + ox, y: lp.y + oy, z: 0 }; }
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = 22;
      const e = { x: spot.x + Math.cos(a) * r, y: spot.y + Math.sin(a) * r, z: spot.z, vx: 0, vy: 0, vz: 0, a: a + Math.PI, hp: 60, state: "idle", t: rand(0, 3), crew, roof, aware: false, cd: rand(0.5, 1.5), windup: 0,
        outfit: { style: "gang", skin: pick(["#f1c27d", "#c68642", "#8d5524", "#e0ac69"]), shirt: pick(["#f1f1f1", "#e9ecef", "#adb5bd"]), pants: pick(["#2b2d42", "#3d405b", "#5c4033"]), accent: pick(GANG_COLORS), hair: "#111", bat: Math.random() < 0.35 },
        home: { x: spot.x, y: spot.y }, anim: { mode: "idle" } };
      G.gang.push(e);
    }
    G.ui.toast(roof ? "Saltwater Boys spotted on a rooftop nearby" : "Saltwater Boys are making trouble nearby", "#3a86ff");
  }
  HZ.spawnCrew = spawnCrew;
  function updateEnemy(e, dt) {
    e.t -= dt; e.cd -= dt;
    const a = e.anim;
    // physics (knockback, falling)
    const ground = () => (e.roof && e.x > e.roof.x && e.x < e.roof.x + e.roof.w && e.y > e.roof.y && e.y < e.roof.y + e.roof.h ? e.roof.h3 : W.groundAt(e.x, e.y)[0]);
    e.x += e.vx * dt; e.y += e.vy * dt;
    const g = ground();
    if (e.z > g || e.vz > 0) { e.vz -= GRAV * dt; e.z += e.vz * dt; if (e.z <= g) { const fall = (e.fallFrom || e.z) - g; e.z = g; e.vz = 0; if (fall > 90 && e.state !== "down") knockOut(e); e.fallFrom = 0; } else e.fallFrom = Math.max(e.fallFrom || 0, e.z); }
    if (e.roof && g === 0 && e.z < e.roof.h3 - 5) e.roof = null; // knocked off the roof
    collide3d(e, 6, e.z);
    const fr = Math.pow(0.02, dt); e.vx *= e.state === "chase" ? 1 : fr; e.vy *= e.state === "chase" ? 1 : fr;
    if (e.state === "down") { a.mode = "ko"; a.action = null; if (e.t <= 0) e.remove = true; return; }
    if (e.state === "webbed" || e.state === "dazed") { a.mode = e.state === "webbed" ? "webbed" : "stagger"; a.t = 0.2; a.action = null; e.vx *= fr; e.vy *= fr; if (e.t <= 0) e.state = "chase"; return; }
    if (e.state === "stagger") { a.mode = "stagger"; a.t = 0.4 - e.t; a.action = null; if (e.t <= 0) e.state = "chase"; return; }
    const tgt = P.car || P, pz = P.car ? 0 : P.z;
    const d = dist(e.x, e.y, tgt.x, tgt.y), dz = Math.abs(pz - e.z);
    if (e.state === "idle") {
      a.mode = "idle"; a.guard = false; a.action = null;
      if (e.t < 0) { e.t = rand(2, 5); e.a += rand(-1, 1); }
      if (!P.car && d < (e.roof ? 220 : 260) && dz < 30) { e.aware = true; alertCrew(e.crew); }
      return;
    }
    // chase / attack
    if (P.car || dz > 40 || d > 900) { e.vx *= fr; e.vy *= fr; a.mode = "idle"; a.guard = true; if (d > 1100) e.state = "idle"; return; }
    const want = Math.atan2(tgt.y - e.y, tgt.x - e.x); e.a += angDiff(e.a, want) * Math.min(1, dt * 8);
    if (e.windup > 0) {
      e.windup -= dt; e.vx = e.vy = 0; a.mode = "idle"; a.guard = true; a.action = e.outfit.bat ? "windup" : "windup"; a.actionT = 0.5;
      if (e.windup <= 0) {
        e.strike = 0.25;
        if (d < 30 && dz < 14 && P.hitCd <= 0) {
          const dmg = e.outfit.bat ? 11 : 7; P.hp -= dmg; P.hitCd = 0.5; P.stun = 0.25; P.lastCombat = G.time;
          P.vx += Math.cos(want) * 180; P.vy += Math.sin(want) * 180; G.shake(6); G.audio.sfx("crash", 0.4);
          if (P.act && P.act.name !== "transform") P.act = null;
          if (P.mode === "swing") { P.swing = null; P.mode = "air"; }
          if (P.hp <= 0 && G.blackout) G.blackout();
        }
      }
      return;
    }
    if (e.strike > 0) { e.strike -= dt; a.action = e.outfit.bat ? "batswing" : "cross"; a.actionT = 1 - e.strike / 0.25; a.mode = "idle"; return; }
    a.action = null;
    if (d > 24) {
      const sp = 125; e.vx = Math.cos(e.a) * sp; e.vy = Math.sin(e.a) * sp; a.mode = "run"; a.speed = sp;
      if (e.roof) { // don't run off the roof edge
        const nx = e.x + e.vx * 0.15, ny = e.y + e.vy * 0.15;
        if (nx < e.roof.x + 6 || nx > e.roof.x + e.roof.w - 6 || ny < e.roof.y + 6 || ny > e.roof.y + e.roof.h - 6) { e.vx = e.vy = 0; a.mode = "idle"; a.guard = true; }
      }
    } else { e.vx = e.vy = 0; a.mode = "idle"; a.guard = true; if (e.cd <= 0) { e.windup = 0.45; e.cd = rand(0.9, 1.6); } }
  }

  // ---------- world update (enemies, webs, shocks, cars vs enemies) ----------
  HZ.update = function (dt) {
    if (slowT > 0) { slowT -= dt / Math.max(0.2, G.timeScale); G.timeScale = slowT > 0 ? 0.35 : 1; }
    for (const e of G.gang) updateEnemy(e, dt);
    // cars run enemies over
    for (const c of G.activeCars || []) {
      if (c.speed < 90 || c.z > 10) continue;
      for (const e of G.gang) if (e.state !== "down" && e.z < 8 && dist(c.x, c.y, e.x, e.y) < c.s.h / 2 + 10) { hurtEnemy(e, 999, c.speed * 0.6, c.x, c.y, 150); }
    }
    G.gang = G.gang.filter((e) => !e.remove && dist(e.x, e.y, P.x, P.y) < 2200);
    // web shots
    for (const w of G.webs) {
      w.life -= dt; w.x += w.vx * dt; w.y += w.vy * dt; w.z += w.vz * dt;
      for (const e of G.gang) if (e.state !== "down" && Math.hypot(e.x - w.x, e.y - w.y, e.z + 10 - w.z) < 14) {
        w.life = 0; e.state = "webbed"; e.t = 4.5; e.aware = true; e.hp -= w.yank ? 30 : 12; e.vx = w.vx * 0.15; e.vy = w.vy * 0.15; alertCrew(e.crew);
        if (w.yank) { const l = Math.hypot(P.x - e.x, P.y - e.y) || 1; e.vx = (P.x - e.x) / l * 420; e.vy = (P.y - e.y) / l * 420; hitstop(0.05); G.shake(3); }
        G.floatText(e.x, e.y, "WEBBED", "#bdfcf5"); if (e.hp <= 0) knockOut(e); break;
      }
      if (W.pointBlocked(w.x, w.y) && w.z < 60) w.life = 0;
    }
    G.webs = G.webs.filter((w) => w.life > 0);
    for (const s of G.shocks) s.t += dt;
    G.shocks = G.shocks.filter((s) => s.t < 0.7);
    gangT -= dt;
    if (gangT <= 0) {
      gangT = 4;
      const crews = new Set(G.gang.filter((e) => e.state !== "down").map((e) => e.crew));
      if (crews.size < 2 && G.state.mode === "play" && !G.missions.active && Math.random() < 0.6) spawnCrew();
    }
  };

  HZ.reset = function () {
    Object.assign(P, { z: 0, vz: 0, mode: "ground", act: null, swing: null, wall: null, charge: 0, stun: 0, flip: 0, diving: false, pounding: false, landT: 9 });
    G.timeScale = 1; slowT = 0;
  };
  HZ.clearGangs = () => { G.gang = []; G.webs = []; };
})();
