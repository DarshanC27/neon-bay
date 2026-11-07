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
    // engine: two oscillators through a lowpass
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain();
    o1.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 600; eg.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(eg); eg.connect(sfxBus); o1.start(); o2.start();
    eng = { o1, o2, lp, g: eg };
    // tire screech: looped noise through bandpass
    const sn = ctx.createBufferSource(); sn.buffer = noiseBuf; sn.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 6;
    const sg = ctx.createGain(); sg.gain.value = 0; sn.connect(bp); bp.connect(sg); sg.connect(sfxBus); sn.start();
    screech = { g: sg, bp };
    // siren
    const so = ctx.createOscillator(), sgn = ctx.createGain(); so.type = "triangle"; sgn.gain.value = 0; so.connect(sgn); sgn.connect(sfxBus); so.start();
    siren = { o: so, g: sgn };
    A.on = true;
    sched = setInterval(schedule, 25);
  };
  // gearbox model: 6 gears spread over the car's top speed, rpm 900-7200, a short torque/sound dip on every shift,
  // a bouncing rev limiter, and a bit of wheelspin flare when the tyres are sliding. Used for my car and other players'.
  const RATIOS = [0, 0.16, 0.31, 0.47, 0.63, 0.8, 1.02];
  A.engineNote = function (c, dt) {
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
    if ((c.ctrl.t || 0) > 0 && sp < 20) target = 2600; // launch revs
    if (target > 7100) target = 7100 - Math.abs(Math.sin(G.time * 40)) * 300; // limiter bounce
    st.rpm += (target - st.rpm) * Math.min(1, dt * (st.shift > 0 ? 25 : 10));
    const load = clamp(Math.abs(c.ctrl.t || 0), 0, 1);
    return { f: (st.rpm / 60) * 2 * 0.8, rpm01: (st.rpm - 900) / 6300, load, shift: st.shift, gear: g };
  };
  A.setVolume = (v) => { A.vol = v; if (master) master.gain.value = v; };
  A.setMusic = (v) => { A.musicVol = v; if (musicBus) musicBus.gain.value = v * 0.5; };

  // ---------- engine / ambience per frame ----------
  A.update = function (dt) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime, P = G.player, c = P.car;
    if (c && !c.wrecked) {
      const e = A.engineNote(c, dt);
      eng.o1.frequency.setTargetAtTime(e.f, t, 0.03); eng.o2.frequency.setTargetAtTime(e.f * 0.5, t, 0.03);
      eng.lp.frequency.setTargetAtTime(300 + e.load * 1500 + e.rpm01 * 900 + (c.ctrl.boost ? 900 : 0), t, 0.06);
      eng.g.gain.setTargetAtTime((0.07 + e.load * 0.1) * (e.shift > 0 ? 0.35 : 1), t, e.shift > 0 ? 0.02 : 0.08);
      const sl = c.z > 0 ? 0 : clamp((c.slip - 70) / 220, 0, 1) * (c.speed > 60 ? 1 : 0);
      screech.g.gain.setTargetAtTime(sl * 0.22, t, 0.05);
    } else { eng.g.gain.setTargetAtTime(0, t, 0.15); screech.g.gain.setTargetAtTime(0, t, 0.05); }
    let nearCop = Infinity;
    for (const k of G.cars) if (k.siren) nearCop = Math.min(nearCop, dist(k.x, k.y, P.x, P.y));
    const sv = nearCop < 900 ? (1 - nearCop / 900) * 0.07 : 0;
    siren.g.gain.setTargetAtTime(sv, t, 0.2);
    siren.o.frequency.setTargetAtTime(Math.sin(t * 5) > 0 ? 960 : 720, t, 0.05);
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
