// ---------- missions, side jobs, shops ----------
(function () {
  const W = G.world, P = G.player, T = G.TILE;
  const M = (G.missions = { active: null });
  const poi = (id) => W.pois[id];
  const inCarNear = (x, y, r = 80, maxSpeed = 70) => P.car && dist(P.car.x, P.car.y, x, y) < r && P.car.speed < maxSpeed;
  const near = (x, y, r) => dist(P.x, P.y, x, y) < r;

  function finish(reward, title, sub) {
    const m = M.active; M.active = null;
    if (m && m.cleanup) m.cleanup(true);
    G.addMoney(reward);
    G.ui.banner(title || "JOB COMPLETE", sub || `+${fmtMoney(reward)}`, "#19f5a0");
    G.audio.sfx("success");
    G.stats.jobs++;
    G.save();
  }
  function fail(reason) {
    const m = M.active; if (!m) return; M.active = null;
    if (m.cleanup) m.cleanup(false);
    G.ui.banner("JOB FAILED", reason, "#ff4d6d");
    G.audio.sfx("fail");
  }
  M.fail = fail; M.finish = finish;
  M.cancel = () => { if (M.active) fail("Cancelled"); };

  // ---------------- story ----------------
  const STORY = [
    {
      name: "Fresh Start", reward: 500,
      intro: [["Vince", "Kai! Back from the mainland at last. Neon Bay ain't the sleepy town you left."], ["Vince", "First rule here: you need wheels. Grab any car off the street. Nobody walks in the Bay."], ["Kai", "Any car?"], ["Vince", "Any car. Then take it to the Spray Shack and get it a new paint job. My treat."]],
      steps: [
        { text: "Get a car (walk up to one and press F)", done: () => !!P.car },
        { text: "Drive to the SPRAY SHACK", target: () => poi("spray"), done: () => inCarNear(poi("spray").x, poi("spray").y, 90, 120),
          after: () => { P.car.color = pick(["#ff3df2", "#22d3ee", "#ffd60a", "#19f5a0"]); P.car.hp = P.car.s.hp; P.car.dents = []; G.clearWanted(); } },
      ],
      outro: [["Vince", "Fresh paint, fresh start. Come by The Velvet when you're ready for real work."]],
    },
    {
      name: "Special Delivery", reward: 1500,
      intro: [["Vince", "I've got a van full of... let's call them 'imported speakers'."], ["Vince", "Get it to Bayside Freight down at the docks. Don't scratch it, and you've got 100 seconds."]],
      setup: (m) => { const v = new G.Car("van", poi("velvet").x, poi("velvet").y - 70, 0, "#f8f9fa"); v.keep = true; G.cars.push(v); m.van = v; },
      steps: [
        { text: "Get in the van", target: (m) => m.van, done: (m) => P.car === m.van },
        { text: "Deliver the van to BAYSIDE FREIGHT", timer: 100, target: () => poi("depot"), done: () => inCarNear(poi("depot").x, poi("depot").y, 110, 90),
          check: (m) => (m.van.hp < m.van.s.hp * 0.45 ? "The cargo got smashed" : P.car !== m.van && m.van.wrecked ? "Van destroyed" : null) },
      ],
      cleanup: (m) => { if (m.van) m.van.keep = false; },
      outro: [["Vince", "Clean work. My guys at the docks are impressed. That doesn't happen often."]],
    },
    {
      name: "Heat Check", reward: 3000,
      intro: [["Vince", "The Saltwater Boys parked a brand new Vortex GT outside Greenway Park. Showing off."], ["Vince", "Take it. Lose the heat. Bring it back to your crib and it's yours."], ["Kai", "The cops will be all over me."], ["Vince", "That's the fun part."]],
      setup: (m) => { const n = W.node(6, 1); const c = new G.Car("sports", n.x - 300, n.y + 34, Math.PI, "#f72585"); c.keep = true; G.cars.push(c); m.gt = c; },
      steps: [
        { text: "Steal the Vortex GT at Greenway Park", target: (m) => m.gt, done: (m) => P.car === m.gt, after: () => G.crime(2, "Stole the Vortex GT") },
        { text: "Lose the cops", done: () => G.wanted.stars === 0 },
        { text: "Bring the Vortex GT to YOUR CRIB", target: () => poi("safehouse"), done: (m) => P.car === m.gt && inCarNear(poi("safehouse").x, poi("safehouse").y, 110, 90),
          check: (m) => (m.gt.wrecked ? "The Vortex GT got destroyed" : null) },
      ],
      cleanup: (m, ok) => { if (ok) { G.state.owned.sports = true; } if (m.gt) m.gt.keep = false; },
      outro: [["Vince", "Ha! The Saltwater Boys are livid. That GT's yours now, kid. It's in your garage."]],
    },
    {
      name: "Kingpin Grand Prix", reward: 6000,
      intro: [["Marlo", "So you're the new kid making noise. Neon Bay belongs to whoever owns the roads."], ["Marlo", "Coastal Run. You, me and my boys. Win it and I'll step aside."], ["Kai", "Start your engine, old man."]],
      race: 2, needWin: true,
      outro: [["Marlo", "...Fine. The Bay's yours. For now."], ["Vince", "Kai. You did it. Neon Bay has a new name on everyone's lips."], ["Vince", "Free roam's all yours. Races, jobs, stunts... go make some noise."]],
    },
  ];
  M.STORY = STORY;

  function startStory() {
    const idx = G.state.story; const def = STORY[idx]; if (!def) return;
    G.ui.dialog(def.intro, () => {
      if (def.race !== undefined) return startRace(def.race, { story: def });
      const m = { kind: "story", title: def.name, def, step: 0, timer: null };
      if (def.setup) def.setup(m);
      m.cleanup = (ok) => def.cleanup && def.cleanup(m, ok);
      M.active = m; beginStep(m);
    });
  }
  function beginStep(m) {
    const s = m.def.steps[m.step];
    m.timer = s.timer || null;
    G.ui.objective(s.text);
  }
  function storyComplete(def) {
    G.state.story++;
    G.ui.dialog(def.outro, () => finish(def.reward, "MISSION COMPLETE", `${def.name}  +${fmtMoney(def.reward)}`));
  }

  // ---------------- delivery ----------------
  function startDelivery() {
    if (!P.car) return G.ui.toast("You need a vehicle for deliveries", "#ffa028");
    const d = poi("depot"); const lp = W.randomLanePoint(d.x, d.y, 1300, 3400);
    const dd = dist(d.x, d.y, lp.x, lp.y);
    const m = { kind: "delivery", title: "Courier Job", target: { x: lp.x, y: lp.y }, timer: Math.round(dd / 230 + 22), startHp: P.car.hp, car: P.car, dist: dd };
    M.active = m; G.ui.objective("Deliver the fragile package before time runs out");
    G.audio.sfx("job");
  }
  // ---------------- rideshare ----------------
  M.startRideshare = function () {
    if (!P.car) return G.ui.toast("Get in a car to start driving for RideBay", "#ffa028");
    if (M.active) return G.ui.toast("Finish your current job first", "#ffa028");
    M.active = { kind: "ride", title: "RideBay Driver", stage: "pickup", fares: 0, earned: 0 };
    newFare(); G.audio.sfx("job");
  };
  function newFare() {
    const m = M.active; const lp = W.randomLanePoint(P.x, P.y, 350, 1000);
    const p = G.makePed(0, 0, 0); p.x = lp.x + Math.sin(lp.a) * -70; p.y = lp.y - Math.cos(lp.a) * -70;
    if (W.pointBlocked(p.x, p.y, 6)) { p.x = lp.x; p.y = lp.y; }
    p.state = "wait"; p.fare = true; p.shirt = "#ffd60a"; G.peds.push(p);
    m.ped = p; m.stage = "pickup"; m.timer = null; G.ui.objective("Pick up your passenger (stop next to them)");
  }
  // ---------------- races ----------------
  function startRace(ri, opts = {}) {
    if (!P.car) return G.ui.toast("You need a car to race", "#ffa028");
    const r = W.raceRoutes[ri], s = r.start;
    const car = P.car; car.x = s.x; car.y = s.y; car.a = s.a; car.vx = car.vy = 0; car.z = 0;
    const fx = Math.cos(s.a), fy = Math.sin(s.a), rx = -fy, ry = fx;
    const names = opts.story ? ["Marlo", "Spike", "Dee"] : ["Rex", "Nova", "Jinx"];
    const racers = [[-34, -60], [34, -60], [0, -120]].map(([lat, back], i) => {
      const c = new G.Car(i === 0 && opts.story ? "super" : "sports", s.x + rx * lat + fx * back, s.y + ry * lat + fy * back, s.a);
      if (i === 0 && opts.story) c.color = "#fee440";
      c.driver = "racer"; c.keep = true; c.name = names[i];
      c.ai = { cps: r.checkpoints, idx: 0, skill: opts.story ? [1.05, 0.97, 0.94][i] : rand(0.9, 1.02), stuck: 0, rev: 0, lane: 0, started: false };
      G.cars.push(c); return c;
    });
    car.x += rx * 0; // player at pole
    // clear traffic on the start line
    for (const c of G.cars) if (c.driver === "ai" && dist(c.x, c.y, s.x, s.y) < 260) c.remove = true;
    G.cars = G.cars.filter((c) => !c.remove);
    const m = { kind: "race", title: opts.story ? opts.story.name : r.name, route: r, idx: 0, racers, countdown: 3.5, finished: [], story: opts.story, ri };
    m.cleanup = () => racers.forEach((c) => { c.keep = false; c.driver = c.wrecked ? null : "ai"; if (!c.wrecked) G.initTrafficAI(c, W.nearestNode(c.x, c.y).id, pick(W.nearestNode(c.x, c.y).nb)); });
    M.active = m; G.ui.objective(`${r.name}: hit every checkpoint`);
  }
  M.startRace = startRace;

  // ---------------- markers (world + minimap) ----------------
  M.markers = function () {
    const out = [];
    const m = M.active;
    if (m) {
      if (m.kind === "op") return G.campaign.markers(m);
      if (m.kind === "story") { const s = m.def.steps[m.step]; const t = s.target && s.target(m); if (t) out.push({ x: t.x, y: t.y, color: "#ffd60a", r: 60, icon: "★", main: true }); }
      if (m.kind === "delivery") out.push({ x: m.target.x, y: m.target.y, color: "#ffa028", r: 70, icon: "📦", main: true });
      if (m.kind === "ride") { if (m.stage === "pickup" && m.ped) out.push({ x: m.ped.x, y: m.ped.y, color: "#ffd60a", r: 50, icon: "🙋", main: true }); else if (m.target) out.push({ x: m.target.x, y: m.target.y, color: "#19f5a0", r: 70, icon: "🏁", main: true }); }
      if (m.kind === "race") { const cp = m.route.checkpoints[m.idx]; if (cp) out.push({ x: cp.x, y: cp.y, color: m.route.color, r: 100, icon: m.idx === m.route.checkpoints.length - 1 ? "🏁" : "◆", main: true, cp: true }); const n2 = m.route.checkpoints[m.idx + 1]; if (n2) out.push({ x: n2.x, y: n2.y, color: m.route.color, r: 70, icon: "◇", dim: true }); }
      return out;
    }
    out.push(...G.campaign.available());
    if (G.state.story < STORY.length) out.push({ x: poi("velvet").x, y: poi("velvet").y, color: "#ffd60a", r: 46, icon: "★", label: `E: Story: ${STORY[G.state.story].name}`, act: startStory });
    out.push({ x: poi("depot").x, y: poi("depot").y, color: "#ffa028", r: 46, icon: "📦", label: "E: Start a courier job", act: startDelivery });
    W.raceRoutes.forEach((r, i) => out.push({ x: r.start.x, y: r.start.y, color: r.color, r: 56, icon: "🏁", label: `E: Street race: ${r.name} (${fmtMoney(r.reward)})`, act: () => startRace(i) }));
    return out;
  };
  M.shops = function () {
    return [...(G.property ? G.property.markers() : []),
      { x: poi("spray").x, y: poi("spray").y, color: "#ff3df2", r: 60, icon: "🎨", label: "E: Spray Shack (respray, repair, lose the cops)", act: () => G.ui.shop("spray") },
      { x: poi("dealer").x, y: poi("dealer").y, color: "#22d3ee", r: 50, icon: "🚗", label: "E: Turbo Motors dealership", act: () => G.ui.shop("dealer") },
      { x: poi("safehouse").x, y: poi("safehouse").y, color: "#19f5a0", r: 50, icon: "🏠", label: "E: Your crib (save, sleep, garage)", act: () => G.ui.shop("safehouse") },
      { x: poi("burger").x, y: poi("burger").y, color: "#ff9f1c", r: 46, icon: "🍔", label: "E: Neon Bites", act: () => G.ui.shop("burger") },
      { x: poi("hospital").x, y: poi("hospital").y, color: "#ff4d6d", r: 46, icon: "✚", label: "E: Hospital", act: () => G.ui.shop("hospital") },
    ];
  };

  // ---------------- update ----------------
  M.update = function (dt) {
    const m = M.active;
    // interaction prompts
    let prompt = null;
    const pts = [...(m ? [] : M.markers()), ...M.shops()];
    for (const k of pts) if (k.act && near(k.x, k.y, k.r)) { prompt = k; break; }
    G.ui.prompt(prompt ? prompt.label : P.car ? null : nearestCarPrompt());
    if (prompt && Input.hit("KeyE")) { G.audio.sfx("click"); prompt.act(); return; }
    if (!m) return;
    if (m.timer !== null && m.timer !== undefined && m.kind !== "race") {
      m.timer -= dt;
      if (m.timer <= 0) return fail("Out of time");
    }
    if (m.kind === "op") return G.campaign.update(m, dt);
    if (m.kind === "story") {
      const s = m.def.steps[m.step];
      const bad = s.check && s.check(m); if (bad) return fail(bad);
      if (s.done(m)) {
        if (s.after) s.after(m);
        G.audio.sfx("checkpoint");
        m.step++;
        if (m.step >= m.def.steps.length) { M.active = null; if (m.cleanup) m.cleanup(true); storyComplete(m.def); }
        else beginStep(m);
      }
    } else if (m.kind === "delivery") {
      if (P.car !== m.car && (!P.car || P.car.wrecked)) { if (m.car.wrecked) return fail("Vehicle destroyed"); }
      if (m.car.hp < m.startHp - 35) return fail("The package broke. Drive gentler!");
      if (inCarNear(m.target.x, m.target.y, 90, 80)) {
        const pay = Math.round((350 + m.dist * 0.25 + m.timer * 12) * (G.property ? G.property.courierMul() : 1));
        G.stats.deliveries++; finish(pay, "DELIVERED", `+${fmtMoney(pay)}  (${Math.round(m.timer)}s to spare)`);
      }
    } else if (m.kind === "ride") {
      if (!P.car) { m.offCar = (m.offCar || 0) + dt; if (m.offCar > 10) return fail("You abandoned your rideshare shift"); } else m.offCar = 0;
      if (m.stage === "pickup") {
        if (!m.ped || m.ped.remove) return newFare();
        m.ped.a = Math.atan2(P.y - m.ped.y, P.x - m.ped.x);
        if (P.car && dist(P.car.x, P.car.y, m.ped.x, m.ped.y) < 95 && P.car.speed < 60) {
          m.ped.remove = true; G.peds = G.peds.filter((p) => !p.remove);
          const lp = W.randomLanePoint(P.x, P.y, 1000, 2800); const d = dist(P.x, P.y, lp.x, lp.y);
          m.target = { x: lp.x, y: lp.y }; m.dist = d; m.timer = Math.round(d / 210 + 18); m.stage = "drop"; m.startHp = P.car.hp;
          G.ui.objective(pick(["Take me downtown, I'm late!", "To the beach, please. No rush... actually, rush.", "Step on it, my ex is following me!", "Drive like the wind, friend!"]) + "  (drive to the marker)");
          G.audio.sfx("door");
        }
      } else if (m.stage === "drop") {
        if (P.car && dist(P.car.x, P.car.y, m.target.x, m.target.y) < 95 && P.car.speed < 70) {
          const dmg = m.startHp - P.car.hp, rating = clamp(5 - Math.floor(dmg / 12), 1, 5);
          const pay = Math.round(120 + m.dist * 0.18 + m.timer * 6 + rating * 20);
          G.addMoney(pay); m.fares++; m.earned += pay; G.stats.fares++;
          G.ui.toast(`Fare complete: ${"★".repeat(rating)}${"☆".repeat(5 - rating)}  +${fmtMoney(pay)}`, "#19f5a0"); G.audio.sfx("cash");
          m.stage = "wait"; m.target = null; m.timer = null; m.wait = 2.5; G.ui.objective("Finding your next passenger...");
        }
      } else if (m.stage === "wait") { m.wait -= dt; if (m.wait <= 0) newFare(); }
    } else if (m.kind === "race") {
      if (m.countdown > 0) {
        const before = Math.ceil(m.countdown); m.countdown -= dt; const after = Math.ceil(m.countdown);
        if (after !== before) { G.ui.bigCount(after > 0 ? String(after) : "GO!"); G.audio.sfx(after > 0 ? "beep" : "go"); }
        for (const c of [P.car, ...m.racers]) if (c) { c.vx = c.vy = 0; c.ctrl.t = 0; }
        if (m.countdown <= 0) { m.racers.forEach((c) => (c.ai.started = true)); m.startT = G.time; }
        return;
      }
      if (!P.car) { m.offCar = (m.offCar || 0) + dt; if (m.offCar > 8) return fail("You left your car"); }
      const cp = m.route.checkpoints[m.idx];
      if (P.car && dist(P.car.x, P.car.y, cp.x, cp.y) < 105) {
        m.idx++; G.audio.sfx("checkpoint");
        if (m.idx >= m.route.checkpoints.length) {
          const place = m.finished.length + 1, t = (G.time - m.startT).toFixed(1);
          const rew = m.story ? (place === 1 ? m.story.reward : 0) : [m.route.reward, Math.round(m.route.reward * 0.4), Math.round(m.route.reward * 0.15), 0][place - 1];
          G.stats.races++; if (place === 1) G.stats.raceWins++;
          if (m.story) {
            if (place === 1) { const def = m.story; M.active = null; m.cleanup(); G.state.story++; G.ui.dialog(def.outro, () => finish(def.reward, "YOU OWN THE BAY", `${def.name}: 1st place  +${fmtMoney(def.reward)}`)); return; }
            return fail(`You finished ${place}${["st", "nd", "rd", "th"][place - 1]}. Marlo laughs at you. Try again!`);
          }
          return finish(rew, place === 1 ? "🏆 1ST PLACE" : `FINISHED ${place}${["ST", "ND", "RD", "TH"][place - 1]}`, `${m.route.name} · ${t}s · +${fmtMoney(rew)}`);
        }
      }
      // standings
      const prog = (c, idx) => idx * 10000 - dist(c.x, c.y, m.route.checkpoints[Math.min(idx, m.route.checkpoints.length - 1)].x, m.route.checkpoints[Math.min(idx, m.route.checkpoints.length - 1)].y);
      const me = P.car ? prog(P.car, m.idx) : -1e9;
      m.pos = 1 + m.racers.filter((c) => (c.ai.done ? 1e9 : prog(c, c.ai.idx)) > me).length;
      G.ui.objective(`${m.route.name}: checkpoint ${m.idx + 1}/${m.route.checkpoints.length} · Position ${m.pos}/4`);
    }
  };
  M.onEvent = function (e) {
    if (e.type === "racerFinish" && M.active && M.active.kind === "race") M.active.finished.push(e.car);
  };
  function nearestCarPrompt() {
    for (const c of G.cars) if (!c.wrecked && c.driver !== "racer" && dist(c.x, c.y, P.x, P.y) < 64)
      return `F: ${c.driver === "ai" ? "Carjack" : c.driver === "police" ? "Steal police" : "Enter"} ${c.s.name}`;
    return null;
  }
})();
