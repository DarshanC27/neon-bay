// ---------- city jobs + the co-op heist ----------
// Highgate:      Sky Courier (helicopter: land on three skyscraper roofs)
// Port Calder:   Smuggler's Run (boat: round the coast to the Neon Bay marina)
// Sierra Vista:  Casino Getaway (3 stars from the start: lose them and reach the hideout)
// Highgate Vault (co-op, works solo too): one cracks the vault, the other drives the getaway car,
//                then both lose the cops and meet at the desert hideout. Synced over net.js "evt" messages.
(function () {
  const W = G.world, P = G.player, T = G.TILE;
  const J = (G.jobs = {});
  const M = () => G.missions;
  const near = (x, y, r) => dist(P.x, P.y, x, y) < r;
  const inCarNear = (x, y, r, vmax = 90) => P.car && dist(P.car.x, P.car.y, x, y) < r && P.car.speed < vmax;
  const spawnVehicle = (type, x, y, a, color) => { const c = new G.Car(type, x, y, a, color); c.keep = true; G.cars.push(c); return c; };

  // ---------------- job definitions ----------------
  // three Highgate towers (taller than 220 if there are enough, otherwise the tallest ones)
  const skyRoofs = () => {
    const pool = W.buildings.filter((b) => W.districtAt(b.x + b.w / 2, b.y + b.h / 2) === "hg_core" && !b.spire && b.poi !== "bank");
    const tall = pool.filter((b) => b.h3 > 220).sort((a, b) => a.seed - b.seed);
    const pick = tall.length >= 3 ? tall.slice(0, 3) : pool.sort((a, b) => b.h3 - a.h3).slice(0, 3);
    return pick.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, z: b.h3, b }));
  };
  // smuggling route: open water from Port Calder, round the west coast, up the channel to the Neon Bay marina
  const SMUG = [[20, 212.5], [3, 196], [3, 150], [3, 112], [40, 99.5], [99.5, 70], [99.5, 40], [94.6, 30]].map(([x, y]) => ({ x: x * T, y: y * T }));

  const DEFS = {
    sky: { name: "Sky Courier", city: "Highgate", icon: "🚁", color: "#22d3ee", reward: 6000, where: () => W.helipads.highgate,
      start(m) { const h = W.helipads.highgate; m.heli = spawnVehicle("heli", h.x + 70, h.y, 0, "#ffd60a"); m.drops = skyRoofs(); m.i = 0; m.hold = 0; m.timer = 210; },
      objective: (m) => (P.car !== m.heli ? "Get in the courier helicopter (F) · Space climb, Shift descend" : `Land on the marked rooftop (${m.i + 1}/${m.drops.length}) and hold still`),
      target: (m) => (P.car !== m.heli ? m.heli : m.drops[m.i]),
      tick(m, dt) {
        if (m.heli.wrecked) return "The helicopter crashed";
        const d = m.drops[m.i]; if (!d || P.car !== m.heli) return;
        const ok = dist(m.heli.x, m.heli.y, d.x, d.y) < 75 && m.heli.z >= d.z - 2 && m.heli.z < d.z + 30 && m.heli.speed < 70;
        m.hold = ok ? m.hold + dt : 0;
        if (m.hold > 1.2) { m.i++; m.hold = 0; G.audio.sfx("checkpoint"); G.ui.toast(`Package delivered (${m.i}/${m.drops.length})`, "#22d3ee"); if (m.i >= m.drops.length) return "done"; }
      },
      cleanup(m) { if (m.heli) m.heli.keep = P.car === m.heli; } },
    smuggle: { name: "Smuggler's Run", city: "Port Calder", icon: "🚤", color: "#ffa028", reward: 5000, where: () => W.marinas.calder,
      start(m) { const mr = W.marinas.calder; m.boat = spawnVehicle("boat", mr.x + 140, mr.y, 0, "#111111"); m.i = 0; m.timer = 170; },
      objective: (m) => (P.car !== m.boat ? "Take the black speedboat (F)" : `Run the coast to the Neon Bay marina · buoy ${m.i + 1}/${SMUG.length}`),
      target: (m) => (P.car !== m.boat ? m.boat : SMUG[m.i]),
      tick(m) {
        if (m.boat.wrecked) return "The boat sank";
        const cp = SMUG[m.i]; if (P.car === m.boat && dist(m.boat.x, m.boat.y, cp.x, cp.y) < 150) { m.i++; G.audio.sfx("checkpoint"); if (m.i >= SMUG.length) return "done"; }
      },
      cleanup(m) { if (m.boat) m.boat.keep = P.car === m.boat; } },
    casino: { name: "Casino Getaway", city: "Sierra Vista", icon: "🎰", color: "#ffd60a", reward: 8000, where: () => W.places.casino,
      start(m) { const p = W.places.casino, lp = W.randomLanePoint(p.x, p.y, 60, 400) || { x: p.x, y: p.y + 60, a: 0 }; m.car = spawnVehicle("muscle", lp.x, lp.y, lp.a, "#d00000"); m.stage = 0; m.timer = 240; G.crime(3, "Robbed the casino"); G.ui.banner("THE ALARM IS RINGING", "Get to the red muscle car!", "#ffd60a"); },
      objective: (m) => (m.stage === 0 ? "Get to the getaway car" : G.wanted.stars > 0 ? `Lose the cops (${G.wanted.stars}★)` : "Lie low at the hideout in the desert"),
      target: (m) => (m.stage === 0 ? m.car : W.places.hideout),
      tick(m) {
        if (m.stage === 0 && P.car === m.car) m.stage = 1;
        if (m.stage === 1 && G.wanted.stars === 0 && near(W.places.hideout.x, W.places.hideout.y, 170)) return "done";
      },
      cleanup(m) { if (m.car) m.car.keep = P.car === m.car; } },
  };

  // ---------------- co-op heist ----------------
  const HEIST_SOLO = 15000, HEIST_COOP = 25000, DRILL = 8;
  const net = () => (G.net && G.net.on ? G.net : null);
  const peer = (id) => (net() && id ? G.net.peers.get(id) : null);
  function send(to, s, extra) { if (net() && to) G.net.evt(to, Object.assign({ k: "heist", s }, extra || {})); }
  function startHeist(role, partner) {
    if (M().active) { G.ui.toast("Finish your current job first", "#ffa028"); return false; }
    const m = { kind: "job", id: "heist", title: "The Highgate Vault", role, partner, stage: role === "inside" ? "vault" : "getaway", drill: 0, timer: 420 };
    m.cleanup = (ok) => { if (!ok && !m.quiet) send(m.partner, "abort"); };
    M().active = m; G.audio.sfx("job");
    const pn = peer(partner);
    G.ui.banner("THE HIGHGATE VAULT", role === "inside" ? (pn ? `You crack the vault. ${pn.name} drives the getaway car.` : "Solo: crack the vault, then grab a car and run") : `${pn ? pn.name : "Your partner"} cracks the vault. You drive the getaway car.`, "#ffd60a");
  }
  J.onNet = function (from, d) {
    const m = M().active, p = peer(from), who = p ? p.name : "Your partner";
    if (d.s === "invite") {
      if (m) { send(from, "busy"); return; }
      startHeist("driver", from); G.ui.toast(`${who} started a heist: you're the getaway driver!`, "#ffd60a");
    } else if (!m || m.id !== "heist" || m.partner !== from) return;
    else if (d.s === "busy") { m.partner = null; G.ui.toast(`${who} is busy: you're going solo`, "#ffa028"); }
    else if (d.s === "drilled") { m.stage = "pickup"; G.crime(3, "Bank robbery"); G.ui.banner("VAULT CRACKED", `Pick up ${who}!`, "#ffd60a"); }
    else if (d.s === "done") { if (m.stage !== "run") m.stage = "run"; m.partnerHome = true; }
    else if (d.s === "abort") { m.quiet = true; M().fail(`${who} called off the heist`); }
  };
  function heistTick(m, dt) {
    const pn = peer(m.partner), H = W.places.hideout, B = W.places.bank, GA = W.places.getaway;
    if (m.partner && !pn) { m.partner = null; G.ui.toast("Your partner left: finish it solo", "#ffa028"); if (m.role === "driver") { m.quiet = true; return "Your partner left"; } }
    if (m.role === "inside") {
      if (m.stage === "vault") {
        const driverReady = !pn || (pn.car && dist(pn.car.x, pn.car.y, GA.x, GA.y) < 260);
        if (near(B.x, B.y, 46) && !P.car && Input.down("KeyE") && driverReady) {
          m.drill += dt; if (Math.random() < dt * 6) G.spawnFx("spark", B.x, B.y - 6, { z: 10, vx: rand(-80, 80), vy: rand(-80, 80), vz: 60, size: 2.5, life: 0.4, max: 0.4, color: "#ffd60a" });
          if (m.drill >= DRILL) { m.stage = pn ? "board" : "run"; G.crime(3, "Bank robbery"); send(m.partner, "drilled"); G.ui.banner("VAULT CRACKED", pn ? `Get in ${pn.name}'s car (F)` : "Grab a car and run!", "#ffd60a"); G.audio.sfx("success"); }
        }
      } else if (m.stage === "board") { if (P.ride && P.ride.id === m.partner) m.stage = "run"; }
    } else {
      if (m.stage === "pickup" && P.car && G.net.passengersOf(P.car).some((q) => q.key === "p:" + m.partner)) m.stage = "run";
    }
    if (m.stage === "run" && G.wanted.stars === 0 && near(H.x, H.y, 180)) {
      send(m.partner, "done"); m.quiet = true;
      return pn || m.partnerHome ? "coop" : "done";
    }
  }
  function heistObjective(m) {
    const pn = peer(m.partner), who = pn ? pn.name : "your partner";
    if (m.role === "inside") {
      if (m.stage === "vault") {
        const ready = !pn || (pn.car && dist(pn.car.x, pn.car.y, W.places.getaway.x, W.places.getaway.y) < 260);
        if (!near(W.places.bank.x, W.places.bank.y, 46)) return "Go to the BANK OF HIGHGATE";
        if (!ready) return `Wait for ${who} to bring a car to the getaway spot`;
        return `Hold E to crack the vault… ${Math.round((m.drill / DRILL) * 100)}%`;
      }
      if (m.stage === "board") return `Get in ${who}'s getaway car (F)`;
    } else {
      if (m.stage === "getaway") return P.car && dist(P.car.x, P.car.y, W.places.getaway.x, W.places.getaway.y) < 260 ? `Wait in the car: ${who} is cracking the vault` : "Bring a fast car to the getaway spot behind the bank";
      if (m.stage === "pickup") return `Pick up ${who}!`;
    }
    return G.wanted.stars > 0 ? `Lose the cops (${G.wanted.stars}★)` : "Get to the hideout in the Sierra Vista desert";
  }
  function heistTarget(m) {
    const pn = peer(m.partner);
    if (m.stage === "vault") return W.places.bank;
    if (m.stage === "getaway") return W.places.getaway;
    if (m.stage === "board") return pn ? (pn.car || pn) : null;
    if (m.stage === "pickup") return pn || null;
    return W.places.hideout;
  }

  // ---------------- glue for missions.js ----------------
  J.available = function () {
    const out = [];
    for (const [id, d] of Object.entries(DEFS)) { const w = d.where(); if (w) out.push({ x: w.x, y: w.y, color: d.color, r: 60, icon: d.icon, label: `E: ${d.city}: ${d.name} (${fmtMoney(d.reward)})`, act: () => startJob(id) }); }
    if (W.places.bank) out.push({ x: W.places.bank.x, y: W.places.bank.y, color: "#ffd60a", r: 46, icon: "💰", label: `E: The Highgate Vault: heist (co-op ${fmtMoney(HEIST_COOP)} each · solo ${fmtMoney(HEIST_SOLO)})`, act: inviteHeist });
    return out;
  };
  function inviteHeist() {
    let partner = null, bd = Infinity;
    if (net()) for (const p of G.net.peers.values()) if (p.vis) { const d = dist(p.x, p.y, P.x, P.y); if (d < bd) { bd = d; partner = p.id; } }
    if (startHeist("inside", partner) !== false && partner) send(partner, "invite");
  }
  J.startHeist = inviteHeist;
  function startJob(id) {
    if (M().active) return G.ui.toast("Finish your current job first", "#ffa028");
    const d = DEFS[id], m = { kind: "job", id, title: d.name, def: d, timer: null };
    m.cleanup = () => d.cleanup && d.cleanup(m);
    M().active = m; d.start(m); G.audio.sfx("job");
    G.ui.banner(d.name.toUpperCase(), `${d.city} · ${fmtMoney(d.reward)}`, d.color);
  }
  J.start = startJob;
  J.markers = function (m) {
    const t = m.id === "heist" ? heistTarget(m) : m.def.target(m);
    if (!t) return [];
    const z = t.z && !t.s ? t.z : 0;
    return [{ x: t.x, y: t.y, z, color: m.id === "heist" ? "#ffd60a" : m.def.color, r: 70, icon: m.id === "heist" ? "💰" : m.def.icon, main: true }];
  };
  J.update = function (m, dt) {
    const r = m.id === "heist" ? heistTick(m, dt) : m.def.tick(m, dt);
    G.ui.objective(m.id === "heist" ? heistObjective(m) : m.def.objective(m));
    if (r === "coop") return M().finish(HEIST_COOP, "HEIST COMPLETE", `Split with your crew · +${fmtMoney(HEIST_COOP)}`);
    if (r === "done") return M().finish(m.id === "heist" ? HEIST_SOLO : m.def.reward, m.id === "heist" ? "HEIST COMPLETE" : "JOB COMPLETE", `${m.title} · +${fmtMoney(m.id === "heist" ? HEIST_SOLO : m.def.reward)}`);
    if (r) return M().fail(r);
  };
  J.SMUG = SMUG;
})();
