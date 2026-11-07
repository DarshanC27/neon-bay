// ---------- FINALE: cinematic camera director, chapter cut-scenes, ending credits, achievements, progress screen ----------
(function () {
  const F = (G.finale = {}), P = G.player, T = G.TILE;
  F.cam = null; // when set, render.updateCamera uses it instead of the chase camera
  let run = null, el = {};

  // ---------- camera shots (sim coords: x,y ground plane, z up) ----------
  const ease = (t) => t * t * (3 - 2 * t);
  const orbit = (cx, cy, cz, r, z, a0, a1, fov = 55) => (t) => { const a = lerp(a0, a1, ease(t)); return { px: cx + Math.cos(a) * r, py: cy + Math.sin(a) * r, pz: z, lx: cx, ly: cy, lz: cz, fov }; };
  const dolly = (a, b, look, fov = 60) => (t) => { const k = ease(t); return { px: lerp(a[0], b[0], k), py: lerp(a[1], b[1], k), pz: lerp(a[2], b[2], k), lx: look[0], ly: look[1], lz: look[2], fov }; };
  const crane = (x, y, z0, z1, r, a, fov = 58) => (t) => { const k = ease(t), aa = a + t * 0.9; return { px: x + Math.cos(aa) * r * (1 + k), py: y + Math.sin(aa) * r * (1 + k), pz: lerp(z0, z1, k), lx: x, ly: y, lz: 10 + k * 40, fov }; };

  function heroShots() {
    const x = P.car ? P.car.x : P.x, y = P.car ? P.car.y : P.y, a = Math.random() * TAU;
    return [
      { d: 3.4, f: orbit(x, y, 14, 120, 34, a, a + 1.7, 50) },
      { d: 3.6, f: crane(x, y, 30, 520, 160, a + 1.7, 62) },
    ];
  }
  function finaleShots() {
    const x = P.car ? P.car.x : P.x, y = P.car ? P.car.y : P.y, cx = 40 * T, cy = 40 * T, wx = 92.3 * T, wy = 30 * T;
    return [
      { d: 7, f: crane(x, y, 18, 380, 90, 0, 56) },
      { d: 7.5, f: orbit(wx, wy, 140, 560, 190, -0.4, 1.6, 52) },
      { d: 7.5, f: dolly([cx - 2200, cy + 1400, 720], [cx + 900, cy - 400, 420], [cx + 300, cy, 60], 64) },
      { d: 8, f: orbit(cx, cy, 0, 2300, 1250, 0, 1.2, 58) },
      { d: 10, f: (t) => { const k = ease(t); return { px: x + 260 - k * 170, py: y + 260 - k * 170, pz: 240 - k * 180, lx: x, ly: y, lz: 14 + (1 - k) * 160, fov: 60 - k * 8 }; } },
    ];
  }

  // ---------- director ----------
  function begin(kind, shots, opts) {
    if (run) end(true);
    run = { kind, shots, i: 0, t: 0, total: 0, prevMode: G.state.mode, prevHour: G.state.hour, fwT: 0, opts };
    if (opts.night) G.state.hour = 22.2;
    G.state.mode = "cine";
    G.render.releaseMouse && G.render.releaseMouse();
    document.body.classList.add("cine");
    el.root.classList.add("on");
    el.title.innerHTML = opts.title || ""; el.title.style.color = opts.color || "#ff3df2";
    el.title.classList.remove("show"); void el.title.offsetWidth; if (opts.title) el.title.classList.add("show");
    el.skip.textContent = "ESC / SPACE to skip";
    if (opts.credits) { el.credits.innerHTML = opts.credits; el.credits.classList.remove("roll"); void el.credits.offsetWidth; el.credits.classList.add("roll"); el.credits.style.animationDuration = `${shots.reduce((a, s) => a + s.d, 0) + 4}s`; }
    else el.credits.innerHTML = "";
    G.audio.sfx("success");
  }
  function end(silent) {
    if (!run) return;
    const r = run; run = null; F.cam = null;
    if (G.state.mode === "cine") G.state.mode = "play";
    if (r.opts.night) G.state.hour = r.prevHour;
    document.body.classList.remove("cine"); el.root.classList.remove("on"); el.credits.classList.remove("roll");
    G.render.snapCamera();
    if (!silent && r.opts.after) r.opts.after();
  }
  F.active = () => !!run;
  F.skip = () => end(false);
  F.update = function (dt) {
    if (!run) return;
    if (run.total > 0.6 && Input.hit("Escape", "Space", "Enter")) return end(false);
    run.t += dt; run.total += dt;
    let s = run.shots[run.i];
    if (run.t >= s.d) { run.t = 0; run.i++; if (run.i >= run.shots.length) return end(false); s = run.shots[run.i]; el.fade.classList.remove("blink"); void el.fade.offsetWidth; el.fade.classList.add("blink"); }
    F.cam = s.f(run.t / s.d);
    // fireworks over whatever the camera is looking at
    run.fwT -= dt;
    if (run.fwT <= 0) { run.fwT = run.opts.credits ? rand(0.35, 0.8) : rand(0.6, 1.1); G.campaign.fireworks(F.cam.lx + rand(-500, 500), F.cam.ly + rand(-500, 500), run.opts.credits ? 3 : 2); }
  };

  // ---------- public cut-scenes ----------
  F.chapter = function (ci, ch, nextCh) {
    begin("chapter", heroShots(), {
      title: `<div class="k">CHAPTER ${ci + 1} COMPLETE</div><div class="t">${ch.name.toUpperCase()}</div><div class="s">${nextCh ? `Next: ${nextCh.name} with ${nextCh.giver}` : "The Bay is waiting..."}</div>`,
      color: ch.color,
      after: () => G.ui.toast(`Chapter bonus paid · ${nextCh ? nextCh.giver + " is waiting at the " + nextCh.face + " marker" : ""}`, ch.color),
    });
  };
  F.play = function () {
    const d = G.campaign.done(), vals = Object.values(d), s = G.stats;
    const golds = vals.filter((v) => v === 3).length, silvers = vals.filter((v) => v === 2).length, bronzes = vals.filter((v) => v === 1).length;
    const chs = G.campaign.chapters || [];
    const credits = `
      <div class="big">NEON BAY</div><div class="sub">a city that never sleeps · and now it's yours</div>
      <h4>THE CREW</h4>${chs.map((c) => `<p><b style="color:${c.color}">${c.giver}</b> · ${c.name}</p>`).join("")}
      <h4>YOUR LEGEND</h4>
      <p>Missions completed <b>${vals.filter(Boolean).length} / 100</b></p>
      <p>🥇 ${golds} &nbsp; 🥈 ${silvers} &nbsp; 🥉 ${bronzes}</p>
      <p>Bank balance <b>${fmtMoney(G.state.money)}</b></p>
      <p>Distance driven <b>${Math.round(s.distance / 100) / 10} km</b> · Top speed <b>${Math.round(s.topSpeed)}</b></p>
      <p>Takedowns <b>${s.kos || 0}</b> · Stunts <b>${s.stunts}</b> · Races won <b>${s.raceWins}</b></p>
      <p>Achievements <b>${Object.keys(G.state.ach || {}).length} / ${ACH.length}</b></p>
      <h4>BUILT WITH</h4><p>three.js · WebAudio · a lot of neon</p>
      <div class="big end">THE END?</div><div class="sub">Free roam is open forever. Go back for every gold medal.</div>`;
    begin("finale", finaleShots(), {
      night: true, credits, color: "#ffd60a",
      title: `<div class="k">MISSION 100 · OWN THE NIGHT</div><div class="t">NEON CROWN</div>`,
      after: () => { G.ui.banner("NEON BAY IS YOURS", "Free roam unlocked · replay any mission from the phone for gold", "#ffd60a"); G.campaign.fireworks(P.x, P.y, 24); G.state.endingSeen = true; G.save(); },
    });
  };

  // ---------- achievements ----------
  const golds = () => Object.values(G.campaign.done()).filter((v) => v === 3).length;
  const doneN = () => Object.values(G.campaign.done()).filter(Boolean).length;
  const ACH = (F.ACH = [
    ["first", "🎬", "First Job", "Complete your first campaign mission", () => doneN() >= 1],
    ["ten", "🔟", "Making a Name", "Complete 10 missions", () => doneN() >= 10],
    ["half", "🌗", "Halfway There", "Complete 50 missions", () => doneN() >= 50],
    ["all", "👑", "Neon Crown", "Complete all 100 missions", () => doneN() >= 100],
    ["gold1", "🥇", "Golden Touch", "Earn a gold medal", () => golds() >= 1],
    ["gold25", "🏅", "Gold Rush", "Earn 25 gold medals", () => golds() >= 25],
    ["gold100", "💎", "Perfectionist", "Gold on all 100 missions", () => golds() >= 100],
    ["rich", "💰", "Millionaire", "Hold $1,000,000", () => G.state.money >= 1e6],
    ["speed", "⚡", "Light Speed", "Hit a top speed of 300", () => G.stats.topSpeed >= 300],
    ["brawl", "🥊", "Street Legend", "Land 100 takedowns", () => (G.stats.kos || 0) >= 100],
    ["racer", "🏁", "Podium Habit", "Win 10 races", () => G.stats.raceWins >= 10],
    ["stunt", "🛹", "Air Time", "Land 25 stunt jumps", () => G.stats.stunts >= 25],
    ["tokens", "💠", "Collector", "Find all 25 neon tokens", () => G.stats.tokens >= 25],
    ["road", "🛣️", "Road Warrior", "Drive 50 km", () => G.stats.distance >= 50000],
  ]);
  let achT = 0;
  function checkAch(dt) {
    achT -= dt; if (achT > 0) return; achT = 1;
    const got = (G.state.ach = G.state.ach || {});
    for (const [id, icon, name, desc, test] of ACH) if (!got[id] && test()) { got[id] = Date.now(); unlockCard(icon, name, desc); G.addMoney(1000); break; }
  }
  function unlockCard(icon, name, desc) {
    const c = document.createElement("div"); c.className = "achCard";
    c.innerHTML = `<div class="i">${icon}</div><div><div class="h">ACHIEVEMENT UNLOCKED</div><div class="n">${name}</div><div class="d">${desc} · +$1,000</div></div>`;
    el.achBox.appendChild(c); G.audio.sfx("job");
    setTimeout(() => c.remove(), 5200);
  }
  F.tick = function (dt) { if (G.state.started && G.state.mode === "play") checkAch(dt); };

  // ---------- phone: progress ----------
  F.phone = function () {
    const got = G.state.ach || {}, d = G.campaign.done(), vals = Object.values(d);
    const pct = Math.round((vals.filter(Boolean).length + vals.filter((v) => v === 3).length * 0.5 + Object.keys(got).length * 2) / (100 + 50 + ACH.length * 2) * 100);
    const items = [
      { label: `📈 Completion`, right: `${pct}%`, disabled: true },
      { label: `🎯 Missions`, right: `${vals.filter(Boolean).length}/100`, disabled: true },
      { label: `🥇 Gold medals`, right: `${vals.filter((v) => v === 3).length}/100`, disabled: true },
      ...ACH.map(([id, icon, name, desc]) => ({ label: `${got[id] ? icon : "🔒"} ${name}`, right: got[id] ? "✔" : desc, disabled: !got[id] })),
    ];
    if (G.state.endingSeen || vals.filter(Boolean).length >= 100) items.splice(3, 0, { label: "🎬 Watch the ending", right: "", act: () => { G.ui.togglePhone(false); F.play(); } });
    G.ui.phoneMenu("Progress", items);
  };

  // ---------- DOM ----------
  F.init = function () {
    const css = document.createElement("style");
    css.textContent = `
    #cine{position:fixed;inset:0;z-index:45;pointer-events:none;display:none}
    #cine.on{display:block}
    #cine .bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .7s cubic-bezier(.2,1,.3,1)}
    #cine.on .bar{height:11vh} #cine .bar.top{top:0} #cine .bar.bot{bottom:0}
    #cine .skip{position:absolute;right:24px;bottom:3.5vh;color:#888;font:12px monospace;letter-spacing:2px}
    #cine .ttl{position:absolute;left:0;right:0;top:20vh;text-align:center;opacity:0}
    #cine .ttl.show{animation:cineTtl 6.5s ease forwards}
    #cine .ttl .k{font-size:15px;letter-spacing:9px;color:#fff;text-shadow:0 2px 8px #000}
    #cine .ttl .t{font-size:84px;font-weight:900;font-style:italic;letter-spacing:6px;text-shadow:0 0 40px currentColor,0 6px 0 rgba(0,0,0,.6)}
    #cine .ttl .s{font-size:20px;color:#fff;margin-top:6px;text-shadow:0 2px 6px #000}
    @keyframes cineTtl{0%{opacity:0;transform:scale(1.4);filter:blur(12px)}12%{opacity:1;transform:scale(1);filter:blur(0)}80%{opacity:1}100%{opacity:0;transform:translateY(-20px)}}
    #cine .fade{position:absolute;inset:0;background:#000;opacity:0}
    #cine .fade.blink{animation:cineBlink .7s ease}
    @keyframes cineBlink{0%{opacity:0}40%{opacity:.85}100%{opacity:0}}
    #cine .cred{position:absolute;right:7vw;top:100vh;width:430px;text-align:center;color:#ddd;font-size:17px;line-height:1.55;text-shadow:0 2px 6px #000}
    #cine .cred.roll{animation:credRoll linear forwards}
    @keyframes credRoll{from{transform:translateY(0)}to{transform:translateY(-210vh)}}
    #cine .cred h4{color:#22d3ee;letter-spacing:6px;margin:34px 0 8px;font-size:15px}
    #cine .cred .big{font-size:54px;font-weight:900;font-style:italic;color:#ff3df2;text-shadow:0 0 30px #ff3df2}
    #cine .cred .big.end{margin-top:60px;color:#ffd60a;text-shadow:0 0 30px #ffd60a}
    #cine .cred .sub{color:#aaa;font-size:14px;letter-spacing:2px}
    #cine .cred b{color:#fff}
    body.cine #hud,body.cine #opArrow,body.cine #opMeter,body.cine #objective,body.cine #prompt{visibility:hidden}
    #achBox{position:fixed;left:24px;top:120px;z-index:44;display:flex;flex-direction:column;gap:10px;pointer-events:none}
    .achCard{display:flex;gap:14px;align-items:center;background:linear-gradient(90deg,rgba(20,10,40,.92),rgba(20,10,40,.55));border-left:4px solid #ffd60a;padding:10px 18px 10px 12px;border-radius:8px;color:#fff;box-shadow:0 0 24px rgba(255,214,10,.35);animation:achIn 5.2s cubic-bezier(.2,1,.3,1) forwards}
    .achCard .i{font-size:36px;animation:achSpin 1s ease}
    .achCard .h{font-size:11px;letter-spacing:4px;color:#ffd60a}
    .achCard .n{font-size:20px;font-weight:900;font-style:italic}
    .achCard .d{font-size:12px;color:#bbb}
    @keyframes achIn{0%{opacity:0;transform:translateX(-120%)}10%{opacity:1;transform:translateX(0)}85%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(-120%)}}
    @keyframes achSpin{from{transform:rotateY(0) scale(.2)}to{transform:rotateY(720deg) scale(1)}}`;
    document.head.appendChild(css);
    const root = document.createElement("div"); root.id = "cine";
    root.innerHTML = `<div class="fade"></div><div class="bar top"></div><div class="bar bot"></div><div class="ttl"></div><div class="cred"></div><div class="skip"></div>`;
    document.body.appendChild(root);
    const ab = document.createElement("div"); ab.id = "achBox"; document.body.appendChild(ab);
    el = { root, title: root.querySelector(".ttl"), credits: root.querySelector(".cred"), skip: root.querySelector(".skip"), fade: root.querySelector(".fade"), achBox: ab };
  };
})();
