// ---------- game state, main loop, save/load ----------
(function () {
  const W = G.world, P = G.player, cam = G.cam;
  const SAVE_KEY = "neonbay-save-v1";
  G.time = 0;
  G.settings = Object.assign({ traffic: 28, peds: 45, voices: true }, G.settings || {});
  G.weather = { rain: 0, target: 0, t: 90 };
  const freshState = () => ({ mode: "title", started: false, money: 500, hour: 18.6, story: 0, owned: {}, colors: {}, waypoint: null, flash: 0, zoomMul: 1, noCops: false, ops: {}, ach: {}, endingSeen: false, props: {} });
  const freshStats = () => ({ jobs: 0, deliveries: 0, fares: 0, races: 0, raceWins: 0, stunts: 0, bestAir: 0, topSpeed: 0, distance: 0, busted: 0, tokens: 0 });
  G.state = freshState(); G.stats = freshStats();

  G.addMoney = function (n) {
    G.state.money = Math.max(0, G.state.money + n);
    if (n > 0) { G.floatText(P.x, P.y - 30, `+${fmtMoney(n)}`, "#19f5a0"); G.audio.sfx("cash"); }
  };
  G.save = function () {
    if (!G.state.started) return;
    const s = G.state;
    const data = { money: s.money, hour: s.hour, story: s.story, owned: s.owned, colors: s.colors, stats: G.stats, settings: G.settings,
      tokens: W.tokens.map((t) => (t.got ? 1 : 0)), ramps: W.ramps.map((r) => (r.found ? 1 : 0)), pos: [P.x, P.y], ops: s.ops || {}, ach: s.ach || {}, endingSeen: !!s.endingSeen, props: s.props || {}, hero: P.hero, music: G.audio.musicVol, vol: G.audio.vol };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
  };
  G.hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      Object.assign(G.state, { money: d.money, hour: d.hour, story: d.story, owned: d.owned || {}, colors: d.colors || {}, ops: d.ops || {}, ach: d.ach || {}, endingSeen: !!d.endingSeen, props: d.props || {} });
      if (d.hero && G.heroes.LIST[d.hero]) P.hero = d.hero;
      Object.assign(G.stats, d.stats || {}); Object.assign(G.settings, d.settings || {});
      (d.tokens || []).forEach((v, i) => { if (W.tokens[i]) W.tokens[i].got = !!v; });
      (d.ramps || []).forEach((v, i) => { if (W.ramps[i]) W.ramps[i].found = !!v; });
      if (d.music !== undefined) G.audio.setMusic(d.music); if (d.vol !== undefined) G.audio.setVolume(d.vol);
      return d;
    } catch (e) { return null; }
  }

  // ---------- start / respawn ----------
  function placeAtPoi(id) { const p = W.pois[id]; P.x = p.x; P.y = p.y + 40; P.a = Math.PI / 2; G.heroes.reset(); G.render.snapCamera && G.render.snapCamera(); }
  function startCommon() {
    G.cars = []; G.peds = []; G.fx = []; G.skids = []; G.heli = null; G.heroes.clearGangs(); G.heroes.reset(); G.missions.active = null; G.wanted.stars = 0;
    P.car = null; P.hp = 100; P.nitro = 1;
    // parked cars in lots
    const prng = mulberry32(42);
    for (const s of W.parkingSpots) if (prng() < 0.6) { const c = new G.Car(pick(["sedan", "compact", "compact", "muscle", "van", "sedan"]), s.x, s.y, s.a); c.keep = true; c.parked = true; G.cars.push(c); }
    const sh = W.pois.safehouse; const starter = new G.Car("compact", sh.x + 90, sh.y - 60, 0, "#ffb703"); starter.keep = true; starter.starter = true; G.cars.push(starter);
    for (const [t, dx] of [["sportbike", 30], ["bicycle", 58]]) { const bk = new G.Car(t, sh.x + dx, sh.y - 18, Math.PI / 2); bk.keep = true; bk.parked = true; G.cars.push(bk); } // on the pavement by the door
    for (const s of W.parkingSpots) if (prng() < 0.12) { const bk = new G.Car(prng() < 0.6 ? "sportbike" : "bicycle", s.x + 28, s.y, s.a); bk.keep = true; bk.parked = true; if (!G.cars.some((c) => dist(c.x, c.y, bk.x, bk.y) < 30)) G.cars.push(bk); }
    G.populateInitial();
    G.state.mode = "play"; G.state.started = true;
    document.getElementById("title").classList.remove("on");
    document.getElementById("hud").classList.add("on");
    cam.x = P.x; cam.y = P.y; cam.zoom = 1.2; G.render.snapCamera();
    G.agents.clear(); G.property.refreshAll();
  }
  G.newGame = function () {
    G.audio.init();
    Object.assign(G.state, freshState()); G.stats = freshStats();
    W.tokens.forEach((t) => (t.got = false)); W.ramps.forEach((r) => (r.found = false));
    placeAtPoi("safehouse"); startCommon();
    G.ui.banner("WELCOME TO NEON BAY", "Head to ★ The Velvet to meet Vince", "#ff3df2");
    setTimeout(() => G.ui.toast("Tip: P opens your phone, M opens the map, Q changes the radio", "#22d3ee"), 3500);
    setTimeout(() => G.ui.toast("Tip: walk up to any car and press F to get in", "#22d3ee"), 8000);
    setTimeout(() => G.ui.toast("Press C to change suits: Spindle, Wraith and Nova have superpowers", "#ffd60a"), 12500);
    setTimeout(() => G.ui.toast("Click to use the mouse to look around · LMB punch · RMB / K special power", "#22d3ee"), 17000);
    G.state.waypoint = { x: W.pois.velvet.x, y: W.pois.velvet.y };
    G.audio.cycleStation();
    G.save();
  };
  G.continueGame = function () {
    G.audio.init();
    Object.assign(G.state, freshState());
    const d = load();
    if (d && d.pos) { P.x = d.pos[0]; P.y = d.pos[1]; if (W.pointBlocked(P.x, P.y, 8)) placeAtPoi("safehouse"); } else placeAtPoi("safehouse");
    startCommon(); G.ui.banner("WELCOME BACK", fmtMoney(G.state.money), "#22d3ee"); G.audio.cycleStation();
  };
  G.busted = function () {
    G.stats.busted++;
    const bail = Math.min(G.state.money, Math.max(100, Math.round(G.state.money * 0.1)));
    G.state.money -= bail;
    if (G.missions.active) G.missions.fail("You got caught");
    if (P.car) { P.car.driver = null; P.car = null; }
    G.cars = G.cars.filter((c) => c.driver !== "police"); G.clearWanted();
    placeAtPoi("police"); G.ui.banner("CAUGHT", `Bail paid: -${fmtMoney(bail)}`, "#4cc9f0"); G.audio.sfx("busted");
    cam.x = P.x; cam.y = P.y;
  };
  G.blackout = () => blackout();
  function blackout() {
    const fee = Math.min(G.state.money, 200); G.state.money -= fee;
    if (G.missions.active) G.missions.fail("You blacked out");
    G.cars = G.cars.filter((c) => c.driver !== "police"); G.clearWanted();
    if (P.car) { P.car.driver = null; P.car = null; }
    placeAtPoi("hospital"); P.hp = 100; G.ui.banner("BLACKED OUT", `Hospital bill: -${fmtMoney(fee)}`, "#ff4d6d"); G.audio.sfx("fail");
    cam.x = P.x; cam.y = P.y;
  }

  // ---------- simulation ----------
  let spawnT = 0;
  function simulate(dt, attract) {
    const S = G.state;
    S.hour = (S.hour + dt * 0.05) % 24;
    const wx = G.weather; wx.t -= dt;
    if (wx.t <= 0) { wx.target = Math.random() < 0.3 ? rand(0.5, 1) : 0; wx.t = rand(70, 160); }
    wx.rain += clamp(wx.target - wx.rain, -dt * 0.05, dt * 0.05);
    if (wx.rain > 0.6 && Math.random() < dt * 0.06) { S.flash = 0.7; setTimeout(() => G.audio.sfx("thunder"), 600); }
    S.flash = Math.max(0, S.flash - dt * 2.5);
    if (!attract) G.updatePlayer(dt);
    const tgt = P.car || P;
    G.activeCars = G.cars.filter((c) => Math.abs(c.x - tgt.x) < 1800 && Math.abs(c.y - tgt.y) < 1800);
    for (const c of G.activeCars) {
      if (c.driver === "ai") G.trafficAI(c, dt);
      else if (c.driver === "police") G.policeAI(c, dt);
      else if (c.driver === "racer") G.racerAI(c, dt);
      else if (!c.driver) { c.ctrl.t = 0; c.ctrl.s = 0; c.ctrl.hb = true; }
    }
    const env = { grip: 1 - wx.rain * 0.22 };
    for (const c of G.activeCars) {
      const ox = c.x, oy = c.y;
      c.update(dt, env);
      if (c.wrecked) c.wreckT += dt;
      // skid marks + tyre smoke
      if (c.z === 0 && c.slip > 115 && c.speed > 70 && Math.abs(c.x - tgt.x) < 1100) {
        const bx = -Math.cos(c.a) * c.s.w * 0.35, by = -Math.sin(c.a) * c.s.w * 0.35, rx = -Math.sin(c.a) * c.s.h * 0.38, ry = Math.cos(c.a) * c.s.h * 0.38;
        for (const sgn of [1, -1]) G.skids.push([ox + bx + rx * sgn, oy + by + ry * sgn, c.x + bx + rx * sgn, c.y + by + ry * sgn]);
        if (G.skids.length > 2400) G.skids.splice(0, 200);
        if (c === P.car && Math.random() < 0.5) G.spawnFx("smoke", c.x + bx, c.y + by, { size: 8, life: 0.9, max: 0.9, color: "#cfd3da" });
      }
      if ((c.hp < c.s.hp * 0.35 || c.wrecked) && Math.random() < (c.wrecked ? 0.5 : 0.2) && Math.abs(c.x - tgt.x) < 1200)
        G.spawnFx("smoke", c.x + rand(-6, 6), c.y + rand(-6, 6), { vy: -30, size: 7, life: 2, max: 2, color: c.wrecked && Math.random() < 0.4 ? "#ff7b00" : "#3a3a3a" });
      if (c.ctrl.boost && c === P.car) G.spawnFx("spark", c.x - Math.cos(c.a) * 26, c.y - Math.sin(c.a) * 26, { vx: -Math.cos(c.a) * 120, vy: -Math.sin(c.a) * 120, size: 4, life: 0.3, max: 0.3, color: Math.random() < 0.5 ? "#22d3ee" : "#c77dff" });
    }
    // world + car-car collisions
    for (const c of G.activeCars) {
      const imp = G.collideWorld(c, c.circles(), c.z);
      if (imp > 90) crash(c, null, imp);
    }
    const A = G.activeCars;
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
      const imp = G.collideCars(A[i], A[j]);
      if (imp > 70) crash(A[i], A[j], imp);
    }
    // other online players' cars and bodies
    if (G.net && G.net.on && !attract) G.net.collide((imp, rc) => {
      P.car.damage((imp - 70) * 0.11 * rc.s.mass); G.shake(Math.min(18, imp / 25)); G.audio.sfx("crash", clamp(imp / 400, 0.3, 1));
      for (let k = 0; k < Math.min(14, imp / 25); k++) G.spawnFx("spark", (P.car.x + rc.x) / 2, (P.car.y + rc.y) / 2, { vx: rand(-220, 220), vy: rand(-220, 220), size: 2.5, life: 0.4, max: 0.4, color: pick(["#ffd60a", "#ff9f1c", "#fff"]) });
    });
    // ramps
    for (const c of A) {
      if (c.z > 0 || c.speed < 170) continue;
      for (const r of W.ramps) {
        const dx = c.x - r.x, dy = c.y - r.y; if (Math.abs(dx) > 80 || Math.abs(dy) > 80) continue;
        const ca = Math.cos(-r.a), sa = Math.sin(-r.a), lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        if (Math.abs(lx) < r.w / 2 && Math.abs(ly) < r.h / 2 && Math.cos(angDiff(Math.atan2(c.vy, c.vx), r.a)) > 0.7) {
          c.vz = 200 + c.speed * 0.38; c.z = 1;
          if (c === P.car) { c.uniqueJump = !r.found; r.found = true; G.audio.sfx("stunt"); }
        }
      }
    }
    // landings
    for (const c of A) {
      if (!c.justLanded) continue;
      const air = c.justLanded; c.justLanded = 0;
      if (air > 0.3) { G.shake(c === P.car ? 8 : 0); for (let k = 0; k < 8; k++) G.spawnFx("smoke", c.x, c.y, { vx: rand(-80, 80), vy: rand(-80, 80), size: 6, life: 0.7, max: 0.7, color: "#b8b0a0" }); }
      if (c === P.car && air > 0.45) {
        const mult = c.uniqueJump ? 2 : 1, rew = Math.round((air * 320 + c.speed * 0.35) * mult);
        G.stats.stunts++; G.stats.bestAir = Math.max(G.stats.bestAir, air);
        G.addMoney(rew); G.ui.banner(c.uniqueJump ? "UNIQUE STUNT!" : air > 1.2 ? "INSANE STUNT!" : "STUNT!", `${air.toFixed(2)}s airtime · +${fmtMoney(rew)}`, "#ffd60a");
        c.uniqueJump = false;
      }
    }
    if (!attract) G.heroes.update(dt);
    // pedestrians
    for (const p of G.peds) G.updatePed(p, dt);
    G.peds = G.peds.filter((p) => !p.remove);
    for (const c of A) {
      if (c.speed < 40 || c.z > 10) continue;
      for (const p of G.peds) {
        const d = dist(c.x, c.y, p.x, p.y);
        if (d < 120 && c.speed > 180 && p.state === "walk") { const f = (p.x - c.x) * Math.cos(c.a) + (p.y - c.y) * Math.sin(c.a); if (f > 0) G.scarePed(p, c.x, c.y); }
        if (d < c.s.h / 2 + 12 && p.state !== "down") {
          if (c.speed > 90) {
            p.state = "down"; p.timer = 3; p.x += Math.cos(c.a) * 20; p.y += Math.sin(c.a) * 20;
            if (c === P.car) { if (G.time - (P.lastPedHit || -99) > 4) { G.crime(1, "Hit a pedestrian", 3); P.lastPedHit = G.time; } c.damage(3); }
          } else { p.x += (p.x - c.x) / (d || 1) * 6; p.y += (p.y - c.y) / (d || 1) * 6; }
        }
      }
    }
    // player on foot hit by cars
    if (!P.car && !P.ride && !attract) for (const c of A) {
      if (c.speed > 140 && c.z < 10 && (P.z || 0) < 10 && dist(c.x, c.y, P.x, P.y) < c.s.h / 2 + 10 && P.hitCd <= 0) {
        P.hp -= c.speed * 0.07; P.hitCd = 0.8; P.x += c.vx * 0.08; P.y += c.vy * 0.08; G.shake(10); G.audio.sfx("crash", 0.6);
        if (P.hp <= 0) return blackout();
      }
    }
    // events
    for (const e of G.events.splice(0)) {
      if (e.type === "wreck") {
        const c = e.car;
        if (dist(c.x, c.y, tgt.x, tgt.y) < 900) { for (let k = 0; k < 40; k++) G.spawnFx(k % 3 ? "spark" : "smoke", c.x, c.y, { vx: rand(-260, 260), vy: rand(-260, 260), size: rand(3, 9), life: rand(0.5, 1.4), max: 1.4, color: pick(["#ff7b00", "#ffd60a", "#ff2e2e", "#444"]) }); G.audio.sfx("boom"); G.shake(16); }
        if (c === P.car) { G.exitCarForce(); G.ui.toast("Your car is wrecked! Find another ride.", "#ff4d6d"); if (P.hp <= 0) return blackout(); }
        if (c.driver === "police" && P.car) G.crime(1, "Wrecked a police car");
        if (c.driver === "ai") c.driver = null;
      } else if (e.type === "honk" && dist(e.x, e.y, P.x, P.y) < 500) G.audio.sfx("horn", 0.5);
      G.missions.onEvent(e);
    }
    // tokens
    if (!attract) for (const t of W.tokens) if (!t.got && dist(t.x, t.y, P.x, P.y) < 36 && (P.car ? P.car.z : P.z || 0) < 40) {
      t.got = true; G.stats.tokens++; const n = W.tokens.filter((k) => k.got).length;
      G.audio.sfx("token"); G.addMoney(250); G.ui.toast(`Neon token ${n}/25`, "#22d3ee");
      if (n === 25) { G.addMoney(10000); G.state.owned.super = true; G.ui.banner("ALL 25 TOKENS!", "+$10,000 and a free Neon X in your garage", "#22d3ee"); }
    }
    if (P.car) { G.stats.distance += P.car.speed * dt * 0.1; G.stats.topSpeed = Math.max(G.stats.topSpeed, P.car.speed); }
    if (!attract) { G.updateWanted(dt); G.missions.update(dt); }
    spawnT -= dt; if (spawnT <= 0) { spawnT = 0.2; G.manageSpawns(); }
    G.render.updateFx(dt);
  }
  function crash(a, b, imp) {
    const dmg = (imp - 70) * 0.11;
    a.damage(dmg * (b ? b.s.mass : 1.2)); if (b) b.damage(dmg * a.s.mass);
    const involved = a === P.car || b === P.car;
    if (involved && P.car.s.bike && imp > 150 && !P.car.wrecked) { // thrown over the handlebars
      const bk = P.car; G.exitCarForce(); P.hp -= Math.min(35, imp * 0.06); P.vx = bk.vx * 0.6; P.vy = bk.vy * 0.6; P.vz = 160; P.z = 4;
      G.ui.toast("You were thrown off the bike!", "#ff4d6d"); if (P.hp <= 0) return blackout();
    }
    if (involved) {
      G.shake(Math.min(18, imp / 25)); G.audio.sfx("crash", clamp(imp / 400, 0.3, 1));
      const other = a === P.car ? b : a;
      if (other && other.driver === "police" && imp > 140) G.crime(1, "Rammed a police car");
    }
    if (Math.abs(a.x - P.x) < 1000 && Math.abs(a.y - P.y) < 1000) for (let k = 0; k < Math.min(14, imp / 25); k++) G.spawnFx("spark", a.x + (b ? (b.x - a.x) / 2 : 0), a.y + (b ? (b.y - a.y) / 2 : 0), { vx: rand(-220, 220), vy: rand(-220, 220), size: 2.5, life: 0.4, max: 0.4, color: pick(["#ffd60a", "#ff9f1c", "#fff"]) });
  }

  // ---------- camera ----------
  function updateCamera(dt, attract) { G.render.updateCamera(dt, attract); }
  addEventListener("wheel", (e) => { if (G.state.mode === "play") G.state.zoomMul = clamp(G.state.zoomMul * (e.deltaY > 0 ? 0.92 : 1.08), 0.55, 1.6); }, { passive: true });

  // ---------- input routing ----------
  function handleKeys() {
    const S = G.state, mode = S.mode;
    if (mode === "play") {
      if (Input.hit("KeyF")) { if (P.ride) G.net.leaveRide(); else if (P.car) G.exitCar(); else if (!(G.net && G.net.tryRide()) ) G.enterNearestCar(); }
      if (Input.hit("KeyM")) { G.render.releaseMouse(); G.ui.toggleMap(true); }
      else if (Input.hit("KeyP", "Tab")) { G.render.releaseMouse(); G.ui.togglePhone(true); }
      else if (Input.hit("Escape")) G.ui.togglePause(true);
      if (Input.hit("KeyQ")) G.audio.cycleStation();
      if (Input.hit("KeyC") && !P.car) G.heroes.cycle();
      if (Input.hit("A_cancel") && G.missions.active) G.missions.cancel();
      if (Input.hit("A_crimson")) { if (P.car) G.ui.toast("Get out of the car to suit up", "#ff1f3d"); else G.heroes.crimson(); }
      if (Input.hit("A_agent")) G.agents.openSelect();
      if (Input.hit("A_empire")) { G.render.releaseMouse(); G.ui.togglePhone(true); G.property.phone(); }
      if (Input.hit("A_photo")) { document.body.classList.toggle("photo"); G.ui.toast(document.body.classList.contains("photo") ? "Photo mode: HUD hidden (press again to show)" : "HUD back on", "#c77dff"); }
      if (G.net) G.net.keys();
      if (Input.hit("KeyR") && P.car && P.car.speed < 30) { P.car.a += Math.PI; P.car.vx = P.car.vy = 0; }
      if (Input.hit("A_trans")) { G.settings.manual = !G.settings.manual; G.ui.toast(G.settings.manual ? `Manual gearbox ON · ${G.controls.label("gearUp")} up · ${G.controls.label("gearDn")} down` : "Automatic gearbox", "#ffd60a"); if (P.car) { P.car.gear = 1; P.car.shiftT = 0; } G.save(); }
    } else if (mode === "map") { if (Input.hit("KeyM", "Escape")) G.ui.toggleMap(false); }
    else if (mode === "phone") { if (Input.hit("KeyP", "Tab")) G.ui.togglePhone(false); else G.ui.updatePhone(); }
    else if (mode === "shop") G.ui.updateMenu();
    else if (mode === "pause") { if (Input.hit("Escape")) G.ui.togglePause(false); }
    else if (mode === "agents") G.agents.updateSelect(1 / 60);
    else if (mode === "help") { if (Input.hit("Escape", "Enter", "Space")) G.ui.showHelp(false); }
  }

  // ---------- loop ----------
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  G.fps = 60;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; G.time += dt;
    fpsAcc += dt; fpsN++; if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    const S = G.state;
    try {
      G.controls.update(dt);
      handleKeys();
      const attract = S.mode === "title";
      const sdt = dt * (G.timeScale || 1);
      if (S.mode === "play" && G.heroes.consumeHitstop(dt)) { /* hit-stop freeze frame */ }
      else if (S.mode === "play" || attract) simulate(sdt, attract);
      else if (S.mode === "cine") { G.finale.update(dt); G.render.updateFx(sdt); }
      G.finale.tick(dt);
      if (S.mode === "play") G.agents.update(sdt);
      G.property.update(dt); G.agents.light();
      if (G.net) G.net.update(dt);
      updateCamera(dt, attract);
      G.audio.update(dt);
      const markers = attract ? [] : [...G.missions.markers(), ...G.missions.shops()];
      G.spectacle.update(dt, G.time);
      G.render.draw(G.time, { markers });
      if (S.started) G.campaign.updateUI();
      if (S.mode !== "play" && S.mode !== "title") G.render.releaseMouse();
      if (S.started) G.ui.update(dt);
    } catch (err) { console.error(err); G.lastError = err; }
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  setInterval(() => { if (G.state.started && G.state.mode === "play") G.save(); }, 30000);

  // ---------- boot ----------
  G.boot = function () {
    G.render.init(document.getElementById("game"));
    G.ui.init(); G.campaign.init(); G.spectacle.init(); G.finale.init(); G.controls.init(); G.agents.init(); G.property.init(); if (G.net) G.net.init();
    G.state.hour = 20.5;
    P.x = 40 * 64; P.y = 40 * 64;
    G.populateInitial();
    document.getElementById("btnContinue").style.display = G.hasSave() ? "" : "none";
    requestAnimationFrame(frame);
  };
  G.debug = {
    setTime: (h) => (G.state.hour = h), rain: (r) => { G.weather.rain = r; G.weather.target = r; G.weather.t = 999; },
    money: (n) => G.addMoney(n), wanted: (n) => G.crime(n, "Debug"), tp: (id) => { const p = W.pois[id]; if (P.car) { P.car.x = p.x; P.car.y = p.y + 40; } else { P.x = p.x; P.y = p.y + 40; P.z = 0; } G.render.snapCamera(); },
    hero: (id) => G.heroes.setHero(id), raid: () => G.property.debugRaid(), crew: () => G.heroes.spawnCrew(),
  };
})();
