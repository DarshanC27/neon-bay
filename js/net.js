// ---------- online multiplayer: shared city, smooth remote players, proximity voice chat, text chat ----------
// Server: mp_server.py. Players send their state 20x a second; the server stamps snapshots with its own clock and
// every client renders the others ~110 ms in the past, interpolating between snapshots (extrapolating briefly
// if packets go missing), so remote players move smoothly even on bumpy Wi-Fi. Voice is peer-to-peer WebRTC with
// 3D positional audio: louder when close, panned left/right, muffled through buildings and car doors.
(function () {
  const P = G.player, W = G.world;
  const N = (G.net = { on: false, id: null, host: null, room: "", name: "", color: "#fff", status: "offline", peers: new Map(), ping: 0 });
  const SEND_MS = 50, INTERP_MS = 110, MAX_EXTRAP_MS = 300, TELEPORT = 500;
  const VOICE_NEAR = 120, VOICE_FAR = 1500; // world units (~10 per metre): full volume up to ~12 m, silent past ~150 m
  const ICE = G.ICE_SERVERS || [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
  let ws = null, sendTimer = null, pingTimer = null, envTimer = null, retryMs = 1000, wantOnline = false, retryTO = null;
  let clockOff = null, bestRtt = 1e9, rttAge = 0;
  const now = () => performance.now();
  const serverNow = () => now() + (clockOff || 0);
  const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
  const $ = (id) => document.getElementById(id);

  N.serverAvailable = false;
  N.checkServer = () => !/^https?:$/.test(location.protocol) ? Promise.resolve((N.serverAvailable = false)) : fetch("mp/info", { cache: "no-store" }).then((r) => r.ok && r.json()).then((j) => (N.serverAvailable = !!(j && j.ok))).catch(() => (N.serverAvailable = false));

  // ---------- connection ----------
  N.connect = async function (name, room) {
    N.name = (name || "Player").slice(0, 18); N.room = (room || "bay").toLowerCase().slice(0, 24);
    try { localStorage.setItem("neonbay-mp", JSON.stringify({ name: N.name, room: N.room, voice: V.mode, party: V.party })); } catch (e) { /* storage blocked */ }
    wantOnline = true; G.audio.init();
    await V.initMic();
    open();
  };
  N.disconnect = function () {
    wantOnline = false; clearTimeout(retryTO);
    if (ws) { try { ws.close(); } catch (e) { /* already closed */ } }
    teardown(); setStatus("offline");
  };
  function open() {
    clearTimeout(retryTO);
    setStatus("connecting");
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + location.pathname.replace(/[^/]*$/, "") + "mp/ws";
    // with mp_server.py: talk to it over a WebSocket; anywhere else (GitHub Pages, a plain file server): peer-to-peer
    const sock = (ws = N.serverAvailable ? new WebSocket(url) : new G.P2PSock(N.room));
    N.mode = N.serverAvailable ? "server" : "p2p";
    sock.onopen = () => { retryMs = 1000; N.warnedBlocked = false; sock.send(JSON.stringify({ type: "hello", name: N.name, room: N.room })); };
    sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMessage(m); };
    sock.onclose = () => {
      if (sock !== ws) return;
      const was = N.on; teardown();
      if (!wantOnline) return setStatus("offline");
      setStatus("reconnecting"); if (was) G.ui.toast("Connection lost, reconnecting…", "#ff4d6d");
      else if (sock.unreachable && !N.warnedBlocked) { // the room exists but WebRTC could not get through
        N.warnedBlocked = true;
        G.ui.toast(G.P2P_HAS_TURN ? "Can't reach the room host: the relay failed. Retrying…"
          : "Can't reach the room host: this network blocks player-to-player links (e.g. eduroam). Try a phone hotspot.", "#ff4d6d");
      }
      retryTO = setTimeout(open, retryMs); retryMs = Math.min(8000, retryMs * 2);
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  N.send = send;
  function teardown() {
    clearInterval(sendTimer); clearInterval(pingTimer); clearInterval(envTimer);
    for (const id of [...N.peers.keys()]) removePeer(id);
    N.on = false; N.id = null; clockOff = null; bestRtt = 1e9;
    updateList();
  }
  function setStatus(s) { N.status = s; updateTitle(); updateList(); }

  function onMessage(m) {
    switch (m.type) {
      case "welcome":
        N.on = true; N.id = m.id; N.host = m.host; N.color = m.color; N.room = m.room;
        clockOff = m.t - now();
        for (const p of m.peers) { addPeer(p); V.call(p.id); } // newcomer starts the voice call with everyone already here
        sendTimer = setInterval(() => { if (now() - lastSend > SEND_MS * 3) sendState(); }, SEND_MS); // backup when the tab is in the background
        pingTimer = setInterval(() => send({ type: "ping", c: now() }), 1000);
        envTimer = setInterval(sendEnv, 2000);
        setStatus("online");
        if (G.state.started) G.ui.toast(`Online in room "${N.room}" · ${N.peers.size + 1} player${N.peers.size ? "s" : ""}`, "#19f5a0");
        break;
      case "full": wantOnline = false; setStatus("full"); G.ui.toast(`Room is full (max ${m.max})`, "#ff4d6d"); break;
      case "join": addPeer(m); G.ui.toast(`${m.name} joined`, m.color); G.audio.sfx && G.audio.sfx("token"); break;
      case "leave": { const p = N.peers.get(m.id); if (p) G.ui.toast(`${p.name} left`, "#8d99ae"); removePeer(m.id); break; }
      case "host": N.host = m.id; break;
      case "pong": {
        const t1 = now(), rtt = t1 - m.c; N.ping = Math.round(rtt); rttAge++;
        // keep the offset from the fastest round trip seen recently (least queueing delay = most accurate)
        if (rtt < bestRtt * 1.2 || rttAge > 20) {
          const off = m.t - (m.c + rtt / 2);
          clockOff = clockOff === null || rttAge > 20 ? off : clockOff + (off - clockOff) * 0.3;
          bestRtt = Math.min(bestRtt, rtt) * (rttAge > 20 ? 1.5 : 1); if (rttAge > 20) rttAge = 0;
        }
        break;
      }
      case "snap": onSnap(m); break;
      case "rtc": V.signal(m.from, m.data); break;
      case "evt": onEvt(m.from, m.data); break;
      case "chat": chatLine(m.name, m.text, m.color); if (m.from !== N.id) G.audio.sfx && G.audio.sfx("cash"); break;
      case "env": onEnv(m.data); break;
    }
  }

  // ---------- my state ----------
  let lastSend = 0;
  function sendState() {
    if (!N.on) return;
    lastSend = now();
    if (!G.state.started || G.state.mode === "title") { send({ type: "state", s: null }); return; }
    const a = P.anim || {}, c = P.car;
    const s = { x: r1(P.x), y: r1(P.y), z: r1(P.z || 0), a: r3(P.a), vx: r1(P.vx || 0), vy: r1(P.vy || 0), h: P.hero, m: a.mode || "idle", sp: r1(a.speed || 0), avz: r1(a.vz || 0), hp: Math.round(P.hp) };
    if (a.flip) s.fl = r3(a.flip); if (a.swingPitch) s.spp = r3(a.swingPitch);
    if (P.swing) s.sw = [r1(P.swing.x), r1(P.swing.y), r1(P.swing.z)];
    if (c) s.c = { t: c.type, col: c.color, x: r1(c.x), y: r1(c.y), z: r1(c.z), a: r3(c.a), vx: r1(c.vx), vy: r1(c.vy), vz: r1(c.vz), vF: r1(c.vF || 0), st: r3(c.ctrl.s), br: c.braking ? 1 : 0, si: c.siren ? 1 : 0, bo: c.ctrl.boost ? 1 : 0, w: c.wrecked ? 1 : 0 };
    s.mic = V.talking() ? 1 : 0; s.t = Math.round(serverNow());
    send({ type: "state", s });
  }
  function sendEnv() { if (N.on && N.host === N.id && G.state.started) send({ type: "env", data: { h: G.state.hour, r: G.weather.target, w: G.weather.rain } }); }
  function onEnv(d) {
    if (!d || !G.state.started) return;
    let dh = d.h - G.state.hour; dh -= Math.round(dh / 24) * 24;
    G.state.hour = Math.abs(dh) > 0.25 ? d.h : (G.state.hour + dh * 0.5 + 24) % 24;
    G.weather.target = d.r; G.weather.t = 999; if (Math.abs(G.weather.rain - d.w) > 0.3) G.weather.rain = d.w;
  }

  // ---------- remote players ----------
  function addPeer(info) {
    if (N.peers.has(info.id)) return N.peers.get(info.id);
    const p = { id: info.id, name: info.name, color: info.color, buf: [], s: null, vis: false, key: { remote: info.id }, anim: { mode: "idle", speed: 0 }, car: null, x: 0, y: 0, z: 0, a: 0, hp: 100, talk: 0, lastSeen: now() };
    N.peers.set(info.id, p); updateList(); return p;
  }
  function removePeer(id) {
    const p = N.peers.get(id); if (!p) return;
    if (p.eng) { try { p.eng.o1.stop(); p.eng.o2.stop(); p.eng.g.disconnect(); } catch (e) { /* gone */ } }
    V.hangup(id); if (p.tag) { G.render.scene.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); }
    if (p.rope) { G.render.scene.remove(p.rope); p.rope.geometry.dispose(); }
    if (p.ring) { G.render.scene.remove(p.ring); p.ring.geometry.dispose(); p.ring.material.dispose(); }
    N.peers.delete(id); updateList();
  }
  function onSnap(m) {
    // a snapshot arriving "from the future" relative to our clock means our offset drifted: nudge it
    const lead = m.t - serverNow(); if (clockOff !== null && lead > 30) clockOff += lead * 0.1;
    for (const [id, s] of Object.entries(m.p)) {
      if (id === N.id) continue;
      const p = N.peers.get(id); if (!p) continue;
      p.lastSeen = now();
      if (!s) { p.buf.length = 0; continue; }
      const t = s.t || m.t, last = p.buf[p.buf.length - 1];
      // how late do this player's updates arrive? the render delay adapts to it (smooth on bad Wi-Fi, snappy on good)
      const late = serverNow() - t; p.jit = Math.max(late, (p.jit || 60) - 0.4);
      if (last && t <= last.t) continue; // same packet again, or out of order
      p.buf.push({ t, s }); if (p.buf.length > 40) p.buf.splice(0, p.buf.length - 40);
    }
    if (!m.part) for (const p of N.peers.values()) if (!(p.id in m.p)) p.buf.length = 0;
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpAng = (a, b, k) => { let d = b - a; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; return a + d * k; };
  // where was this player at render time? interpolate between the two snapshots around it
  function sample(p, rt) {
    const b = p.buf; if (!b.length) return null;
    if (rt <= b[0].t) return { s: b[0].s, k: 0, b: null, dt: 0 };
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= rt) {
        if (i === b.length - 1) return { s: b[i].s, k: 0, b: null, dt: Math.min(MAX_EXTRAP_MS, rt - b[i].t) / 1000 };
        const A = b[i], B = b[i + 1]; return { s: A.s, b: B.s, k: (rt - A.t) / (B.t - A.t), dt: 0 };
      }
    }
    return null;
  }
  function blend(o) {
    const a = o.s, b = o.b, k = o.k, out = Object.assign({}, b && k > 0.5 ? b : a);
    if (b) {
      const jump = Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT;
      if (!jump) { out.x = lerp(a.x, b.x, k); out.y = lerp(a.y, b.y, k); out.z = lerp(a.z, b.z, k); out.a = lerpAng(a.a, b.a, k); out.sp = lerp(a.sp, b.sp, k); }
      if (a.c && b.c && !jump && Math.hypot(b.c.x - a.c.x, b.c.y - a.c.y) < TELEPORT) {
        const c = (out.c = Object.assign({}, k > 0.5 ? b.c : a.c));
        for (const f of ["x", "y", "z", "vx", "vy", "vz", "vF", "st"]) c[f] = lerp(a.c[f], b.c[f], k);
        c.a = lerpAng(a.c.a, b.c.a, k);
      }
    } else if (o.dt > 0) { // no newer packet yet: keep moving the way they were going for a moment
      out.x = a.x + (a.vx || 0) * o.dt; out.y = a.y + (a.vy || 0) * o.dt;
      if (a.c) { const c = (out.c = Object.assign({}, a.c)); c.x += c.vx * o.dt; c.y += c.vy * o.dt; c.z = Math.max(0, c.z + c.vz * o.dt - 490 * o.dt * o.dt * (c.z > 0 ? 1 : 0)); }
    }
    return out;
  }

  N.update = function (dt) {
    if (N.on && now() - lastSend >= SEND_MS - 4) sendState();
    if (!N.peers.size) return;
    for (const p of N.peers.values()) {
      const want = clamp((p.jit || 60) + 35, INTERP_MS - 20, 260); p.delay = p.delay ? p.delay + clamp(want - p.delay, -dt * 40, dt * 40) : want; // ≤4% time-stretch: invisible
      const o = sample(p, serverNow() - p.delay);
      p.vis = !!o && G.state.started;
      if (!o) { p.car = null; continue; }
      const s = blend(o);
      p.s = s; p.hero = G.heroes.LIST[s.h] ? s.h : "kai"; p.hp = s.hp; p.talk = Math.max(p.talk - dt, s.mic ? 0.3 : 0);
      // gentle error smoothing on top of interpolation hides the small pop when extrapolation is corrected
      const snapNow = Math.hypot(s.x - p.x, s.y - p.y) > 150 || !p.seen; p.seen = true;
      const k = snapNow ? 1 : Math.min(1, dt * 18);
      p.x += (s.x - p.x) * k; p.y += (s.y - p.y) * k; p.z += (s.z - p.z) * k; p.a = lerpAng(p.a, s.a, k);
      Object.assign(p.anim, { mode: s.m, speed: s.sp, vz: s.avz, flip: s.fl || 0, swingPitch: s.spp || 0 });
      if (s.c) {
        if (!p.car || p.car.type !== s.c.t) { p.car = new G.Car(s.c.t, s.c.x, s.c.y, s.c.a, s.c.col); p.car.driver = "remote"; p.car.remote = p; }
        const c = p.car, sc = s.c, kk = snapNow || Math.hypot(sc.x - c.x, sc.y - c.y) > 150 ? 1 : Math.min(1, dt * 18);
        c.x += (sc.x - c.x) * kk; c.y += (sc.y - c.y) * kk; c.z = sc.z; c.a = lerpAng(c.a, sc.a, kk);
        c.vx = sc.vx; c.vy = sc.vy; c.vz = sc.vz; c.vF = sc.vF; c.speed = Math.hypot(sc.vx, sc.vy); c.ctrl.s = sc.st; c.ctrl.boost = !!sc.bo;
        c.braking = !!sc.br; c.siren = !!sc.si; c.wrecked = !!sc.w; c.color = sc.col;
        p.x = c.x; p.y = c.y; p.z = c.z;
        if (c.ctrl.boost && Math.random() < 0.5) G.spawnFx("spark", c.x - Math.cos(c.a) * 26, c.y - Math.sin(c.a) * 26, { vx: -Math.cos(c.a) * 120, vy: -Math.sin(c.a) * 120, size: 4, life: 0.3, max: 0.3, color: Math.random() < 0.5 ? "#22d3ee" : "#c77dff" });
      } else p.car = null;
      drawTag(p); drawRope(p); drawRing(p); engineSound(p, dt);
    }
    V.update(dt);
    // keep the player list fresh (ping, distances, who's talking)
    listT -= dt; if (listT <= 0) { listT = 0.25; updateList(); }
  };
  let listT = 0;
  N.cars = () => { const out = []; for (const p of N.peers.values()) if (p.vis && p.car) out.push(p.car); return out; };
  N.avatars = () => { const out = []; for (const p of N.peers.values()) if (p.vis && !p.car) out.push(p); return out; };

  // ---------- physical contact with other players ----------
  // Each client resolves its own side of a contact: my car bounces off your car on my screen, yours off mine on yours.
  N.collide = function (onCrash) {
    if (!N.on) return;
    for (const p of N.peers.values()) {
      if (!p.vis) continue;
      if (p.car && P.car) {
        const rc = p.car, sx = rc.x, sy = rc.y, svx = rc.vx, svy = rc.vy;
        const imp = G.collideCars(P.car, rc);
        rc.x = sx; rc.y = sy; rc.vx = svx; rc.vy = svy; // the remote car is theirs to move
        if (imp > 70) onCrash(imp, rc);
      } else if (p.car && !P.car) {
        const rc = p.car;
        if (rc.speed > 140 && rc.z < 10 && (P.z || 0) < 10 && dist(rc.x, rc.y, P.x, P.y) < rc.s.h / 2 + 10 && P.hitCd <= 0) {
          P.hp -= rc.speed * 0.07; P.hitCd = 0.8; P.x += rc.vx * 0.08; P.y += rc.vy * 0.08; G.shake(10); G.audio.sfx("crash", 0.6);
          if (P.hp <= 0) G.blackout();
        }
      } else if (!p.car && !P.car && Math.abs(p.z - (P.z || 0)) < 14) { // shoulders bump instead of walking through each other
        const d = dist(p.x, p.y, P.x, P.y), R = 11;
        if (d < R && d > 0.01) { P.x += ((P.x - p.x) / d) * (R - d); P.y += ((P.y - p.y) / d) * (R - d); }
      } else if (!p.car && P.car && P.car.speed > 140 && dist(p.x, p.y, P.car.x, P.car.y) < P.car.s.h / 2 + 10 && (G.time - (p.hitSent || -9)) > 1) {
        p.hitSent = G.time; send({ type: "evt", to: p.id, data: { k: "run", dmg: P.car.speed * 0.07, vx: P.car.vx, vy: P.car.vy } }); G.audio.sfx("crash", 0.5);
      }
    }
  };
  // my punch landed on another player? (called from heroes.meleeHit)
  N.melee = function (reach, dmg, knock) {
    if (!N.on) return false;
    let any = false;
    for (const p of N.peers.values()) {
      if (!p.vis || p.car) continue;
      const d = dist(P.x, P.y, p.x, p.y); if (d > reach + 4 || Math.abs(p.z - (P.z || 0)) > 16) continue;
      if (Math.abs(angDiff(P.a, Math.atan2(p.y - P.y, p.x - P.x))) > 1.1) continue;
      send({ type: "evt", to: p.id, data: { k: "punch", dmg, kx: Math.cos(P.a) * knock, ky: Math.sin(P.a) * knock } }); any = true;
    }
    return any;
  };
  function onEvt(from, d) {
    if (!d || !G.state.started || G.state.mode !== "play") return;
    const p = N.peers.get(from), who = p ? p.name : "Someone";
    if (d.k === "punch" && !P.car) {
      P.hp -= clamp(+d.dmg || 0, 0, 60); P.hitCd = 0.5; P.stun = 0.25; P.vx = (P.vx || 0) + clamp(+d.kx || 0, -400, 400); P.vy = (P.vy || 0) + clamp(+d.ky || 0, -400, 400);
      G.shake(6); G.audio.sfx("crash", 0.4);
      if (P.hp <= 0) { G.blackout(); G.ui.toast(`${who} knocked you out`, "#ff4d6d"); }
    } else if (d.k === "run" && !P.car && P.hitCd <= 0) {
      P.hp -= clamp(+d.dmg || 0, 0, 60); P.hitCd = 0.8; P.x += clamp(+d.vx || 0, -900, 900) * 0.08; P.y += clamp(+d.vy || 0, -900, 900) * 0.08; G.shake(10); G.audio.sfx("crash", 0.6);
      if (P.hp <= 0) { G.blackout(); G.ui.toast(`${who} ran you over`, "#ff4d6d"); }
    }
  }

  // ---------- name tags + grapple lines ----------
  function drawTag(p) {
    const talking = p.talk > 0, key = `${p.name}|${talking}|${p.hp > 0}`;
    if (!p.tag) {
      p.tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, sizeAttenuation: false }));
      p.tag.renderOrder = 10; G.render.scene.add(p.tag);
    }
    if (p.tagKey !== key) {
      p.tagKey = key; if (p.tag.material.map) p.tag.material.map.dispose();
      const c = document.createElement("canvas"); c.width = 512; c.height = 112; const g = c.getContext("2d");
      g.font = "bold 46px Bahnschrift, 'Segoe UI', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      const label = (talking ? "🔊 " : "") + p.name, w = Math.min(500, g.measureText(label).width + 50);
      g.fillStyle = "rgba(5,6,14,0.78)"; g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 74, 24); g.fill();
      g.lineWidth = 4; g.strokeStyle = talking ? "#19f5a0" : p.color; g.stroke();
      g.fillStyle = "#fff"; g.shadowColor = p.color; g.shadowBlur = 12; g.fillText(label, 256, 53);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; p.tag.material.map = t; p.tag.material.needsUpdate = true;
    }
    p.tag.visible = p.vis;
    if (!p.vis) return;
    const d = dist(p.x, p.y, P.x, P.y), sc = clamp(1.25 - d / 3000, 0.55, 1.1);
    p.tag.scale.set(0.16 * sc, 0.035 * sc, 1);
    p.tag.position.set(p.x, p.z + (p.car ? 30 : 27), p.y);
    p.tag.material.opacity = d > 4000 ? 0.4 : 1;
  }
  // a glowing ring in the player's colour under their feet, so friends stand out from the crowd
  function drawRing(p) {
    if (!p.ring) {
      p.ring = new THREE.Mesh(new THREE.RingGeometry(9, 11.5, 40), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      p.ring.rotation.x = -Math.PI / 2; G.render.scene.add(p.ring);
    }
    p.ring.visible = p.vis && !p.car; if (!p.ring.visible) return;
    p.ring.position.set(p.x, p.z + 0.9, p.y); p.ring.scale.setScalar(1 + Math.sin(G.time * 4) * 0.06);
  }
  function drawRope(p) {
    const sw = p.vis && !p.car && p.s && p.s.sw;
    if (!p.rope) { if (!sw) return; p.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xeafffd })); p.rope.frustumCulled = false; G.render.scene.add(p.rope); }
    p.rope.visible = !!sw; if (!sw) return;
    const pa = p.rope.geometry.attributes.position; pa.setXYZ(0, p.x, p.z + 20, p.y); pa.setXYZ(1, sw[0], sw[2], sw[1]); pa.needsUpdate = true;
  }

  // ---------- other players' engines, heard in 3D ----------
  function engineSound(p, dt) {
    const ctx = G.audio.ctx; if (!ctx) return;
    const c = p.vis && p.car && !p.car.wrecked ? p.car : null;
    if (!c) { if (p.eng) { const e = p.eng; e.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.g.disconnect(); } catch (err) { /* stopped */ } }, 400); p.eng = null; } return; }
    if (!p.eng) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), pan = ctx.createPanner(), g = ctx.createGain();
      o1.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 600; g.gain.value = 0;
      pan.panningModel = "HRTF"; pan.distanceModel = "linear"; pan.rolloffFactor = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(pan); pan.connect(g); g.connect(ctx.destination); o1.start(); o2.start();
      p.eng = { o1, o2, lp, pan, g };
    }
    const e = p.eng, n = G.audio.engineNote(c, dt), t = ctx.currentTime, me = P.car || P;
    c.ctrl.t = c.speed > 30 && !c.braking ? 0.7 : 0; // best guess at throttle from what we can see
    e.o1.frequency.setTargetAtTime(n.f, t, 0.04); e.o2.frequency.setTargetAtTime(n.f * 0.5, t, 0.04);
    e.lp.frequency.setTargetAtTime(300 + n.rpm01 * 1500 + (c.ctrl.boost ? 900 : 0), t, 0.08);
    setPos(e.pan, c.x, 6, c.y);
    const d = dist(c.x, c.y, me.x, me.y), near = d < 90 ? 1 : Math.max(0, 1 - (d - 90) / 1300) ** 2;
    e.g.gain.setTargetAtTime(0.07 * near * (G.audio.vol || 0.8) * (n.shift > 0 ? 0.4 : 1), t, 0.06);
  }

  // ---------- minimap ----------
  N.drawMinimap = function (g, toMM, R) {
    for (const p of N.peers.values()) {
      if (!p.vis) continue;
      let [x, y] = toMM(p.x, p.y); const dx = x - R, dy = y - R, d = Math.hypot(dx, dy), lim = R - 12;
      if (d > lim) { x = R + (dx / d) * lim; y = R + (dy / d) * lim; }
      g.fillStyle = p.color; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.stroke();
      if (p.talk > 0) { g.strokeStyle = "#19f5a0"; g.beginPath(); g.arc(x, y, 10 + Math.sin(G.time * 12) * 2, 0, Math.PI * 2); g.stroke(); }
    }
  };

  // ================= VOICE (WebRTC mesh + Web Audio) =================
  const V = (N.voice = { stream: null, mode: "open", party: false, pcs: new Map(), level: 0, err: "" });
  try { const s = JSON.parse(localStorage.getItem("neonbay-mp") || "{}"); if (s.voice) V.mode = s.voice; V.party = !!s.party; } catch (e) { /* none */ }
  let micAnalyser = null, micBuf = null, occT = 0;

  V.initMic = async function () {
    if (V.stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      V.err = window.isSecureContext ? "no microphone API" : "mic needs https:// (see mp_server.py)"; return false;
    }
    try {
      V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      const ctx = G.audio.ctx; if (ctx) { const src = ctx.createMediaStreamSource(V.stream); micAnalyser = ctx.createAnalyser(); micAnalyser.fftSize = 512; micBuf = new Uint8Array(micAnalyser.fftSize); src.connect(micAnalyser); }
      V.err = ""; applyMic(); return true;
    } catch (e) { V.err = "microphone blocked"; return false; }
  };
  const micTrack = () => V.stream && V.stream.getAudioTracks()[0];
  function rms(an, buf) { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i += 2) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.sqrt(s / (buf.length / 2)); }
  function micOpen() { return V.mode === "open" || (V.mode === "ptt" && (Input.keys.KeyT || V.touchTalk) && !chatOpen()); }
  function applyMic() { const t = micTrack(); if (t) t.enabled = micOpen(); }
  V.talking = () => !!micTrack() && micOpen() && V.level > 0.025;

  function peerConn(id) {
    let c = V.pcs.get(id); if (c) return c;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    c = { pc, pending: [], ready: false };
    V.pcs.set(id, c);
    pc.onicecandidate = (e) => { if (e.candidate) send({ type: "rtc", to: id, data: { ice: e.candidate } }); };
    pc.ontrack = (e) => attachAudio(id, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") { pc.restartIce && pc.restartIce(); if (c.offerer) offer(id, c, true); }
      updateList();
    };
    return c;
  }
  async function offer(id, c, restart) {
    const o = await c.pc.createOffer(restart ? { iceRestart: true } : undefined); await c.pc.setLocalDescription(o);
    send({ type: "rtc", to: id, data: { sdp: c.pc.localDescription } });
  }
  V.call = async function (id) {
    try {
      const c = peerConn(id), t = micTrack(); c.offerer = true;
      const tx = c.pc.addTransceiver("audio", { direction: t ? "sendrecv" : "recvonly" }); if (t) await tx.sender.replaceTrack(t);
      await offer(id, c);
    } catch (e) { console.warn("voice call failed", e); } };
  V.signal = async function (from, d) {
    if (!d || !N.peers.has(from)) return;
    const c = peerConn(from), pc = c.pc;
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === "offer") {
          const t = micTrack(); const tx = pc.getTransceivers().find((x) => x.receiver.track.kind === "audio");
          if (t && tx) { await tx.sender.replaceTrack(t); tx.direction = "sendrecv"; }
          await pc.setLocalDescription(await pc.createAnswer());
          send({ type: "rtc", to: from, data: { sdp: pc.localDescription } });
        }
        c.ready = true; for (const ice of c.pending.splice(0)) await pc.addIceCandidate(ice).catch(() => {});
      } else if (d.ice) { if (c.ready) await pc.addIceCandidate(d.ice).catch(() => {}); else c.pending.push(d.ice); }
    } catch (e) { console.warn("voice signalling", e); }
  };
  V.hangup = function (id) {
    const c = V.pcs.get(id); if (!c) return;
    try { c.pc.close(); } catch (e) { /* closed */ }
    if (c.el) { c.el.srcObject = null; c.el.remove(); }
    if (c.nodes) for (const n of Object.values(c.nodes)) { try { n.disconnect(); } catch (e) { /* gone */ } }
    V.pcs.delete(id);
  };
  // remote voice -> analyser -> muffle filter -> 3D panner -> volume -> speakers
  function attachAudio(id, stream) {
    const c = V.pcs.get(id), ctx = G.audio.ctx; if (!c || !ctx) return;
    if (c.el) return;
    // Chrome only pulls WebRTC audio into Web Audio if the stream is also playing in a (muted) media element
    c.el = new Audio(); c.el.muted = true; c.el.srcObject = stream; c.el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(), lp = ctx.createBiquadFilter(), pan = ctx.createPanner(), gain = ctx.createGain();
    an.fftSize = 512; lp.type = "lowpass"; lp.frequency.value = 20000;
    pan.panningModel = "HRTF"; pan.distanceModel = "linear"; pan.rolloffFactor = 0; // we do our own distance curve below
    gain.gain.value = 0;
    src.connect(an); an.connect(lp); lp.connect(pan); pan.connect(gain); gain.connect(ctx.destination);
    c.nodes = { src, an, lp, pan, gain }; c.buf = new Uint8Array(an.fftSize);
  }
  const setPos = (node, x, y, z) => { if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; } else node.setPosition(x, y, z); };
  // are there buildings between the two of us? (sound gets muffled through walls)
  function occluded(ax, ay, az, bx, by, bz) {
    const n = Math.min(16, Math.ceil(dist(ax, ay, bx, by) / 60));
    for (let i = 1; i < n; i++) { const k = i / n; if (W.groundAt(ax + (bx - ax) * k, ay + (by - ay) * k)[0] > lerp(az, bz, k) + 18) return true; }
    return false;
  }
  V.update = function (dt) {
    applyMic();
    if (micAnalyser) V.level += (rms(micAnalyser, micBuf) - V.level) * 0.3;
    const ctx = G.audio.ctx; if (!ctx) return;
    const me = P.car || P, mz = P.car ? P.car.z : P.z || 0, L = ctx.listener;
    // listener sits on my character, facing where the camera looks
    const c3 = G.cam3, fx = c3.tgt.x - c3.pos.x, fz = c3.tgt.z - c3.pos.z, fl = Math.hypot(fx, fz) || 1;
    if (L.positionX) { L.positionX.value = me.x; L.positionY.value = mz + 15; L.positionZ.value = me.y; L.forwardX.value = fx / fl; L.forwardY.value = 0; L.forwardZ.value = fz / fl; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(me.x, mz + 15, me.y); L.setOrientation(fx / fl, 0, fz / fl, 0, 1, 0); }
    occT -= dt; const doOcc = occT <= 0; if (doOcc) occT = 0.2;
    const tc = ctx.currentTime;
    for (const [id, c] of V.pcs) {
      const p = N.peers.get(id); if (!p || !c.nodes) continue;
      const lvl = rms(c.nodes.an, c.buf); if (lvl > 0.02) p.talk = Math.max(p.talk, 0.35);
      let g = 1, cut = 20000;
      if (!p.vis) g = V.party ? 1 : 0;
      else if (V.party) setPos(c.nodes.pan, me.x, mz + 15, me.y); // party chat: everyone in your ears, no 3D
      else {
        setPos(c.nodes.pan, p.x, p.z + 15, p.y);
        const d = dist(p.x, p.y, me.x, me.y);
        g = d <= VOICE_NEAR ? 1 : Math.pow(Math.max(0, 1 - (d - VOICE_NEAR) / (VOICE_FAR - VOICE_NEAR)), 1.6);
        if (doOcc) c.occ = d > 60 && occluded(me.x, me.y, mz, p.x, p.y, p.z);
        if (c.occ) { cut = 900; g *= 0.55; }
        if (P.car || p.car) { cut = Math.min(cut, 2200); g *= 0.8; } // talking through a car door
      }
      g *= (G.settings.voiceVol === undefined ? 1 : G.settings.voiceVol);
      c.nodes.gain.gain.setTargetAtTime(g, tc, 0.08);
      c.nodes.lp.frequency.setTargetAtTime(cut, tc, 0.1);
    }
  };
  V.cycleMode = function () {
    V.mode = V.mode === "open" ? "ptt" : V.mode === "ptt" ? "mute" : "open"; applyMic(); saveSettings();
    G.ui.toast(V.mode === "open" ? "🎤 Open mic" : V.mode === "ptt" ? "🎤 Push-to-talk: hold T" : "🔇 Mic muted", "#22d3ee");
    if (!V.stream && V.mode !== "mute") V.initMic().then((ok) => { if (ok) for (const id of V.pcs.keys()) addMicTo(id); else G.ui.toast("Mic unavailable: " + V.err, "#ff4d6d"); });
    updateList();
  };
  function addMicTo(id) { // mic granted after the call started: renegotiate so it gets sent
    const c = V.pcs.get(id), t = micTrack(); if (!c || !t) return;
    const tx = c.pc.getTransceivers()[0]; if (!tx) return;
    tx.sender.replaceTrack(t); if (tx.direction !== "sendrecv") { tx.direction = "sendrecv"; offer(id, c).catch(() => {}); }
  }
  V.toggleParty = function () { V.party = !V.party; saveSettings(); G.ui.toast(V.party ? "📡 Party chat: everyone hears everyone" : "📍 Proximity chat: only players near you", "#c77dff"); updateList(); };
  function saveSettings() { try { localStorage.setItem("neonbay-mp", JSON.stringify({ name: N.name, room: N.room, voice: V.mode, party: V.party })); } catch (e) { /* blocked */ } }

  // ================= UI: title panel, player list, chat =================
  function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstChild; }
  function buildUI() {
    const title = $("title");
    const btn = el(`<button class="tbtn" id="btnOnline">🌐 PLAY ONLINE</button>`);
    title.insertBefore(btn, $("btnContinue").nextSibling);
    const panel = el(`<div id="mpPanel" class="mppanel">
      <div class="mph">🌐 PLAY ONLINE</div>
      <label>Your name <input id="mpName" maxlength="18" autocomplete="off" spellcheck="false"></label>
      <label>Room <input id="mpRoom" maxlength="24" autocomplete="off" spellcheck="false"></label>
      <div class="mphint">Everyone who types the same room name plays in the same city and can talk to each other.</div>
      <div class="mprow"><button class="mpb main" id="mpGo">CONNECT</button><button class="mpb" id="mpClose">CLOSE</button></div>
      <div id="mpStatus" class="mpstatus"></div>
      <div class="mphint">🎧 Use headphones so others don't hear an echo. Your mic only works on http://localhost or an https:// link.</div>
    </div>`);
    title.appendChild(panel);
    let saved = {}; try { saved = JSON.parse(localStorage.getItem("neonbay-mp") || "{}"); } catch (e) { /* none */ }
    const q = new URLSearchParams(location.search);
    $("mpName").value = q.get("name") || saved.name || "Player" + Math.floor(100 + Math.random() * 900);
    $("mpRoom").value = q.get("room") || saved.room || "bay";
    btn.onclick = () => { panel.classList.toggle("on"); N.checkServer().then(updateTitle); };
    $("mpClose").onclick = () => panel.classList.remove("on");
    $("mpGo").onclick = () => { if (N.on || wantOnline) N.disconnect(); else N.connect($("mpName").value.trim(), $("mpRoom").value.trim()); };
    for (const id of ["mpName", "mpRoom"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") $("mpGo").click(); });
    // in-game: player list + chat
    const hud = $("hud");
    hud.appendChild(el(`<div id="mpbox" class="mpbox"></div>`));
    hud.appendChild(el(`<div id="mpchat" class="mpchat"><div id="mplog"></div><input id="mpin" maxlength="200" placeholder="Say something… (Enter to send, Esc to cancel)" autocomplete="off"></div>`));
    $("mpbox").addEventListener("click", () => V.cycleMode());
    const inp = $("mpin");
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { const t = inp.value.trim(); if (t) send({ type: "chat", text: t }); inp.value = ""; closeChat(); }
      else if (e.key === "Escape") closeChat();
    });
    if (q.get("room") && q.get("autojoin") !== "0" && N.serverAvailable) { /* auto-join handled after server check */ }
    N.checkServer().then(() => { updateTitle(); if (q.get("room")) N.connect($("mpName").value.trim(), $("mpRoom").value.trim()); });
  }
  const chatOpen = () => document.activeElement === $("mpin");
  function openChat() { const c = $("mpchat"); c.classList.add("typing"); G.render.releaseMouse(); setTimeout(() => $("mpin").focus(), 0); }
  function closeChat() { $("mpchat").classList.remove("typing"); $("mpin").blur(); Input.keys = {}; }
  function chatLine(name, text, color) {
    const log = $("mplog"); if (!log) return;
    const line = document.createElement("div"); line.className = "mpline";
    const b = document.createElement("b"); b.style.color = color || "#fff"; b.textContent = name + ": "; line.appendChild(b); line.appendChild(document.createTextNode(text));
    log.appendChild(line); while (log.children.length > 8) log.removeChild(log.firstChild);
    setTimeout(() => line.classList.add("old"), 15000);
  }
  function updateTitle() {
    const st = $("mpStatus"), go = $("mpGo"); if (!st) return;
    const b = $("btnOnline"); if (b) b.textContent = N.on ? `🟢 ONLINE · ${N.room.toUpperCase()} (${N.peers.size + 1})` : "🌐 PLAY ONLINE";
    if (!G.P2PSock && !N.serverAvailable && !N.on) { st.innerHTML = `⚠️ Online play isn't available here.`; go.disabled = true; return; }
    go.disabled = false; go.textContent = N.on || wantOnline ? "DISCONNECT" : "CONNECT";
    const msg = { offline: N.serverAvailable ? "Not connected (game server found)" : "Not connected · peer-to-peer mode: the first player in a room hosts it", connecting: "Connecting…", reconnecting: "Reconnecting…", full: "That room is full", online: `🟢 Connected to room "${N.room}" · ${N.peers.size + 1} player(s). Now press NEW GAME or CONTINUE.` }[N.status] || N.status;
    st.textContent = msg + (V.err ? ` · 🎤 ${V.err}` : V.stream ? " · 🎤 mic ready" : "");
  }
  function updateList() {
    updateTitle();
    const box = $("mpbox"); if (!box) return;
    box.classList.toggle("on", N.on || wantOnline);
    if (!(N.on || wantOnline)) return;
    const mic = !V.stream ? "🎤✖" : V.mode === "mute" ? "🔇" : V.mode === "ptt" ? (micOpen() ? "🎙️ TALKING" : "🎤 hold T") : "🎤 open";
    const rows = [...N.peers.values()].map((p) => {
      const d = p.vis ? Math.round(dist(p.x, p.y, P.x, P.y) / 10) + " m" : "menu";
      const c = V.pcs.get(p.id), vst = c ? c.pc.connectionState : "", vdot = vst === "connected" ? "" : vst === "failed" ? " ⚠️" : " …";
      return `<div class="mpp${p.talk > 0 ? " talk" : ""}"><i style="background:${p.color}"></i><span>${esc(p.name)}${vdot}</span><em>${d}</em></div>`;
    }).join("");
    box.innerHTML = `<div class="mpt">🌐 ${esc(N.room.toUpperCase())} · ${N.status === "online" ? N.ping + " ms" : N.status}</div>
      <div class="mpp me${V.talking() ? " talk" : ""}"><i style="background:${N.color}"></i><span>${esc(N.name)} (you)</span><em>${mic}</em></div>${rows}
      <div class="mpk">N mic · T talk · Y ${V.party ? "party" : "proximity"} · Enter chat</div>`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // keys while playing (called from main.handleKeys)
  N.keys = function () {
    if (!(N.on || wantOnline) || chatOpen()) return;
    if (Input.hit("KeyN")) V.cycleMode();
    if (Input.hit("KeyY")) V.toggleParty();
    if (Input.hit("Enter") && N.on) openChat();
  };
  N.chatOpen = chatOpen;

  N.init = function () { buildUI(); };
})();
