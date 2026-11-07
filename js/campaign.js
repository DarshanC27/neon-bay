// ---------- CAMPAIGN: 100 missions in 10 chapters, built from reusable mission steps ----------
(function () {
  const W = G.world, P = G.player, T = G.TILE;
  const C = (G.campaign = {});
  const KMH = 0.6; // px/s -> km/h used by the speedometer

  // ================= chapters =================
  const CH = (C.CHAPTERS = C.chapters = [
    { name: "Fresh Wheels", giver: "Vince", face: "🕴️", color: "#ff3df2", node: [1, 2], blurb: "Learn the streets of Neon Bay." },
    { name: "Courier Nights", giver: "Lola", face: "👩‍🎤", color: "#ffa028", node: [2, 6], blurb: "Lola's courier crew never sleeps." },
    { name: "Saltwater War", giver: "Vince", face: "🕴️", color: "#3a86ff", node: [3, 2], blurb: "The Saltwater Boys want your streets." },
    { name: "Street Kings", giver: "Marlo", face: "🦹", color: "#ffd60a", node: [6, 5], blurb: "Marlo runs the night races." },
    { name: "Hot Pursuit", giver: "Det. Reyes", face: "🕵️", color: "#4cc9f0", node: [4, 5], blurb: "A crooked detective owns you now." },
    { name: "Hero Hours", giver: "Dr. Ada Chen", face: "👩‍🔬", color: "#19e3d0", node: [5, 3], blurb: "Suit up. The city needs heroes." },
    { name: "Stunt City", giver: "Jett", face: "🤠", color: "#ff7b00", node: [6, 1], blurb: "Jett films stunts for the BayTube channel." },
    { name: "Ghost Protocol", giver: "Mr. Shade", face: "🥷", color: "#8b3dff", node: [2, 3], blurb: "Spies, tails and quiet takedowns." },
    { name: "Bay Blackout", giver: "The Admiral", face: "⚓", color: "#ef233c", node: [1, 5], blurb: "The Admiral wants to switch the city off." },
    { name: "Neon Crown", giver: "Vince", face: "👑", color: "#c77dff", node: [4, 4], blurb: "Everything you learned. One night. One crown." },
  ]);
  CH.forEach((c) => { const n = W.node(c.node[0], c.node[1]); c.hub = { x: n.x + T + 34, y: n.y + T + 34 }; });

  const PLAN = [
    ["joyride", "pickups", "timetrial", "smash", "joyride", "drift", "speed", "courier", "race", "heat"],
    ["courier", "pickups", "courier", "taxi", "smash", "timetrial", "courier", "getaway", "taxi", "race"],
    ["brawl", "smash", "rooftop", "takedown", "brawl", "ambush", "heat", "brawl", "rooftop", "ambush"],
    ["race", "drift", "timetrial", "race", "stunts", "drift", "race", "speed", "timetrial", "race"],
    ["heat", "survive", "getaway", "takedown", "tail", "survive", "heat", "getaway", "takedown", "survive"],
    ["rooftop", "swing", "brawl", "rooftop", "pickupsFoot", "ambush", "swing", "rooftop", "ambush", "swing"],
    ["stunts", "speed", "stunts", "drift", "timetrial", "stunts", "smash", "speed", "stunts", "race"],
    ["tail", "takedown", "tail", "escort", "rooftop", "tail", "getaway", "escort", "takedown", "ambush"],
    ["getaway", "ambush", "race", "survive", "takedown", "rooftop", "heat", "smash", "timetrial", "brawl"],
    [["heat", "getaway"], ["brawl", "takedown"], "raceWin", ["tail", "takedown"], ["rooftop", "ambush"], ["stunts", "speed"], ["courier", "survive"], ["swing", "brawl"], ["drift", "timetrial"], ["ambush", "heat", "raceWin"]],
  ];
  const TITLES = [
    "Learner's Permit", "Lost & Found", "Rush Hour", "Fruit Stand Fury", "Sunset Cruise", "Sideways Saturday", "Need for Neon", "Fragile Goods", "Back Alley Grand Prix", "Borrowed Ride",
    "Midnight Express", "Dead Drops", "Cold Chain", "VIP Treatment", "Postal Rage", "Thirty Minutes or Free", "Hot Potato", "Return to Sender", "Red-Eye Fare", "Courier Cup",
    "Turf Talk", "Tag, You're Out", "High Ground", "Wheelman Down", "Pier Pressure", "Salt in the Wound", "Grand Theft Pride", "Knuckle Sandwich", "Penthouse Party", "Low Tide",
    "Rookie Heat", "Smoke Show", "Hot Lap", "Neon Sprint", "Air Mail", "Tandem Dreams", "King of the Coast", "Redline", "Ghost Lap", "Crown Jewel",
    "Bait Car", "Most Wanted Minute", "Clean Getaway", "Bad Cop", "Shadow Play", "Siren Song", "Evidence Locker", "Roadblock Runner", "Internal Affairs", "Five-Star General",
    "First Flight", "Skyline Sprint", "Night Patrol", "Rooftop Rescue", "Lost Kittens", "Gang Signal", "Web of Lies", "Gravity Check", "Hero Complex", "City Never Sleeps",
    "Hello, Gravity", "Sonic Boom", "Frequent Flyer", "Burnout Ballet", "Pinball Wizard", "Moon Shot", "Demolition Derby", "Light Speed", "Airtime Addict", "Stunt Royale",
    "Quiet Car", "Paper Trail", "Double Agent", "The Package", "Silent Rooftops", "Rat Run", "Vanishing Act", "Witness Protection", "Burn Notice", "Ghost Story",
    "Lights Out", "Dock Siege", "Blackout Run", "Storm Front", "Admiral's Courier", "Tower Defense", "Flagship", "Grid Crash", "Power Surge", "Mutiny",
    "Crown Heist", "Street Justice", "Last Lap", "Spyglass", "Skyfall", "Daredevil", "Final Delivery", "Hero of the Bay", "Neon Drift", "Own the Night",
  ];
  const BRIEF = {
    joyride: ["There's a {car} with your name on it. Take it out and learn the roads.", "Hit every checkpoint and bring it back without a scratch."],
    pickups: ["Somebody dropped a load of my stuff all over town.", "Collect every package before the clock runs out."],
    pickupsFoot: ["The animal shelter van crashed. Kittens everywhere.", "Find them all on foot before they wander into traffic."],
    timetrial: ["The track's set. The clock is running.", "Every checkpoint, no excuses."],
    smash: ["The Saltwater Boys set up stalls on my turf.", "Drive through them fast. I want them flattened."],
    drift: ["The BayTube crowd loves tyre smoke.", "Get sideways and rack up the drift score. Space is your friend."],
    speed: ["They say this {car} can top {kmh} km/h.", "Prove it, then bring it home in one piece."],
    courier: ["Fragile cargo, tight deadline, no questions.", "Scratch the cargo and the deal's off."],
    race: ["The street's closed, the crowd's here and so are the rivals.", "Finish on the podium or don't come back."],
    raceWin: ["This one's for the crown. Only first place counts.", "Win it."],
    heat: ["There's a hot {car} parked nearby. Steal it.", "The cops will come running. Lose them, then bring it to me."],
    taxi: ["My VIP needs a ride and they hate being late.", "Pick them up and get them there fast and smooth."],
    getaway: ["The job went loud. You've got cops on your tail already.", "Get to the safe garage before they box you in."],
    brawl: ["A Saltwater crew is shaking down shop owners.", "Get out of the car and teach them some manners."],
    ambush: ["They're coming in waves. Stand your ground.", "Take down every last one of them."],
    rooftop: ["Their lookouts are on a rooftop watching our every move.", "Suit up, get up there and clear it."],
    swing: ["The city looks different from the rooftops.", "Hit every rooftop beacon before the timer ends."],
    takedown: ["Their wheelman is out on the streets in a {car}.", "Ram it until it's scrap."],
    tail: ["Follow that car. Don't lose it, and don't get spotted.", "Stay close, but not too close."],
    escort: ["A friend needs safe passage across town.", "Stay with them the whole way. If they get hit, we're done."],
    survive: ["I need the cops busy while my crew works.", "Max heat, and survive until the timer runs out. Then lose them."],
    stunts: ["The camera's rolling. Hit the yellow ramps.", "Land {n} stunts and make it look good."],
  };

  // ================= helpers: seeded positions =================
  function lanePt(rng, cx, cy, minD, maxD) {
    for (let k = 0; k < 80; k++) {
      const n = W.nodes[Math.floor(rng() * 64)], nb = n.nb[Math.floor(rng() * n.nb.length)], m = W.nodes[nb];
      const t = 0.2 + rng() * 0.6, dx = Math.sign(m.x - n.x), dy = Math.sign(m.y - n.y);
      const x = lerp(n.x, m.x, t) - dy * 34, y = lerp(n.y, m.y, t) + dx * 34, d = dist(x, y, cx, cy);
      if (d >= minD && d <= maxD) return { x, y, a: Math.atan2(dy, dx) };
    }
    const n = W.nearestNode(cx, cy); return { x: n.x + 40, y: n.y + 34, a: 0 };
  }
  function walkPt(rng, cx, cy, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const p = lanePt(rng, cx, cy, minD, maxD), ox = -Math.sin(p.a) * 72, oy = Math.cos(p.a) * 72;
      if (!W.pointBlocked(p.x + ox, p.y + oy, 10)) return { x: p.x + ox, y: p.y + oy, a: p.a };
    }
    return lanePt(rng, cx, cy, minD, maxD);
  }
  function chain(rng, start, n, a = 380, b = 760) { const out = []; let p = start; for (let i = 0; i < n; i++) { p = lanePt(rng, p.x, p.y, a, b); out.push(p); } return out; }
  function roof(rng, cx, cy, maxD, minH = 70) {
    const c = W.buildings.filter((b) => !b.poi && !b.container && b.h3 >= minH && b.w > 90 && b.h > 90 && dist(b.x + b.w / 2, b.y + b.h / 2, cx, cy) < maxD);
    if (!c.length) return null;
    const b = c[Math.floor(rng() * c.length)]; return { x: b.x + b.w / 2, y: b.y + b.h / 2, z: b.h3, b };
  }
  function roofChain(rng, start, n) {
    const out = []; let p = start;
    for (let i = 0; i < n; i++) {
      const c = W.buildings.filter((b) => !b.poi && !b.container && b.h3 >= 60 && b.w > 80 && !out.some((o) => o.b === b) && dist(b.x + b.w / 2, b.y + b.h / 2, p.x, p.y) > 200 && dist(b.x + b.w / 2, b.y + b.h / 2, p.x, p.y) < 650);
      if (!c.length) break;
      const b = c[Math.floor(rng() * c.length)]; p = { x: b.x + b.w / 2, y: b.y + b.h / 2, z: b.h3, b }; out.push(p);
    }
    return out;
  }
  const pathLen = (pts, from) => { let d = 0, p = from; for (const q of pts) { d += dist(p.x, p.y, q.x, q.y); p = q; } return d; };

  // ================= mission archetypes -> steps =================
  // every builder returns an array of steps; ctx = { rng, hub, tier, color, i }
  const A = {
    joyride(c) {
      const type = pick2(c.rng, ["sedan", "muscle", "compact", "sports"]), sp = lanePt(c.rng, c.hub.x, c.hub.y, 90, 260), cps = chain(c.rng, sp, 4 + Math.floor(c.tier / 3));
      return [{ t: "getcar", type, x: sp.x, y: sp.y, a: sp.a, text: `Get in the ${G.CAR_TYPES[type].name}` },
        { t: "checkpoints", pts: cps, timer: Math.round(pathLen(cps, sp) / 210 + 20 - c.tier), text: "Hit every checkpoint" },
        { t: "bring", x: c.hub.x, y: c.hub.y, minHp: 0.35, text: "Bring the car back" }];
    },
    pickups(c, foot = false) {
      const n = 4 + Math.floor(c.tier / 2), pts = [];
      for (let k = 0; k < n; k++) pts.push((foot ? walkPt : lanePt)(c.rng, c.hub.x, c.hub.y, 250, foot ? 800 : 1300));
      return [{ t: "collect", pts, foot, icon: foot ? "🐱" : "📦", timer: Math.round(n * (foot ? 26 : 20) - c.tier * 1.5 + 25), text: foot ? "Find the lost kittens (on foot)" : "Collect the packages" }];
    },
    pickupsFoot(c) { return A.pickups(c, true); },
    timetrial(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 100, 300), cps = chain(c.rng, sp, 6 + Math.floor(c.tier / 2), 400, 700);
      return [{ t: "goto", x: sp.x, y: sp.y, car: true, text: "Drive to the start line" },
        { t: "checkpoints", pts: cps, timer: Math.round(pathLen(cps, sp) / (230 + c.tier * 8) + 12), text: "Time trial: beat the clock" }];
    },
    smash(c) {
      const n = 5 + Math.floor(c.tier / 3), pts = [];
      for (let k = 0; k < n; k++) pts.push(lanePt(c.rng, c.hub.x, c.hub.y, 250, 1300));
      return [{ t: "smash", pts, minSpeed: 170, timer: Math.round(n * 18 + 30 - c.tier), text: "Smash the rival stalls at speed" }];
    },
    drift(c) { return [{ t: "drift", score: 2500 + c.tier * 900, timer: 75 + c.tier * 4, text: "Drift! Hold SPACE while turning" }]; },
    speed(c) {
      const type = c.tier >= 6 ? "super" : c.tier >= 3 ? "sports" : "muscle", sp = lanePt(c.rng, c.hub.x, c.hub.y, 90, 260);
      const kmh = Math.min(Math.round(G.CAR_TYPES[type].max * KMH * 0.9 / 10) * 10, 190 + c.tier * 15);
      return [{ t: "getcar", type, x: sp.x, y: sp.y, a: sp.a, text: `Get in the ${G.CAR_TYPES[type].name}` },
        { t: "speed", kmh, text: `Hit ${kmh} km/h (Shift = nitro)` },
        { t: "bring", x: c.hub.x, y: c.hub.y, minHp: 0.3, text: "Bring it back in one piece" }];
    },
    courier(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 90, 240), d = lanePt(c.rng, c.hub.x, c.hub.y, 1300, 3200), dd = dist(sp.x, sp.y, d.x, d.y);
      return [{ t: "getcar", type: "van", x: sp.x, y: sp.y, a: sp.a, text: "Get in the delivery van" },
        { t: "deliver", x: d.x, y: d.y, fragile: Math.max(18, 40 - c.tier * 2), timer: Math.round(dd / (200 + c.tier * 6) + 18), text: "Deliver the fragile cargo" }];
    },
    race(c, needWin = false) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 100, 300), cps = chain(c.rng, sp, 8 + Math.floor(c.tier / 2), 420, 720);
      return [{ t: "goto", x: sp.x, y: sp.y, car: true, text: "Drive to the race start" },
        { t: "race", pts: cps, rivals: 3, need: needWin || c.tier >= 3 ? 1 : 2, skill: 0.88 + c.tier * 0.022, text: "Race!" }];
    },
    raceWin(c) { return A.race(c, true); },
    heat(c) {
      const type = pick2(c.rng, ["sports", "muscle", "super"]), sp = lanePt(c.rng, c.hub.x, c.hub.y, 400, 900), stars = 2 + Math.floor(c.tier / 3);
      return [{ t: "getcar", type, x: sp.x, y: sp.y, a: sp.a, crime: stars, text: `Steal the hot ${G.CAR_TYPES[type].name}` },
        { t: "evade", text: "Lose the cops" },
        { t: "bring", x: c.hub.x, y: c.hub.y, minHp: 0.2, text: "Deliver the car to the drop-off" }];
    },
    taxi(c) {
      const pu = walkPt(c.rng, c.hub.x, c.hub.y, 200, 700), d = lanePt(c.rng, pu.x, pu.y, 1200, 2600);
      return [{ t: "taxi", pu, x: d.x, y: d.y, timer: Math.round(dist(pu.x, pu.y, d.x, d.y) / (210 + c.tier * 6) + 45), text: "Pick up the VIP" }];
    },
    getaway(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 90, 240), d = lanePt(c.rng, c.hub.x, c.hub.y, 1700, 3400);
      return [{ t: "getcar", type: "muscle", x: sp.x, y: sp.y, a: sp.a, crime: 2 + Math.floor(c.tier / 3), text: "Get in the getaway car" },
        { t: "goto", x: d.x, y: d.y, car: true, clearHeat: true, text: "Reach the safe garage without getting caught" }];
    },
    brawl(c) {
      const p = walkPt(c.rng, c.hub.x, c.hub.y, 350, 1100);
      return [{ t: "goto", x: p.x, y: p.y, r: 120, text: "Find the gang" },
        { t: "fight", x: p.x, y: p.y, z: 0, n: 3 + Math.floor(c.tier / 2), text: "Take them down (get out and fight)" }];
    },
    ambush(c) {
      const p = walkPt(c.rng, c.hub.x, c.hub.y, 350, 1000), n = 3 + Math.floor(c.tier / 3);
      return [{ t: "goto", x: p.x, y: p.y, r: 120, text: "Get to the meeting point" },
        { t: "fight", x: p.x, y: p.y, z: 0, n, text: "Ambush! Wave 1" },
        { t: "fight", x: p.x + 30, y: p.y + 30, z: 0, n: n + 1, text: "Wave 2: they brought friends" }];
    },
    rooftop(c) {
      const r = roof(c.rng, c.hub.x, c.hub.y, 1300, 90) || roof(c.rng, c.hub.x, c.hub.y, 3000, 60);
      return [{ t: "hero", text: "Suit up! Press C to switch to Spindle, Wraith or Nova" },
        { t: "roof", ...r, text: "Get onto the rooftop (climb, swing or super-jump)" },
        { t: "fight", x: r.x, y: r.y, z: r.z, roof: r.b, n: 3 + Math.floor(c.tier / 3), text: "Clear the rooftop" }];
    },
    swing(c) {
      const first = roof(c.rng, c.hub.x, c.hub.y, 900, 80) || roof(c.rng, c.hub.x, c.hub.y, 3000, 60), pts = [first, ...roofChain(c.rng, first, 3 + Math.floor(c.tier / 3))];
      return [{ t: "hero", text: "Suit up! Press C to switch to Spindle, Wraith or Nova" },
        { t: "roofs", pts, timer: Math.round(pts.length * 26 + 30 - c.tier), text: "Touch every rooftop beacon" }];
    },
    takedown(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 500, 1000), type = pick2(c.rng, ["muscle", "sedan", "sports"]);
      return [{ t: "takedown", type, x: sp.x, y: sp.y, a: sp.a, hp: 120 + c.tier * 12, skill: 0.75 + c.tier * 0.03, text: `Wreck the target ${G.CAR_TYPES[type].name}` }];
    },
    tail(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 250, 500);
      return [{ t: "tail", x: sp.x, y: sp.y, a: sp.a, secs: 35 + c.tier * 4, text: "Tail the target" }];
    },
    escort(c) {
      const sp = lanePt(c.rng, c.hub.x, c.hub.y, 120, 300), d = lanePt(c.rng, sp.x, sp.y, 1800, 3000);
      return [{ t: "escort", x: sp.x, y: sp.y, a: sp.a, tx: d.x, ty: d.y, text: "Escort the friendly car to safety" }];
    },
    survive(c) {
      const stars = Math.min(5, 3 + Math.floor(c.tier / 3));
      return [{ t: "survive", stars, secs: 40 + c.tier * 5, text: `Survive at ${stars} stars` }, { t: "evade", text: "Now lose the cops" }];
    },
    stunts(c) { const n = 2 + Math.floor(c.tier / 3); return [{ t: "stunts", n, timer: 90 + n * 35, text: `Land ${n} stunt jumps off the yellow ramps` }]; },
  };
  function pick2(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ================= mission list =================
  C.list = [];
  for (let ci = 0; ci < 10; ci++) for (let k = 0; k < 10; k++) {
    const i = ci * 10 + k, ch = CH[ci], spec = PLAN[ci][k];
    const kinds = Array.isArray(spec) ? spec : [spec];
    C.list.push({ i, ch: ci, n: i + 1, title: TITLES[i], kinds, reward: Math.round((400 + i * 95) / 50) * 50, color: ch.color, giver: ch.giver, face: ch.face });
  }
  function build(def) {
    const rng = mulberry32(9000 + def.i * 131), ch = CH[def.ch], tier = def.ch + (def.i % 10 >= 7 ? 1 : 0);
    const ctx = { rng, hub: ch.hub, tier, color: ch.color, i: def.i };
    const steps = []; for (const k of def.kinds) steps.push(...A[k](ctx));
    const k0 = def.kinds[0], car = steps.find((s) => s.type);
    const fill = (s) => s.replace("{car}", car ? G.CAR_TYPES[car.type].name : "car").replace("{kmh}", (steps.find((x) => x.kmh) || {}).kmh || 200).replace("{n}", (steps.find((x) => x.n && x.t === "stunts") || {}).n || 2);
    const lines = (BRIEF[k0] || BRIEF.joyride).map((t) => [def.giver, fill(t)]);
    if (def.kinds.length > 1) lines.push([def.giver, `And this one has ${def.kinds.length} parts. Stay sharp.`]);
    return { steps, lines };
  }
  C._build = build;
  C.done = () => (G.state.ops = G.state.ops || {});
  C.nextIndex = () => { const d = C.done(); for (let i = 0; i < 100; i++) if (!d[i]) return i; return -1; };
  C.unlocked = (i) => i === 0 || !!C.done()[i - 1];

  // ================= runtime =================
  const MAIN = (s, m, extra = {}) => Object.assign({ color: m.def.color, r: 70, icon: "◆", main: true }, extra);
  const near = (x, y, r) => dist(P.x, P.y, x, y) < r;
  function spawnCar(m, type, x, y, a, color) { const c = new G.Car(type, x, y, a, color); c.keep = true; G.cars.push(c); m.spawned.push(c); return c; }
  function spawnSquad(m, x, y, z, n, roofB) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = 24 + rand(0, 10);
      const e = { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z, vx: 0, vy: 0, vz: 0, a: a + Math.PI, hp: 60 + m.tier * 8, state: "idle", t: rand(0, 2), crew: 9000 + m.def.i, roof: roofB || null, aware: false, cd: rand(0.6, 1.4), windup: 0, op: true,
        outfit: { style: "gang", skin: pick(["#f1c27d", "#c68642", "#8d5524", "#e0ac69"]), shirt: pick(["#212529", "#343a40", "#f1f1f1"]), pants: pick(["#2b2d42", "#3d405b"]), accent: m.def.color, hair: "#111", bat: Math.random() < 0.3 + m.tier * 0.04 },
        home: { x, y }, anim: { mode: "idle" } };
      G.gang.push(e); list.push(e);
    }
    return list;
  }
  function racePath(rng, x, y, n) { return chain(rng, { x, y }, n, 500, 900); }

  const STEP = {
    goto: {
      update(m, s) {
        const ok = near(s.x, s.y, s.r || 85) && (!s.car || (P.car && P.car.speed < 160)) && (!s.foot || !P.car);
        if (ok && s.clearHeat) { G.clearWanted(); G.cars.forEach((c) => { if (c.driver === "police") c.copLeaving = true; }); }
        return ok ? "done" : null;
      },
      markers: (m, s) => [MAIN(s, m, { x: s.x, y: s.y, r: s.r || 70, icon: s.car ? "🚗" : "📍" })],
    },
    getcar: {
      init(m, s, st) { m.car = spawnCar(m, s.type, s.x, s.y, s.a, s.type === "van" ? "#f8f9fa" : null); },
      update(m, s) {
        if (m.car.wrecked) return "fail:The car got wrecked";
        if (P.car === m.car) { if (s.crime) G.crime(s.crime, `Stole the ${m.car.s.name}`); return "done"; }
        return null;
      },
      markers: (m) => [MAIN(null, m, { x: m.car.x, y: m.car.y, r: 40, icon: "🔑" })],
    },
    bring: {
      update(m, s) {
        if (m.car.wrecked) return "fail:The car got wrecked";
        if (s.minHp && m.car.hp < m.car.s.hp * s.minHp) return "fail:The car is too damaged";
        return P.car === m.car && near(s.x, s.y, 95) && P.car.speed < 120 ? "done" : null;
      },
      markers: (m, s) => [MAIN(s, m, { x: s.x, y: s.y, icon: "🏁" })],
    },
    deliver: {
      init(m, s, st) { st.hp0 = P.car ? P.car.hp : 100; },
      update(m, s, st) {
        if (!P.car) return null;
        if (P.car.hp < st.hp0 - s.fragile) return "fail:The cargo is smashed";
        return near(s.x, s.y, 95) && P.car.speed < 110 ? "done" : null;
      },
      progress: (m, s, st) => (P.car ? `Cargo ${Math.max(0, Math.round(100 - ((st.hp0 - P.car.hp) / s.fragile) * 100))}%` : ""),
      markers: (m, s) => [MAIN(s, m, { x: s.x, y: s.y, icon: "📦" })],
    },
    checkpoints: {
      init(m, s, st) { st.i = 0; },
      update(m, s, st) {
        const p = s.pts[st.i];
        if (near(p.x, p.y, 105)) { st.i++; G.audio.sfx("checkpoint"); C.pulse(); if (st.i >= s.pts.length) return "done"; }
        return null;
      },
      progress: (m, s, st) => `${st.i}/${s.pts.length}`,
      markers: (m, s, st) => { const out = [MAIN(s, m, { x: s.pts[st.i].x, y: s.pts[st.i].y, r: 100, icon: st.i === s.pts.length - 1 ? "🏁" : "◆", cp: true })]; const n = s.pts[st.i + 1]; if (n) out.push({ x: n.x, y: n.y, r: 70, color: m.def.color, icon: "◇", dim: true }); return out; },
    },
    collect: {
      init(m, s, st) { st.got = new Set(); },
      update(m, s, st) {
        s.pts.forEach((p, k) => {
          if (st.got.has(k)) return;
          if ((s.foot && P.car) || !near(p.x, p.y, s.foot ? 46 : 70)) return;
          st.got.add(k); G.audio.sfx("token"); G.floatText(p.x, p.y, `${st.got.size}/${s.pts.length}`, m.def.color); C.pulse();
          for (let j = 0; j < 14; j++) G.spawnFx("fw", p.x, p.y, { z: 20, vx: rand(-90, 90), vy: rand(-90, 90), vz: rand(40, 160), size: 3, life: 0.8, max: 0.8, color: m.def.color });
        });
        return st.got.size >= s.pts.length ? "done" : null;
      },
      progress: (m, s, st) => `${st.got.size}/${s.pts.length}`,
      markers: (m, s, st) => nearestFirst(s.pts.filter((_, k) => !st.got.has(k)), m, s.icon, 46),
    },
    smash: {
      init(m, s, st) { st.got = new Set(); },
      update(m, s, st) {
        if (!P.car) return null;
        s.pts.forEach((p, k) => {
          if (st.got.has(k) || !near(p.x, p.y, 55)) return;
          if (P.car.speed < s.minSpeed) { if (!st.warn || G.time - st.warn > 2) { st.warn = G.time; G.ui.toast(`Faster! Hit it above ${Math.round(s.minSpeed * KMH)} km/h`, "#ffa028"); } return; }
          st.got.add(k); G.audio.sfx("crash", 1); G.shake(12); C.pulse();
          for (let j = 0; j < 40; j++) G.spawnFx(j % 3 ? "spark" : "fw", p.x, p.y, { z: 8, vx: rand(-260, 260), vy: rand(-260, 260), vz: rand(60, 300), size: rand(2, 5), life: 1, max: 1, color: pick([m.def.color, "#ffd60a", "#ffffff", "#ff7b00"]) });
          G.floatText(p.x, p.y, "SMASH!", m.def.color);
        });
        return st.got.size >= s.pts.length ? "done" : null;
      },
      progress: (m, s, st) => `${st.got.size}/${s.pts.length}`,
      markers: (m, s, st) => nearestFirst(s.pts.filter((_, k) => !st.got.has(k)), m, "💥", 50),
    },
    drift: {
      init(m, s, st) { st.score = 0; st.combo = 0; st.chain = 0; },
      update(m, s, st, dt) {
        const c = P.car;
        if (c && c.z === 0 && c.slip > 100 && c.speed > 130) { st.combo = Math.min(5, st.combo + dt * 0.7); st.chain += c.slip * dt * 0.55 * (1 + st.combo); }
        else if (st.chain > 0) { st.score += st.chain; if (st.chain > 300) { G.floatText(P.x, P.y, `+${Math.round(st.chain)} DRIFT`, m.def.color); G.audio.sfx("cash"); } st.chain = 0; st.combo = 0; }
        C.meter(Math.min(1, (st.score + st.chain) / s.score), `${Math.round(st.score + st.chain)} / ${s.score}`, st.chain > 0 ? `x${(1 + st.combo).toFixed(1)}` : "");
        return st.score >= s.score ? "done" : null;
      },
      markers: () => [],
    },
    speed: {
      update(m, s) { if (m.car && m.car.wrecked) return "fail:The car got wrecked"; const k = P.car ? P.car.speed * KMH : 0; C.meter(Math.min(1, k / s.kmh), `${Math.round(k)} / ${s.kmh} km/h`); return P.car && k >= s.kmh ? "done" : null; },
      markers: () => [],
    },
    race: {
      init(m, s, st) {
        const c = P.car; st.i = 0; st.count = 3.5; st.finished = [];
        if (!c) { st.nocar = true; st.rivals = []; st.count = 0; return; }
        const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = -fy, ry = fx;
        st.rivals = [[-36, -55], [36, -55], [0, -115]].slice(0, s.rivals).map(([lat, back], k) => {
          const r = spawnCar(m, pick(["sports", "muscle", "super"]), c.x + rx * lat + fx * back, c.y + ry * lat + fy * back, c.a);
          r.driver = "racer"; r.ai = { cps: s.pts, idx: 0, skill: s.skill * rand(0.96, 1.04), stuck: 0, rev: 0, lane: 0, started: false }; return r;
        });
      },
      update(m, s, st, dt) {
        if (st.nocar) return "fail:You need a car to race";
        if (st.count > 0) {
          const b = Math.ceil(st.count); st.count -= dt; const a = Math.ceil(st.count);
          if (a !== b) { G.ui.bigCount(a > 0 ? String(a) : "GO!"); G.audio.sfx(a > 0 ? "beep" : "go"); }
          for (const c of [P.car, ...st.rivals]) if (c) { c.vx = c.vy = 0; }
          if (st.count <= 0) st.rivals.forEach((r) => (r.ai.started = true));
          return null;
        }
        if (!P.car) return "fail:You left your car";
        for (const r of st.rivals) if (r.ai.done && !st.finished.includes(r)) st.finished.push(r);
        const p = s.pts[st.i];
        if (near(p.x, p.y, 110)) {
          st.i++; G.audio.sfx("checkpoint"); C.pulse();
          if (st.i >= s.pts.length) { const place = st.finished.length + 1; m.place = place; return place <= s.need ? "done" : `fail:You finished ${ord(place)}. Need ${ord(s.need)} or better`; }
        }
        const prog = (c, k) => k * 10000 - dist(c.x, c.y, s.pts[Math.min(k, s.pts.length - 1)].x, s.pts[Math.min(k, s.pts.length - 1)].y);
        st.pos = 1 + st.rivals.filter((r) => (r.ai.done ? 1e9 : prog(r, r.ai.idx)) > prog(P.car, st.i)).length;
        return null;
      },
      progress: (m, s, st) => (st.count > 0 ? "Get ready" : `CP ${st.i}/${s.pts.length} · P${st.pos || 1}/${s.rivals + 1}`),
      markers: (m, s, st) => STEP.checkpoints.markers(m, s, st),
      cleanup(m, s, st) { (st.rivals || []).forEach((r) => { if (!r.wrecked) { r.keep = false; G.initTrafficAI(r, W.nearestNode(r.x, r.y).id, pick(W.nearestNode(r.x, r.y).nb)); } }); },
    },
    evade: { init() { }, update() { return G.wanted.stars === 0 ? "done" : null; }, markers: () => [] },
    survive: {
      init(m, s, st) { st.t = s.secs; G.crime(s.stars, "Causing chaos for the crew"); },
      update(m, s, st, dt) {
        st.t -= dt; if (G.wanted.stars < s.stars) G.crime(s.stars - G.wanted.stars, "Keeping the heat on");
        C.meter(1 - st.t / s.secs, `${Math.ceil(st.t)}s left`);
        return st.t <= 0 ? "done" : null;
      },
      markers: () => [],
    },
    stunts: {
      init(m, s, st) { st.base = G.stats.stunts; },
      update(m, s, st) { return G.stats.stunts - st.base >= s.n ? "done" : null; },
      progress: (m, s, st) => `${G.stats.stunts - st.base}/${s.n}`,
      markers: (m) => nearestFirst(W.ramps.map((r) => ({ x: r.x, y: r.y })), m, "🛹", 60).slice(0, 3),
    },
    taxi: {
      init(m, s, st) {
        const p = G.makePed(0, 0, 0); p.x = s.pu.x; p.y = s.pu.y; p.state = "wait"; p.fare = true; p.shirt = "#ffd60a"; p.keep = true; G.peds.push(p); st.ped = p; st.stage = 0;
      },
      update(m, s, st) {
        if (st.stage === 0) {
          if (!st.ped || st.ped.remove || !G.peds.includes(st.ped)) { st.ped.remove = false; G.peds.push(st.ped); }
          if (P.car && dist(P.car.x, P.car.y, st.ped.x, st.ped.y) < 95 && P.car.speed < 70) {
            st.ped.remove = true; G.peds = G.peds.filter((p) => p !== st.ped); st.stage = 1; st.hp0 = P.car.hp; G.audio.sfx("door");
            G.ui.toast(pick(["VIP: \"Downtown, and step on it!\"", "VIP: \"I'm late for my own wedding!\"", "VIP: \"Smooth driving please, I just had sushi.\""]), "#ffd60a");
          }
          return null;
        }
        if (!P.car) return null;
        if (P.car.hp < st.hp0 - 45) return "fail:Your VIP jumped out in terror";
        return near(s.x, s.y, 95) && P.car.speed < 90 ? "done" : null;
      },
      progress: (m, s, st) => (st.stage ? "Drive the VIP to the destination" : "Pick up the VIP (stop next to them)"),
      markers: (m, s, st) => [st.stage ? MAIN(s, m, { x: s.x, y: s.y, icon: "🏁" }) : MAIN(s, m, { x: st.ped.x, y: st.ped.y, r: 50, icon: "🙋" })],
      cleanup(m, s, st) { if (st.ped) st.ped.remove = true; },
    },
    fight: {
      init(m, s, st) { st.list = spawnSquad(m, s.x, s.y, s.z || 0, s.n, s.roof); },
      update(m, s, st) {
        for (const e of st.list) if (e.state !== "down" && !G.gang.includes(e)) { e.remove = false; G.gang.push(e); }
        if (st.list.every((e) => e.state === "down")) return "done";
        if (dist(P.x, P.y, s.x, s.y) < 320) for (const e of st.list) if (e.state === "idle" && Math.abs((P.z || 0) - e.z) < 40) { e.state = "chase"; e.aware = true; }
        return null;
      },
      progress: (m, s, st) => `${st.list.filter((e) => e.state === "down").length}/${st.list.length} down`,
      markers: (m, s, st) => { const alive = st.list.filter((e) => e.state !== "down"); if (!alive.length) return []; const cx = alive.reduce((a, e) => a + e.x, 0) / alive.length, cy = alive.reduce((a, e) => a + e.y, 0) / alive.length; return [MAIN(s, m, { x: cx, y: cy, r: 50, icon: "👊" })]; },
      cleanup(m, s, st) { (st.list || []).forEach((e) => (e.remove = true)); },
    },
    hero: { update() { return P.hero !== "kai" ? "done" : null; }, markers: () => [] },
    roof: {
      update(m, s) { return !P.car && near(s.x, s.y, Math.max(s.b.w, s.b.h) / 2 + 10) && (P.z || 0) >= s.z - 14 ? "done" : null; },
      markers: (m, s) => [MAIN(s, m, { x: s.x, y: s.y, r: 60, icon: "🏙️" })],
    },
    roofs: {
      init(m, s, st) { st.i = 0; },
      update(m, s, st) {
        const p = s.pts[st.i];
        if (!P.car && near(p.x, p.y, Math.max(p.b.w, p.b.h) / 2 + 20) && (P.z || 0) >= p.z - 16) { st.i++; G.audio.sfx("checkpoint"); C.pulse(); C.fireworks(p.x, p.y, 1, p.z); if (st.i >= s.pts.length) return "done"; }
        return null;
      },
      progress: (m, s, st) => `${st.i}/${s.pts.length}`,
      markers: (m, s, st) => [MAIN(s, m, { x: s.pts[st.i].x, y: s.pts[st.i].y, r: 60, icon: "🕸️", cp: true })],
    },
    takedown: {
      init(m, s, st) {
        const c = (st.car = spawnCar(m, s.type, s.x, s.y, s.a, "#e63946")); c.hp = c.s.hp = s.hp; c.driver = "racer"; c.target = true;
        c.ai = { cps: racePath(Math.random, s.x, s.y, 14), idx: 0, skill: s.skill, stuck: 0, rev: 0, lane: 0, started: true }; st.far = 0;
      },
      update(m, s, st, dt) {
        const c = st.car; if (c.wrecked) { C.fireworks(c.x, c.y, 2); return "done"; }
        if (c.ai.done) { c.ai.cps = racePath(Math.random, c.x, c.y, 14); c.ai.idx = 0; c.ai.done = false; }
        const d = dist(c.x, c.y, P.x, P.y); st.far = d > 1300 ? st.far + dt : 0;
        C.meter(1 - c.hp / c.s.hp, `Target damage ${Math.round(100 - (c.hp / c.s.hp) * 100)}%`);
        return st.far > 7 ? "fail:The target got away" : null;
      },
      markers: (m, s, st) => [MAIN(s, m, { x: st.car.x, y: st.car.y, r: 36, icon: "🎯" })],
    },
    tail: {
      init(m, s, st) { const c = (st.car = spawnCar(m, "sedan", s.x, s.y, s.a, "#111111")); const n = W.nearestNode(s.x, s.y); G.initTrafficAI(c, n.id, pick(n.nb)); c.ai.cruise = 175; st.t = s.secs; st.lost = 0; st.close = 0; },
      update(m, s, st, dt) {
        const c = st.car; if (c.wrecked) return "fail:You wrecked the target";
        if (c.driver !== "ai") { c.driver = "ai"; }
        const d = dist(c.x, c.y, P.x, P.y);
        if (d > 520) st.lost += dt; else st.lost = Math.max(0, st.lost - dt);
        if (d < 75) st.close += dt; else st.close = Math.max(0, st.close - dt * 0.5);
        if (d >= 75 && d <= 520) st.t -= dt;
        C.meter(1 - st.t / s.secs, d > 520 ? `Too far! ${Math.ceil(5 - st.lost)}s` : d < 75 ? "Too close! Back off" : `Tailing · ${Math.ceil(st.t)}s`);
        if (st.lost > 5) return "fail:You lost the target";
        if (st.close > 2.5) return "fail:The target spotted you";
        return st.t <= 0 ? "done" : null;
      },
      markers: (m, s, st) => [MAIN(s, m, { x: st.car.x, y: st.car.y, r: 30, icon: "👁️" })],
    },
    escort: {
      init(m, s, st) {
        const c = (st.car = spawnCar(m, "van", s.x, s.y, s.a, "#4cc9f0")); c.driver = "racer"; c.hp = c.s.hp = 220;
        const path = W.nodePath(W.nearestNode(s.x, s.y).id, W.nearestNode(s.tx, s.ty).id).map((id) => ({ x: W.nodes[id].x, y: W.nodes[id].y }));
        path.push({ x: s.tx, y: s.ty });
        c.ai = { cps: path, idx: 0, skill: 0.62, stuck: 0, rev: 0, lane: 0, started: true }; st.far = 0;
      },
      update(m, s, st, dt) {
        const c = st.car; if (c.wrecked) return "fail:The escort got destroyed";
        const d = dist(c.x, c.y, P.x, P.y);
        c.ai.started = d < 450; if (!c.ai.started) { c.ctrl.t = c.vF > 5 ? -1 : 0; }
        st.far = d > 900 ? st.far + dt : 0;
        C.meter(c.ai.idx / c.ai.cps.length, d > 450 ? "Catch up! They're waiting for you" : `Escort health ${Math.round((c.hp / c.s.hp) * 100)}%`);
        if (st.far > 8) return "fail:You abandoned the escort";
        return c.ai.done || dist(c.x, c.y, s.tx, s.ty) < 110 ? "done" : null;
      },
      markers: (m, s, st) => [MAIN(s, m, { x: st.car.x, y: st.car.y, r: 36, icon: "🛡️" }), { x: s.tx, y: s.ty, r: 70, color: m.def.color, icon: "🏁", dim: true }],
    },
  };
  function nearestFirst(pts, m, icon, r) {
    const sorted = [...pts].sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y));
    return sorted.map((p, k) => (k === 0 ? MAIN(null, m, { x: p.x, y: p.y, r, icon }) : { x: p.x, y: p.y, r, color: m.def.color, icon, dim: false, side: true }));
  }
  const ord = (n) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]);

  // ================= start / update / finish =================
  C.start = function (i) {
    if (G.missions.active) return G.ui.toast("Finish your current job first (X cancels)", "#ffa028");
    if (!C.unlocked(i)) return G.ui.toast("That mission is still locked", "#ff4d6d");
    if (G.finale && G.finale.active()) G.finale.skip();
    const def = C.list[i], b = build(def);
    const m = { kind: "op", def, tier: def.ch, steps: b.steps, si: -1, st: null, spawned: [], timer: null, t0: G.time, title: def.title };
    m.cleanup = () => { for (const [k, s] of m.steps.entries()) if (STEP[s.t].cleanup && k <= m.si) STEP[s.t].cleanup(m, s, k === m.si ? m.st : s._st || {}); for (const c of m.spawned) { c.keep = false; if (c.driver === "racer" && !c.wrecked && c !== P.car) G.initTrafficAI(c, W.nearestNode(c.x, c.y).id, pick(W.nearestNode(c.x, c.y).nb)); } C.meter(null); };
    G.missions.active = m;
    C.introCard(def);
    G.audio.sfx("whoosh");
    setTimeout(() => G.ui.dialog(b.lines, () => { m.t0 = G.time; nextStep(m); }), 1400);
  };
  function nextStep(m) {
    if (m.si >= 0) m.steps[m.si]._st = m.st;
    m.si++; C.meter(null);
    if (m.si >= m.steps.length) return complete(m);
    const s = m.steps[m.si]; m.st = {}; m.timer = s.timer || null;
    if (STEP[s.t].init) STEP[s.t].init(m, s, m.st);
    G.ui.objective(s.text);
    if (m.si > 0) { G.audio.sfx("job"); C.stageFlash(`STAGE ${m.si + 1}/${m.steps.length}`); }
  }
  C.update = function (m, dt) {
    if (m.si < 0) return; // still in the briefing
    const s = m.steps[m.si], h = STEP[s.t], r = h.update(m, s, m.st, dt);
    const prog = h.progress ? h.progress(m, s, m.st) : "";
    const label = s.text + (prog ? `  ·  ${prog}` : "");
    G.ui.objective(label);
    if (r === "done") nextStep(m);
    else if (r && r.startsWith("fail:")) G.missions.fail(r.slice(5));
  };
  C.markers = function (m) {
    if (m.si < 0) return [];
    const s = m.steps[m.si]; return STEP[s.t].markers ? STEP[s.t].markers(m, s, m.st) : [];
  };
  function complete(m) {
    const def = m.def, secs = G.time - m.t0, d = C.done(), before = d[def.i] || 0;
    const par = 60 + m.steps.length * 55 + def.ch * 6;
    const hpK = P.car ? P.car.hp / P.car.s.hp : P.hp / 100;
    const medal = secs < par && hpK > 0.5 ? 3 : secs < par * 1.6 ? 2 : 1;
    const reward = Math.round(def.reward * [1, 1, 1.25, 1.6][medal] / 10) * 10;
    d[def.i] = Math.max(before, medal);
    G.missions.active = null; m.cleanup && m.cleanup(true);
    G.addMoney(reward); G.stats.jobs++;
    G.ui.objective("");
    C.medal(def, medal, secs, reward);
    C.fireworks(P.x, P.y, 6 + medal * 2);
    G.timeScale = 0.45; setTimeout(() => (G.timeScale = 1), 1100);
    G.audio.sfx("success");
    const chDone = C.list.filter((x) => x.ch === def.ch).every((x) => d[x.i]);
    if (chDone && !before) setTimeout(() => {
      G.addMoney(2500 * (def.ch + 1)); C.fireworks(P.x, P.y, 20);
      if (G.missions.active || G.state.mode !== "play") return G.ui.banner(`CHAPTER ${def.ch + 1} COMPLETE`, "", CH[def.ch].color);
      if (def.ch === 9) G.finale.play(); else G.finale.chapter(def.ch, CH[def.ch], CH[def.ch + 1]);
    }, 3600);
    G.save();
  }

  // markers for the next mission (shown when no job is active)
  C.available = function () {
    const i = C.nextIndex(); if (i < 0) return [];
    const def = C.list[i], ch = CH[def.ch];
    return [{ x: ch.hub.x, y: ch.hub.y, color: def.color, r: 52, icon: ch.face, label: `E: Mission ${def.n}/100 · ${def.title} (${ch.giver})`, act: () => C.start(i), campaign: true }];
  };

  // ================= fireworks =================
  const rockets = [];
  const PAL = ["#ff3df2", "#22d3ee", "#ffd60a", "#19f5a0", "#ff7b00", "#c77dff", "#ffffff", "#ef233c"];
  C.fireworks = function (x, y, n = 6, z0 = 0) {
    for (let k = 0; k < n; k++) setTimeout(() => rockets.push({ x: x + rand(-160, 160), y: y + rand(-160, 160), z: z0 + 4, vx: rand(-20, 20), vy: rand(-20, 20), vz: rand(330, 470), fuse: rand(0.9, 1.4), color: pick(PAL), color2: pick(PAL), kind: randi(0, 3) }), k * rand(120, 260));
  };
  C.updateFireworks = function (dt) {
    for (const r of rockets) {
      r.fuse -= dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt; r.vz -= 120 * dt;
      G.spawnFx("spark", r.x, r.y, { z: r.z, vx: 0, vy: 0, vz: -20, size: 2.2, life: 0.35, max: 0.35, color: "#ffe8b0" });
      if (r.fuse <= 0) {
        r.dead = true; const N = 70;
        for (let k = 0; k < N; k++) {
          const u = rand(-1, 1), th = rand(TAU), s = Math.sqrt(1 - u * u), sp = r.kind === 1 ? 210 : rand(120, 240);
          let vx = Math.cos(th) * s * sp, vy = Math.sin(th) * s * sp, vz = u * sp;
          if (r.kind === 2) { vz = Math.abs(vz) * 0.3; } // flat ring
          G.spawnFx("fw", r.x, r.y, { z: r.z, vx, vy, vz, size: rand(3, 5), life: rand(1.3, 2.1), max: 2.1, color: k % 2 ? r.color : r.color2 });
        }
        G.spectacle && G.spectacle.flash(r.x, r.y, r.z, r.color);
        if (dist(r.x, r.y, P.x, P.y) < 1500) G.audio.sfx("boom", 0.4);
      }
    }
    for (let k = rockets.length - 1; k >= 0; k--) if (rockets[k].dead) rockets.splice(k, 1);
  };

  // ================= UI (self-contained DOM + CSS) =================
  let el = {};
  C.init = function () {
    const css = document.createElement("style");
    css.textContent = `
    #opCard{position:fixed;left:50%;top:13%;transform:translateX(-50%);z-index:40;pointer-events:none;opacity:0;text-align:center}
    #opCard.show{animation:opIn 4.2s cubic-bezier(.2,1,.3,1) forwards}
    #opCard .stripe{height:6px;width:0;margin:0 auto 12px;border-radius:3px;animation:stripe 1s .2s forwards}
    #opCard .k{font-size:15px;letter-spacing:8px;color:#e9e9ff;text-shadow:0 2px 6px #000}
    #opCard .t{font-size:72px;font-weight:900;font-style:italic;letter-spacing:4px;line-height:1.05;-webkit-text-stroke:2px rgba(0,0,0,.45);text-shadow:0 0 30px currentColor,0 6px 0 rgba(0,0,0,.6)}
    #opCard .t span{display:inline-block;opacity:0;transform:translateY(30px) rotate(8deg);animation:letter .5s forwards}
    #opCard .g{margin-top:8px;font-size:18px;color:#fff;text-shadow:0 2px 6px #000}
    @keyframes opIn{0%{opacity:0;transform:translateX(-50%) scale(1.3)}8%{opacity:1;transform:translateX(-50%) scale(1)}82%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-30px)}}
    @keyframes stripe{to{width:520px}} @keyframes letter{to{opacity:1;transform:none}}
    #opMedal{position:fixed;left:50%;top:22%;transform:translateX(-50%);z-index:41;pointer-events:none;text-align:center;opacity:0}
    #opMedal.show{animation:medalBox 5.2s forwards}
    #opMedal .m{font-size:150px;line-height:1;display:inline-block;animation:medalSpin 1.2s cubic-bezier(.2,1.6,.4,1)}
    #opMedal .h{font-size:58px;font-weight:900;font-style:italic;letter-spacing:5px;color:#19f5a0;text-shadow:0 0 30px #19f5a0,0 5px 0 #000}
    #opMedal .s{font-size:21px;color:#fff;text-shadow:0 2px 6px #000;margin-top:4px}
    #opMedal .stars{font-size:40px;letter-spacing:8px;margin-top:6px}
    #opMedal .stars i{font-style:normal;display:inline-block;opacity:0;animation:starPop .4s forwards}
    @keyframes medalBox{0%{opacity:0}6%{opacity:1}85%{opacity:1}100%{opacity:0}}
    @keyframes medalSpin{0%{transform:scale(0) rotateY(720deg)}100%{transform:scale(1) rotateY(0)}}
    @keyframes starPop{0%{opacity:0;transform:scale(3)}100%{opacity:1;transform:scale(1)}}
    #opArrow{position:fixed;width:64px;height:64px;margin:-32px 0 0 -32px;z-index:30;pointer-events:none;display:none;filter:drop-shadow(0 0 10px currentColor)}
    #opArrow svg{width:100%;height:100%;animation:arrowBob .8s ease-in-out infinite alternate}
    #opArrow .d{position:absolute;top:62px;left:50%;transform:translateX(-50%);font:bold 13px Bahnschrift,sans-serif;color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap}
    @keyframes arrowBob{to{transform:scale(1.15)}}
    #opMeter{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);width:420px;z-index:30;pointer-events:none;display:none;text-align:center}
    #opMeter .bar{height:12px;border-radius:7px;background:rgba(0,0,0,.6);overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.2)}
    #opMeter .bar i{display:block;height:100%;width:0;border-radius:7px;transition:width .15s;background:linear-gradient(90deg,#22d3ee,#c77dff,#ff3df2);box-shadow:0 0 14px #c77dff}
    #opMeter .lb{font:bold 16px Bahnschrift,sans-serif;color:#fff;text-shadow:0 1px 4px #000;margin-bottom:4px}
    #opMeter .cb{font:900 34px Bahnschrift,sans-serif;font-style:italic;color:#ffd60a;text-shadow:0 0 18px #ffd60a;height:38px}
    #opStage{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:35;pointer-events:none;font:900 46px Bahnschrift,sans-serif;font-style:italic;letter-spacing:6px;color:#fff;opacity:0;text-shadow:0 0 24px #c77dff,0 4px 0 #000}
    #opStage.show{animation:stageIn 1.6s forwards}
    @keyframes stageIn{0%{opacity:0;transform:translate(-50%,-50%) scaleX(2.5)}15%{opacity:1;transform:translate(-50%,-50%) scaleX(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) translateY(-20px)}}
    #opPulse{position:fixed;inset:0;pointer-events:none;z-index:29;box-shadow:inset 0 0 0 0 rgba(255,255,255,0)}
    #opPulse.go{animation:pulseIn .45s}
    @keyframes pulseIn{0%{box-shadow:inset 0 0 120px 20px var(--pc,#c77dff)}100%{box-shadow:inset 0 0 0 0 transparent}}
    `;
    document.head.appendChild(css);
    const mk = (id, html = "") => { const d = document.createElement("div"); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    el.card = mk("opCard"); el.medal = mk("opMedal"); el.stage = mk("opStage"); el.pulse = mk("opPulse");
    el.arrow = mk("opArrow", `<svg viewBox="0 0 64 64"><path d="M32 4 L58 58 L32 44 L6 58 Z" fill="currentColor" stroke="#000" stroke-width="3" stroke-linejoin="round"/></svg><div class="d"></div>`);
    el.meter = mk("opMeter", `<div class="cb"></div><div class="lb"></div><div class="bar"><i></i></div>`);
  };
  C.introCard = function (def) {
    const ch = CH[def.ch];
    el.card.style.color = def.color;
    const letters = [...def.title].map((c, k) => `<span style="animation-delay:${0.25 + k * 0.035}s">${c === " " ? "&nbsp;" : c}</span>`).join("");
    el.card.innerHTML = `<div class="stripe" style="background:${def.color};box-shadow:0 0 20px ${def.color}"></div><div class="k">CHAPTER ${def.ch + 1} · ${ch.name.toUpperCase()} · MISSION ${def.n}/100</div><div class="t">${letters}</div><div class="g">${def.face} ${def.giver}</div>`;
    el.card.classList.remove("show"); void el.card.offsetWidth; el.card.classList.add("show");
  };
  C.medal = function (def, medal, secs, reward) {
    const icon = ["", "🥉", "🥈", "🥇"][medal], name = ["", "BRONZE", "SILVER", "GOLD"][medal];
    const stars = [0, 1, 2].map((k) => `<i style="animation-delay:${0.9 + k * 0.25}s;color:${k < medal ? "#ffd60a" : "#555"}">★</i>`).join("");
    el.medal.innerHTML = `<div class="m">${icon}</div><div class="h">MISSION PASSED</div><div class="stars">${stars}</div><div class="s">${def.title} · ${name} · ${Math.round(secs)}s · +${fmtMoney(reward)}</div>`;
    el.medal.classList.remove("show"); void el.medal.offsetWidth; el.medal.classList.add("show");
  };
  C.stageFlash = function (t) { el.stage.textContent = t; el.stage.classList.remove("show"); void el.stage.offsetWidth; el.stage.classList.add("show"); };
  C.pulse = function () { const m = G.missions.active; el.pulse.style.setProperty("--pc", m && m.def ? m.def.color : "#c77dff"); el.pulse.classList.remove("go"); void el.pulse.offsetWidth; el.pulse.classList.add("go"); };
  C.meter = function (frac, label, combo = "") {
    if (frac === null || frac === undefined) { el.meter.style.display = "none"; return; }
    el.meter.style.display = "block"; el.meter.querySelector("i").style.width = clamp(frac, 0, 1) * 100 + "%";
    el.meter.querySelector(".lb").textContent = label; el.meter.querySelector(".cb").textContent = combo;
  };
  // screen-edge arrow toward the current objective
  C.updateUI = function () {
    const m = G.missions.active;
    const tgt = m ? G.missions.markers().find((k) => k.main) : C.available()[0];
    if (!tgt || G.state.mode !== "play" || !G.render.project) { el.arrow.style.display = "none"; return; }
    const d = dist(P.x, P.y, tgt.x, tgt.y);
    const p = G.render.project(tgt.x, tgt.y, 30), [Wd, Hd] = G.render.size();
    const onScreen = !p.behind && p.sx > 60 && p.sx < Wd - 60 && p.sy > 60 && p.sy < Hd - 60;
    if (onScreen && d < 900) { el.arrow.style.display = "none"; return; }
    let dx = p.sx - Wd / 2, dy = p.sy - Hd / 2; if (p.behind) { dx = -dx; dy = -dy; }
    const ang = Math.atan2(dy, dx), rx = Wd / 2 - 70, ry = Hd / 2 - 90, k = Math.min(rx / Math.abs(Math.cos(ang) || 1e-6), ry / Math.abs(Math.sin(ang) || 1e-6));
    el.arrow.style.display = "block"; el.arrow.style.color = tgt.color || "#fff";
    el.arrow.style.left = Wd / 2 + Math.cos(ang) * k + "px"; el.arrow.style.top = Hd / 2 + Math.sin(ang) * k + "px";
    el.arrow.querySelector("svg").style.transform = `rotate(${ang + Math.PI / 2}rad)`;
    el.arrow.querySelector(".d").textContent = d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m";
  };

  // ================= phone: Missions app =================
  C.phone = function () {
    const d = C.done(), U = G.ui;
    U.phoneMenu("Missions", CH.map((ch, ci) => {
      const got = C.list.filter((x) => x.ch === ci && d[x.i]).length, open = C.unlocked(ci * 10);
      return { label: `${open ? ch.face : "🔒"} ${ci + 1}. ${ch.name}`, right: `${got}/10`, disabled: !open, act: () => chapterMenu(ci) };
    }));
  };
  function chapterMenu(ci) {
    const d = C.done(), U = G.ui, ch = CH[ci];
    U.phoneMenu(`${ch.face} ${ch.name}`, C.list.filter((x) => x.ch === ci).map((x) => {
      const medal = ["", "🥉", "🥈", "🥇"][d[x.i] || 0], open = C.unlocked(x.i);
      return { label: `${open ? (medal || "▶") : "🔒"} ${x.n}. ${x.title}`, right: fmtMoney(x.reward), disabled: !open, act: () => {
        U.togglePhone(false);
        if (d[x.i]) C.start(x.i); // replay instantly
        else { G.state.waypoint = { x: ch.hub.x, y: ch.hub.y }; G.ui.toast(`Head to ${ch.giver} (marked on your GPS)`, ch.color); }
      } };
    }));
  }
})();
