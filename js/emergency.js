// ---------- city emergency services ----------
// Crashes in the cities are attended to:
//   ambulance  -> paramedics run to people knocked down by cars (or the wreck's driver) and give CPR
//   fire engine -> burning wrecks are put out with a hose (water spray + steam)
//   tow truck  -> once the fire is out, the wreck is hooked up and hauled away
// Traffic pulls over to the kerb for any siren coming up behind it (yieldFor, used by trafficAI).
// You can also give first aid yourself (E next to an injured person) before the ambulance gets there.
// Everything here is local ambient simulation, like traffic: nothing is synced over the network.
(function () {
  const W = G.world, P = G.player;
  const E = (G.ems = { incidents: [], units: [], sirens: [], helped: 0 });
  const MAX_UNITS = 4, RANGE = 1500, DROP = 2300;
  const TYPE = { med: "ambulance", fire: "firetruck", tow: "tow" };
  const LOOK = {
    med: { shirt: "#1f5f4a", pants: "#1d2b25", hair: "#2b2118" },   // green paramedic uniform
    fire: { shirt: "#c9a227", pants: "#c9a227", hair: "#b3121f" },  // turnout gear, red helmet
    tow: { shirt: "#ff7b00", pants: "#343a40", hair: "#3b2a1a" },   // hi-vis
  };
  let scanT = 0;

  // ---------------- incidents ----------------
  function incidentNear(x, y) { return E.incidents.find((i) => dist(i.x, i.y, x, y) < 320); }
  function report(x, y) {
    let inc = incidentNear(x, y);
    if (!inc) { inc = { x, y, cars: [], peds: [], t: 0, units: {} }; E.incidents.push(inc); }
    return inc;
  }
  function scan() {
    const tgt = P.car || P;
    for (const c of G.cars) {
      if (!c.wrecked || c.emsSeen || c.driver === "remote" || c.s.air || c.s.boat || c.s.ems || c.towedBy) continue;
      if (dist(c.x, c.y, tgt.x, tgt.y) > RANGE || !W.cityAt(c.x, c.y) || !W.isRoad(c.x, c.y)) continue;
      c.emsSeen = true;
      if (c.burning === undefined) c.burning = Math.random() < 0.55 ? 1 : 0; // about half of wrecks catch fire
      const inc = report(c.x, c.y); inc.cars.push(c);
      if (Math.random() < 0.5) inc.driverHurt = true; // someone was hurt in the crash
    }
    for (const p of G.peds) {
      if (!p.injured || p.emsSeen || p.state !== "down") continue;
      if (dist(p.x, p.y, tgt.x, tgt.y) > RANGE || !W.cityAt(p.x, p.y)) continue;
      p.emsSeen = true; report(p.x, p.y).peds.push(p);
    }
  }
  // what each incident still needs
  const burning = (inc) => inc.cars.some((c) => c.burning > 0 && G.cars.includes(c));
  const hurt = (inc) => inc.peds.some((p) => p.injured && G.peds.includes(p)) || (inc.driverHurt && !inc.driverTreated);
  const wrecks = (inc) => inc.cars.filter((c) => G.cars.includes(c) && !c.towedBy && !c.towed);
  function needs(inc) {
    const out = [];
    if (hurt(inc)) out.push("med");
    if (burning(inc)) out.push("fire");
    else if (wrecks(inc).length) out.push("tow"); // the tow truck waits until the fire is out
    return out;
  }

  // ---------------- dispatch ----------------
  function dispatch(inc, role) {
    // ambulances come from the hospital when it's close enough, everyone else from a road off-screen
    const hos = W.pois.hospital;
    let lp = role === "med" && hos && dist(hos.x, hos.y, inc.x, inc.y) < 1400 ? W.lanePointNear(hos.x, hos.y, 60, 300) : null;
    lp = lp || W.lanePointNear(inc.x, inc.y, 700, 1100);
    if (!lp || G.cars.some((c) => dist(c.x, c.y, lp.x, lp.y) < 60)) return;
    const car = new G.Car(TYPE[role], lp.x, lp.y, lp.a);
    car.driver = "ems"; car.keep = true; car.siren = role !== "tow"; car.beacon = role === "tow";
    car.ai = { stuck: 0, rev: 0, repath: 0, path: null };
    const u = { car, role, inc, stage: "enroute", t: 0, crew: [], work: 0 };
    car.unit = u; inc.units[role] = u; E.units.push(u); G.cars.push(car);
    if (dist(inc.x, inc.y, P.x, P.y) < 900 && role !== "tow") G.ui.toast(role === "med" ? "🚑 An ambulance is on its way" : "🚒 The fire brigade is on its way", "#ff4d6d");
  }

  // ---------------- driving (route over the road graph, like the police) ----------------
  E.drive = function (car, dt) {
    const u = car.unit, c = car.ctrl;
    if (!u || car.wrecked) { c.t = 0; c.hb = true; return; }
    if (u.stage !== "enroute" && u.stage !== "leave") { c.t = 0; c.s = 0; c.hb = true; return; } // parked at the scene
    const ai = car.ai;
    if (ai.rev > 0) { ai.rev -= dt; c.t = -1; c.s = ai.revSteer; c.hb = false; return; }
    const tx = u.park.x, ty = u.park.y, d = dist(car.x, car.y, tx, ty);
    let ax = tx, ay = ty;
    if (d > 260) {
      ai.repath -= dt;
      if (ai.repath <= 0 || !ai.path || !ai.path.length) { ai.repath = 2; ai.path = W.nodePath(W.nearestNode(car.x, car.y).id, W.nearestNode(tx, ty).id); }
      // drop junctions we've reached, or that are behind us on the road to the next one (no driving back to turn round)
      while (ai.path.length > 1) {
        const n0 = W.nodes[ai.path[0]], n1 = W.nodes[ai.path[1]];
        if (dist(car.x, car.y, n0.x, n0.y) < 90 || (car.x - n0.x) * (n1.x - n0.x) + (car.y - n0.y) * (n1.y - n0.y) > 0) ai.path.shift(); else break;
      }
      const n = W.nodes[ai.path[0]]; ax = n.x; ay = n.y;
    }
    const diff = angDiff(car.a, Math.atan2(ay - car.y, ax - car.x));
    let steer = diff * 2.4;
    const probe = (ang, len) => !!W.pointBlocked(car.x + Math.cos(car.a + ang) * len, car.y + Math.sin(car.a + ang) * len, 4);
    if (probe(0, 60)) steer += probe(-0.6, 64) ? 1.2 : -1.2;
    else { if (probe(-0.5, 54)) steer += 0.7; if (probe(0.5, 54)) steer -= 0.7; }
    c.s = clamp(steer, -1, 1); c.hb = false; c.boost = false;
    // fast but careful: slow for corners, ease off on approach, stop for whatever is right in front
    let want = car.s.max * 0.62;
    if (Math.abs(diff) > 0.6) want = Math.min(want, 120);
    if (d < 260) want = Math.min(want, 40 + d * 0.6);
    const ob = G.obstacleAhead(car, 40 + car.speed * 0.35);
    if (ob && ob !== P && ob !== P.car) want = Math.min(want, 25); else if (ob) want = 0;
    const v = car.vF || 0;
    c.t = v < want - 12 ? 1 : v > want + 20 ? -0.8 : 0.1;
    if (car.speed < 6 && !ob && d > 80) { ai.stuck += dt; if (ai.stuck > 1.8) { ai.stuck = 0; ai.rev = 1.1; ai.revSteer = diff > 0 ? -1 : 1; } } else ai.stuck = 0;
  };

  // ---------------- traffic yields to sirens ----------------
  // returns how far (0..1) this traffic car should be pulled over to the kerb
  E.yieldFor = function (car, cur, dt) {
    let want = 0;
    for (const s of E.sirens) {
      if (s === car) continue;
      const dx = car.x - s.x, dy = car.y - s.y, d = Math.hypot(dx, dy);
      if (d > 320 || d < 1) continue;
      const fx = Math.cos(car.a), fy = Math.sin(car.a);
      const sameWay = Math.cos(car.a - s.a) > 0.5, behind = (dx * fx + dy * fy) > 0, inLane = Math.abs(-dx * fy + dy * fx) < 70;
      if (sameWay && behind && inLane) { want = 1; break; }
    }
    return clamp(cur + (want - cur) * Math.min(1, dt * 2.2), 0, 1);
  };

  // ---------------- crews on foot ----------------
  function crewMember(u, k) {
    const c = u.car, side = k ? 1 : -1, p = G.makePed(0, 0, 0), lk = LOOK[u.role];
    p.x = c.x - Math.sin(c.a) * side * 22 - Math.cos(c.a) * 8; p.y = c.y + Math.cos(c.a) * side * 22 - Math.sin(c.a) * 8;
    Object.assign(p, { crew: u.role, state: "crew", shirt: lk.shirt, pants: lk.pants, hair: lk.hair, speed: 95, a: c.a, _of: null });
    G.peds.push(p); u.crew.push(p); return p;
  }
  // walk a crew member to (x, y); true when there
  function walkTo(p, x, y, dt, stop = 10) {
    const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    if (d < stop) { p.moving = false; return true; }
    const s = Math.min(d, p.speed * dt); p.x += (dx / d) * s; p.y += (dy / d) * s; p.a = Math.atan2(dy, dx); p.walk += dt * 9;
    p.state = "crew"; p.act = null; p.moving = true; return false;
  }
  const face = (p, x, y) => (p.a = Math.atan2(y - p.y, x - p.x));

  function water(p, tx, ty) { // hose spray towards (tx, ty): a jet of droplets plus steam where it lands
    const a = Math.atan2(ty - p.y, tx - p.x), d = dist(p.x, p.y, tx, ty);
    if (dist(p.x, p.y, (P.car || P).x, (P.car || P).y) > 1100) return;
    for (let k = 0; k < 2; k++) G.spawnFx("spark", p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, { z: 9, vx: Math.cos(a) * d * 1.6 + rand(-20, 20), vy: Math.sin(a) * d * 1.6 + rand(-20, 20), vz: 70, size: 2.2, life: 0.55, max: 0.55, color: "#bfe6ff" });
    if (Math.random() < 0.35) G.spawnFx("smoke", tx + rand(-10, 10), ty + rand(-10, 10), { z: 8, vx: rand(-15, 15), vy: rand(-15, 15), vz: 40, size: 12, life: 1.6, max: 1.6, color: "#e8eef2" });
  }
  function flames(c, dt) { // a burning wreck: flickering fire and a column of black smoke
    if (dist(c.x, c.y, (P.car || P).x, (P.car || P).y) > 1100 || Math.random() > dt * 40) return;
    G.spawnFx("spark", c.x + rand(-12, 12), c.y + rand(-8, 8), { z: 10, vx: rand(-15, 15), vy: rand(-15, 15), vz: rand(50, 110), size: rand(3, 6), life: 0.6, max: 0.6, color: pick(["#ff7b00", "#ffd60a", "#ff3d00"]) });
    if (Math.random() < 0.4) G.spawnFx("smoke", c.x, c.y, { z: 16, vx: rand(-10, 10), vy: rand(-10, 10), vz: 55, size: 14, life: 2.6, max: 2.6, color: "#2b2b2b" });
  }

  // ---------------- per-unit behaviour at the scene ----------------
  function parkSpot(inc, role) { // stop on the road short of the scene, so the crew walks the last bit
    const n = W.lanePointNear(inc.x, inc.y, role === "fire" ? 70 : 55, 170);
    return n ? { x: n.x, y: n.y } : { x: inc.x + 90, y: inc.y };
  }
  function leave(u) {
    for (const p of u.crew) p.remove = true;
    u.crew = []; u.stage = "leave"; const c = u.car;
    c.siren = false; c.beacon = u.role === "tow" && !!u.load;
    const n = W.nearestNode(c.x, c.y); G.initTrafficAI(c, n.id, pick(n.nb));
    c.driver = "ai"; c.keep = false; c.copLeaving = true; c.ai.cruise = 160;
    if (u.inc.units[u.role] === u) delete u.inc.units[u.role];
  }
  function scene(u, dt) {
    const inc = u.inc, c = u.car;
    u.t += dt;
    if (u.role === "med") {
      // the patient: an injured pedestrian, otherwise the driver of the wreck
      let pt = inc.peds.find((p) => p.injured && G.peds.includes(p));
      const wreck = wrecks(inc)[0] || inc.cars[0];
      const target = pt || (inc.driverHurt && !inc.driverTreated && wreck ? { x: wreck.x - Math.sin(wreck.a) * 24, y: wreck.y + Math.cos(wreck.a) * 24 } : null);
      if (!target) return backToVan(u, dt);
      let there = 0;
      u.crew.forEach((p, k) => {
        const off = k ? 13 : -13;
        if (walkTo(p, target.x + off, target.y + 6, dt, 4)) { there++; face(p, target.x, target.y); p.act = k ? "kneel" : "cpr"; }
      });
      if (there === u.crew.length) u.work += dt;
      if (u.work > 6) { // patient is stable
        if (pt) { pt.injured = false; pt.timer = 0.4; pt.bubble = 2; } else inc.driverTreated = true;
        u.work = 0;
        if (dist(c.x, c.y, P.x, P.y) < 700) G.ui.toast(pt ? "🚑 The paramedics got them back on their feet" : "🚑 The driver has been treated", "#19f5a0");
      }
    } else if (u.role === "fire") {
      const fire = inc.cars.find((w) => w.burning > 0 && G.cars.includes(w));
      if (!fire) return backToVan(u, dt);
      u.crew.forEach((p, k) => {
        if (!p.spot) { const a = Math.atan2(c.y - fire.y, c.x - fire.x) + (k ? 0.55 : -0.55); p.spot = { x: fire.x + Math.cos(a) * 40, y: fire.y + Math.sin(a) * 40 }; } // fixed spot on the engine's side
        if (walkTo(p, p.spot.x, p.spot.y, dt, 6)) { face(p, fire.x, fire.y); p.act = "hose"; water(p, fire.x, fire.y); fire.burning -= dt * 0.09; }
      });
      if (fire.burning <= 0) {
        fire.burning = 0;
        for (let k = 0; k < 10; k++) G.spawnFx("smoke", fire.x + rand(-14, 14), fire.y + rand(-10, 10), { z: 10, vx: rand(-20, 20), vy: rand(-20, 20), vz: rand(30, 70), size: 16, life: 2.4, max: 2.4, color: "#eef2f4" });
        if (dist(c.x, c.y, P.x, P.y) < 700) G.ui.toast("🚒 Fire's out", "#19f5a0");
      }
    } else { // tow: walk round to the wreck, hook it up, drive off with it
      const wreck = u.load || wrecks(inc)[0];
      if (!wreck) return backToVan(u, dt);
      const p = u.crew[0];
      if (!u.load) {
        if (p && walkTo(p, wreck.x, wreck.y, dt, 26)) { face(p, wreck.x, wreck.y); p.act = "hook"; u.work += dt; }
        if (u.work > 3.5) { u.load = wreck; wreck.towedBy = c; wreck.towed = true; wreck.keep = true; u.work = 0; G.audio.sfx("door", 0.6); }
      } else if (backToVan(u, dt, true)) leave(u);
    }
  }
  // everyone back in the vehicle; then it drives off (returns true once they're all in)
  function backToVan(u, dt, keepGoing) {
    const c = u.car; let all = true;
    for (const p of u.crew) if (!walkTo(p, c.x - Math.cos(c.a) * 6, c.y - Math.sin(c.a) * 6, dt, 16)) all = false;
    if (all && !keepGoing) { leave(u); return true; }
    return all;
  }

  // ---------------- a tow truck carries its wreck behind it, front wheels lifted ----------------
  function carry(u) {
    const c = u.car, w = u.load; if (!w) return;
    const back = c.s.w / 2 + w.s.w / 2 - 2;
    w.x = c.x - Math.cos(c.a) * back; w.y = c.y - Math.sin(c.a) * back; w.a = c.a; w.vx = c.vx; w.vy = c.vy; w.z = 0; w.vz = 0; w.speed = c.speed;
  }

  // ---------------- main update ----------------
  E.update = function (dt) {
    if (!G.state.started) return;
    E.sirens = G.cars.filter((c) => c.siren && !c.wrecked);
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.5; scan(); }
    const tgt = P.car || P;
    // incidents: drop those far behind you, dispatch what they still need
    for (const inc of E.incidents) {
      inc.t += dt;
      if (dist(inc.x, inc.y, tgt.x, tgt.y) > DROP) inc.gone = true;
      const need = needs(inc);
      if (!need.length && !Object.keys(inc.units).length) inc.gone = true;
      for (const r of need) if (!inc.units[r] && E.units.filter((u) => u.stage !== "leave").length < MAX_UNITS && inc.t > (r === "tow" ? 4 : 1.5)) dispatch(inc, r);
    }
    for (const inc of E.incidents) if (inc.gone) {
      for (const r in inc.units) leave(inc.units[r]);
      for (const p of inc.peds) if (p.injured) { p.injured = false; p.timer = 0.5; }
    }
    E.incidents = E.incidents.filter((i) => !i.gone);
    // burning wrecks burn (and burn out on their own eventually)
    for (const c of G.cars) if (c.burning > 0) { flames(c, dt); c.burnT = (c.burnT || 0) + dt; if (c.burnT > 120) c.burning = 0; }
    // units
    for (const u of E.units) {
      const c = u.car;
      if (!G.cars.includes(c) || c.wrecked || (c.driver !== "ems" && u.stage !== "leave")) { // gone, wrecked or stolen
        for (const p of u.crew) p.remove = true; u.crew = []; u.dead = true;
        if (u.load && G.cars.includes(u.load)) { u.load.towedBy = null; u.load.towed = false; }
        if (u.inc.units[u.role] === u) delete u.inc.units[u.role];
        if (u.load && !G.cars.includes(c)) u.load.remove = true; // the tow drove off-screen with it
        continue;
      }
      if (u.stage === "enroute") {
        if (!u.park) u.park = parkSpot(u.inc, u.role);
        if (dist(c.x, c.y, u.park.x, u.park.y) < 70 || (dist(c.x, c.y, u.inc.x, u.inc.y) < 140 && c.speed < 30)) {
          u.stage = "scene"; c.siren = false; c.beacon = true; // lights stay on at the scene, the siren stops
          for (let k = 0; k < (u.role === "tow" ? 1 : 2); k++) crewMember(u, k);
        }
      } else if (u.stage === "scene") scene(u, dt);
      if (u.load) carry(u);
    }
    // remove what's gone (wrecks that were towed away go with their truck)
    E.units = E.units.filter((u) => !u.dead && G.cars.includes(u.car));
    if (G.peds.some((p) => p.remove && p.crew)) G.peds = G.peds.filter((p) => !(p.remove && p.crew));
    if (G.cars.some((c) => c.remove && c.towed)) G.cars = G.cars.filter((c) => !(c.remove && c.towed));
  };

  // you stole their vehicle: the crew stays behind and the job goes to the next unit
  E.stolen = function (car) {
    const u = car.unit; if (!u) return;
    for (const p of u.crew) { p.crew = null; p.state = "walk"; G.scarePed(p, P.x, P.y, 3); p.state = "fleeAway"; }
    u.crew = []; if (u.load) { u.load.towedBy = null; u.load.towed = false; u.load.keep = false; u.load = null; }
    u.dead = true; car.unit = null; car.beacon = false;
    if (u.inc.units[u.role] === u) delete u.inc.units[u.role];
  };

  // ---------------- first aid: help an injured person yourself ----------------
  E.available = function () {
    if (P.car || P.ride) return [];
    const out = [];
    for (const p of G.peds) {
      if (!p.injured || p.state !== "down" || dist(p.x, p.y, P.x, P.y) > 160) continue;
      if (E.units.some((u) => u.role === "med" && u.stage === "scene" && u.crew.some((c) => dist(c.x, c.y, p.x, p.y) < 30))) continue;
      out.push({ x: p.x, y: p.y, color: "#19f5a0", r: 26, icon: "✚", label: "E: Give first aid", act: () => firstAid(p) });
    }
    return out;
  };
  function firstAid(p) {
    if (!p.injured) return;
    p.injured = false; p.timer = 0.6; p.bubble = 2.5; E.helped++;
    G.stats.helped = (G.stats.helped || 0) + 1;
    G.addMoney(150); G.audio.sfx("success");
    G.ui.toast("✚ You helped them up. They thank you and hand you $150", "#19f5a0");
    if (G.wanted.stars > 0 && G.time - (P.lastPedHit || -99) > 6) { G.wanted.cool += 3; } // a good deed calms things down a little
    G.save && G.save();
  }
  E.firstAid = firstAid;
})();
