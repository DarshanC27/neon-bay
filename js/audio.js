// ---------- audio: synthesized SFX, engine, sirens, 3 generative radio stations ----------
(function () {
  const A = (G.audio = { ctx: null, on: false, station: 0, vol: 0.8, musicVol: 0.55 });
  const STATIONS = A.STATIONS = [
    { name: "📻 Radio off" },
    { name: "NEON FM · synthwave", bpm: 100, dj: "You're tuned to Neon FM. The sound of the Bay after dark." },
    { name: "CHILL WAVES · lo-fi", bpm: 82, dj: "Chill Waves. Roll the windows down and take it slow." },
    { name: "BASS DRIVE · drum and bass", bpm: 172, dj: "Bass Drive! One seventy two beats per minute. Don't get a ticket." },
  ];
  let master, sfxBus, musicBus, noiseBuf, eng = null, screech = null, siren = null, sched = null, step = 0, nextT = 0;
  let amb = null, traf = null, verb = null, encT = 0, birdT = 2, crickT = 1, prevLoad = 0;
  const SOUND = 2058; // speed of sound in game units/s (343 m/s), for the Doppler shift

  A.init = function () {
    if (A.ctx) { A.ctx.resume(); return; }
    const ctx = (A.ctx = new (window.AudioContext || window.webkitAudioContext)());
    master = ctx.createGain(); master.gain.value = A.vol; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(comp);
    musicBus = ctx.createGain(); musicBus.gain.value = A.musicVol * 0.5; musicBus.connect(comp);
    // echo for music
    const dl = ctx.createDelay(); dl.delayTime.value = 0.36; const fb = ctx.createGain(); fb.gain.value = 0.28; const wet = ctx.createGain(); wet.gain.value = 0.22;
    musicBus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loopNoise = () => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(0, Math.random() * 1.9); return n; };
    const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    // reverb: a generated impulse response; how much of it you hear depends on how enclosed the street is
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.6, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d2 = ir.getChannelData(ch); for (let i = 0; i < d2.length; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d2.length, 3.2) * (i < 600 ? i / 600 : 1); }
    const conv = ctx.createConvolver(); conv.buffer = ir; const revG = gain(0.06); sfxBus.connect(conv); conv.connect(revG); revG.connect(comp);
    verb = { g: revG };
    // engine: firing-order harmonics (saw + sub square + a little whine) -> lowpass -> soft-clip that bites harder under load,
    // plus combustion noise around the 3rd harmonic
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain();
    o1.type = "sawtooth"; o2.type = "square"; o3.type = "sine"; lp.type = "lowpass"; lp.frequency.value = 600; eg.gain.value = 0;
    const o3g = gain(0.18), drive = gain(1), shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve; shaper.oversample = "2x";
    const cn = loopNoise(), cbp = filt("bandpass", 300, 1.4), cng = gain(0);
    o1.connect(lp); o2.connect(lp); o3.connect(o3g); o3g.connect(lp); cn.connect(cbp); cbp.connect(cng); cng.connect(lp);
    lp.connect(drive); drive.connect(shaper); shaper.connect(eg); eg.connect(sfxBus); o1.start(); o2.start(); o3.start();
    eng = { o1, o2, o3, lp, g: eg, drive, cbp, cng };
    // tyres on the road (rumble), wind at speed, rain hiss, the city's distant traffic bed
    const mk = (type, f, q) => { const n = loopNoise(), b = filt(type, f, q), g = gain(0); n.connect(b); b.connect(g); g.connect(sfxBus); return { b, g }; };
    amb = { road: mk("lowpass", 300), wind: mk("bandpass", 700, 0.6), rain: mk("highpass", 2600), wet: mk("bandpass", 3800, 0.8), city: mk("lowpass", 220) };
    // the nearest other car going past: its own engine note, panned and Doppler-shifted
    const to = ctx.createOscillator(), tlp = filt("lowpass", 500), tg = gain(0), tp = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
    to.type = "sawtooth"; to.connect(tlp); tlp.connect(tg); tg.connect(tp); tp.connect(sfxBus); to.start();
    traf = { o: to, lp: tlp, g: tg, pan: tp };
    // tire screech: looped noise through bandpass
    const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0; sn.connect(bp); bp.connect(sg); sg.connect(sfxBus); sn.start();
    screech = { g: sg, bp };
    // siren: wail / yelp sweep, distance lowpass, stereo pan and Doppler
    const so = ctx.createOscillator(), slp = ctx.createBiquadFilter(), sgn = ctx.createGain(), sp = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    so.type = "triangle"; slp.type = "lowpass"; slp.frequency.value = 6000; sgn.gain.value = 0; so.connect(slp); slp.connect(sgn); sgn.connect(sp); sp.connect(sfxBus); so.start();
    siren = { o: so, g: sgn, lp: slp, pan: sp };
    A.on = true;
    sched = setInterval(schedule, 25);
  };
  // gearbox model: 6 gears spread over the car's top speed, rpm 900-7200, a short torque/sound dip on every shift,
  // a bouncing rev limiter, and a bit of wheelspin flare when the tyres are sliding. Used for my car and other players'.
  const RATIOS = [0, 0.16, 0.31, 0.47, 0.63, 0.8, 1.02];
  A.engineNote = function (c, dt) {
    if (c.manual && c.rpm) { // the real gearbox drives the sound
      const sh = c.shiftT > 0 ? c.shiftT : 0, bounce = c.limiter > 0 ? Math.abs(Math.sin(G.time * 40)) * 300 : 0, rpm = c.rpm - bounce;
      return { f: (rpm / 60) * 2 * 0.8, rpm01: (rpm - 900) / 6300, load: clamp(Math.abs(c.ctrl.t || 0), 0, 1), shift: sh, gear: c.gear };
    }
    const st = c._eng || (c._eng = { gear: 1, rpm: 900, shift: 0 });
    const max = c.s.max * (c.ctrl.boost ? 1.32 : 1), sp = Math.abs(c.vF || c.speed || 0), k = sp / max;
    let g = st.gear;
    while (g < 6 && k > RATIOS[g] * 0.97) g++;
    while (g > 1 && k < RATIOS[g - 1] * 0.8) g--;
    if (g !== st.gear) { st.shift = g > st.gear ? 0.14 : 0.08; st.gear = g; }
    st.shift = Math.max(0, st.shift - dt);
    const lo = RATIOS[g - 1] * 0.8, hi = RATIOS[g];
    let target = 900 + clamp((k - lo) / (hi - lo), 0, 1) * 6300;
    if (c.slip > 120 && c.z === 0) target += Math.min(1400, c.slip * 2.2);
    if (c.wheelspin > 0.25 && c.z === 0) target += Math.min(2200, (c.wheelspin - 0.25) * 1800); // launch wheelspin flares the revs
    if ((c.ctrl.t || 0) > 0 && sp < 20) target = 2600; // launch revs
    if (target > 7100) target = 7100 - Math.abs(Math.sin(G.time * 40)) * 300; // limiter bounce
    st.rpm += (target - st.rpm) * Math.min(1, dt * (st.shift > 0 ? 25 : 10));
    const load = clamp(Math.abs(c.ctrl.t || 0), 0, 1);
    return { f: (st.rpm / 60) * 2 * 0.8, rpm01: (st.rpm - 900) / 6300, load, shift: st.shift, gear: g };
  };
  A.setVolume = (v) => { A.vol = v; if (master) master.gain.value = v; };
  A.setMusic = (v) => { A.musicVol = v; if (musicBus) musicBus.gain.value = v * 0.5; };

  // ---------- engine / ambience per frame ----------
  // where a sound is relative to the listener: stereo pan from the camera's right vector, Doppler from the closing speed
  function spatial(src, L) {
    const dx = src.x - L.x, dy = src.y - L.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
    let pan = 0; const cam = G.render && G.render.camera;
    if (cam) { const e = cam.matrixWorld.elements; pan = clamp(nx * e[0] + ny * e[2], -1, 1) * 0.85; }
    const vs = -((src.vx || 0) * nx + (src.vy || 0) * ny), vl = (L.vx || 0) * nx + (L.vy || 0) * ny; // source closing in / listener closing in
    return { d, pan, dop: clamp((SOUND + vl) / Math.max(200, SOUND - vs), 0.6, 1.6) };
  }
  function chirp(t0, pan) { // a songbird: a few quick rising/falling whistles
    const ctx = A.ctx, n = randi(3, 6);
    for (let i = 0; i < n; i++) { const t = t0 + i * rand(0.07, 0.13), o = ctx.createOscillator(), g = ctx.createGain(), f = rand(2600, 4200);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rand(0.7, 1.4), t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = pan;
      o.connect(g); g.connect(p); p.connect(sfxBus); o.start(t); o.stop(t + 0.1); }
  }
  function trill(t0) { // crickets at night
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rand(4300, 4900); g.gain.value = 0.0001;
    for (let i = 0; i < 9; i++) { const t = t0 + i * 0.045; g.gain.setValueAtTime(0.009, t); g.gain.setValueAtTime(0.0001, t + 0.025); }
    o.connect(g); g.connect(sfxBus); o.start(t0); o.stop(t0 + 0.45);
  }
  function pops(t0, n) { for (let i = 0; i < n; i++) noise(0.04, rand(0.12, 0.3), rand(700, 1500), "lowpass", t0 + rand(0.03, 0.45)); } // exhaust crackle on the overrun

  // ---------- engine / ambience per frame ----------
  A.update = function (dt) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime, P = G.player, c = P.car, L = c || P, wx = G.weather || { rain: 0 };
    const spd = c ? c.speed : 0, grounded = c && !c.s.air && !c.s.boat && c.z === 0;
    if (c && !c.wrecked && !c.s.pedal) {
      // helicopter: a low rotor chop that speeds up with the rotor; everything else: the engine model
      const e = c.s.air ? { f: 14 + c.rotor * 16 + c.speed * 0.015, rpm01: c.rotor * 0.35, load: 0.5 + Math.abs(c.ctrl.lift || 0) * 0.4, shift: 0 } : A.engineNote(c, dt);
      eng.o1.frequency.setTargetAtTime(e.f, t, 0.03); eng.o2.frequency.setTargetAtTime(e.f * 0.5, t, 0.03); eng.o3.frequency.setTargetAtTime(e.f * 2.01, t, 0.03);
      eng.lp.frequency.setTargetAtTime(300 + e.load * 1500 + e.rpm01 * 900 + (c.ctrl.boost ? 900 : 0), t, 0.06);
      eng.drive.gain.setTargetAtTime(0.8 + e.load * 2.2 + e.rpm01, t, 0.05);
      eng.cbp.frequency.setTargetAtTime(Math.max(80, e.f * 3), t, 0.05); eng.cng.gain.setTargetAtTime(e.load * (0.15 + e.rpm01 * 0.35), t, 0.05);
      eng.g.gain.setTargetAtTime((0.06 + e.load * 0.08) * (e.shift > 0 ? 0.35 : 1), t, e.shift > 0 ? 0.02 : 0.08);
      if (!c.s.air && prevLoad > 0.6 && e.load < 0.05 && e.rpm01 > 0.45) pops(t, randi(2, 6));
      prevLoad = e.load;
      const sl = c.z > 0 ? 0 : Math.max(clamp((c.slip - 70) / 220, 0, 1) * (c.speed > 60 ? 1 : 0), clamp(((c.wheelspin || 0) - 0.25) * 1.5, 0, 1));
      screech.g.gain.setTargetAtTime(sl * 0.22, t, 0.05);
    } else { eng.g.gain.setTargetAtTime(0, t, 0.15); screech.g.gain.setTargetAtTime(0, t, 0.05); prevLoad = 0; }
    // tyres, wind, rain
    const k = Math.min(1, spd / 600), rough = grounded && G.world.tileAt && [G.world.TT.DIRT, G.world.TT.SAND, G.world.TT.GRASS].includes(G.world.tileAt(c.x, c.y)) ? 2.2 : 1;
    amb.road.g.gain.setTargetAtTime(grounded ? Math.min(0.16, k * 0.14 * rough) : 0, t, 0.1); amb.road.b.frequency.setTargetAtTime(150 + spd * 1.2 * rough, t, 0.1);
    amb.wind.g.gain.setTargetAtTime(c ? k * k * 0.18 : 0, t, 0.15); amb.wind.b.frequency.setTargetAtTime(500 + spd * 1.5, t, 0.15);
    amb.wet.g.gain.setTargetAtTime(grounded ? wx.rain * Math.min(1, spd / 250) * 0.09 : 0, t, 0.15);
    amb.rain.g.gain.setTargetAtTime(wx.rain * (c ? 0.05 : 0.09), t, 0.4);
    // the city: distant traffic hum (busier with more cars about, quieter at night), birds by day, crickets at night
    const hr = G.state ? G.state.hour : 12, night = hr < 5.5 || hr > 20.5, near = (G.activeCars || []).length;
    amb.city.g.gain.setTargetAtTime((0.012 + Math.min(0.04, near * 0.0025)) * (night ? 0.5 : 1), t, 0.8);
    if (wx.rain < 0.3 && spd < 120) {
      if (!night && (birdT -= dt) <= 0) { birdT = rand(1.5, 6); chirp(t + 0.05, rand(-0.8, 0.8)); }
      if (night && (crickT -= dt) <= 0) { crickT = rand(0.4, 1.6); trill(t + 0.02); }
    }
    // echo off buildings: sample the skyline around the listener a few times a second
    if ((encT -= dt) <= 0 && G.world.groundAt) {
      encT = 0.4; let hit = 0, n = 0;
      for (let i = 0; i < 8; i++) for (const r of [80, 170]) { const a = (i / 8) * TAU; n++; if (G.world.groundAt(L.x + Math.cos(a) * r, L.y + Math.sin(a) * r)[0] > 45) hit++; }
      verb.g.gain.setTargetAtTime(0.04 + (hit / n) * 0.42, t, 0.5);
    }
    // sirens: nearest one, with a wail (police) or a fast yelp (ambulance / fire), Doppler and pan
    let sc = null, sd = Infinity;
    for (const q of G.cars) if (q.siren) { const d = dist(q.x, q.y, L.x, L.y); if (d < sd) { sd = d; sc = q; } }
    if (sc && sd < 1100) {
      const sp = spatial(sc, L), fast = sc.s.ems, base = fast ? 700 + 550 * (0.5 + 0.5 * Math.sin(t * TAU * 3)) : 650 + 800 * (0.5 - 0.5 * Math.cos(t * TAU / 3.6));
      siren.g.gain.setTargetAtTime(Math.pow(1 - sd / 1100, 1.6) * 0.09, t, 0.15);
      siren.o.frequency.setTargetAtTime(base * sp.dop, t, 0.03);
      siren.lp.frequency.setTargetAtTime(Math.max(900, 7000 - sd * 6), t, 0.2);
      if (siren.pan.pan) siren.pan.pan.setTargetAtTime(sp.pan, t, 0.1);
    } else siren.g.gain.setTargetAtTime(0, t, 0.2);
    // the nearest other moving car
    let tc = null, td = 420;
    for (const q of G.activeCars || []) if (q !== c && q.driver && !q.wrecked && q.speed > 30 && !q.s.pedal) { const d = dist(q.x, q.y, L.x, L.y); if (d < td) { td = d; tc = q; } }
    if (tc) {
      const sp = spatial(tc, L);
      traf.o.frequency.setTargetAtTime((28 + tc.speed * 0.11) * sp.dop, t, 0.05);
      traf.lp.frequency.setTargetAtTime(Math.max(250, 1400 - td * 2.4), t, 0.1);
      traf.g.gain.setTargetAtTime(Math.pow(1 - td / 420, 2) * 0.05 * (0.4 + Math.min(1, tc.speed / 260)), t, 0.08);
      if (traf.pan.pan) traf.pan.pan.setTargetAtTime(sp.pan, t, 0.08);
    } else traf.g.gain.setTargetAtTime(0, t, 0.2);
  };

  // ---------- one-shot SFX ----------
  function tone(freq, dur, type = "sine", vol = 0.3, slide = 0, delay = 0, bus = sfxBus) {
    const ctx = A.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol = 0.4, freq = 1500, type = "lowpass", delay = 0, bus = sfxBus) {
    const ctx = A.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  A.sfx = function (name, v = 1) {
    if (!A.ctx) return;
    switch (name) {
      case "crash": noise(0.4 * v + 0.1, 0.5 * v, 900); tone(90, 0.25, "sine", 0.4 * v, -50); break;
      case "door": noise(0.08, 0.3, 700); tone(160, 0.08, "square", 0.08); break;
      case "shift": noise(0.05, 0.22, 500); tone(110, 0.06, "square", 0.06); break;
      case "horn": tone(330, 0.35, "square", 0.12); tone(415, 0.35, "square", 0.1); break;
      case "cash": [988, 1319].forEach((f, i) => tone(f, 0.18, "square", 0.08, 0, i * 0.07)); break;
      case "success": [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, "triangle", 0.18, 0, i * 0.08)); break;
      case "fail": [392, 330, 262].forEach((f, i) => tone(f, 0.35, "sawtooth", 0.1, 0, i * 0.15)); break;
      case "checkpoint": tone(880, 0.12, "square", 0.1); tone(1320, 0.15, "square", 0.1, 0, 0.08); break;
      case "beep": tone(660, 0.2, "square", 0.14); break;
      case "go": tone(1320, 0.5, "square", 0.16); break;
      case "alert": tone(880, 0.12, "square", 0.12); tone(660, 0.12, "square", 0.12, 0, 0.13); break;
      case "click": tone(1200, 0.04, "square", 0.06); break;
      case "job": tone(700, 0.1, "triangle", 0.15); tone(1050, 0.18, "triangle", 0.15, 0, 0.1); break;
      case "token": [1568, 2093, 2637].forEach((f, i) => tone(f, 0.16, "sine", 0.14, 0, i * 0.05)); break;
      case "stunt": tone(300, 0.6, "sawtooth", 0.1, 900); break;
      case "thunder": noise(2.5, 0.6, 180); break;
      case "boom": noise(1.2, 0.8, 600); tone(70, 1, "sine", 0.6, -40); break;
      case "busted": [440, 415, 392, 370].forEach((f, i) => tone(f, 0.3, "square", 0.12, 0, i * 0.2)); break;
      case "whoosh": noise(0.5, 0.25, 3000, "bandpass"); break;
    }
  };

  // ---------- radio ----------
  A.cycleStation = function () {
    A.station = (A.station + 1) % STATIONS.length;
    step = 0; if (A.ctx) nextT = A.ctx.currentTime + 0.05;
    G.ui.radio(STATIONS[A.station].name);
    if (A.station && G.settings.voices && window.speechSynthesis && Math.random() < 0.7) {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(STATIONS[A.station].dj); u.rate = 1.05; u.pitch = 0.9; u.volume = 0.8; speechSynthesis.speak(u);
    }
  };
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function kick(t, v = 0.5) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.32); }
  function snare(t, v = 0.25) { const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 1500; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random()); s.stop(t + 0.2); }
  function hat(t, v = 0.07) { const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = 8000; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random()); s.stop(t + 0.06); }
  function note(t, n, dur, type, v, cutoff = 2000, detune = 0) {
    const o = A.ctx.createOscillator(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    o.type = type; o.frequency.value = midi(n); o.detune.value = detune; f.type = "lowpass"; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.02, dur / 4)); g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    o.connect(f); f.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.3);
  }
  // chord progressions (root midi, chord intervals)
  const SYNTH = [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]]]; // Am F C G
  const LOFI = [[50, [0, 3, 7, 10, 14]], [55, [0, 4, 7, 10, 14]], [48, [0, 4, 7, 11, 14]], [57, [0, 3, 7, 10]]];
  const DNB = [[45, [0, 3, 7]], [41, [0, 4, 7]], [43, [0, 4, 7]], [40, [0, 3, 7]]];
  function schedule() {
    if (!A.ctx || !A.station || !musicBus) return;
    const st = STATIONS[A.station], spb = 60 / st.bpm / 4; // 16th note
    if (nextT < A.ctx.currentTime) nextT = A.ctx.currentTime + 0.05;
    while (nextT < A.ctx.currentTime + 0.15) { play(A.station, step, nextT, spb); nextT += A.station === 2 && step % 2 === 0 ? spb * 1.18 : A.station === 2 ? spb * 0.82 : spb; step++; }
  }
  function play(s, i, t, spb) {
    const bar = Math.floor(i / 16) % 4, k = i % 16;
    if (s === 1) {
      const [root, ch] = SYNTH[bar];
      if (k % 4 === 0) kick(t, 0.45); if (k === 4 || k === 12) snare(t, 0.22); if (k % 2 === 1) hat(t, 0.05);
      if (k % 2 === 0) note(t, root - 12, spb * 1.8, "sawtooth", 0.16, 500);
      note(t, root + 12 + ch[(i * 1) % ch.length] + (k > 7 ? 12 : 0), spb * 0.9, "square", 0.045, 2600);
      if (k === 0) ch.forEach((c) => note(t, root + c, spb * 15, "sawtooth", 0.035, 1200, rand(-12, 12)));
    } else if (s === 2) {
      const [root, ch] = LOFI[bar];
      if (k === 0 || k === 10) kick(t, 0.4); if (k === 4 || k === 12) snare(t, 0.12); if (k % 2 === 0) hat(t, 0.035);
      if (k === 0 || k === 7) ch.forEach((c, j) => note(t + j * 0.012, root + 12 + c, spb * 6, "triangle", 0.045, 1400));
      if (k === 0 || k === 8) note(t, root - 12, spb * 7, "sine", 0.22, 400);
      if (k === 3 && Math.random() < 0.5) note(t, root + 24 + pick(ch), spb * 3, "sine", 0.03, 3000);
    } else if (s === 3) {
      const [root, ch] = DNB[bar];
      const kp = [0, 10], sp = [4, 12], gh = [7, 15];
      if (kp.includes(k)) kick(t, 0.5); if (sp.includes(k)) snare(t, 0.3); if (gh.includes(k)) snare(t, 0.08); hat(t, k % 2 ? 0.03 : 0.06);
      if (k % 4 === 0) { note(t, root - 12, spb * 3.5, "sawtooth", 0.13, 300, -8); note(t, root - 12, spb * 3.5, "sawtooth", 0.13, 300, 8); }
      if (k === 0 || k === 6) ch.forEach((c) => note(t, root + 12 + c, spb * 1.2, "square", 0.03, 1800));
    }
  }
})();
