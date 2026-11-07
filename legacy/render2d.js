// ---------- renderer: ground, 2.5D city, actors, lighting, weather, particles ----------
(function () {
  const T = G.TILE, W = G.world, TT = W.TT;
  const R = (G.render = {});
  const cam = (G.cam = { x: 0, y: 0, zoom: 1, tz: 1, shake: 0 });
  G.fx = []; G.skids = [];
  G.shake = (a) => { cam.shake = Math.max(cam.shake, a); };
  let cv, ctx, light, lctx, Wd = 0, Hd = 0, DPR = 1;
  const K = 0.00095; // building perspective strength

  // ---------- textures ----------
  function texture(size, base, fn) {
    const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
    g.fillStyle = base; g.fillRect(0, 0, size, size); fn(g, size); return c;
  }
  const r01 = mulberry32(7);
  const speck = (cols, n, rmax) => (g, s) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r01() * cols.length)]; g.globalAlpha = 0.25 + r01() * 0.5; const r = 0.5 + r01() * rmax; g.fillRect(r01() * s, r01() * s, r, r); } g.globalAlpha = 1; };
  let PAT = {};
  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext("2d");
    light = document.createElement("canvas"); lctx = light.getContext("2d");
    const mk = (c) => ctx.createPattern(c, "repeat");
    PAT[TT.GRASS] = mk(texture(128, "#3f7d3a", speck(["#356b31", "#4c9145", "#2e5e2a", "#5aa04f"], 900, 2.4)));
    PAT[TT.PARK] = mk(texture(128, "#468a3f", speck(["#3a7735", "#56a14c", "#6bb35e", "#2f6a2b"], 900, 2.6)));
    PAT[TT.SAND] = mk(texture(128, "#e6d3a3", speck(["#d9c28c", "#f0e2bd", "#cdb37a", "#fff3d6"], 700, 1.6)));
    PAT[TT.ROAD] = mk(texture(128, "#2c2f36", speck(["#25282e", "#353840", "#1f2227", "#3d4048"], 1200, 1.4)));
    PAT[TT.WALK] = mk(texture(64, "#9a9ca3", (g, s) => { speck(["#8c8e95", "#a8aab0"], 200, 1.5)(g, s); g.strokeStyle = "rgba(0,0,0,0.12)"; g.strokeRect(0.5, 0.5, 31, 31); g.strokeRect(32.5, 32.5, 31, 31); g.strokeRect(32.5, 0.5, 31, 31); g.strokeRect(0.5, 32.5, 31, 31); }));
    PAT[TT.PLAZA] = mk(texture(64, "#a59f96", (g, s) => { speck(["#968f86", "#b5afa6"], 200, 1.5)(g, s); g.strokeStyle = "rgba(0,0,0,0.1)"; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); } }));
    PAT[TT.LOT] = mk(texture(128, "#4a4d54", speck(["#3f4249", "#565961", "#3a3d43"], 900, 1.8)));
    PAT[TT.PARKING] = mk(texture(128, "#33363d", speck(["#2b2e34", "#3b3e45"], 800, 1.5)));
    PAT[TT.WATER] = mk(texture(128, "#0f4c75", speck(["#1b6ca8", "#0b3c5d", "#3282b8"], 300, 3)));
    R.resize();
    addEventListener("resize", R.resize);
  };
  R.resize = function () {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    Wd = innerWidth; Hd = innerHeight;
    cv.width = Wd * DPR; cv.height = Hd * DPR; cv.style.width = Wd + "px"; cv.style.height = Hd + "px";
    light.width = Math.ceil(Wd / 2); light.height = Math.ceil(Hd / 2);
  };
  R.size = () => [Wd, Hd];
  R.screenToWorld = (sx, sy) => [(sx - Wd / 2) / cam.zoom + cam.x, (sy - Hd / 2) / cam.zoom + cam.y];

  // ---------- particles ----------
  G.spawnFx = function (kind, x, y, o = {}) {
    if (G.fx.length > 900) G.fx.shift();
    G.fx.push(Object.assign({ kind, x, y, vx: rand(-20, 20), vy: rand(-20, 20), life: 1, max: 1, size: 6, color: "#999" }, o));
  };
  G.floatText = (x, y, text, color = "#19f5a0") => G.spawnFx("text", x, y, { vx: 0, vy: -40, life: 1.6, max: 1.6, text, color });
  R.updateFx = function (dt) {
    for (const p of G.fx) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "smoke") { p.size += dt * 22; p.vx *= 0.97; p.vy *= 0.97; }
      if (p.kind === "spark") { p.vx *= 0.9; p.vy *= 0.9; }
    }
    G.fx = G.fx.filter((p) => p.life > 0);
  };

  // ---------- time of day ----------
  R.darkness = function (h) {
    if (h >= 7.5 && h <= 17.5) return 0;
    if (h > 17.5 && h < 20.5) return ((h - 17.5) / 3) * 0.68;
    if (h >= 20.5 || h <= 4.5) return 0.68;
    return (1 - (h - 4.5) / 3) * 0.68;
  };
  function duskTint(h) {
    const a = h > 16.5 && h < 20.5 ? Math.sin(((h - 16.5) / 4) * Math.PI) : h > 4.5 && h < 8 ? Math.sin(((h - 4.5) / 3.5) * Math.PI) : 0;
    return a * 0.28;
  }

  // ---------- main draw ----------
  R.draw = function (time, opts = {}) {
    const P = G.player, h = G.state.hour;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sh = cam.shake > 0.1 ? [rand(-cam.shake, cam.shake), rand(-cam.shake, cam.shake)] : [0, 0];
    cam.shake *= 0.88;
    const z = cam.zoom;
    const vw = Wd / z, vh = Hd / z, x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;
    const view = { x0: x0 - 300, y0: y0 - 300, x1: x0 + vw + 300, y1: y0 + vh + 300 };
    const vis = (x, y, m = 0) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
    ctx.fillStyle = "#0f4c75"; ctx.fillRect(0, 0, Wd, Hd);
    ctx.save();
    ctx.translate(Wd / 2 + sh[0], Hd / 2 + sh[1]); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y);
    drawGround(x0, y0, vw, vh, time);
    drawRoadMarks(x0, y0, vw, vh);
    drawDecor(vis, time);
    // skid marks
    ctx.strokeStyle = "rgba(15,15,18,0.33)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.beginPath();
    for (const s of G.skids) if (vis(s[0], s[1])) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
    ctx.stroke();
    // ramps
    for (const r of W.ramps) if (vis(r.x, r.y)) drawRamp(r);
    // tokens
    for (const t of W.tokens) if (!t.got && vis(t.x, t.y)) drawToken(t, time);
    // markers (ground part)
    const markers = opts.markers || [];
    for (const m of markers) if (vis(m.x, m.y, 100)) drawMarkerGround(m, time);
    // streetlight posts
    ctx.fillStyle = "#23262d";
    for (const l of W.lights) if (vis(l.x, l.y)) { ctx.beginPath(); ctx.arc(l.x, l.y, 4, 0, TAU); ctx.fill(); }
    // peds
    for (const p of G.peds) if (vis(p.x, p.y)) { G.drawPerson(ctx, p, time); if (p.bubble > 0) bubble(p.x, p.y - 22, p.fare ? "🙋" : "!"); }
    if (!P.car && G.state.started) G.drawPerson(ctx, P, time);
    // ground-level cars
    for (const c of G.cars) if (c.z <= 2 && vis(c.x, c.y)) G.drawCar(ctx, c, time);
    // smoke/sparks below roofs
    drawFx(false);
    // trees + buildings (2.5D, far first)
    const items = [];
    for (const t of W.trees) if (vis(t.x, t.y, 60)) items.push(t);
    for (const b of W.buildings) if (vis(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) items.push(b);
    items.sort((a, b) => dist2c(b) - dist2c(a));
    const night = R.darkness(h);
    for (const it of items) it.kind === "rect" ? drawBuilding(it, night, time) : drawTree(it);
    // airborne cars over roofs
    for (const c of G.cars) if (c.z > 2 && vis(c.x, c.y)) G.drawCar(ctx, c, time);
    for (const m of markers) if (vis(m.x, m.y, 100)) drawMarkerBeam(m, time);
    drawFx(true);
    if (G.heli) drawHeli(G.heli, time);
    ctx.restore();

    // ---------- lighting ----------
    const dark = night + (G.weather.rain > 0 ? G.weather.rain * 0.18 : 0);
    if (dark > 0.02) drawLighting(dark, night, vis, time);
    const tint = duskTint(h);
    if (tint > 0.01) {
      const g = ctx.createLinearGradient(0, 0, 0, Hd);
      g.addColorStop(0, `rgba(255,94,77,${tint})`); g.addColorStop(1, `rgba(140,60,200,${tint * 0.7})`);
      ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd); ctx.globalCompositeOperation = "source-over";
    }
    drawWeather(time);
    // speed lines
    const sp = P.car ? P.car.speed : 0;
    if (sp > 430) {
      const a = clamp((sp - 430) / 300, 0, 1) * 0.5;
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) {
        const ang = rand(TAU), r0 = Math.max(Wd, Hd) * rand(0.38, 0.5), r1 = r0 + rand(40, 140);
        ctx.beginPath(); ctx.moveTo(Wd / 2 + Math.cos(ang) * r0, Hd / 2 + Math.sin(ang) * r0); ctx.lineTo(Wd / 2 + Math.cos(ang) * r1, Hd / 2 + Math.sin(ang) * r1); ctx.stroke();
      }
    }
    // vignette
    const vg = ctx.createRadialGradient(Wd / 2, Hd / 2, Math.min(Wd, Hd) * 0.45, Wd / 2, Hd / 2, Math.max(Wd, Hd) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, Wd, Hd);
    if (G.state.flash > 0) { ctx.fillStyle = `rgba(230,240,255,${G.state.flash})`; ctx.fillRect(0, 0, Wd, Hd); }
  };
  const dist2c = (o) => { const cx = o.kind === "rect" ? o.x + o.w / 2 : o.x, cy = o.kind === "rect" ? o.y + o.h / 2 : o.y; return (cx - cam.x) ** 2 + (cy - cam.y) ** 2; };

  function drawGround(x0, y0, vw, vh, time) {
    const tx0 = Math.max(0, Math.floor(x0 / T)), ty0 = Math.max(0, Math.floor(y0 / T));
    const tx1 = Math.min(W.N - 1, Math.floor((x0 + vw) / T)), ty1 = Math.min(W.N - 1, Math.floor((y0 + vh) / T));
    for (let ty = ty0; ty <= ty1; ty++) {
      let run = -1, runT = -1;
      for (let tx = tx0; tx <= tx1 + 1; tx++) {
        const t = tx <= tx1 ? W.tiles[ty * W.N + tx] : -1;
        if (t !== runT) {
          if (runT >= 0) { ctx.fillStyle = PAT[runT] || "#555"; ctx.fillRect(run * T, ty * T, (tx - run) * T + 0.5, T + 0.5); }
          run = tx; runT = t;
        }
      }
    }
    // water shimmer + shoreline foam
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = W.tiles[ty * W.N + tx];
      if (t === TT.WATER && (tx + ty) % 2 === 0) { const ox = Math.sin(time * 1.3 + tx * 0.7 + ty) * 10; ctx.beginPath(); ctx.moveTo(tx * T + 12 + ox, ty * T + 30); ctx.quadraticCurveTo(tx * T + 32 + ox, ty * T + 22, tx * T + 52 + ox, ty * T + 30); ctx.stroke(); }
      if (t === TT.WALK) { // curb toward road
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        if (W.tiles[ty * W.N + tx + 1] === TT.ROAD) ctx.fillRect(tx * T + T - 3, ty * T, 3, T);
        if (W.tiles[ty * W.N + tx - 1] === TT.ROAD) ctx.fillRect(tx * T, ty * T, 3, T);
        if (W.tiles[(ty + 1) * W.N + tx] === TT.ROAD) ctx.fillRect(tx * T, ty * T + T - 3, T, 3);
        if (W.tiles[(ty - 1) * W.N + tx] === TT.ROAD) ctx.fillRect(tx * T, ty * T, T, 3);
      }
      if (t === TT.SAND && (W.tiles[ty * W.N + tx + 1] === TT.WATER || W.tiles[(ty + 1) * W.N + tx] === TT.WATER || W.tiles[ty * W.N + tx - 1] === TT.WATER || W.tiles[(ty - 1) * W.N + tx] === TT.WATER)) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(time * 2 + tx + ty) * 0.12})`; ctx.fillRect(tx * T, ty * T, T, T);
      }
    }
    // parking bays
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2;
    for (const s of W.parkingSpots) if (s.x > x0 - 60 && s.x < x0 + vw + 60 && s.y > y0 - 80 && s.y < y0 + vh + 80) { ctx.strokeRect(s.x - 24, s.y - 44, 48, 88); }
  }
  function drawRoadMarks(x0, y0, vw, vh) {
    const RD = W.ROADS;
    ctx.lineWidth = 3;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 7; i++) {
      // horizontal segment
      const hy = (RD[j] + 1) * T, hx0 = (RD[i] + 2) * T, hx1 = RD[i + 1] * T;
      if (hy > y0 - 80 && hy < y0 + vh + 80 && hx1 > x0 && hx0 < x0 + vw) {
        ctx.strokeStyle = "#f2c94c"; ctx.setLineDash([26, 18]); ctx.beginPath(); ctx.moveTo(hx0 + 30, hy - 2); ctx.lineTo(hx1 - 30, hy - 2); ctx.moveTo(hx0 + 30, hy + 2); ctx.lineTo(hx1 - 30, hy + 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(hx0, hy - T + 5); ctx.lineTo(hx1, hy - T + 5); ctx.moveTo(hx0, hy + T - 5); ctx.lineTo(hx1, hy + T - 5); ctx.stroke();
        zebra(hx0 + 4, hy - T + 8, 22, 2 * T - 16, true); zebra(hx1 - 26, hy - T + 8, 22, 2 * T - 16, true);
      }
      // vertical segment
      const vx = (RD[j] + 1) * T, vy0 = (RD[i] + 2) * T, vy1 = RD[i + 1] * T;
      if (vx > x0 - 80 && vx < x0 + vw + 80 && vy1 > y0 && vy0 < y0 + vh) {
        ctx.strokeStyle = "#f2c94c"; ctx.setLineDash([26, 18]); ctx.beginPath(); ctx.moveTo(vx - 2, vy0 + 30); ctx.lineTo(vx - 2, vy1 - 30); ctx.moveTo(vx + 2, vy0 + 30); ctx.lineTo(vx + 2, vy1 - 30); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(vx - T + 5, vy0); ctx.lineTo(vx - T + 5, vy1); ctx.moveTo(vx + T - 5, vy0); ctx.lineTo(vx + T - 5, vy1); ctx.stroke();
        zebra(vx - T + 8, vy0 + 4, 2 * T - 16, 22, false); zebra(vx - T + 8, vy1 - 26, 2 * T - 16, 22, false);
      }
    }
  }
  function zebra(x, y, w, h, vertStripes) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    if (vertStripes) for (let k = 0; k < h; k += 14) ctx.fillRect(x, y + k, w, 7);
    else for (let k = 0; k < w; k += 14) ctx.fillRect(x + k, y, 7, h);
  }
  function drawDecor(vis, time) {
    for (const d of W.decor) {
      if (!vis(d.x, d.y, 200)) continue;
      if (d.type === "pool") {
        ctx.fillStyle = "#e9ecef"; ctx.beginPath(); ctx.roundRect(d.x - 4, d.y - 4, d.w + 8, d.h + 8, 8); ctx.fill();
        ctx.fillStyle = "#4cc9f0"; ctx.beginPath(); ctx.roundRect(d.x, d.y, d.w, d.h, 6); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.moveTo(d.x + 8, d.y + d.h / 2 + Math.sin(time * 2) * 3); ctx.lineTo(d.x + d.w - 8, d.y + d.h / 2 - Math.sin(time * 2) * 3); ctx.stroke();
      } else if (d.type === "pond") {
        ctx.fillStyle = "#c2b280"; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx + 8, d.ry + 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1f6f8b"; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) { const s = ((time * 0.3 + k / 3) % 1); ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx * s, d.ry * s, 0, 0, TAU); ctx.stroke(); }
      } else if (d.type === "fountain") {
        ctx.fillStyle = "#cfc7bb"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = "#3aa6d6"; ctx.beginPath(); ctx.arc(d.x, d.y, d.r - 9, 0, TAU); ctx.fill();
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + time; ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(d.x + Math.cos(a) * 22, d.y + Math.sin(a) * 22, 3, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "#e9ecef"; ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, TAU); ctx.fill();
      }
    }
  }
  function drawRamp(r) {
    ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.a);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-r.w / 2 + 6, -r.h / 2 + 6, r.w, r.h);
    const g = ctx.createLinearGradient(-r.w / 2, 0, r.w / 2, 0); g.addColorStop(0, "#5c4a1a"); g.addColorStop(1, "#ffd60a");
    ctx.fillStyle = g; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
    ctx.fillStyle = "#111"; for (let k = -r.h / 2; k < r.h / 2; k += 14) ctx.fillRect(r.w / 2 - 6, k, 6, 7);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 4;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-10 + k * 18, -12); ctx.lineTo(2 + k * 18, 0); ctx.lineTo(-10 + k * 18, 12); ctx.stroke(); }
    ctx.restore();
  }
  function drawToken(t, time) {
    const s = Math.abs(Math.sin(time * 3 + t.x)), bob = Math.sin(time * 2 + t.y) * 3;
    ctx.save(); ctx.translate(t.x, t.y + bob);
    ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.ellipse(0, 0, 11 * s + 2, 11, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = "#083344"; ctx.font = "bold 12px Bahnschrift, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (s > 0.5) ctx.fillText("N", 0, 1);
    ctx.restore();
  }
  function drawMarkerGround(m, time) {
    const p = (Math.sin(time * 4) + 1) / 2;
    ctx.save(); ctx.globalAlpha = m.dim ? 0.35 : 0.9;
    ctx.strokeStyle = m.color; ctx.lineWidth = 4; ctx.shadowColor = m.color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (0.85 + p * 0.15), 0, TAU); ctx.stroke();
    ctx.globalAlpha *= 0.18; ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawMarkerBeam(m, time) {
    if (m.dim) return;
    const hgt = 130 + Math.sin(time * 3) * 8;
    const g = ctx.createLinearGradient(m.x, m.y, m.x, m.y - hgt);
    g.addColorStop(0, m.color + "cc"); g.addColorStop(1, m.color + "00");
    ctx.fillStyle = g; ctx.fillRect(m.x - 14, m.y - hgt, 28, hgt);
    ctx.font = "26px 'Segoe UI Emoji', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(m.icon, m.x, m.y - hgt * 0.62 + Math.sin(time * 3) * 6);
  }
  function bubble(x, y, s) {
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.roundRect(x - 9, y - 10, 18, 18, 6); ctx.fill();
    ctx.fillStyle = "#e63946"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
  }
  function proj(x, y, hgt) { return [x + (x - cam.x) * hgt * K, y + (y - cam.y) * hgt * K]; }
  function drawTree(t) {
    const [px, py] = proj(t.x, t.y, 34);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.arc(t.x + 6, t.y + 8, t.size * 0.9, 0, TAU); ctx.fill();
    if (t.tree === "palm") {
      ctx.strokeStyle = "#6b4f2a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(px, py); ctx.stroke();
      ctx.fillStyle = "#2f8f46";
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + t.hue; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * t.size * 0.55, py + Math.sin(a) * t.size * 0.55, t.size * 0.6, 5, a, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#5c3d1e"; ctx.beginPath(); ctx.arc(px, py, 4, 0, TAU); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(px - t.size * 0.3, py - t.size * 0.3, 2, px, py, t.size);
      g.addColorStop(0, `hsl(${110 + t.hue * 30},55%,48%)`); g.addColorStop(1, `hsl(${115 + t.hue * 30},55%,24%)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, t.size, 0, TAU); ctx.fill();
    }
  }
  function drawBuilding(b, night, time) {
    const H = b.height;
    const c = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    const r = c.map(([x, y]) => proj(x, y, H));
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(b.x + 8, b.y + 10, b.w + Math.min(26, H * 0.12), b.h + Math.min(26, H * 0.12));
    const walls = [[0, 1, 0, -1, 0.82], [1, 2, 1, 0, 0.62], [2, 3, 0, 1, 0.5], [3, 0, -1, 0, 0.72]];
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (const [i, j, nx, ny, sh] of walls) {
      const mx = (c[i][0] + c[j][0]) / 2, my = (c[i][1] + c[j][1]) / 2;
      if (nx * (cam.x - mx) + ny * (cam.y - my) <= 0) continue;
      ctx.fillStyle = G.shade(b.color, sh);
      ctx.beginPath(); ctx.moveTo(c[i][0], c[i][1]); ctx.lineTo(c[j][0], c[j][1]); ctx.lineTo(r[j][0], r[j][1]); ctx.lineTo(r[i][0], r[i][1]); ctx.closePath(); ctx.fill();
      if (b.windows && H > 50) drawWindows(b, c[i], c[j], r[i], r[j], night, i);
      if (b.glass) { ctx.fillStyle = "rgba(180,230,255,0.25)"; ctx.fill(); }
    }
    // roof
    ctx.fillStyle = b.roof;
    ctx.beginPath(); r.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    const rx = r[0][0], ry = r[0][1], rw = r[1][0] - r[0][0], rh = r[3][1] - r[0][1];
    if (b.house) { // hip roof
      const inset = Math.min(rw, rh) * 0.35;
      ctx.fillStyle = G.shade(b.roof, 1.15); ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw - inset, ry + rh / 2); ctx.lineTo(rx + inset, ry + rh / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = G.shade(b.roof, 0.85); ctx.beginPath(); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw - inset, ry + rh / 2); ctx.closePath(); ctx.fill();
    } else if (b.ridges) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2;
      for (let k = 12; k < rw; k += 20) { ctx.beginPath(); ctx.moveTo(rx + k, ry + 2); ctx.lineTo(rx + k, ry + rh - 2); ctx.stroke(); }
    } else if (!b.container) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 3; ctx.strokeRect(rx + 5, ry + 5, rw - 10, rh - 10);
      const rr = mulberry32(b.seed);
      ctx.fillStyle = "rgba(200,200,210,0.35)";
      for (let k = 0; k < 3; k++) ctx.fillRect(rx + 12 + rr() * (rw - 40), ry + 12 + rr() * (rh - 40), 14, 10);
      if (b.helipad) { ctx.strokeStyle = "#ffd60a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rx + rw / 2, ry + rh / 2, 34, 0, TAU); ctx.stroke(); ctx.fillStyle = "#ffd60a"; ctx.font = "bold 30px Bahnschrift"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("H", rx + rw / 2, ry + rh / 2 + 1); }
      if (b.cross) { ctx.fillStyle = "#e63946"; ctx.fillRect(rx + rw / 2 - 30, ry + rh / 2 - 10, 60, 20); ctx.fillRect(rx + rw / 2 - 10, ry + rh / 2 - 30, 20, 60); }
    }
    if (b.neon && night > 0.15) {
      ctx.save(); ctx.strokeStyle = b.neon; ctx.lineWidth = 3; ctx.shadowColor = b.neon; ctx.shadowBlur = 22; ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(time * 2 + b.seed));
      ctx.beginPath(); r.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    if (b.sign) {
      ctx.save(); ctx.font = "bold 17px Bahnschrift, 'Segoe UI', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const sx = rx + rw / 2, sy = b.helipad || b.cross ? ry + 18 : ry + rh / 2;
      const tw = ctx.measureText(b.sign).width + 18;
      ctx.fillStyle = "rgba(10,10,20,0.75)"; ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy - 13, tw, 26, 7); ctx.fill();
      ctx.shadowColor = b.neon; ctx.shadowBlur = night > 0.1 ? 16 : 4; ctx.fillStyle = b.neon; ctx.fillText(b.sign, sx, sy + 1); ctx.restore();
    }
  }
  function drawWindows(b, a0, a1, b0, b1, night, side) {
    const floors = Math.min(12, Math.floor(b.height / 18)), cols = Math.max(3, Math.min(8, Math.floor(Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) / 30)));
    const rr = mulberry32(b.seed + side);
    for (let f = 0; f < floors; f++) {
      const t0 = (f + 0.25) / floors, t1 = (f + 0.7) / floors;
      for (let k = 0; k < cols; k++) {
        const u0 = (k + 0.2) / cols, u1 = (k + 0.8) / cols;
        const lit = rr() < 0.45;
        const pt = (u, t) => [lerp(lerp(a0[0], a1[0], u), lerp(b0[0], b1[0], u), t), lerp(lerp(a0[1], a1[1], u), lerp(b0[1], b1[1], u), t)];
        const p1 = pt(u0, t0), p2 = pt(u1, t0), p3 = pt(u1, t1), p4 = pt(u0, t1);
        ctx.fillStyle = night > 0.2 && lit ? "rgba(255,214,120,0.9)" : "rgba(170,210,255,0.22)";
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.fill();
      }
    }
  }
  function drawHeli(h, time) {
    ctx.save(); ctx.translate(h.x, h.y - 60);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(40, 90, 30, 14, h.a, 0, TAU); ctx.fill();
    ctx.rotate(h.a);
    ctx.fillStyle = "#1b263b"; ctx.beginPath(); ctx.ellipse(0, 0, 28, 13, 0, 0, TAU); ctx.fill(); ctx.fillRect(-58, -3, 34, 6);
    ctx.fillStyle = "#e9ecef"; ctx.fillRect(-4, -13, 8, 26);
    ctx.fillStyle = "#7fb7ff"; ctx.beginPath(); ctx.ellipse(14, 0, 10, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(220,220,220,0.6)"; ctx.lineWidth = 4;
    for (let k = 0; k < 2; k++) { const a = h.rot + (k * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(-Math.cos(a) * 48, -Math.sin(a) * 48); ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48); ctx.stroke(); }
    ctx.fillStyle = Math.floor(time * 4) % 2 ? "#ff2040" : "#2080ff"; ctx.beginPath(); ctx.arc(-56, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawFx(top) {
    for (const p of G.fx) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === "text") { if (!top) continue; ctx.globalAlpha = a; ctx.font = "bold 22px Bahnschrift, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); continue; }
      if (top !== (p.kind === "smoke")) continue;
      ctx.globalAlpha = p.kind === "smoke" ? a * 0.45 : a;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? a : 1), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- lighting ----------
  function drawLighting(dark, night, vis, time) {
    const lw = light.width, lh = light.height, s = 0.5;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle = `rgba(6,8,28,${dark})`; lctx.fillRect(0, 0, lw, lh);
    lctx.setTransform(cam.zoom * s, 0, 0, cam.zoom * s, lw / 2 - cam.x * cam.zoom * s, lh / 2 - cam.y * cam.zoom * s);
    lctx.globalCompositeOperation = "destination-out";
    const glow = (x, y, r, a = 1) => { const g = lctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, "rgba(0,0,0,0)"); lctx.fillStyle = g; lctx.fillRect(x - r, y - r, r * 2, r * 2); };
    if (night > 0.15) for (const l of W.lights) if (vis(l.x, l.y, 200)) glow(l.x, l.y, 175, 0.85);
    for (const c of G.cars) {
      if (c.wrecked || !vis(c.x, c.y, 300) || (!c.driver && c !== G.player.car)) continue;
      const fx = Math.cos(c.a), fy = Math.sin(c.a);
      glow(c.x + fx * 95, c.y + fy * 95, 105, 0.95); glow(c.x + fx * 30, c.y + fy * 30, 50, 0.9);
    }
    glow(G.player.x, G.player.y, 90, 0.6);
    for (const b of W.buildings) if (b.sign && vis(b.x, b.y, 300)) glow(b.x + b.w / 2, b.y + b.h + 30, 160, 0.7);
    for (const t of W.tokens) if (!t.got && vis(t.x, t.y)) glow(t.x, t.y, 50, 0.8);
    if (G.heli) glow(G.heli.x, G.heli.y + 10, 150, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(light, 0, 0, cv.width, cv.height);
    // additive colour glows
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save(); ctx.translate(Wd / 2, Hd / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
    ctx.globalCompositeOperation = "lighter";
    const cglow = (x, y, r, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    const k = night;
    if (k > 0.15) for (const l of W.lights) if (vis(l.x, l.y, 200)) cglow(l.x, l.y, 120, `rgba(255,170,80,${0.16 * k})`);
    for (const c of G.cars) {
      if (!vis(c.x, c.y, 200) || c.wrecked) continue;
      if (c.siren) { const on = Math.floor(time * 8) % 2 === 0; cglow(c.x, c.y, 140, on ? `rgba(255,30,60,${0.25 + k * 0.3})` : `rgba(40,110,255,${0.25 + k * 0.3})`); }
      if (c.driver && k > 0.1) { const fx = Math.cos(c.a), fy = Math.sin(c.a); cglow(c.x + fx * 70, c.y + fy * 70, 80, `rgba(255,245,200,${0.12 * k})`); cglow(c.x - fx * 24, c.y - fy * 24, 26, `rgba(255,0,0,${(c.braking ? 0.5 : 0.18) * k})`); }
    }
    for (const b of W.buildings) if (b.sign && vis(b.x, b.y, 300)) cglow(b.x + b.w / 2, b.y + b.h + 20, 150, hexA(b.neon, 0.22 * k + 0.03));
    if (G.heli) cglow(G.heli.x, G.heli.y + 10, 150, "rgba(220,235,255,0.28)");
    ctx.restore();
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // ---------- weather ----------
  const drops = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.6, 1) }));
  function drawWeather(time) {
    const r = G.weather.rain; if (r < 0.02) return;
    ctx.fillStyle = `rgba(30,40,70,${0.12 * r})`; ctx.fillRect(0, 0, Wd, Hd);
    ctx.strokeStyle = `rgba(190,210,255,${0.35 * r})`; ctx.lineWidth = 1.2; ctx.beginPath();
    const n = Math.floor(drops.length * r);
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y += 0.035 * d.s; d.x += 0.006 * d.s; if (d.y > 1) { d.y -= 1; d.x = Math.random(); } if (d.x > 1) d.x -= 1;
      const x = d.x * Wd, y = d.y * Hd; ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 18 * d.s);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(200,220,255,${0.3 * r})`;
    for (let i = 0; i < 40 * r; i++) ctx.fillRect(rand(Wd), rand(Hd), 3, 1.5);
  }
})();
