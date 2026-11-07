// ---------- player, pedestrians, traffic, police, racers ----------
(function () {
  const T = G.TILE, W = G.world;
  const SKIN = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#5c3a21"];
  const SHIRTS = ["#e63946", "#457b9d", "#2a9d8f", "#f4a261", "#9b5de5", "#f15bb5", "#fee440", "#00bbf9", "#ffffff", "#222222", "#06d6a0"];
  const HAIR = ["#2b1d14", "#111111", "#6b4226", "#d4a373", "#9a9a9a", "#b5179e"];
  const PANTS = ["#1b263b", "#333333", "#5c4033", "#2b2d42", "#14213d", "#3d405b"];
  G.cars = []; G.peds = []; G.heli = null;
  G.events = [];

  const P = (G.player = {
    x: 0, y: 0, a: 0, vx: 0, vy: 0, car: null, hp: 100, walk: 0, state: "walk",
    skin: "#c68642", shirt: "#ff3df2", pants: "#1b1b2f", hair: "#111111", nitro: 1, hitCd: 0,
  });
  const WANT = (G.wanted = { stars: 0, cool: 0, seen: false, bust: 0, lastCrime: 0, reason: "" });

  // ---------------- pedestrians ----------------
  const ringBounds = (bx, by) => ({ x0: (4 + 12 * bx + 2.5) * T, x1: (4 + 12 * bx + 11.5) * T, y0: (4 + 12 * by + 2.5) * T, y1: (4 + 12 * by + 11.5) * T });
  function ringPos(p) {
    const r = ringBounds(p.bx, p.by), L = r.x1 - r.x0;
    let s = ((p.s % (4 * L)) + 4 * L) % (4 * L);
    p.s = s;
    const seg = Math.floor(s / L), u = s - seg * L, o = p.off;
    if (seg === 0) return [r.x0 + u, r.y0 + o, 0];
    if (seg === 1) return [r.x1 - o, r.y0 + u, Math.PI / 2];
    if (seg === 2) return [r.x1 - u, r.y1 - o, Math.PI];
    return [r.x0 + o, r.y1 - u, -Math.PI / 2];
  }
  function ringNearest(p) {
    const r = ringBounds(p.bx, p.by), L = r.x1 - r.x0;
    const c = [[clamp(p.x, r.x0, r.x1) - r.x0, Math.abs(p.y - r.y0)], [L + clamp(p.y, r.y0, r.y1) - r.y0, Math.abs(p.x - r.x1)], [2 * L + r.x1 - clamp(p.x, r.x0, r.x1), Math.abs(p.y - r.y1)], [3 * L + r.y1 - clamp(p.y, r.y0, r.y1), Math.abs(p.x - r.x0)]];
    c.sort((a, b) => a[1] - b[1]);
    p.s = c[0][0];
  }
  function makePed(bx, by, s) {
    return { x: 0, y: 0, a: 0, vx: 0, vy: 0, walk: rand(10), skin: pick(SKIN), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR),
      state: "walk", speed: rand(36, 62), bx, by, s, dir: Math.random() < 0.5 ? 1 : -1, off: rand(-14, 14), timer: 0, bubble: 0 };
  }
  G.makePed = makePed;
  function blockOfPoint(x, y) { return [clamp(Math.floor((x / T - 4) / 12), 0, W.NB - 1), clamp(Math.floor((y / T - 4) / 12), 0, W.NB - 1)]; }
  const isBlock = (bx, by) => !!W.blockAt(bx, by); // a city block (pedestrians only walk around those)

  G.updatePed = function (p, dt) {
    p.bubble = Math.max(0, p.bubble - dt);
    if (p.state === "wait") { p.bubble = 0.5; return; }
    if (p.state === "down") { p.timer -= dt; if (p.timer <= 0) { p.state = "walk"; ringNearest(p); } return; }
    if (p.state === "flee" || p.state === "fleeAway") {
      p.timer -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.walk += dt * 14;
      p.a = Math.atan2(p.vy, p.vx);
      G.collideWorld(p, [[0, 0, 7]], 0, 0);
      if (p.timer <= 0) { if (p.state === "fleeAway") { p.remove = true; return; } p.state = "walk"; [p.bx, p.by] = blockOfPoint(p.x, p.y); ringNearest(p); p.state = "rejoin"; }
      return;
    }
    if (p.state === "cross") {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 6) { p.state = "walk"; p.bx = p.nbx; p.by = p.nby; ringNearest(p); return; }
      p.x += (dx / d) * p.speed * 1.2 * dt; p.y += (dy / d) * p.speed * 1.2 * dt; p.a = Math.atan2(dy, dx); p.walk += dt * 9;
      return;
    }
    const before = Math.floor(p.s / (9 * T));
    p.s += p.dir * p.speed * dt;
    const [tx, ty, segA] = ringPos(p);
    if (p.state === "rejoin") {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
      if (d < 8) p.state = "walk"; else { p.x += (dx / d) * p.speed * dt; p.y += (dy / d) * p.speed * dt; p.a = Math.atan2(dy, dx); p.walk += dt * 9; return; }
    }
    p.x = tx; p.y = ty; p.a = segA + (p.dir < 0 ? Math.PI : 0); p.walk += dt * p.speed * 0.17;
    const after = Math.floor(p.s / (9 * T));
    if (before !== after && Math.random() < 0.22) { // at a corner: maybe cross the road
      const r = ringBounds(p.bx, p.by);
      const cx = Math.abs(p.x - r.x0) < Math.abs(p.x - r.x1) ? -1 : 1, cy = Math.abs(p.y - r.y0) < Math.abs(p.y - r.y1) ? -1 : 1;
      const horiz = Math.random() < 0.5;
      const nbx = p.bx + (horiz ? cx : 0), nby = p.by + (horiz ? 0 : cy);
      if (isBlock(nbx, nby)) {
        const nr = ringBounds(nbx, nby);
        p.state = "cross"; p.nbx = nbx; p.nby = nby;
        p.tx = horiz ? (cx < 0 ? nr.x1 : nr.x0) : p.x; p.ty = horiz ? p.y : cy < 0 ? nr.y1 : nr.y0;
      }
    }
  };
  G.scarePed = function (p, fromX, fromY, sec = 1.6) {
    if (p.state === "down") return;
    const dx = p.x - fromX, dy = p.y - fromY, d = Math.hypot(dx, dy) || 1;
    p.state = "flee"; p.timer = sec; p.vx = (dx / d) * 170; p.vy = (dy / d) * 170; p.bubble = 1.2;
  };

  // ---------------- traffic AI ----------------
  function chooseNext(fromId, toId) {
    const to = W.nodes[toId], from = W.nodes[fromId];
    let opts = to.nb.filter((n) => n !== fromId);
    if (!opts.length) opts = to.nb;
    const straight = opts.find((n) => { const m = W.nodes[n]; return Math.sign(m.x - to.x) === Math.sign(to.x - from.x) && Math.sign(m.y - to.y) === Math.sign(to.y - from.y); });
    if (straight !== undefined && Math.random() < 0.5) return straight;
    return pick(opts);
  }
  G.initTrafficAI = function (car, from, to) {
    car.driver = "ai";
    car.ai = { from, to, next: chooseNext(from, to), cruise: rand(150, 225), stuck: 0, rev: 0, honk: 0 };
  };
  function obstacleAhead(car, range) {
    const fx = Math.cos(car.a), fy = Math.sin(car.a);
    const check = (ox, oy) => {
      const rx = ox - car.x, ry = oy - car.y, f = rx * fx + ry * fy;
      if (f <= 0 || f > range) return false;
      return Math.abs(-rx * fy + ry * fx) < 24;
    };
    for (const o of G.activeCars) if (o !== car && check(o.x, o.y)) return o;
    if (!P.car && !P.ride && check(P.x, P.y)) return P;
    for (const p of G.peds) if ((p.state === "cross" || p.state === "flee") && check(p.x, p.y)) return p;
    return null;
  }
  G.trafficAI = function (car, dt, depth = 0) {
    const ai = car.ai, c = car.ctrl;
    if (car.wrecked) return;
    if (ai.rev > 0) { ai.rev -= dt; c.t = -1; c.s = ai.revSteer; c.hb = false; return; }
    const from = W.nodes[ai.from], to = W.nodes[ai.to];
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y), rx = -dy, ry = dx, lane = 34;
    const along = (car.x - from.x) * dx + (car.y - from.y) * dy, segLen = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const remaining = segLen - along;
    if (remaining < 62 && depth < 3) { ai.from = ai.to; ai.to = ai.next; ai.next = chooseNext(ai.from, ai.to); return G.trafficAI(car, dt, depth + 1); }
    if (depth >= 3 || Math.abs((car.x - from.x) * rx + (car.y - from.y) * ry) > 300 || along < -300) { // lost: re-anchor on the nearest road
      const n = W.nearestNode(car.x, car.y); ai.from = n.id; ai.to = pick(n.nb); ai.next = chooseNext(ai.from, ai.to);
    }
    const look = Math.min(along + 80, segLen + 20);
    const ax = from.x + dx * look + rx * lane, ay = from.y + dy * look + ry * lane;
    c.s = clamp(angDiff(car.a, Math.atan2(ay - car.y, ax - car.x)) * 2.4, -1, 1);
    const nx = W.nodes[ai.next];
    const turning = !(Math.sign(nx.x - to.x) === dx && Math.sign(nx.y - to.y) === dy);
    let want = ai.cruise;
    if (turning && remaining < 190) want = 105;
    const ob = obstacleAhead(car, 46 + car.speed * 0.5);
    if (ob) { want = 0; if (ob === P || ob === P.car) ai.honk += dt; }
    else ai.honk = 0;
    if (ai.honk > 1.6) { ai.honk = -3; G.events.push({ type: "honk", x: car.x, y: car.y }); }
    const v = car.vF;
    c.t = v < want - 12 ? 1 : v > want + 20 ? -0.7 : 0.12;
    if (want === 0) c.t = v > 8 ? -1 : 0;
    c.hb = false;
    if (want > 40 && car.speed < 6) { ai.stuck += dt; if (ai.stuck > 2.4) { ai.stuck = 0; ai.rev = 1.1; ai.revSteer = -c.s || 1; } } else ai.stuck = 0;
  };

  // ---------------- police AI ----------------
  G.policeAI = function (car, dt) {
    const ai = car.ai, c = car.ctrl;
    if (car.wrecked) return;
    if (ai.rev > 0) { ai.rev -= dt; c.t = -1; c.s = ai.revSteer; c.hb = false; return; }
    const tgt = P.car || P, tvx = P.car ? P.car.vx : P.vx, tvy = P.car ? P.car.vy : P.vy;
    let ax = tgt.x + tvx * 0.45, ay = tgt.y + tvy * 0.45;
    const d = dist(car.x, car.y, tgt.x, tgt.y);
    if (d > 520) {
      ai.repath -= dt;
      if (ai.repath <= 0 || !ai.path || !ai.path.length) { ai.repath = 1.5; ai.path = W.nodePath(W.nearestNode(car.x, car.y).id, W.nearestNode(tgt.x, tgt.y).id); }
      while (ai.path.length > 1 && dist(car.x, car.y, W.nodes[ai.path[0]].x, W.nodes[ai.path[0]].y) < 90) ai.path.shift();
      const n = W.nodes[ai.path[0]]; ax = n.x; ay = n.y;
    }
    const want = Math.atan2(ay - car.y, ax - car.x), diff = angDiff(car.a, want);
    let steer = diff * 2.6;
    const probe = (ang, len) => !!W.pointBlocked(car.x + Math.cos(car.a + ang) * len, car.y + Math.sin(car.a + ang) * len, 4);
    if (probe(0, 55)) steer += probe(-0.6, 60) ? 1.2 : -1.2;
    else { if (probe(-0.5, 50)) steer += 0.7; if (probe(0.5, 50)) steer -= 0.7; }
    c.s = clamp(steer, -1, 1);
    c.t = 1; c.hb = false; c.boost = d > 700;
    if (Math.abs(diff) > 1.25 && car.speed > 230) { c.t = -0.6; c.hb = car.speed > 280; }
    if (d < 85 && (P.car ? P.car.speed : 0) < 60) c.t = car.vF > 40 ? -1 : 0.2;
    if (car.speed < 6 && d > 90) { ai.stuck += dt; if (ai.stuck > 1.6) { ai.stuck = 0; ai.rev = 1; ai.revSteer = diff > 0 ? -1 : 1; } } else ai.stuck = 0;
  };

  // ---------------- racers ----------------
  G.racerAI = function (car, dt) {
    const ai = car.ai, c = car.ctrl;
    if (car.wrecked || ai.done) { c.t = car.vF > 5 ? -1 : 0; c.s = 0; return; }
    if (ai.rev > 0) { ai.rev -= dt; c.t = -1; c.s = ai.revSteer; return; }
    const cps = ai.cps, cp = cps[ai.idx];
    if (dist(car.x, car.y, cp.x, cp.y) < 100) { ai.idx++; if (ai.idx >= cps.length) { ai.done = true; G.events.push({ type: "racerFinish", car }); return; } }
    const nxt = cps[Math.min(ai.idx + 1, cps.length - 1)];
    const cur = cps[ai.idx];
    const dcur = dist(car.x, car.y, cur.x, cur.y);
    const ax = dcur < 160 ? lerp(cur.x, nxt.x, 0.35) : cur.x + ai.lane * 0, ay = dcur < 160 ? lerp(cur.y, nxt.y, 0.35) : cur.y;
    const diff = angDiff(car.a, Math.atan2(ay - car.y, ax - car.x));
    let steer = diff * 2.8;
    if (W.pointBlocked(car.x + Math.cos(car.a) * 55, car.y + Math.sin(car.a) * 55, 4)) steer += diff > 0 ? 0.8 : -0.8;
    c.s = clamp(steer, -1, 1);
    const turnAng = Math.abs(angDiff(Math.atan2(cur.y - car.y, cur.x - car.x), Math.atan2(nxt.y - cur.y, nxt.x - cur.x)));
    const want = dcur < 260 && turnAng > 0.8 ? 250 * ai.skill : 999;
    c.t = car.vF > want ? -0.8 : 1; c.boost = false; c.hb = Math.abs(diff) > 1.0 && car.speed > 260;
    if (car.speed < 8 && ai.started) { ai.stuck += dt; if (ai.stuck > 1.5) { ai.stuck = 0; ai.rev = 0.9; ai.revSteer = diff > 0 ? -1 : 1; } } else ai.stuck = 0;
  };

  // ---------------- wanted system ----------------
  G.crime = function (stars, reason, cap = 5) {
    if (G.state.noCops) return;
    const before = WANT.stars;
    WANT.stars = clamp(Math.max(WANT.stars, Math.min(cap, WANT.stars + stars)), 0, 5);
    WANT.cool = 0; WANT.reason = reason; WANT.lastCrime = G.time;
    if (WANT.stars > before) { G.ui.toast(`★ WANTED: ${reason}`, "#ff4d6d"); G.audio.sfx("alert"); }
  };
  G.clearWanted = function () {
    WANT.stars = 0; WANT.cool = 0; WANT.bust = 0;
    for (const c of G.cars) if (c.driver === "police") { c.siren = false; G.initTrafficAI(c, W.nearestNode(c.x, c.y).id, pick(W.nearestNode(c.x, c.y).nb)); c.copLeaving = true; }
    G.heli = null;
  };
  G.updateWanted = function (dt) {
    const tgt = P.car || P;
    let near = Infinity, cops = 0;
    for (const c of G.cars) if (c.driver === "police" && !c.wrecked) { cops++; near = Math.min(near, dist(c.x, c.y, tgt.x, tgt.y)); }
    if (WANT.stars === 0) { WANT.bust = 0; return; }
    const heliSee = G.heli && dist(G.heli.x, G.heli.y, tgt.x, tgt.y) < 420;
    WANT.seen = near < 620 || heliSee;
    if (!WANT.seen) { WANT.cool += dt * (G.property ? G.property.copMul() : 1); if (WANT.cool > 7 + WANT.stars * 2.2) { WANT.stars--; WANT.cool = 0; if (WANT.stars === 0) { G.clearWanted(); G.ui.toast("You lost the cops", "#19f5a0"); G.events.push({ type: "evaded" }); } } }
    else WANT.cool = 0;
    const slow = P.car ? P.car.speed < 40 : true;
    if (near < (P.car ? 78 : 66) && slow) { WANT.bust += dt; if (WANT.bust > 2.2) G.busted(); }
    else WANT.bust = Math.max(0, WANT.bust - dt * 0.7);
    // helicopter
    if (WANT.stars >= 3 && !G.heli) G.heli = { x: tgt.x + 900, y: tgt.y - 700, a: 0, rot: 0 };
    if (G.heli) {
      const h = G.heli, ox = Math.cos(G.time * 0.4) * 140, oy = Math.sin(G.time * 0.4) * 140;
      const dx = tgt.x + ox - h.x, dy = tgt.y + oy - h.y, d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(330, d * 1.5);
      h.x += (dx / d) * sp * dt; h.y += (dy / d) * sp * dt; h.a = Math.atan2(dy, dx); h.rot += dt * 30;
    }
  };

  // ---------------- spawning ----------------
  G.copTarget = () => [0, 1, 2, 3, 5, 6][WANT.stars];
  G.manageSpawns = function () {
    const tgt = P.car || P;
    // despawn far stuff
    for (const c of G.cars) {
      if (c === P.car || c.keep) continue;
      const d = dist(c.x, c.y, tgt.x, tgt.y);
      if (d > 2000 || (c.copLeaving && d > 1100) || (c.wrecked && c.wreckT > 25 && d > 900)) c.remove = true;
    }
    for (const p of G.peds) if (dist(p.x, p.y, tgt.x, tgt.y) > 1700) p.remove = true;
    G.cars = G.cars.filter((c) => !c.remove);
    G.peds = G.peds.filter((p) => !p.remove);
    // traffic
    const traffic = G.cars.filter((c) => c.driver === "ai").length;
    if (traffic < G.settings.traffic && Math.random() < 0.5) {
      const lp = W.randomLanePoint(tgt.x, tgt.y, 800, 1500);
      if (lp && !G.cars.some((c) => dist(c.x, c.y, lp.x, lp.y) < 80)) {
        const car = new G.Car(pick(G.TRAFFIC_MIX), lp.x, lp.y, lp.a);
        G.initTrafficAI(car, lp.from, lp.to);
        car.vx = Math.cos(lp.a) * 120; car.vy = Math.sin(lp.a) * 120;
        G.cars.push(car);
      }
    }
    // police
    const cops = G.cars.filter((c) => c.driver === "police").length;
    if (cops < G.copTarget() && Math.random() < 0.08) {
      const lp = W.randomLanePoint(tgt.x, tgt.y, 750, 1250);
      if (lp) {
        const car = new G.Car("police", lp.x, lp.y, lp.a);
        car.driver = "police"; car.siren = true; car.ai = { stuck: 0, rev: 0, repath: 0, path: null };
        G.cars.push(car);
      }
    }
    // pedestrians
    if (G.peds.length < G.settings.peds) {
      const [pbx, pby] = blockOfPoint(tgt.x, tgt.y);
      const bx = pbx + randi(-2, 2), by = pby + randi(-2, 2);
      if (!isBlock(bx, by)) return;
      const p = makePed(bx, by, rand(4 * 9 * T));
      const [x, y] = ringPos(p); p.x = x; p.y = y;
      const d = dist(x, y, tgt.x, tgt.y);
      if (d > 600 && d < 1500) G.peds.push(p);
    }
  };
  G.populateInitial = function () {
    const tgt = P.car || P;
    for (let i = 0; i < 60; i++) {
      const [pbx, pby] = blockOfPoint(tgt.x, tgt.y), bx = pbx + randi(-2, 2), by = pby + randi(-2, 2);
      if (!isBlock(bx, by)) continue;
      const p = makePed(bx, by, rand(4 * 9 * T));
      const [x, y] = ringPos(p); p.x = x; p.y = y;
      if (dist(x, y, tgt.x, tgt.y) < 1500 && dist(x, y, tgt.x, tgt.y) > 120) G.peds.push(p);
    }
    for (let i = 0; i < 40; i++) {
      const lp = W.randomLanePoint(tgt.x, tgt.y, 250, 1500);
      if (lp && !G.cars.some((c) => dist(c.x, c.y, lp.x, lp.y) < 90)) {
        const car = new G.Car(pick(G.TRAFFIC_MIX), lp.x, lp.y, lp.a);
        G.initTrafficAI(car, lp.from, lp.to); G.cars.push(car);
      }
    }
  };

  // ---------------- player ----------------
  G.enterNearestCar = function () {
    if ((P.z || 0) > 8 || P.mode !== "ground") return false;
    let best = null, bd = 64;
    for (const c of G.cars) { const d = dist(c.x, c.y, P.x, P.y); if (d < bd && !c.wrecked && c.driver !== "racer") { best = c; bd = d; } }
    if (!best) return false;
    if (best.driver === "ai") {
      const p = makePed(0, 0, 0); p.x = best.x - Math.sin(best.a) * 26; p.y = best.y + Math.cos(best.a) * 26;
      G.peds.push(p); G.scarePed(p, P.x, P.y, 3); p.state = "fleeAway"; p.bubble = 2;
      G.crime(1, "Carjacking", 2); G.audio.sfx("door");
    } else if (best.driver === "police") { G.crime(2, "Stole a police car"); }
    else G.audio.sfx("door");
    best.driver = "player"; best.siren = false; best.ai = null; best.keep = true; best.copLeaving = false;
    best.manual = !!G.settings.manual && !best.s.pedal; best.gear = 1; best.shiftT = 0;
    P.car = best; G.heroes.reset(); G.events.push({ type: "enterCar", car: best });
    if (best.manual && !G.state.manualTip) { G.state.manualTip = true; G.ui.toast(`Manual gearbox: ${G.controls.label("gearUp")} shift up · ${G.controls.label("gearDn")} shift down · go below 1st for N, then R`, "#ffd60a"); }
    return true;
  };
  G.exitCar = function () {
    const c = P.car; if (!c || c.speed > 90) return;
    const lx = -Math.sin(c.a), ly = Math.cos(c.a);
    let x = c.x - lx * 30, y = c.y - ly * 30;
    if (W.pointBlocked(x, y, 8)) { x = c.x + lx * 30; y = c.y + ly * 30; }
    P.x = x; P.y = y; c.driver = null; c.ctrl = { t: 0, s: 0, hb: true, boost: false }; c.manual = false; P.car = null; G.heroes.reset(); P.vx = P.vy = 0;
    G.audio.sfx("door"); G.events.push({ type: "exitCar", car: c });
  };
  G.updatePlayer = function (dt) {
    P.hitCd = Math.max(0, P.hitCd - dt);
    if (P.ride) { P.anim = { mode: "sit", speed: 0 }; return; } // passenger in a friend's car: net.js moves us
    if (P.car) {
      const c = P.car, k = c.ctrl;
      if (c.wrecked) { G.exitCarForce(); return; }
      k.t = Input.down("KeyW", "ArrowUp") ? 1 : Input.down("KeyS", "ArrowDown") ? -1 : 0;
      k.s = (Input.down("KeyD", "ArrowRight") ? 1 : 0) - (Input.down("KeyA", "ArrowLeft") ? 1 : 0);
      k.hb = Input.down("Space");
      k.boost = Input.down("ShiftLeft", "ShiftRight") && P.nitro > 0.02 && k.t > 0 && !c.s.pedal;
      c.manual = !!G.settings.manual && !c.s.pedal;
      if (c.manual) {
        const up = Input.hit("A_gearUp"), dn = Input.hit("A_gearDn");
        if (up || dn) {
          const r = c.shift(up ? 1 : -1);
          if (r === true) G.audio.sfx("shift");
          else if (r === "overrev") { G.audio.sfx("fail"); G.ui.toast("Too fast for that gear: it would over-rev", "#ff4d6d"); }
          else if (r === "moving") G.ui.toast("Stop before selecting reverse", "#ff4d6d");
        }
      }
      P.nitro = clamp(P.nitro + (k.boost ? -0.38 : 0.07) * dt, 0, 1);
      P.x = c.x; P.y = c.y; P.a = c.a;
      if (Input.hit("KeyH")) { G.audio.sfx("horn"); for (const p of G.peds) if (dist(p.x, p.y, c.x, c.y) < 160) G.scarePed(p, c.x, c.y); }
      return;
    }
    G.heroes.foot(dt);
  };
  G.exitCarForce = function () {
    const c = P.car; if (!c) return;
    P.x = c.x - Math.sin(c.a) * 34; P.y = c.y + Math.cos(c.a) * 34; c.driver = null; c.manual = false; P.car = null; G.heroes.reset(); P.vx = P.vy = 0;
    P.hp -= 20; G.shake(14);
  };
})();
