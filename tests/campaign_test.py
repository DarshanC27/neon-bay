"""Builds and autoplays all 100 campaign missions in real Chrome; reports pass/fail per mission."""
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
DRIVER = r"""
window.autoStep = function () {
  const m = G.missions.active, P = G.player;
  if (!m || m.kind !== 'op') return 'none';
  if (m.si < 0) return 'brief';
  const s = m.steps[m.si], st = m.st;
  const ensureCar = () => { if (!P.car) { const c = new G.Car('sports', P.x, P.y, 0); c.keep = true; G.cars.push(c); P.car = c; c.driver = 'player'; } };
  const tpCar = (x, y) => { ensureCar(); P.car.x = x; P.car.y = y; P.car.vx = P.car.vy = 0; P.x = x; P.y = y; };
  const tpFoot = (x, y, z = 0) => { if (P.car) { P.car.driver = null; P.car = null; } P.x = x; P.y = y; P.z = z; P.vz = 0; P.vx = P.vy = 0; };
  switch (s.t) {
    case 'goto': s.car ? tpCar(s.x, s.y) : tpFoot(s.x, s.y); break;
    case 'getcar': if (P.car !== m.car) { if (P.car) { P.car.driver = null; P.car = null; } P.x = m.car.x; P.y = m.car.y + 20; G.enterNearestCar(); } break;
    case 'bring': case 'deliver': tpCar(s.x, s.y); if (m.car) m.car.hp = m.car.s.hp; break;
    case 'checkpoints': case 'race': if (st.count > 0) break; { const p = s.pts[st.i]; if (p) tpCar(p.x, p.y); } break;
    case 'collect': { const k = s.pts.findIndex((_, k) => !st.got.has(k)); const p = s.pts[k]; if (p) (s.foot ? tpFoot(p.x, p.y) : tpCar(p.x, p.y)); } break;
    case 'smash': { const k = s.pts.findIndex((_, k) => !st.got.has(k)); const p = s.pts[k]; if (p) { tpCar(p.x, p.y); P.car.vx = 420; } } break;
    case 'drift': st.score = s.score; break;
    case 'speed': ensureCar(); P.car.vx = s.kmh / 0.6 + 25; P.car.vy = 0; P.car.a = 0; break;
    case 'evade': G.clearWanted(); break;
    case 'survive': st.t = 0; break;
    case 'stunts': G.stats.stunts += s.n; break;
    case 'taxi': if (st.stage === 0) tpCar(st.ped.x, st.ped.y); else tpCar(s.x, s.y); break;
    case 'fight': st.list.forEach((e) => { e.state = 'down'; e.t = 5; }); break;
    case 'hero': if (P.car) { P.car.driver = null; P.car = null; } G.heroes.setHero('nova'); break;
    case 'roof': tpFoot(s.x, s.y, s.z); break;
    case 'roofs': { const p = s.pts[st.i]; if (p) tpFoot(p.x, p.y, p.z); } break;
    case 'takedown': st.car.damage(99999); break;
    case 'tail': st.t = 0; break;
    case 'escort': st.car.x = s.tx; st.car.y = s.ty; tpCar(s.tx + 60, s.ty); break;
  }
  return s.t + ':' + m.si;
};
window._banners = []; const ob = G.ui.banner; G.ui.banner = (a, b, c) => { window._banners.push(a + ' | ' + b); return ob(a, b, c); };
"""
VALIDATE = r"""(() => {
  const bad = [], kinds = {};
  for (const d of G.campaign.list) {
    let b; try { b = G.campaign._build(d); } catch (e) { bad.push(d.n + ' build error ' + e.message); continue; }
    for (const s of b.steps) {
      kinds[s.t] = (kinds[s.t] || 0) + 1;
      const pts = s.pts || [];
      for (const p of [s, ...pts]) if (('x' in p) && !(isFinite(p.x) && isFinite(p.y))) bad.push(d.n + ' bad coords in ' + s.t);
      if ((s.t === 'roof') && !s.b) bad.push(d.n + ' roof without building');
      if (s.t === 'roofs' && s.pts.length < 2) bad.push(d.n + ' roofs chain too short');
      if (s.text === undefined) bad.push(d.n + ' missing text');
    }
  }
  return { bad, kinds, count: G.campaign.list.length };
})()"""
start_i = int(sys.argv[1]) if len(sys.argv) > 1 else 0
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2.5); pg.click("text=NEW GAME"); time.sleep(2)
    v = pg.evaluate(VALIDATE)
    print("BUILD:", v["count"], "missions | step kinds:", json.dumps(v["kinds"]), "| problems:", v["bad"] or "none", flush=True)
    pg.evaluate(DRIVER)
    pg.evaluate(f"G.state.ops = {{}}; for (let i = 0; i < {start_i}; i++) G.state.ops[i] = 1; G.state.noCops = false")
    passed, failed, medals, fps = 0, [], {1: 0, 2: 0, 3: 0}, []
    for i in range(start_i, 100):
        pg.evaluate("window._banners = []")
        pg.evaluate(f"G.campaign.start({i})")
        t0 = time.time(); result = None
        while time.time() - t0 < 45:
            mode = pg.evaluate("G.state.mode")
            if mode == "dialog":
                pg.keyboard.press("Space"); time.sleep(0.03); pg.keyboard.press("Space"); time.sleep(0.03); continue
            if mode != "play": pg.keyboard.press("Escape"); time.sleep(0.1); continue
            st = pg.evaluate("autoStep()")
            if st == "none":
                done = pg.evaluate(f"G.campaign.done()[{i}] || 0")
                result = ("PASS", done) if done else ("FAIL", pg.evaluate("window._banners.slice(-1)[0] || 'no banner'"))
                break
            time.sleep(0.12)
        if result is None: result = ("TIMEOUT", pg.evaluate("(() => { const m = G.missions.active; return m && m.steps ? m.steps[m.si].t + ' step ' + m.si : 'none'; })()")); pg.evaluate("G.missions.active && G.missions.cancel()")
        d = pg.evaluate(f"G.campaign.list[{i}]")
        if result[0] == "PASS": passed += 1; medals[result[1]] += 1
        else: failed.append((i + 1, d["title"], result))
        if i % 10 == 9: fps.append(pg.evaluate("G.fps")); pg.screenshot(path=str(OUT / f"30_campaign_ch{(i // 10) + 1}.png"))
        print(f"{i+1:3} {d['title'][:24]:24} {'+'.join(d['kinds']):22} {result[0]} {result[1] if result[0]!='PASS' else ['','bronze','silver','gold'][result[1]]}", flush=True)
        if not pg.evaluate("G.missions.active") and pg.evaluate("G.wanted.stars"): pg.evaluate("G.clearWanted()")
        if pg.evaluate("G.player.hp") < 40: pg.evaluate("G.player.hp = 100")
    print(f"\nRESULT: {passed}/{100 - start_i} passed | medals {medals} | fps samples {fps} | lastError {pg.evaluate('G.lastError ? String(G.lastError) : null')}")
    b.close()
print("JS ERRORS:", errs[:10] or "none", f"({len(errs)} total)")
