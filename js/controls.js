// ---------- CONTROLS: rebindable keys (2 slots per action), controls editor, gamepad, mouse settings ----------
// The game listens for "virtual" codes (KeyW, Space, A_crimson ...). This layer maps physical keys -> virtual codes.
(function () {
  const C = (G.controls = {});
  G.settings = G.settings || {};
  const KEY = "neonbay-keys-v1";
  const ACTIONS = (C.ACTIONS = [
    // [id, virtual code, label, group, default bindings]
    ["fwd", "KeyW", "Forward · accelerate", "Movement", ["KeyW"]],
    ["back", "KeyS", "Back · brake · reverse", "Movement", ["KeyS"]],
    ["left", "KeyA", "Left · steer left", "Movement", ["KeyA"]],
    ["right", "KeyD", "Right · steer right", "Movement", ["KeyD"]],
    ["sprint", "ShiftLeft", "Sprint · nitro boost", "Movement", ["ShiftLeft", "ShiftRight"]],
    ["jump", "Space", "Jump · handbrake · hold to web-swing", "Movement", ["Space"]],
    ["punch", "KeyJ", "Punch combo (also LMB)", "Combat", ["KeyJ"]],
    ["special", "KeyK", "Special power (also RMB)", "Combat", ["KeyK"]],
    ["ab1", "A_ab1", "Agent ability 1", "Combat", ["Digit1"]],
    ["ab2", "A_ab2", "Agent ability 2", "Combat", ["Digit2"]],
    ["ab3", "A_ab3", "Agent ability 3", "Combat", ["Digit3"]],
    ["ult", "A_ult", "Agent ULTIMATE", "Combat", ["Digit4", "KeyG"]],
    ["crimson", "A_crimson", "Crimson Spindle suit (toggle)", "Heroes", ["KeyX"]],
    ["suit", "KeyC", "Cycle classic suits", "Heroes", ["KeyC"]],
    ["agent", "A_agent", "Agent select", "Heroes", ["KeyV"]],
    ["interact", "KeyE", "Interact · buy · missions", "World", ["KeyE"]],
    ["car", "KeyF", "Enter / exit / carjack", "World", ["KeyF"]],
    ["horn", "KeyH", "Horn", "World", ["KeyH"]],
    ["flip", "KeyR", "Turn the car around", "World", ["KeyR"]],
    ["gearUp", "A_gearUp", "Shift up (manual gearbox)", "Driving", ["KeyI", "Period"]],
    ["gearDn", "A_gearDn", "Shift down (manual gearbox)", "Driving", ["KeyU", "Comma"]],
    ["trans", "A_trans", "Switch manual / automatic", "Driving", ["KeyL"]],
    ["cancel", "A_cancel", "Cancel current job", "World", ["KeyZ"]],
    ["map", "KeyM", "City map", "Menus", ["KeyM"]],
    ["phone", "KeyP", "Phone", "Menus", ["KeyP", "Tab"]],
    ["empire", "A_empire", "Empire (properties) app", "Menus", ["KeyB"]],
    ["radio", "KeyQ", "Next radio station", "Menus", ["KeyQ"]],
    ["photo", "A_photo", "Photo mode (hide HUD)", "Menus", ["KeyO"]],
  ]);
  const managed = new Set(ACTIONS.map((a) => a[1]).concat(["ShiftRight", "Tab"]));
  let binds = {};
  function defaults() { binds = {}; for (const a of ACTIONS) binds[a[0]] = a[4].slice(0, 2).concat([null, null]).slice(0, 2); }
  function load() { defaults(); try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && d.binds) for (const k in d.binds) if (binds[k]) binds[k] = d.binds[k]; if (d && d.sens) G.settings.sens = d.sens; if (d && d.invertY !== undefined) G.settings.invertY = d.invertY; if (d && d.vib !== undefined) G.settings.vib = d.vib; } catch (e) { /* ignore */ } rebuild(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ binds, sens: G.settings.sens, invertY: G.settings.invertY, vib: G.settings.vib })); } catch (e) { /* ignore */ } }
  let map = new Map();
  function rebuild() {
    map = new Map();
    for (const a of ACTIONS) for (const k of binds[a[0]]) if (k) { if (!map.has(k)) map.set(k, []); map.get(k).push(a[1]); }
  }
  Input.route = (code) => {
    const out = map.get(code) ? map.get(code).slice() : [];
    if (!managed.has(code) || code === "Tab") { if (!out.includes(code) && !(code === "Tab" && out.length)) out.push(code); }
    return out;
  };
  G.settings.sens = G.settings.sens || 1; G.settings.invertY = !!G.settings.invertY; if (G.settings.vib === undefined) G.settings.vib = true;
  C.binding = (id) => binds[id];
  C.keyName = (code) => {
    if (!code) return "—";
    const n = { Space: "Space", ShiftLeft: "L-Shift", ShiftRight: "R-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl", AltLeft: "L-Alt", AltRight: "R-Alt", Tab: "Tab", Enter: "Enter", Backspace: "Bksp", CapsLock: "Caps", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\" }[code];
    if (n) return n;
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return "Num" + code.slice(6);
    return code;
  };
  C.label = (id) => (binds[id] || []).filter(Boolean).map(C.keyName).join(" / ") || "unbound";
  C.set = function (id, slot, code) {
    if (code) for (const a of ACTIONS) for (let s = 0; s < 2; s++) if (binds[a[0]][s] === code && !(a[0] === id && s === slot)) binds[a[0]][s] = binds[id][slot] && a[0] !== id ? binds[id][slot] : null; // swap on conflict
    binds[id][slot] = code; rebuild(); save();
  };
  C.reset = () => { defaults(); rebuild(); save(); };

  // ---------- gamepad ----------
  const PAD = { 0: "Space", 1: "KeyF", 2: "KeyJ", 3: "KeyK", 4: "A_crimson", 5: "KeyE", 8: "KeyM", 9: "Escape", 10: "ShiftLeft", 11: "KeyC", 12: "A_ab1", 14: "A_ab2", 15: "A_ab3", 13: "A_ult" };
  let padPrev = new Set(), padOn = false;
  C.pad = null;
  addEventListener("gamepadconnected", (e) => { padOn = true; G.ui && G.ui.toast && G.ui.toast(`🎮 Controller connected: ${e.gamepad.id.slice(0, 40)}`, "#19f5a0"); });
  C.update = function (dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const g of pads || []) if (g && g.connected) { gp = g; break; }
    C.pad = gp;
    if (!gp) { if (padPrev.size) { for (const v of padPrev) Input.keys[v] = false; padPrev = new Set(); } return; }
    const now = new Set(), b = gp.buttons, ax = gp.axes, val = (i) => (b[i] ? (typeof b[i] === "object" ? b[i].value || (b[i].pressed ? 1 : 0) : b[i]) : 0);
    const manualCar = G.player && G.player.car && G.player.car.manual; // in a manual car LB / RB are the paddle shifters
    for (const i in PAD) if (val(+i) > 0.5) now.add(manualCar && (i === "4" || i === "5") ? (i === "5" ? "A_gearUp" : "A_gearDn") : PAD[i]);
    if (val(7) > 0.25) now.add("KeyW"); if (val(6) > 0.25) now.add("KeyS");
    if ((ax[0] || 0) < -0.4) now.add("KeyA"); if ((ax[0] || 0) > 0.4) now.add("KeyD");
    if ((ax[1] || 0) < -0.4) now.add("KeyW"); if ((ax[1] || 0) > 0.4) now.add("KeyS");
    for (const v of now) { Input.keys[v] = true; if (!padPrev.has(v)) Input.pressed[v] = true; }
    for (const v of padPrev) if (!now.has(v)) Input.keys[v] = false;
    padPrev = now;
    const rx = ax[2] || 0, ry = ax[3] || 0;
    if (G.cam3 && (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15)) {
      G.cam3.yaw += rx * dt * 2.8 * G.settings.sens; G.cam3.pitch = clamp(G.cam3.pitch + ry * dt * 1.8 * G.settings.sens * (G.settings.invertY ? -1 : 1), -0.2, 1.15); G.cam3.lastMouse = G.time;
    }
  };
  C.rumble = function (power = 0.5, ms = 120) {
    const gp = C.pad; if (!gp || !G.settings.vib || !gp.vibrationActuator) return;
    try { gp.vibrationActuator.playEffect("dual-rumble", { duration: ms, strongMagnitude: power, weakMagnitude: power * 0.6 }); } catch (e) { /* unsupported */ }
  };

  // ---------- editor UI ----------
  let el = null, prevMode = null, listening = null;
  function render() {
    const groups = {};
    for (const a of ACTIONS) (groups[a[3]] = groups[a[3]] || []).push(a);
    el.querySelector(".kgrid").innerHTML = Object.entries(groups).map(([g, list]) => `<div class="kgrp"><h5>${g}</h5>${list.map((a) => `
      <div class="krow"><span>${a[2]}</span>${[0, 1].map((s) => `<button class="kchip ${listening && listening[0] === a[0] && listening[1] === s ? "listen" : ""} ${binds[a[0]][s] ? "" : "empty"}" data-id="${a[0]}" data-s="${s}">${listening && listening[0] === a[0] && listening[1] === s ? "press a key…" : C.keyName(binds[a[0]][s])}</button>`).join("")}</div>`).join("")}</div>`).join("");
    el.querySelectorAll(".kchip").forEach((b) => (b.onclick = () => { listening = [b.dataset.id, +b.dataset.s]; G.audio.sfx("click"); render(); }));
    el.querySelector("#kSens").value = G.settings.sens; el.querySelector("#kSensV").textContent = G.settings.sens.toFixed(2) + "×";
    el.querySelector("#kInv").checked = G.settings.invertY; el.querySelector("#kVib").checked = G.settings.vib;
    el.querySelector(".kpad").innerHTML = C.pad ? `🎮 <b>${C.pad.id.slice(0, 48)}</b> connected` : "🎮 Plug in a controller and press any button";
  }
  Input.capture = null;
  function capture(e) {
    if (!listening) return;
    const [id, s] = listening; listening = null;
    if (e.code === "Escape") { /* cancel */ }
    else if (e.code === "Backspace" || e.code === "Delete") C.set(id, s, null);
    else { C.set(id, s, e.code); G.audio.sfx("cash"); }
    setTimeout(() => (Input.capture = el.classList.contains("on") ? captureIdle : null), 0);
    render();
  }
  function captureIdle(e) { if (listening) return capture(e); if (e.code === "Escape") C.close(); }
  C.open = function () {
    prevMode = G.state.mode; G.state.mode = "keys"; el.classList.add("on"); listening = null; render();
    Input.capture = (e) => (listening ? capture(e) : captureIdle(e));
    G.render.releaseMouse && G.render.releaseMouse();
  };
  C.close = function () {
    el.classList.remove("on"); Input.capture = null; listening = null; Input.keys = {};
    G.state.mode = prevMode && prevMode !== "keys" ? prevMode : "play";
    G.ui.refreshHelp && G.ui.refreshHelp();
  };
  C.isOpen = () => el && el.classList.contains("on");

  C.init = function () {
    const css = document.createElement("style");
    css.textContent = `
    #ctrlPanel{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,10,50,.92),rgba(5,3,12,.97))}
    #ctrlPanel.on{display:flex;animation:kIn .35s cubic-bezier(.2,1,.3,1)}
    @keyframes kIn{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:none}}
    #ctrlPanel .kbox{width:min(1180px,96vw);max-height:92vh;overflow:auto;padding:22px 30px;color:#eee}
    #ctrlPanel h3{margin:0 0 4px;font-size:40px;font-style:italic;font-weight:900;letter-spacing:4px;color:#ff3df2;text-shadow:0 0 24px #ff3df2}
    #ctrlPanel .ksub{color:#99a;font-size:13px;margin-bottom:14px}
    #ctrlPanel .kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
    #ctrlPanel .kgrp{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 14px}
    #ctrlPanel h5{margin:2px 0 8px;color:#22d3ee;letter-spacing:5px;font-size:12px}
    #ctrlPanel .krow{display:grid;grid-template-columns:1fr 92px 92px;gap:6px;align-items:center;padding:3px 0;font-size:14px}
    #ctrlPanel .kchip{font:700 13px monospace;color:#fff;background:linear-gradient(#2b2440,#1a1528);border:1px solid #4b3d6e;border-bottom-width:3px;border-radius:7px;padding:6px 4px;cursor:pointer;transition:all .15s}
    #ctrlPanel .kchip:hover{border-color:#ff3df2;transform:translateY(-1px);box-shadow:0 0 12px rgba(255,61,242,.4)}
    #ctrlPanel .kchip.empty{color:#666}
    #ctrlPanel .kchip.listen{background:#ff3df2;color:#000;animation:kPulse .6s infinite alternate}
    @keyframes kPulse{from{box-shadow:0 0 4px #ff3df2}to{box-shadow:0 0 22px #ff3df2}}
    #ctrlPanel .kfoot{display:flex;flex-wrap:wrap;gap:18px;align-items:center;margin-top:16px;font-size:14px}
    #ctrlPanel .kfoot label{display:flex;gap:8px;align-items:center}
    #ctrlPanel .kpad{color:#19f5a0;font-size:13px;margin-top:10px}
    #ctrlPanel .kpadmap{color:#889;font-size:12px;margin-top:4px}
    #ctrlPanel .kbtn{font:800 14px sans-serif;letter-spacing:2px;padding:10px 22px;border-radius:8px;border:0;cursor:pointer;background:#22d3ee;color:#001}
    #ctrlPanel .kbtn.alt{background:#2b2440;color:#fff;border:1px solid #4b3d6e}
    body.photo #hud,body.photo #opArrow,body.photo #opMeter,body.photo #objective,body.photo #prompt,body.photo #abilityBar,body.photo #achBox,body.photo #toasts{visibility:hidden}`;
    document.head.appendChild(css);
    el = document.createElement("div"); el.id = "ctrlPanel";
    el.innerHTML = `<div class="kbox"><h3>CONTROLS</h3><div class="ksub">Click a key to rebind it · Backspace clears · Esc cancels · conflicting keys are swapped automatically</div>
      <div class="kgrid"></div>
      <div class="kfoot">
        <label>Mouse sensitivity <input type="range" id="kSens" min="0.3" max="2.5" step="0.05"> <b id="kSensV"></b></label>
        <label><input type="checkbox" id="kInv"> Invert Y</label>
        <label><input type="checkbox" id="kVib"> Controller rumble</label>
        <span style="flex:1"></span>
        <button class="kbtn alt" id="kReset">RESET DEFAULTS</button><button class="kbtn" id="kDone">DONE</button>
      </div>
      <div class="kpad"></div>
      <div class="kpadmap">Controller: L-stick move · R-stick camera · RT/LT gas/brake · A jump/handbrake · B car · X punch · Y special · RB interact · LB Crimson suit · L3 sprint/nitro · R3 suits · D-pad abilities (↓ = ultimate) · Back map · Start pause</div></div>`;
    document.body.appendChild(el);
    el.querySelector("#kSens").oninput = (e) => { G.settings.sens = +e.target.value; el.querySelector("#kSensV").textContent = G.settings.sens.toFixed(2) + "×"; save(); };
    el.querySelector("#kInv").onchange = (e) => { G.settings.invertY = e.target.checked; save(); };
    el.querySelector("#kVib").onchange = (e) => { G.settings.vib = e.target.checked; save(); };
    el.querySelector("#kReset").onclick = () => { C.reset(); G.audio.sfx("job"); render(); };
    el.querySelector("#kDone").onclick = () => C.close();
    // help overlay shows live bindings
    const keysBox = document.querySelector("#help .keys");
    G.ui.refreshHelp = () => {
      if (!keysBox) return;
      keysBox.innerHTML = ACTIONS.map((a) => `<span><kbd>${C.label(a[0])}</kbd></span><span>${a[2]}</span>`).join("") + `<span><kbd>Mouse</kbd></span><span>Click to look around · wheel to zoom</span><span><kbd>Esc</kbd></span><span>Pause</span>`;
    };
    G.ui.refreshHelp();
    const help = document.querySelector("#help .box"), btn = document.createElement("button");
    btn.className = "tbtn"; btn.textContent = "CUSTOMIZE KEYS"; btn.onclick = () => { G.ui.showHelp(false); C.open(); }; help.appendChild(btn);
  };
  load();
})();
