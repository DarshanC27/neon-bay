// ---------- touch / mobile layer (iPhone, iPad, Android) ----------
// Virtual joystick (left thumb), drag-to-look (right thumb), action buttons, context buttons,
// a BACK button for menus, auto UI scaling for small screens and a lighter graphics profile.
(function () {
  const T = (G.touch = { on: false });
  const q = new URLSearchParams(location.search);
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const iPadOS = navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || "");
  T.on = q.has("touch") || (("ontouchstart" in window || navigator.maxTouchPoints > 0) && (coarse || iPadOS));
  T.ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || iPadOS;
  if (!T.on) return;

  // lighter graphics + fewer actors on phones (read by main.js / render.js at boot)
  G.settings = G.settings || {};
  Object.assign(G.settings, { mobile: true, traffic: 18, peds: 26 });
  document.documentElement.classList.add("touch");

  const css = document.createElement("style");
  css.textContent = `
  html.touch, html.touch body { touch-action:none; -webkit-touch-callout:none; -webkit-user-select:none; overscroll-behavior:none; -webkit-tap-highlight-color:transparent; }
  html.touch #mousehint, html.touch #fps { display:none !important; }
  html.touch #speedoWrap { right:auto; left:50%; margin-left:-105px; bottom:6px; }
  html.touch body > *:not(#game):not(#touchUI):not(#vignette):not(#flash):not(#opArrow):not(#rotateMsg) { zoom: var(--uiz, 1); }
  #touchUI { position:fixed; inset:0; z-index:40; pointer-events:none; display:none; font-family:inherit; }
  #touchUI.on { display:block; }
  #touchUI .zone { position:absolute; pointer-events:auto; touch-action:none; }
  #tMove { left:0; bottom:0; width:42%; height:78%; }
  #tLook { right:0; top:0; width:58%; height:100%; }
  #tStick { position:absolute; width:128px; height:128px; margin:-64px 0 0 -64px; border-radius:50%; border:2px solid rgba(255,255,255,.35);
    background:radial-gradient(circle, rgba(255,255,255,.08), rgba(20,20,40,.35)); opacity:.55; left:calc(235px + env(safe-area-inset-left)); bottom:100px; top:auto; transition:opacity .2s; pointer-events:none; }
  #tStick.active { opacity:1; }
  #tKnob { position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px; border-radius:50%;
    background:radial-gradient(circle at 35% 30%, #fff, #b9c3ff 45%, #6c5ce7); box-shadow:0 0 18px rgba(140,120,255,.8); }
  .tb { position:absolute; pointer-events:auto; touch-action:none; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-direction:column;
    color:#fff; font-weight:800; font-size:12px; letter-spacing:.5px; background:rgba(12,14,28,.55); border:2px solid rgba(255,255,255,.35);
    box-shadow:0 4px 14px rgba(0,0,0,.45), inset 0 0 12px rgba(255,255,255,.08); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
  .tb i { font-style:normal; font-size:24px; line-height:1; margin-bottom:2px; }
  .tb.down { transform:scale(.9); background:rgba(255,61,242,.45); border-color:#ff3df2; }
  .tb.big { width:84px; height:84px; } .tb.mid { width:64px; height:64px; } .tb.sm { width:48px; height:48px; font-size:10px; } .tb.sm i { font-size:18px; }
  .tb.hot { animation:tpulse 1s infinite; border-color:#ffd60a; }
  @keyframes tpulse { 50% { box-shadow:0 0 24px #ffd60a; } }
  .tb.hide { display:none; }
  #tBack { position:fixed; z-index:60; left:calc(14px + env(safe-area-inset-left)); top:calc(12px + env(safe-area-inset-top)); display:none; padding:10px 18px;
    border-radius:22px; background:rgba(10,10,22,.8); border:2px solid rgba(255,255,255,.4); color:#fff; font-weight:800; letter-spacing:1px; font-size:14px; touch-action:none; }
  #tBack.on { display:block; }
  #rotateMsg { position:fixed; inset:0; z-index:99; display:none; align-items:center; justify-content:center; flex-direction:column; gap:14px;
    background:#05060b; color:#fff; font-size:20px; font-weight:800; text-align:center; letter-spacing:1px; }
  #rotateMsg b { font-size:64px; display:block; animation:trot 1.6s infinite ease-in-out; }
  @keyframes trot { 50% { transform:rotate(-90deg); } }
  @media (orientation: portrait) { html.touch #rotateMsg { display:flex; } }
  `;
  document.head.appendChild(css);

  // ---------- DOM ----------
  const ui = document.createElement("div"); ui.id = "touchUI";
  const R = "env(safe-area-inset-right)", B = "env(safe-area-inset-bottom)", Lf = "env(safe-area-inset-left)", Tp = "env(safe-area-inset-top)";
  // [id, icon, label, virtual key, size, right, bottom]  (positions from the bottom-right corner)
  const BTNS = [
    ["bJump", "⤒", "JUMP", "Space", "big", 26, 30],
    ["bPunch", "👊", "PUNCH", "KeyJ", "big", 122, 64],
    ["bSpecial", "✨", "POWER", "KeyK", "mid", 46, 128],
    ["bSprint", "⚡", "RUN", "ShiftLeft", "mid", 216, 26],
    ["bCar", "🚗", "CAR", "KeyF", "mid", 128, 160],
    ["bUse", "✋", "USE", "KeyE", "mid", 208, 112],
    ["bGearUp", "▲", "GEAR", "A_gearUp", "mid", 128, 78], ["bGearDn", "▼", "GEAR", "A_gearDn", "mid", 52, 134],
    ["bAb1", "1", "", "A_ab1", "sm", 300, 34], ["bAb2", "2", "", "A_ab2", "sm", 300, 92],
    ["bAb3", "3", "", "A_ab3", "sm", 352, 34], ["bUlt", "★", "ULT", "A_ult", "sm", 352, 92],
  ];
  // top row (from the top-right corner, left of the money display)
  const TOP = [
    ["tMap", "🗺️", "MAP", "KeyM"], ["tPhone", "📱", "PHONE", "KeyP"], ["tEmpire", "🏢", "EMPIRE", "A_empire"],
    ["tCrimson", "🕷️", "SUIT X", "A_crimson"], ["tAgent", "🎯", "AGENTS", "A_agent"], ["tSuit", "🔄", "SUITS", "KeyC"],
    ["tRadio", "📻", "RADIO", "KeyQ"], ["tGyro", "📐", "TILT", "A_gyro"], ["tPause", "⏸", "MENU", "Escape"],
  ];
  let html = `<div class="zone" id="tMove"></div><div class="zone" id="tLook"></div><div id="tStick"><div id="tKnob"></div></div>`;
  for (const [id, ic, lb, , sz, r, b] of BTNS) html += `<div class="tb ${sz}" id="${id}" style="right:calc(${r}px + ${R});bottom:calc(${b}px + ${B})"><i>${ic}</i>${lb}</div>`;
  TOP.forEach(([id, ic, lb], i) => { html += `<div class="tb sm" id="${id}" style="left:calc(50% + ${(i - TOP.length / 2) * 54}px);top:calc(8px + ${Tp})"><i>${ic}</i></div>`; });
  ui.innerHTML = html;
  document.body.appendChild(ui);
  const back = document.createElement("div"); back.id = "tBack"; back.textContent = "✕ BACK"; document.body.appendChild(back);
  const rot = document.createElement("div"); rot.id = "rotateMsg"; rot.innerHTML = `<b>📱</b>Rotate your phone<br><small style="font-weight:400;color:#aab">NEON BAY plays in landscape</small>`; document.body.appendChild(rot);
  const $ = (id) => document.getElementById(id);

  // ---------- buttons ----------
  const held = new Map(); // pointerId -> virtual key
  function press(v) { Input.keys[v] = true; Input.pressed[v] = true; }
  function release(v) { Input.keys[v] = false; }
  for (const [id, , , v] of BTNS.concat(TOP.map((t) => [t[0], t[1], t[2], t[3]]))) {
    const el = $(id);
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation(); el.classList.add("down"); held.set(e.pointerId, [v, el]); press(v);
      if (v === "KeyM" || v === "KeyP" || v === "A_empire") G.render.releaseMouse && G.render.releaseMouse();
      if (G.audio && G.audio.init) G.audio.init();
    });
  }
  const up = (e) => { const h = held.get(e.pointerId); if (h) { release(h[0]); h[1].classList.remove("down"); held.delete(e.pointerId); } };
  addEventListener("pointerup", up); addEventListener("pointercancel", up);
  back.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); press("Escape"); press("KeyP"); press("KeyM"); setTimeout(() => { release("Escape"); release("KeyP"); release("KeyM"); }, 60); });

  // ---------- joystick ----------
  const stick = $("tStick"), knob = $("tKnob"), RAD = 56;
  let mv = null; // { id, ox, oy }
  const MOVE_KEYS = ["KeyW", "KeyS", "KeyA", "KeyD"];
  T.vec = { x: 0, y: 0 };
  function setMove(dx, dy) {
    const m = Math.hypot(dx, dy), k = m > RAD ? RAD / m : 1, nx = (dx * k) / RAD, ny = (dy * k) / RAD;
    knob.style.transform = `translate(${nx * RAD}px, ${ny * RAD}px)`;
    T.vec.x = nx; T.vec.y = ny;
    const want = { KeyW: ny < -0.35, KeyS: ny > 0.35, KeyA: nx < -0.38, KeyD: nx > 0.38 };
    for (const key of MOVE_KEYS) { if (want[key] && !Input.keys[key]) press(key); else if (!want[key] && Input.keys[key]) release(key); }
    // full tilt on foot = sprint
    const sprint = !G.player.car && Math.hypot(nx, ny) > 0.93;
    if (sprint !== !!T.autoSprint) { T.autoSprint = sprint; sprint ? press("ShiftLeft") : release("ShiftLeft"); }
  }
  function endMove() {
    mv = null; stick.classList.remove("active"); knob.style.transform = ""; T.vec.x = T.vec.y = 0;
    for (const key of MOVE_KEYS) release(key); if (T.autoSprint) { T.autoSprint = false; release("ShiftLeft"); }
    stick.style.left = "calc(235px + env(safe-area-inset-left))"; stick.style.top = ""; stick.style.bottom = "calc(100px + env(safe-area-inset-bottom))";
  }
  $("tMove").addEventListener("pointerdown", (e) => {
    e.preventDefault(); if (mv) return;
    mv = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    stick.style.left = e.clientX + "px"; stick.style.top = e.clientY + "px"; stick.style.bottom = "auto"; stick.classList.add("active");
    if (G.audio && G.audio.init) G.audio.init();
  });
  // ---------- look ----------
  let lk = null; // { id, x, y, t, moved }
  $("tLook").addEventListener("pointerdown", (e) => { e.preventDefault(); if (!lk) lk = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; });
  addEventListener("pointermove", (e) => {
    if (mv && e.pointerId === mv.id) setMove(e.clientX - mv.ox, e.clientY - mv.oy);
    else if (lk && e.pointerId === lk.id) {
      const dx = e.clientX - lk.x, dy = e.clientY - lk.y; lk.x = e.clientX; lk.y = e.clientY; lk.moved += Math.abs(dx) + Math.abs(dy);
      const c = G.cam3, sn = (G.settings.sens || 1) * 1.15;
      if (c) { c.yaw += dx * 0.0062 * sn; c.pitch = clamp(c.pitch + dy * 0.005 * sn * (G.settings.invertY ? -1 : 1), -0.2, 1.15); c.lastMouse = G.time; }
    }
  }, { passive: false });
  const endPtr = (e) => {
    if (mv && e.pointerId === mv.id) endMove();
    if (lk && e.pointerId === lk.id) { // quick tap on the right side = punch
      if (lk.moved < 10 && performance.now() - lk.t < 220) { press("KeyJ"); setTimeout(() => release("KeyJ"), 80); }
      lk = null;
    }
  };
  addEventListener("pointerup", endPtr); addEventListener("pointercancel", endPtr);

  // ---------- per-frame state ----------
  function resetAll() { if (mv) endMove(); lk = null; for (const [, h] of held) { release(h[0]); h[1].classList.remove("down"); } held.clear(); }
  function scaleUI() {
    const z = clamp(Math.min(innerWidth / 1280, innerHeight / 720) * 1.08, 0.45, 1);
    document.documentElement.style.setProperty("--uiz", z.toFixed(3));
  }
  scaleUI(); addEventListener("resize", scaleUI); addEventListener("orientationchange", () => setTimeout(scaleUI, 250));
  // stop iOS page bounce / pinch zoom / double-tap zoom
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => { if (e.target.closest && !e.target.closest(".mlist, .pscreen, .box, #agentSel, #ctrlPanel")) e.preventDefault(); }, { passive: false });

  const BACK_MODES = { map: 1, phone: 1, shop: 1, agents: 1, help: 1 };
  let wasOn = false;
  function frame() {
    requestAnimationFrame(frame);
    const st = G.state; if (!st) return;
    const on = !!st.started && st.mode === "play";
    if (on !== wasOn) { ui.classList.toggle("on", on); if (!on) resetAll(); wasOn = on; }
    back.classList.toggle("on", !!BACK_MODES[st.mode]);
    if (!on) return;
    const P = G.player, inCar = !!P.car;
    $("bCar").innerHTML = inCar ? "<i>🚪</i>EXIT" : "<i>🚗</i>CAR";
    $("bJump").innerHTML = inCar ? "<i>🛑</i>BRAKE" : G.heroes && G.heroes.LIST && G.heroes.LIST[P.hero] && G.heroes.LIST[P.hero].swing ? "<i>🕸️</i>SWING" : "<i>⤒</i>JUMP";
    $("bSprint").innerHTML = inCar ? "<i>🔥</i>NITRO" : "<i>⚡</i>RUN";
    $("bPunch").classList.toggle("hide", inCar); $("bSpecial").classList.toggle("hide", inCar);
    if (inCar && P.car.s.air) { $("bJump").innerHTML = "<i>⬆</i>UP"; $("bSprint").innerHTML = "<i>⬇</i>DOWN"; }
    $("tGyro").classList.toggle("down", !!T.gyro);
    const man = inCar && P.car.manual; $("bGearUp").classList.toggle("hide", !man); $("bGearDn").classList.toggle("hide", !man);
    const pr = document.getElementById("prompt"); $("bUse").classList.toggle("hot", !!(pr && pr.textContent.trim() && getComputedStyle(pr).opacity !== "0"));
    const ab = document.getElementById("abilityBar"), agent = !!(ab && ab.classList.contains("on")) && !inCar;
    for (const id of ["bAb1", "bAb2", "bAb3", "bUlt"]) $(id).classList.toggle("hide", !agent);
  }
  requestAnimationFrame(frame);
  T.reset = resetAll;

  // ---------- gyroscope: tilt to steer / fly, turn the phone to look around ----------
  // Off by default. The TILT button turns it on (iPhone asks for permission on that tap) and re-centres:
  // however you're holding the phone at that moment becomes "straight ahead".
  T.gyro = false; T.tilt = null; T.pitch = null;
  let base = null, lastAlpha = null;
  const DEAD = 3, FULL = 24; // degrees: dead zone, full lock
  const curve = (deg) => { const a = Math.abs(deg); if (a < DEAD) return 0; return Math.sign(deg) * clamp((a - DEAD) / (FULL - DEAD), 0, 1) ** 1.25; };
  T.applyOrientation = function (beta, gamma, alpha) {
    // landscape: rolling the phone like a steering wheel changes beta, tipping it towards you changes gamma
    const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 90;
    const sign = ang === -90 || ang === 270 ? -1 : 1;
    const roll = beta * sign, tip = -gamma * sign;
    if (!base) base = { roll, tip };
    T.tilt = curve(roll - base.roll);
    T.pitch = curve((tip - base.tip) * 0.8);
    // gyro look on foot: turning your body with the phone turns the camera
    if (alpha !== null && alpha !== undefined) {
      if (lastAlpha !== null && G.cam3 && !G.player.car && G.state.mode === "play") { let d = alpha - lastAlpha; d -= Math.round(d / 360) * 360; if (Math.abs(d) < 20 && Math.abs(d) > 0.4) { G.cam3.yaw -= (d * Math.PI) / 180; G.cam3.lastMouse = G.time; } }
      lastAlpha = alpha;
    }
  };
  const onOri = (e) => { if (T.gyro && e.beta !== null) T.applyOrientation(e.beta, e.gamma, e.alpha); };
  T.setGyro = async function (on) {
    if (on && typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try { if ((await DeviceOrientationEvent.requestPermission()) !== "granted") { G.ui.toast("Motion access was denied (Settings → Safari → Motion & Orientation)", "#ff4d6d"); return; } } catch (err) { G.ui.toast("Tap TILT again to allow motion access", "#ffa028"); return; }
    }
    T.gyro = on; base = null; lastAlpha = null; T.tilt = T.pitch = null;
    if (on) addEventListener("deviceorientation", onOri); else removeEventListener("deviceorientation", onOri);
    G.ui.toast(on ? "Tilt controls ON: tilt to steer / fly, turn to look. Tap TILT again to re-centre, long-press to turn off" : "Tilt controls off", "#22d3ee");
  };
  const gb = $("tGyro"); let pressT = 0;
  gb.addEventListener("pointerdown", () => { pressT = performance.now(); });
  gb.addEventListener("pointerup", () => {
    const long = performance.now() - pressT > 600;
    if (T.gyro && !long) { base = null; G.ui.toast("Tilt re-centred", "#22d3ee"); } else T.setGyro(!T.gyro); // off: tap turns on, on: long-press turns off
  });
})();
