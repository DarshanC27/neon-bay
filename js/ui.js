// ---------- UI: HUD, minimap, speedometer, map, phone, shops, dialog, menus ----------
(function () {
  const W = G.world, T = G.TILE, TT = W.TT, P = G.player;
  const U = (G.ui = {});
  const $ = (id) => document.getElementById(id);
  const MS = 1 / 8; // map image scale
  let mapImg, mm, mmc, sp, spc, routePts = [], routeT = 0;

  U.init = function () {
    // pre-render the city map
    mapImg = document.createElement("canvas"); mapImg.width = mapImg.height = W.SIZE * MS;
    const g = mapImg.getContext("2d");
    const COL = { [TT.WATER]: "#0b3d5c", [TT.SAND]: "#d9c48f", [TT.GRASS]: "#3b6e37", [TT.ROAD]: "#d8dde6", [TT.WALK]: "#6f7480", [TT.LOT]: "#4a4d54", [TT.PARK]: "#2f8f46", [TT.PLAZA]: "#8f8a83", [TT.PARKING]: "#3a3d44", [TT.DIRT]: "#b08a5c" };
    for (let ty = 0; ty < W.N; ty++) for (let tx = 0; tx < W.N; tx++) { g.fillStyle = COL[W.tiles[ty * W.N + tx]]; g.fillRect(tx * T * MS, ty * T * MS, T * MS + 0.5, T * MS + 0.5); }
    for (const b of W.buildings) { g.fillStyle = b.poi ? b.neon : "#2a2f3d"; g.globalAlpha = b.poi ? 0.9 : 0.85; g.fillRect(b.x * MS, b.y * MS, b.w * MS, b.h * MS); }
    g.globalAlpha = 1;
    for (const d of W.decor) if (d.type === "pond") { g.fillStyle = "#1f6f8b"; g.beginPath(); g.ellipse(d.x * MS, d.y * MS, d.rx * MS, d.ry * MS, 0, 0, TAU); g.fill(); }
    mm = $("minimap"); mmc = mm.getContext("2d");
    sp = $("speedo"); spc = sp.getContext("2d");
    $("mapCanvas").addEventListener("mousedown", mapClick);
    buildPhone();
  };

  // ---------- small text widgets ----------
  U.toast = function (text, color = "#fff") {
    const el = document.createElement("div"); el.className = "toast"; el.style.borderLeftColor = color; el.textContent = text;
    $("toasts").appendChild(el); setTimeout(() => el.classList.add("out"), 3200); setTimeout(() => el.remove(), 3700);
  };
  U.banner = function (title, sub = "", color = "#19f5a0") {
    const b = $("banner"); b.innerHTML = `<div class="bt" style="color:${color};text-shadow:0 0 30px ${color}">${title}</div><div class="bs">${sub}</div>`;
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  };
  U.bigCount = function (t) { const b = $("bigcount"); b.textContent = t; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); };
  U.objective = function (t) { const o = $("objective"); if (o.textContent !== t) { o.textContent = t; o.classList.toggle("on", !!t); } };
  U.prompt = function (t) { const p = $("prompt"); if (t) { p.textContent = t; p.classList.add("on"); } else p.classList.remove("on"); };
  U.radio = function (name) { const r = $("radio"); r.textContent = name; r.classList.remove("show"); void r.offsetWidth; r.classList.add("show"); };
  let lastDistrict = "";

  // ---------- dialog ----------
  let dlg = null;
  const PORTRAIT = { Vince: "🕴️", Kai: "😎", Marlo: "🦹" };
  U.dialog = function (lines, done) {
    dlg = { lines, i: 0, ch: 0, done }; G.state.mode = "dialog";
    $("dialog").classList.add("on"); renderDlg();
  };
  function renderDlg() {
    const [who, text] = dlg.lines[dlg.i];
    $("dlgWho").textContent = who; $("dlgFace").textContent = PORTRAIT[who] || "🙂";
    $("dlgText").textContent = text.slice(0, Math.floor(dlg.ch));
    if (G.settings.voices && dlg.ch === 0 && window.speechSynthesis) {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text);
      u.pitch = who === "Kai" ? 1.1 : who === "Marlo" ? 0.7 : 0.85; u.rate = 1.05; speechSynthesis.speak(u);
    }
  }
  U.updateDialog = function (dt) {
    if (!dlg) return;
    const text = dlg.lines[dlg.i][1];
    if (dlg.ch === 0) renderDlg();
    dlg.ch = Math.min(text.length, dlg.ch + dt * 55); $("dlgText").textContent = text.slice(0, Math.floor(dlg.ch));
    if (Input.hit("KeyE", "Space", "Enter") || Input.mouse.clicked) {
      if (dlg.ch < text.length) dlg.ch = text.length;
      else { dlg.i++; dlg.ch = 0; G.audio.sfx("click"); if (dlg.i >= dlg.lines.length) { const d = dlg.done; dlg = null; $("dialog").classList.remove("on"); G.state.mode = "play"; if (window.speechSynthesis) speechSynthesis.cancel(); d && d(); } }
    }
  };

  // ---------- HUD ----------
  let shownMoney = 0;
  U.update = function (dt) {
    const s = G.state;
    shownMoney += (s.money - shownMoney) * Math.min(1, dt * 6);
    if (Math.abs(s.money - shownMoney) < 1) shownMoney = s.money;
    $("money").textContent = fmtMoney(shownMoney);
    const hh = Math.floor(s.hour), mi = Math.floor((s.hour % 1) * 60);
    $("clock").textContent = `${String(hh).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    $("weather").textContent = G.weather.rain > 0.3 ? "🌧️" : s.hour > 20 || s.hour < 5.5 ? "🌙" : s.hour > 17.5 ? "🌇" : "☀️";
    const st = G.wanted.stars, blink = !G.wanted.seen && st > 0 && Math.floor(G.time * 4) % 2;
    $("stars").innerHTML = [0, 1, 2, 3, 4].map((i) => `<span class="${i < st ? (blink ? "blink" : "on") : ""}">★</span>`).join("");
    const d = W.districtAt(P.x, P.y);
    if (d !== lastDistrict) { lastDistrict = d; const el = $("district"); el.textContent = W.DISTRICT_NAMES[d] || d; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
    $("hpbar").style.width = (P.car ? (P.car.hp / P.car.s.hp) * 100 : P.hp) + "%";
    $("hpbar").style.background = P.car ? "#22d3ee" : "#19f5a0";
    $("nitrobar").style.width = P.nitro * 100 + "%";
    $("hplabel").textContent = P.car ? "CAR" : "HP";
    const m = G.missions.active;
    $("timer").textContent = m && m.timer != null && m.kind !== "race" ? `⏱ ${Math.max(0, Math.ceil(m.timer))}s` : "";
    $("timer").classList.toggle("urgent", !!(m && m.timer != null && m.timer < 15));
    if (!m && !G.state.objectiveHold) U.objective("");
    drawMinimap(dt);
    drawSpeedo();
    U.updateDialog(dt);
  };

  // ---------- GPS ----------
  function gpsTarget() {
    const m = G.missions.active;
    if (m) { const mk = G.missions.markers().find((k) => k.main); if (mk) return mk; }
    return G.state.waypoint;
  }
  function drawMinimap(dt) {
    const S = mm.width, R = S / 2, scale = 0.13, tgt = gpsTarget();
    routeT -= dt;
    if (tgt && routeT <= 0) { routeT = 0.5; routePts = W.route(P.x, P.y, tgt.x, tgt.y); }
    if (!tgt) routePts = [];
    const rot = -(G.cam3 ? G.cam3.yaw : P.a) - Math.PI / 2;
    mmc.setTransform(1, 0, 0, 1, 0, 0); mmc.clearRect(0, 0, S, S);
    mmc.save(); mmc.beginPath(); mmc.arc(R, R, R - 4, 0, TAU); mmc.clip();
    mmc.fillStyle = "#0b3d5c"; mmc.fillRect(0, 0, S, S);
    mmc.translate(R, R); mmc.rotate(rot); mmc.scale(scale / MS, scale / MS); mmc.translate(-P.x * MS, -P.y * MS);
    mmc.drawImage(mapImg, 0, 0);
    mmc.setTransform(1, 0, 0, 1, 0, 0);
    const toMM = (x, y) => { const dx = (x - P.x) * scale, dy = (y - P.y) * scale, c = Math.cos(rot), s = Math.sin(rot); return [R + dx * c - dy * s, R + dx * s + dy * c]; };
    if (routePts.length > 1) {
      mmc.strokeStyle = "#c77dff"; mmc.lineWidth = 5; mmc.lineJoin = "round"; mmc.shadowColor = "#c77dff"; mmc.shadowBlur = 8;
      mmc.beginPath(); routePts.forEach((p, i) => { const [x, y] = toMM(p.x, p.y); i ? mmc.lineTo(x, y) : mmc.moveTo(x, y); }); mmc.stroke(); mmc.shadowBlur = 0;
    }
    for (const c of G.cars) if (c.driver === "police" && !c.wrecked) { const [x, y] = toMM(c.x, c.y); mmc.fillStyle = Math.floor(G.time * 6) % 2 ? "#ff2040" : "#2080ff"; mmc.beginPath(); mmc.arc(x, y, 4.5, 0, TAU); mmc.fill(); }
    for (const e of G.gang || []) if (e.state !== "down") { const [x, y] = toMM(e.x, e.y); mmc.fillStyle = "#3a86ff"; mmc.strokeStyle = "#fff"; mmc.lineWidth = 1; mmc.beginPath(); mmc.arc(x, y, 3.5, 0, TAU); mmc.fill(); mmc.stroke(); }
    for (const c of G.cars) if (c.driver === "racer") { const [x, y] = toMM(c.x, c.y); mmc.fillStyle = "#ffd60a"; mmc.beginPath(); mmc.arc(x, y, 4, 0, TAU); mmc.fill(); }
    mmc.restore();
    // blips (clamped to edge)
    const blip = (x, y, icon, color, big) => {
      let [bx, by] = toMM(x, y); const dx = bx - R, dy = by - R, d = Math.hypot(dx, dy), lim = R - 14;
      if (d > lim) { bx = R + (dx / d) * lim; by = R + (dy / d) * lim; }
      mmc.fillStyle = "rgba(0,0,0,0.6)"; mmc.beginPath(); mmc.arc(bx, by, big ? 11 : 9, 0, TAU); mmc.fill();
      mmc.strokeStyle = color; mmc.lineWidth = 2; mmc.stroke();
      mmc.font = `${big ? 12 : 10}px 'Segoe UI Emoji', sans-serif`; mmc.textAlign = "center"; mmc.textBaseline = "middle"; mmc.fillStyle = color; mmc.fillText(icon, bx, by + 1);
    };
    for (const k of G.missions.shops()) blip(k.x, k.y, k.icon, k.color);
    for (const k of G.missions.markers()) if (!k.dim) blip(k.x, k.y, k.icon, k.color, k.main);
    if (G.state.waypoint && !G.missions.active) blip(G.state.waypoint.x, G.state.waypoint.y, "📍", "#c77dff", true);
    if (G.net) G.net.drawMinimap(mmc, toMM, R);
    // player arrow
    mmc.save(); mmc.translate(R, R); mmc.rotate((P.car ? P.car.a : P.a) + rot);
    mmc.fillStyle = "#fff"; mmc.shadowColor = "#fff"; mmc.shadowBlur = 6;
    mmc.beginPath(); mmc.moveTo(10, 0); mmc.lineTo(-7, 7); mmc.lineTo(-3, 0); mmc.lineTo(-7, -7); mmc.closePath(); mmc.fill(); mmc.restore();
    // north marker
    const [nx, ny] = (() => { const c = Math.cos(rot), s = Math.sin(rot); return [R + (-(R - 12)) * -s, R + (-(R - 12)) * c]; })();
    mmc.fillStyle = "#ff4d6d"; mmc.font = "bold 12px Bahnschrift"; mmc.textAlign = "center"; mmc.textBaseline = "middle"; mmc.fillText("N", nx, ny);
    mmc.strokeStyle = "rgba(255,255,255,0.35)"; mmc.lineWidth = 3; mmc.beginPath(); mmc.arc(R, R, R - 4, 0, TAU); mmc.stroke();
    const tg = tgt ? Math.round(dist(P.x, P.y, tgt.x, tgt.y) / 10) * 10 : 0;
    $("gpsdist").textContent = tgt ? `${tg >= 1000 ? (tg / 1000).toFixed(1) + " km" : tg + " m"}` : "";
  }
  function drawSpeedo() {
    const c = P.car; $("speedoWrap").classList.toggle("on", !!c);
    if (!c) return;
    const S = sp.width, R = S / 2, kmh = Math.round(c.speed * 0.6), max = 400;
    spc.clearRect(0, 0, S, S);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, frac = clamp(kmh / max, 0, 1);
    spc.lineCap = "round"; spc.lineWidth = 12;
    spc.strokeStyle = "rgba(255,255,255,0.08)"; spc.beginPath(); spc.arc(R, R, R - 16, a0, a1); spc.stroke();
    const g = spc.createLinearGradient(0, S, S, 0); g.addColorStop(0, "#22d3ee"); g.addColorStop(0.6, "#c77dff"); g.addColorStop(1, "#ff3df2");
    spc.strokeStyle = g; spc.shadowColor = "#c77dff"; spc.shadowBlur = 14; spc.beginPath(); spc.arc(R, R, R - 16, a0, a0 + (a1 - a0) * frac); spc.stroke(); spc.shadowBlur = 0;
    spc.fillStyle = "rgba(255,255,255,0.5)"; spc.font = "11px Bahnschrift"; spc.textAlign = "center"; spc.textBaseline = "middle";
    for (let v = 0; v <= max; v += 80) { const a = a0 + (a1 - a0) * (v / max); spc.fillText(v, R + Math.cos(a) * (R - 36), R + Math.sin(a) * (R - 36)); }
    spc.fillStyle = "#fff"; spc.font = "bold 44px Bahnschrift"; spc.fillText(kmh, R, R - 4);
    spc.font = "12px Bahnschrift"; spc.fillStyle = "#aab"; spc.fillText("KM/H", R, R + 24);
    if (c.manual) { // rev counter ring + shift light + big gear letter
      const r01 = clamp((c.rpm - 900) / 6300, 0, 1), b0 = Math.PI * 0.8, b1 = Math.PI * 2.2;
      spc.lineWidth = 5; spc.strokeStyle = "rgba(255,255,255,0.1)"; spc.beginPath(); spc.arc(R, R, R - 30, b0, b1); spc.stroke();
      spc.strokeStyle = r01 > 0.86 ? "#ff3048" : r01 > 0.7 ? "#ffd60a" : "#19f5a0"; spc.beginPath(); spc.arc(R, R, R - 30, b0, b0 + (b1 - b0) * r01); spc.stroke();
      const g = c.gear < 0 ? "R" : c.gear === 0 ? "N" : String(c.gear), flash = r01 > 0.9 && Math.floor(G.time * 14) % 2;
      spc.font = "bold 26px Bahnschrift"; spc.fillStyle = flash ? "#ff3048" : "#ffd60a"; spc.fillText(g, R, R + 50);
      spc.font = "10px Bahnschrift"; spc.fillStyle = "#aab"; spc.fillText(`${(c.rpm / 1000).toFixed(1)}k RPM · M`, R, R + 70);
    } else {
      const gear = c.vF < -5 ? "R" : Math.max(1, Math.min(6, 1 + Math.floor(Math.abs(c.vF) / 110)));
      spc.font = "bold 16px Bahnschrift"; spc.fillStyle = "#ffd60a"; spc.fillText(gear, R, R + 46);
    }
    $("carname").textContent = c.s.name;
  }

  // ---------- full map ----------
  U.toggleMap = function (on = !$("map").classList.contains("on")) {
    $("map").classList.toggle("on", on); G.state.mode = on ? "map" : "play";
    if (on) drawMap();
  };
  let mapView = null;
  function drawMap() {
    const cvs = $("mapCanvas"), Wd = innerWidth, Hd = innerHeight;
    cvs.width = Wd; cvs.height = Hd;
    const g = cvs.getContext("2d"), size = Math.min(Wd, Hd) - 80, ox = (Wd - size) / 2, oy = (Hd - size) / 2 + 10, sc = size / W.SIZE;
    mapView = { ox, oy, sc };
    g.fillStyle = "rgba(4,6,14,0.92)"; g.fillRect(0, 0, Wd, Hd);
    g.drawImage(mapImg, ox, oy, size, size);
    const toS = (x, y) => [ox + x * sc, oy + y * sc];
    const tgt = gpsTarget();
    if (tgt) { const pts = W.route(P.x, P.y, tgt.x, tgt.y); g.strokeStyle = "#c77dff"; g.lineWidth = 4; g.beginPath(); pts.forEach((p, i) => { const [x, y] = toS(p.x, p.y); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    const label = (x, y, icon, color, text) => {
      const [sx, sy] = toS(x, y);
      g.fillStyle = "rgba(0,0,0,0.7)"; g.beginPath(); g.arc(sx, sy, 13, 0, TAU); g.fill(); g.strokeStyle = color; g.lineWidth = 2; g.stroke();
      g.font = "14px 'Segoe UI Emoji'"; g.fillStyle = color; g.fillText(icon, sx, sy + 1);
      if (text) { g.font = "bold 12px Bahnschrift"; g.fillStyle = "#fff"; g.fillText(text, sx, sy + 24); }
    };
    for (const k of G.missions.shops()) label(k.x, k.y, k.icon, k.color, k.label.replace(/^E: /, "").split(" (")[0]);
    for (const k of G.missions.markers()) if (!k.dim) label(k.x, k.y, k.icon, k.color, k.label ? k.label.replace(/^E: /, "").split(" (")[0] : "");
    if (G.state.waypoint) label(G.state.waypoint.x, G.state.waypoint.y, "📍", "#c77dff", "Waypoint");
    const got = W.tokens.filter((t) => t.got).length;
    const [px, py] = toS(P.x, P.y);
    g.save(); g.translate(px, py); g.rotate(P.a); g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 10; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, 8); g.lineTo(-4, 0); g.lineTo(-8, -8); g.fill(); g.restore();
    g.textAlign = "center";
    for (const c of W.CITIES) { const [x, y] = toS(c.cx, c.y0 - 120); g.font = "bold 18px Bahnschrift"; g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(c.name.toUpperCase(), x, y); g.fillStyle = c.color; g.fillText(c.name.toUpperCase(), x, y); }
    g.font = "bold 30px Bahnschrift"; g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText("THE BAY REGION", ox, oy - 26);
    g.font = "14px Bahnschrift"; g.fillStyle = "#9aa3c7"; g.textAlign = "right";
    g.fillText(`Left-click: set waypoint · Right-click: clear · M / Esc: close · Neon tokens: ${got}/25`, ox + size, oy - 26);
  }
  function mapClick(e) {
    if (!mapView) return;
    const x = (e.clientX - mapView.ox) / mapView.sc, y = (e.clientY - mapView.oy) / mapView.sc;
    if (e.button === 2) G.state.waypoint = null;
    else if (x > 0 && y > 0 && x < W.SIZE && y < W.SIZE) { G.state.waypoint = { x, y }; G.audio.sfx("click"); }
    routeT = 0; drawMap();
  }

  // ---------- list menus (phone screens + shops) ----------
  let menu = null;
  function openMenu(el, title, items, onBack) {
    menu = { el, items, sel: 0, onBack };
    el.querySelector(".mtitle").textContent = title;
    renderMenu();
  }
  function renderMenu() {
    const box = menu.el.querySelector(".mlist");
    box.innerHTML = "";
    menu.items.forEach((it, i) => {
      const d = document.createElement("div"); d.className = "mitem" + (i === menu.sel ? " sel" : "") + (it.disabled ? " dis" : "");
      d.innerHTML = `<span>${it.label}</span><span class="mr">${it.right || ""}</span>`;
      d.onmouseenter = () => { menu.sel = i; renderMenu(); };
      d.onclick = () => { menu.sel = i; activate(); };
      box.appendChild(d);
    });
  }
  function activate() { const it = menu.items[menu.sel]; if (!it || it.disabled) { G.audio.sfx("fail"); return; } G.audio.sfx("click"); it.act && it.act(); }
  U.updateMenu = function () {
    if (!menu) return;
    if (Input.hit("ArrowDown", "KeyS")) { menu.sel = (menu.sel + 1) % menu.items.length; renderMenu(); G.audio.sfx("click"); }
    if (Input.hit("ArrowUp", "KeyW")) { menu.sel = (menu.sel - 1 + menu.items.length) % menu.items.length; renderMenu(); G.audio.sfx("click"); }
    if (Input.hit("Enter", "KeyE", "Space")) activate();
    if (Input.hit("Backspace", "Escape")) menu.onBack && menu.onBack();
  };

  // ---------- phone ----------
  function buildPhone() {
    const apps = [
      ["🚕", "RideBay", () => phoneRide()], ["📦", "Courier", () => { setWP(W.pois.depot); }], ["🏁", "Races", () => phoneRaces()],
      ["🎯", "Missions", () => G.campaign.phone()], ["🏢", "Empire", () => G.property.phone()], ["🦸", "Agents", () => { U.togglePhone(false); G.agents.openSelect(); }], ["🏆", "Progress", () => G.finale.phone()], ["★", "Story", () => phoneStory()], ["🚗", "Garage", () => phoneGarage()], ["📊", "Stats", () => phoneStats()],
      ["💾", "Save", () => { G.save(); U.toast("Game saved", "#19f5a0"); }], ["⚙️", "Settings", () => phoneSettings()], ["❓", "Controls", () => U.showHelp(true)],
    ];
    const grid = $("phoneApps");
    apps.forEach(([ic, name, fn], i) => {
      const d = document.createElement("div"); d.className = "app"; d.innerHTML = `<div class="ai">${ic}</div><div>${name}</div>`;
      d.onclick = () => { G.audio.sfx("click"); fn(); }; grid.appendChild(d);
    });
    U.phoneApps = apps;
    U.phoneMenu = (t, items) => phoneMenu(t, items);
  }
  let phoneSel = 0;
  U.togglePhone = function (on = !$("phone").classList.contains("on")) {
    $("phone").classList.toggle("on", on); G.state.mode = on ? "phone" : "play";
    phoneHome(); G.audio.sfx("whoosh");
  };
  function phoneHome() { menu = null; $("phoneHome").style.display = ""; $("phoneMenu").style.display = "none"; highlightApp(); }
  function highlightApp() { [...$("phoneApps").children].forEach((c, i) => c.classList.toggle("sel", i === phoneSel)); }
  U.updatePhone = function () {
    if (menu) return U.updateMenu();
    const n = U.phoneApps.length;
    if (Input.hit("ArrowRight", "KeyD")) { phoneSel = (phoneSel + 1) % n; highlightApp(); }
    if (Input.hit("ArrowLeft", "KeyA")) { phoneSel = (phoneSel - 1 + n) % n; highlightApp(); }
    if (Input.hit("ArrowDown", "KeyS")) { phoneSel = (phoneSel + 3) % n; highlightApp(); }
    if (Input.hit("ArrowUp", "KeyW")) { phoneSel = (phoneSel - 3 + n) % n; highlightApp(); }
    if (Input.hit("Enter", "KeyE", "Space")) { G.audio.sfx("click"); U.phoneApps[phoneSel][2](); }
    if (Input.hit("Escape", "Backspace")) U.togglePhone(false);
  };
  function phoneMenu(title, items) { $("phoneHome").style.display = "none"; $("phoneMenu").style.display = ""; openMenu($("phoneMenu"), title, [...items, { label: "← Back", act: phoneHome }], phoneHome); }
  function setWP(p) { G.state.waypoint = { x: p.x, y: p.y }; routeT = 0; U.toast("Waypoint set on your GPS", "#c77dff"); U.togglePhone(false); }
  function phoneRide() {
    const m = G.missions.active;
    if (m && m.kind === "ride") phoneMenu("RideBay", [{ label: `Shift: ${m.fares} fares · ${fmtMoney(m.earned)}`, disabled: true }, { label: "End shift", act: () => { G.missions.active = null; U.toast(`Shift over. Earned ${fmtMoney(m.earned)}`, "#19f5a0"); U.togglePhone(false); } }]);
    else phoneMenu("RideBay", [{ label: "Start driving (needs a car)", act: () => { U.togglePhone(false); G.missions.startRideshare(); } }, { label: `Fares completed: ${G.stats.fares}`, disabled: true }]);
  }
  function phoneRaces() { phoneMenu("Street Races", W.raceRoutes.map((r) => ({ label: `🏁 ${r.name}`, right: fmtMoney(r.reward), act: () => setWP(r.start) }))); }
  function phoneStory() {
    const st = G.missions.STORY, i = G.state.story;
    phoneMenu("Story", [...st.map((s, k) => ({ label: `${k < i ? "✅" : k === i ? "★" : "🔒"} ${s.name}`, right: fmtMoney(s.reward), disabled: k !== i, act: () => setWP(W.pois.velvet) }))]);
  }
  function phoneGarage() {
    const owned = Object.keys(G.state.owned).filter((k) => G.state.owned[k]);
    phoneMenu("My Garage", owned.length ? owned.map((t) => ({ label: `${G.CAR_TYPES[t].name}`, right: "deliver $100", act: () => deliverCar(t) })) : [{ label: "No cars yet. Buy one at Turbo Motors", disabled: true }]);
  }
  function deliverCar(type) {
    if (G.state.money < 100) return U.toast("Not enough money", "#ff4d6d");
    const lp = W.randomLanePoint(P.x, P.y, 120, 420); if (!lp) return U.toast("No road nearby", "#ff4d6d");
    G.addMoney(-100); const c = new G.Car(type, lp.x, lp.y, lp.a, G.state.colors[type]); c.keep = true; G.cars.push(c);
    G.state.waypoint = { x: lp.x, y: lp.y }; routeT = 0; U.toast(`Your ${c.s.name} has been delivered nearby`, "#22d3ee"); U.togglePhone(false);
  }
  function phoneStats() {
    const s = G.stats, got = W.tokens.filter((t) => t.got).length;
    phoneMenu("Stats", [
      { label: "Money", right: fmtMoney(G.state.money), disabled: true }, { label: "Story progress", right: `${G.state.story}/4`, disabled: true },
      { label: "Jobs completed", right: s.jobs, disabled: true }, { label: "Races won", right: `${s.raceWins}/${s.races}`, disabled: true },
      { label: "Stunts", right: s.stunts, disabled: true }, { label: "Best airtime", right: s.bestAir.toFixed(2) + "s", disabled: true },
      { label: "Neon tokens", right: `${got}/25`, disabled: true }, { label: "Top speed", right: Math.round(s.topSpeed * 0.6) + " km/h", disabled: true },
      { label: "Distance driven", right: (s.distance / 1000).toFixed(1) + " km", disabled: true }, { label: "Times caught", right: s.busted, disabled: true },
    ]);
  }
  function phoneSettings() {
    const S = G.settings;
    const items = () => [
      { label: "Music volume", right: Math.round(G.audio.musicVol * 100) + "%", act: () => { G.audio.setMusic(G.audio.musicVol >= 1 ? 0 : Math.round((G.audio.musicVol + 0.25) * 100) / 100); refresh(); } },
      { label: "Master volume", right: Math.round(G.audio.vol * 100) + "%", act: () => { G.audio.setVolume(G.audio.vol >= 1 ? 0 : Math.round((G.audio.vol + 0.2) * 100) / 100); refresh(); } },
      { label: "Traffic density", right: S.traffic, act: () => { S.traffic = S.traffic >= 45 ? 10 : S.traffic + 10; refresh(); } },
      { label: "Pedestrians", right: S.peds, act: () => { S.peds = S.peds >= 70 ? 10 : S.peds + 15; refresh(); } },
      { label: "Character voices (TTS)", right: S.voices ? "ON" : "OFF", act: () => { S.voices = !S.voices; refresh(); } },
      { label: "Gearbox", right: S.manual ? "MANUAL" : "AUTOMATIC", act: () => { S.manual = !S.manual; if (P.car) { P.car.gear = 1; P.car.shiftT = 0; } refresh(); } },
      { label: "Graphics: bloom + film look", right: S.post === false ? "OFF" : "ON", act: () => { G.render.setPost(S.post === false); refresh(); } },
    ];
    const refresh = () => { const sel = menu ? menu.sel : 0; phoneMenu("Settings", items()); menu.sel = sel; renderMenu(); };
    phoneMenu("Settings", items());
  }

  // ---------- shops ----------
  U.customShop = function (title, items) { // generic shop-style menu: items {label,right,disabled,act}; act may return true to keep it open
    const el = $("shop"); el.classList.add("on"); G.state.mode = "shop";
    const close = () => { el.classList.remove("on"); menu = null; G.state.mode = "play"; };
    const wrap = (list) => list.map((it) => Object.assign({}, it, { act: it.act && (() => { const keep = it.act(close, U.customShop); if (!keep) close(); }) }));
    openMenu(el, title, [...wrap(items), { label: "Leave", act: close }], close);
    return close;
  };
  U.shop = function (id) {
    const el = $("shop"); el.classList.add("on"); G.state.mode = "shop";
    const close = () => { el.classList.remove("on"); menu = null; G.state.mode = "play"; };
    const S = G.state, buy = (cost, fn) => () => { if (S.money < cost) { U.toast("Not enough money", "#ff4d6d"); G.audio.sfx("fail"); return; } G.addMoney(-cost); G.audio.sfx("cash"); fn(); };
    let title = "", items = [];
    if (id === "spray") {
      title = "🎨 SPRAY SHACK";
      if (!P.car) items = [{ label: "Bring a car in here first", disabled: true }];
      else {
        const copsNear = G.cars.some((c) => c.driver === "police" && dist(c.x, c.y, P.x, P.y) < 380);
        const cols = [["Neon pink", "#ff3df2"], ["Electric cyan", "#22d3ee"], ["Sunset orange", "#ff7b00"], ["Toxic green", "#7cff4f"], ["Midnight black", "#111111"], ["Pearl white", "#f1faee"], ["Royal purple", "#7b2cbf"], ["Gold", "#d4af37"]];
        items = cols.map(([n, c]) => ({ label: `<span style="color:${c}">■</span> Respray: ${n}`, right: "$250", disabled: copsNear, act: buy(250, () => {
          P.car.color = c; P.car.hp = P.car.s.hp; P.car.dents = []; G.state.colors[P.car.type] = c;
          if (G.wanted.stars) { G.clearWanted(); U.toast("New paint. The cops lost track of you", "#19f5a0"); }
          U.banner("FRESH PAINT", "Repaired and resprayed", c); close();
        }) }));
        if (copsNear) items.unshift({ label: "🚨 Cops are watching! Lose them first.", disabled: true });
      }
    } else if (id === "dealer") {
      title = "🚗 TURBO MOTORS";
      items = ["bicycle", "compact", "hatch", "sedan", "sportbike", "van", "pickup", "suv", "muscle", "sports", "super"].map((t) => {
        const c = G.CAR_TYPES[t], own = S.owned[t];
        return { label: `${c.name}  <small>${Math.round(c.max * 0.6)} km/h · grip ${c.grip}</small>`, right: own ? "OWNED" : fmtMoney(c.price), disabled: own, act: buy(c.price, () => {
          S.owned[t] = true; const lp = W.randomLanePoint(P.x, P.y, 80, 380); const car = new G.Car(t, lp.x, lp.y, lp.a); car.keep = true; G.cars.push(car);
          S.colors[t] = car.color; U.banner("NEW RIDE", `${c.name} is parked outside. It's also in your garage.`, "#22d3ee"); G.save(); close();
        }) };
      });
    } else if (id === "safehouse") {
      title = "🏠 YOUR CRIB";
      items = [
        { label: "💾 Save game", act: () => { G.save(); U.toast("Game saved", "#19f5a0"); close(); } },
        { label: "😴 Sleep until morning (heal + save)", act: () => { S.hour = 8; P.hp = 100; G.clearWanted(); G.save(); U.banner("GOOD MORNING", "08:00 · Health restored", "#ffd60a"); close(); } },
        { label: "🌙 Sleep until night", act: () => { S.hour = 21; P.hp = 100; G.save(); U.banner("NIGHTFALL", "21:00 · The city lights up", "#c77dff"); close(); } },
        { label: "🚗 Open garage", act: () => { close(); U.togglePhone(true); phoneGarage(); } },
      ];
    } else if (id === "burger") {
      title = "🍔 NEON BITES";
      items = [
        { label: "Neon Burger (+40 HP)", right: "$15", act: buy(15, () => { P.hp = Math.min(100, P.hp + 40); U.toast("Delicious. +40 HP", "#19f5a0"); }) },
        { label: "Mango Smoothie (+20 HP, nitro refill)", right: "$8", act: buy(8, () => { P.hp = Math.min(100, P.hp + 20); P.nitro = 1; U.toast("Refreshing!", "#19f5a0"); }) },
        { label: "Mega Combo (full HP)", right: "$30", act: buy(30, () => { P.hp = 100; U.toast("You feel unstoppable", "#19f5a0"); }) },
      ];
    } else if (id === "hospital") {
      title = "✚ ST. MARIS HOSPITAL";
      items = [{ label: "Full check-up (full HP)", right: "$100", act: buy(100, () => { P.hp = 100; U.toast("Patched up", "#19f5a0"); close(); }) }];
    }
    items.push({ label: "✕ Leave", act: close });
    openMenu(el, title, items, close);
  };

  // ---------- help / title / pause ----------
  U.showHelp = function (on) { $("help").classList.toggle("on", on); if (on) { $("phone").classList.remove("on"); G.state.mode = "help"; } else G.state.mode = G.state.started ? "play" : "title"; };
  U.togglePause = function (on) { $("pause").classList.toggle("on", on); G.state.mode = on ? "pause" : "play"; if (on) $("pauseSave").textContent = "Save game"; };
})();
