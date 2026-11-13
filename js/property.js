// ---------- PROPERTY EMPIRE: buy homes & businesses, passive income, upgrades, managers, raids, holo signs, Empire phone app ----------
(function () {
  const PR = (G.property = {}), W = G.world, P = G.player;
  const V3 = (x, y, z) => new THREE.Vector3(x, z, y);
  const LV = [1, 1.6, 2.4, 3.5, 5], UPC = [0.4, 0.7, 1.1, 1.6];
  const DEFS = [
    // id, name, kind, district, price, income per game-hour, icon, color, perk
    ["bungalow", "Palm Bungalow", "home", "suburb", 30000, 0, "🏠", "#19f5a0", "Safehouse: sleep, save, heal"],
    ["taco", "Taco Truck Co.", "biz", "suburb", 18000, 400, "🌮", "#ffb703", ""],
    ["carwash", "Bay Car Wash", "biz", "suburb", 55000, 1200, "🧽", "#4cc9f0", "Free car repairs & respray here"],
    ["surf", "Sunset Surf Shack", "biz", "beach", 40000, 900, "🏄", "#00f5d4", ""],
    ["villa", "Sunset Beach Villa", "home", "beach", 160000, 0, "🏖️", "#ff9f1c", "Safehouse + a Vortex GT parked outside"],
    ["loft", "Harbor Loft", "home", "industrial", 75000, 0, "🏭", "#adb5bd", "Safehouse near the docks"],
    ["chop", "Dockside Chop Shop", "biz", "industrial", 130000, 2900, "🔧", "#ff7b00", "Sell any car you drive in for cash"],
    ["logistics", "Bayline Logistics", "biz", "industrial", 380000, 8400, "🚚", "#ffa028", "Courier jobs pay double"],
    ["arcade", "Pixel Palace Arcade", "biz", "plaza", 95000, 2100, "🕹️", "#c77dff", ""],
    ["townhouse", "Plaza Townhouse", "home", "plaza", 110000, 0, "🏛️", "#e9c46a", "Safehouse in the heart of the city"],
    ["cinema", "Starlight Cinema", "biz", "plaza", 520000, 11500, "🎬", "#ffd60a", ""],
    ["club", "Neon Nights Club", "biz", "downtown", 260000, 5800, "🪩", "#ff3df2", "Cops forget you faster downtown"],
    ["penthouse", "Sky Penthouse", "home", "downtown", 450000, 0, "🌃", "#22d3ee", "Safehouse + a Neon X parked outside"],
    ["apex", "Apex Tower Offices", "biz", "downtown", 1200000, 26000, "🏙️", "#3a86ff", ""],
  ];
  const RANKS = [[0, "Street Hustler"], [50000, "Small-Time Owner"], [250000, "Entrepreneur"], [1000000, "Mogul"], [3000000, "Tycoon"], [8000000, "Bay Baron"]];
  PR.list = [];
  const S = () => (G.state.props = G.state.props || {});

  // ---------- placement: pick a building per property and a reachable door marker ----------
  function place() {
    const rng = mulberry32(777), used = new Set();
    for (const d of DEFS) {
      const [id, name, kind, district, price, income, icon, color, perk] = d;
      const ok = (b) => !b.poi && !used.has(b) && b.w > 60 && b.h > 60;
      let c = W.buildings.filter((b) => ok(b) && W.districtAt(b.x + b.w / 2, b.y + b.h / 2) === district);
      if (!c.length) { // district has no buildings (e.g. the plaza): use the buildings ringing it
        const ctr = PLAZA(district); c = W.buildings.filter(ok).sort((a, b) => dist(a.x, a.y, ctr.x, ctr.y) - dist(b.x, b.y, ctr.x, ctr.y)).slice(0, 8);
      }
      if (id === "penthouse" || id === "apex") c.sort((a, b) => (b.h3 || b.height) - (a.h3 || a.height)); else c.sort(() => rng() - 0.5);
      let b = null, door = null;
      for (const cand of c) { door = doorFor(cand); if (door) { b = cand; break; } }
      if (!b) continue;
      used.add(b);
      PR.list.push({ id, name, kind, district, price, income, icon, color, perk, b, x: door.x, y: door.y, top: (b.h3 || b.height || 40) });
    }
  }
  function PLAZA(district) { // centre of the first map cell in that district
    for (let by = 0; by < 7; by++) for (let bx = 0; bx < 7; bx++) { const x = (4 + 12 * bx + 9) * G.TILE, y = (4 + 12 * by + 9) * G.TILE; if (W.districtAt(x, y) === district) return { x, y }; }
    return { x: 40 * G.TILE, y: 40 * G.TILE };
  }
  function doorFor(b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (const [x, y] of [[cx, b.y + b.h + 26], [cx, b.y - 26], [b.x - 26, cy], [b.x + b.w + 26, cy]])
      if (!W.pointBlocked(x, y, 8)) return { x, y };
    return null;
  }

  // ---------- money ----------
  const own = (p) => S()[p.id];
  const lvlMul = (p) => LV[(own(p) && own(p).lvl) || 0];
  const rate = (p) => (p.income * lvlMul(p));
  const cap = (p) => rate(p) * 10;
  PR.netWorth = () => PR.list.reduce((a, p) => { const o = own(p); if (!o) return a; let v = p.price; for (let i = 0; i < o.lvl; i++) v += p.price * UPC[i]; return a + v + (o.mgr ? p.price * 0.5 : 0); }, 0) + G.state.money;
  PR.income = () => PR.list.reduce((a, p) => a + (own(p) && p.kind === "biz" ? rate(p) : 0), 0);
  PR.owns = (id) => !!S()[id];
  PR.rank = () => { const nw = PR.netWorth(); let r = RANKS[0][1]; for (const [v, n] of RANKS) if (nw >= v) r = n; return r; };
  let lastHour = null, lastRank = null;
  function tickIncome() {
    const h = G.state.hour; if (lastHour === null) { lastHour = h; return; }
    let dh = h - lastHour; if (dh < 0) dh += 24; lastHour = h; if (dh <= 0 || dh > 6) return;
    let auto = 0;
    for (const p of PR.list) {
      const o = own(p); if (!o || p.kind !== "biz" || o.raided) continue;
      o.safe = Math.min(cap(p), (o.safe || 0) + rate(p) * dh);
      if (o.mgr && o.safe >= rate(p) * 2) { auto += o.safe; o.safe = 0; }
    }
    if (auto > 0) { G.state.money += Math.floor(auto); G.ui.toast(`💼 Managers deposited ${fmtMoney(auto)}`, "#19f5a0"); G.audio.sfx("cash"); }
    const r = PR.rank(); if (lastRank && r !== lastRank && RANKS.findIndex((x) => x[1] === r) > RANKS.findIndex((x) => x[1] === lastRank)) { G.ui.banner("EMPIRE RANK UP", r.toUpperCase(), "#ffd60a"); G.campaign.fireworks(P.x, P.y, 10); } lastRank = r;
  }

  // ---------- buying & menus ----------
  function buy(p) {
    if (G.state.money < p.price) { G.ui.toast(`You need ${fmtMoney(p.price - G.state.money)} more`, "#ff4d6d"); G.audio.sfx("fail"); return; }
    G.state.money -= p.price; S()[p.id] = { lvl: 0, safe: 0, mgr: false, t: Date.now() };
    G.audio.sfx("success"); G.ui.banner("PROPERTY ACQUIRED", `${p.icon} ${p.name}${p.perk ? " · " + p.perk : ""}`, p.color);
    G.campaign.fireworks(p.x, p.y, 8, p.top); G.shake(4);
    perkCar(p); refreshSign(p); G.save();
  }
  function perkCar(p) {
    const type = p.id === "villa" ? "sports" : p.id === "penthouse" ? "super" : null; if (!type) return;
    if (G.cars.some((c) => c.perkOf === p.id)) return;
    const c = new G.Car(type, p.x + 40, p.y, 0); c.keep = true; c.parked = true; c.perkOf = p.id; G.cars.push(c);
  }
  function homeMenu(p) {
    G.ui.customShop(`${p.icon} ${p.name.toUpperCase()}`, [
      { label: "😴 Sleep until morning (save + full health)", act: () => { G.state.hour = 8; P.hp = 100; G.save(); G.ui.banner("GOOD MORNING", `${p.name} · game saved`, p.color); lastHour = 8; } },
      { label: "💾 Save game", act: () => { G.save(); G.ui.toast("Game saved", "#19f5a0"); } },
      { label: "🩹 Patch up (full health)", act: () => { P.hp = 100; G.ui.toast("Healed", "#19f5a0"); } },
      ...(p.perk.includes("parked") ? [{ label: "🚗 Bring my perk car around", act: () => { perkCar(p); G.ui.toast("Your car is parked outside", p.color); } }] : []),
      { label: "💸 Sell property", right: fmtMoney(p.price * 0.6), act: () => sell(p) },
    ]);
  }
  function bizMenu(p) {
    const o = own(p), lvl = o.lvl;
    const items = [
      { label: `Income`, right: `${fmtMoney(rate(p))}/hr · Lv ${lvl + 1}/5`, disabled: true },
      { label: `💰 Collect the safe`, right: fmtMoney(o.safe || 0), disabled: !(o.safe >= 1), act: () => { const v = Math.floor(o.safe); o.safe = 0; G.addMoney(v); G.campaign.fireworks(p.x, p.y, 3, 20); G.save(); } },
      lvl < 4 ? { label: `⬆️ Upgrade to Lv ${lvl + 2} (${fmtMoney(p.income * LV[lvl + 1])}/hr)`, right: fmtMoney(p.price * UPC[lvl]), act: () => { const c = p.price * UPC[lvl]; if (G.state.money < c) { G.ui.toast("Not enough money", "#ff4d6d"); G.audio.sfx("fail"); return true; } G.state.money -= c; o.lvl++; G.audio.sfx("success"); G.ui.banner("BUSINESS UPGRADED", `${p.name} · Level ${o.lvl + 1}`, p.color); G.campaign.fireworks(p.x, p.y, 5, p.top); refreshSign(p); G.save(); } } : { label: "⭐ Fully upgraded", disabled: true },
      o.mgr ? { label: "👔 Manager hired (auto-deposits income)", disabled: true } : { label: "👔 Hire a manager (auto-collects)", right: fmtMoney(p.price * 0.5), act: () => { const c = p.price * 0.5; if (G.state.money < c) { G.ui.toast("Not enough money", "#ff4d6d"); G.audio.sfx("fail"); return true; } G.state.money -= c; o.mgr = true; G.audio.sfx("cash"); G.ui.toast(`${p.name} now runs itself`, p.color); G.save(); } },
    ];
    if (p.id === "carwash" && P.car) items.push({ label: "🧽 Free wash, repair & respray", act: () => { P.car.hp = P.car.s.hp; P.car.crush = null; P.car.color = pick(P.car.s.colors || ["#fff"]); G.clearWanted(); G.ui.toast("Squeaky clean, and the cops lost you", "#4cc9f0"); } });
    if (p.id === "chop" && P.car && !P.car.perkOf) { const v = Math.round(((P.car.s.price || 3000) * 0.45 * (P.car.hp / P.car.s.hp)) / 50) * 50; items.push({ label: `🔧 Chop the ${P.car.s.name}`, right: fmtMoney(v), act: () => { const c = P.car; G.exitCar(); c.dead = true; c.remove = true; G.cars = G.cars.filter((k) => k !== c); G.addMoney(v); G.ui.toast("Stripped for parts", "#ff7b00"); } }); }
    items.push({ label: "💸 Sell business", right: fmtMoney(p.price * 0.6), act: () => sell(p) });
    G.ui.customShop(`${p.icon} ${p.name.toUpperCase()}`, items);
  }
  function sell(p) { const o = own(p); const v = p.price * 0.6 + (o.safe || 0); delete S()[p.id]; G.addMoney(Math.floor(v)); G.ui.toast(`Sold ${p.name}`, "#ffd60a"); refreshSign(p); G.save(); }
  function forSaleMenu(p) {
    G.ui.customShop(`${p.icon} ${p.name.toUpperCase()} · FOR SALE`, [
      { label: p.kind === "biz" ? `Business · earns ${fmtMoney(p.income)}/hr (up to ${fmtMoney(p.income * 5)}/hr upgraded)` : "Home", disabled: true },
      ...(p.perk ? [{ label: `Perk: ${p.perk}`, disabled: true }] : []),
      { label: `🔑 BUY NOW`, right: fmtMoney(p.price), disabled: G.state.money < p.price, act: () => buy(p) },
      { label: `You have ${fmtMoney(G.state.money)}`, disabled: true },
    ]);
  }

  // ---------- markers (used by missions.shops so they get prompts, minimap and map icons) ----------
  PR.markers = function () {
    const out = [];
    for (const p of PR.list) {
      const o = own(p), raid = o && o.raid;
      out.push({ x: p.x, y: p.y, r: 44, color: raid ? "#ff1f3d" : o ? p.color : "#9aa0b4", icon: raid ? "⚠️" : o ? p.icon : "🏷️",
        label: raid ? `E: ${p.name} is being raided!` : o ? `E: ${p.name} (${p.kind === "biz" ? `safe ${fmtMoney(o.safe || 0)}` : "your home"})` : `E: ${p.name} (for sale, ${fmtMoney(p.price)})`,
        act: () => (o ? (p.kind === "home" ? homeMenu(p) : bizMenu(p)) : forSaleMenu(p)) });
    }
    return out;
  };

  // ---------- raids ----------
  let raidT = 300;
  function startRaid() {
    const biz = PR.list.filter((p) => own(p) && p.kind === "biz" && !own(p).raid); if (!biz.length) return;
    const p = pick(biz), o = own(p), crew = 7000 + Math.floor(rand(0, 999)), n = randi(4, 7);
    o.raid = { t: 150, crew };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      G.gang.push({ x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30, z: 0, vx: 0, vy: 0, vz: 0, a: a + Math.PI, hp: 80, state: "idle", t: rand(0, 2), crew, aware: false, cd: rand(0.5, 1.2), windup: 0, raid: p.id,
        outfit: { style: "gang", skin: pick(["#f1c27d", "#c68642", "#8d5524", "#e0ac69"]), shirt: "#1b1b1f", pants: "#2b2d42", accent: "#ff1f3d", hair: "#111", bat: Math.random() < 0.5 }, home: { x: p.x, y: p.y }, anim: { mode: "idle" } });
    }
    G.state.waypoint = { x: p.x, y: p.y };
    G.ui.banner("BUSINESS UNDER ATTACK", `${p.icon} ${p.name}: defend it within 2:30 or they take the safe`, "#ff1f3d"); G.audio.sfx("fail");
  }
  function updateRaids(dt) {
    for (const p of PR.list) {
      const o = own(p); if (!o || !o.raid) continue;
      o.raid.t -= dt;
      const left = G.gang.filter((e) => e.crew === o.raid.crew && e.state !== "down");
      if (!left.length) { const bonus = Math.round(rate(p) * 3); o.raid = null; G.addMoney(bonus); G.ui.banner("RAID DEFENDED", `${p.name} is safe · bonus +${fmtMoney(bonus)}`, "#19f5a0"); G.campaign.fireworks(p.x, p.y, 8); G.stats.raids = (G.stats.raids || 0) + 1; }
      else if (o.raid.t <= 0) { const lost = Math.floor(o.safe || 0); o.safe = 0; o.raid = null; for (const e of left) e.remove = true; G.ui.banner("RAID LOST", `They emptied the ${p.name} safe (−${fmtMoney(lost)})`, "#ff4d6d"); }
      else if (G.state.mode === "play" && dist(P.x, P.y, p.x, p.y) < 600) G.ui.objective(`⚠️ Defend ${p.name}: ${left.length} raiders · ${Math.ceil(o.raid.t)}s`);
    }
  }

  // ---------- 3D holo signs ----------
  const signs = new Map();
  function signTex(p) {
    const o = own(p), cv = document.createElement("canvas"); cv.width = 512; cv.height = 160; const g = cv.getContext("2d");
    const col = o ? p.color : "#7dffb0";
    g.fillStyle = "rgba(8,6,18,.55)"; g.beginPath(); g.roundRect ? g.roundRect(6, 6, 500, 148, 22) : g.rect(6, 6, 500, 148); g.fill();
    g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 18; g.stroke();
    g.textAlign = "center"; g.fillStyle = "#fff"; g.font = "bold 44px sans-serif"; g.fillText(`${p.icon} ${p.name}`, 256, 66);
    g.fillStyle = col; g.font = "bold 38px sans-serif";
    g.fillText(o ? (p.kind === "biz" ? `★ OWNED · LV ${o.lvl + 1}` : "★ YOUR HOME") : `FOR SALE · ${fmtMoney(p.price)}`, 256, 124);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
  }
  function refreshSign(p) {
    let s = signs.get(p.id);
    if (!s) {
      const g = new THREE.Group();
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); spr.scale.set(96, 30, 1); g.add(spr);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(26, 1.1, 8, 48), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })); ring.rotation.x = Math.PI / 2; ring.position.y = -24; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 400, 6, 1, true), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = 170; g.add(beam);
      const cx = p.b.x + p.b.w / 2, cy = p.b.y + p.b.h / 2; g.position.copy(V3(cx, cy, p.top + 34));
      G.render.scene.add(g); s = { g, spr, ring, beam }; signs.set(p.id, s);
    }
    if (s.spr.material.map) s.spr.material.map.dispose();
    s.spr.material.map = signTex(p); s.spr.material.needsUpdate = true;
    const o = own(p); s.ring.visible = !!o; s.beam.visible = !!o; s.ring.material.color.set(o ? p.color : "#7dffb0");
  }
  function updateSigns(time) {
    const cx = G.cam3.tgt.x, cy = G.cam3.tgt.z;
    for (const p of PR.list) {
      const s = signs.get(p.id); if (!s) continue;
      const near = Math.abs(p.x - cx) < 1600 && Math.abs(p.y - cy) < 1600; s.g.visible = near; if (!near) continue;
      s.spr.position.y = Math.sin(time * 1.6 + p.price) * 3; s.ring.rotation.z = time * 1.4; s.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.06);
      const o = own(p); if (o && o.raid) { s.ring.material.color.set(Math.sin(time * 10) > 0 ? "#ff1f3d" : "#ffffff"); }
    }
  }

  // ---------- phone app ----------
  PR.phone = function () {
    const owned = PR.list.filter(own), safeSum = owned.reduce((a, p) => a + (own(p).safe || 0), 0);
    G.ui.phoneMenu("Empire", [
      { label: `👑 ${PR.rank()}`, right: `net worth ${fmtMoney(PR.netWorth())}`, disabled: true },
      { label: `📈 Income`, right: `${fmtMoney(PR.income())}/hr · ${owned.length}/${PR.list.length} owned`, disabled: true },
      { label: `💰 Collect all safes remotely (−10% fee)`, right: fmtMoney(safeSum * 0.9), disabled: safeSum < 1, act: () => { let v = 0; for (const p of owned) { v += own(p).safe || 0; own(p).safe = 0; } G.addMoney(Math.floor(v * 0.9)); G.save(); PR.phone(); } },
      ...PR.list.map((p) => { const o = own(p); return { label: `${o ? p.icon : "🏷️"} ${p.name}`, right: o ? (o.raid ? "⚠️ RAID" : p.kind === "biz" ? `Lv${o.lvl + 1} · ${fmtMoney(o.safe || 0)}` : "home") : fmtMoney(p.price),
        act: () => { G.state.waypoint = { x: p.x, y: p.y }; G.ui.toast(`GPS set: ${p.name}`, p.color); G.ui.togglePhone(false); } }; }),
    ]);
  };

  // ---------- perks hooks ----------
  PR.courierMul = () => (PR.owns("logistics") ? 2 : 1);
  PR.copMul = () => (PR.owns("club") && W.districtAt(P.x, P.y) === "downtown" ? 1.6 : 1);

  PR.update = function (dt) {
    if (!G.state.started) return;
    tickIncome(); updateRaids(dt); updateSigns(G.time);
    if (G.state.mode === "play" && !G.missions.active) { raidT -= dt; if (raidT <= 0) { raidT = rand(300, 540); startRaid(); } }
  };
  PR.debugRaid = startRaid;
  PR.refreshAll = () => { for (const p of PR.list) refreshSign(p); for (const p of PR.list) if (own(p)) perkCar(p); lastHour = null; };
  PR.init = function () {
    place();
    for (const p of PR.list) refreshSign(p);
    if (G.finale && G.finale.ACH) G.finale.ACH.push(
      ["landlord", "🔑", "Landlord", "Buy your first property", () => PR.list.some(own)],
      ["tycoon", "🏙️", "Bay Baron", "Own every property in Neon Bay", () => PR.list.every(own)],
      ["mogul", "💼", "Mogul", "Reach a $1,000,000 net worth", () => PR.netWorth() >= 1e6],
      ["agent", "🦸", "Agent Ready", "Use an agent ultimate", () => (G.stats.ults || 0) >= 1],
    );
  };
})();
