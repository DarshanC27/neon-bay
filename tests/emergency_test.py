"""City emergency services: fire engine puts out a burning wreck, tow truck hauls it away, ambulance crew treats a
pedestrian, first aid by the player, traffic pulls over for sirens, stealing an emergency vehicle."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs, results = [], []
def check(name, ok, info=""): results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name, info, flush=True)
def wait(fn, sec):
    t = time.time()
    while time.time() - t < sec:
        if fn(): return True
        time.sleep(0.25)
    return False
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2.5)
    pg.evaluate("localStorage.clear()"); pg.click("text=NEW GAME"); time.sleep(2.5)
    js = pg.evaluate
    shot = lambda n: pg.screenshot(path=str(OUT / f"{n}.png"))
    def look_at(expr):  # aim the camera at a world object for the screenshot
        js(f"(() => {{ const o = {expr}, P = G.player; G.cam3.yaw = Math.atan2(o.y - P.y, o.x - P.x); G.cam3.lastMouse = G.time; }})()"); time.sleep(0.35)
    js("G.debug.tp('velvet'); G.debug.setTime(20.5)"); time.sleep(0.8)
    # a lane point near (x, y), widening the search until one is found
    js("window._lane = (x, y, a, b) => { for (let k = 0; k < 6; k++) { const lp = G.world.lanePointNear(x, y, a, b + k * 250); if (lp) return lp; } throw new Error('no lane'); }; 0")
    check("emergency module loaded", js("!!G.ems && !!G.CAR_TYPES.ambulance && !!G.CAR_TYPES.firetruck && !!G.CAR_TYPES.tow"))

    # ---- a burning wreck on the road -> fire engine
    js("""(() => { const P = G.player, lp = _lane(P.x, P.y, 160, 320);
      const c = new G.Car('sedan', lp.x, lp.y, lp.a); G.cars.push(c); c.burning = 1; c.damage(999); window._wreck = c;
      P.x = lp.x - Math.cos(lp.a) * 170; P.y = lp.y - Math.sin(lp.a) * 170; P.a = lp.a; })()""")  # on the road, looking at the scene
    check("wreck reported as an incident", wait(lambda: js("G.ems.incidents.length") >= 1, 3))
    check("fire engine dispatched", wait(lambda: js("G.ems.units.some(u => u.role === 'fire')"), 4))
    p0 = js("(() => { const c = G.ems.units.find(u => u.role === 'fire').car; return [c.x, c.y]; })()")
    mv = lambda: js(f"(() => {{ const u = G.ems.units.find(u => u.role === 'fire'); return u ? Math.hypot(u.car.x - {p0[0]}, u.car.y - {p0[1]}) : -1; }})()")
    wait(lambda: mv() > 200, 7); moved = mv()
    check("fire engine drives to the scene on the road network, siren on", moved > 200 and js("G.ems.units.find(u => u.role === 'fire').car.siren"), f"moved {round(moved)}")
    # skip the rest of the drive
    js("(() => { const u = G.ems.units.find(u => u.role === 'fire'), c = u.car; u.park = u.park || { x: _wreck.x + 90, y: _wreck.y }; c.x = u.park.x; c.y = u.park.y; c.vx = c.vy = 0; })()")
    check("crew gets out at the scene, siren off, lights on", wait(lambda: js("(() => { const u = G.ems.units.find(u => u.role === 'fire'); return u && u.stage === 'scene' && u.crew.length === 2 && !u.car.siren && u.car.beacon; })()"), 3))
    check("firefighters reach the fire and spray", wait(lambda: js("G.peds.some(p => p.crew === 'fire' && p.act === 'hose')"), 6))
    time.sleep(1.2); look_at("_wreck"); shot("80_ems_fire")
    check("fire is put out", wait(lambda: js("_wreck.burning") <= 0, 12), js("_wreck.burning"))
    # ---- tow truck
    check("tow truck dispatched once the fire is out", wait(lambda: js("G.ems.units.some(u => u.role === 'tow')"), 8))
    js("(() => { const u = G.ems.units.find(u => u.role === 'tow'), c = u.car; u.park = u.park || { x: _wreck.x - 90, y: _wreck.y }; c.x = u.park.x; c.y = u.park.y; c.vx = c.vy = 0; })()")
    check("tow driver hooks up the wreck", wait(lambda: js("_wreck.towed === true"), 12))
    look_at("_wreck"); shot("81_ems_tow")
    t0 = js("[_wreck.towedBy.x, _wreck.towedBy.y]")
    wait(lambda: js(f"Math.hypot(_wreck.towedBy.x - {t0[0]}, _wreck.towedBy.y - {t0[1]})") > 120, 12)  # may wait at a red light first
    tw = js("(() => { const t = _wreck.towedBy; return t ? [t.x, t.y, Math.hypot(t.x - _wreck.x, t.y - _wreck.y)] : null; })()")
    check("tow truck drives off with the wreck behind it", tw and ((tw[0] - t0[0]) ** 2 + (tw[1] - t0[1]) ** 2) ** 0.5 > 120 and tw[2] < 80, tw)
    check("fire engine leaves once done", wait(lambda: not js("G.ems.units.some(u => u.role === 'fire' && u.stage !== 'leave')"), 8))

    # ---- a pedestrian knocked down hard -> ambulance + CPR
    js("""(() => { const P = G.player; P.x += 400; const lp = _lane(P.x, P.y, 100, 250); const p = G.makePed(0, 0, 0);
      p.x = lp.x + 40; p.y = lp.y; p.state = 'wait'; G.peds.push(p); window._ped = p;
      const c = new G.Car('sedan', p.x - 30, p.y, 0); c.vx = 400; c.keep = true; G.cars.push(c); })()""")
    check("a hard hit leaves the pedestrian injured on the ground", wait(lambda: js("_ped.injured === true && _ped.state === 'down'"), 3), js("_ped.state"))
    check("ambulance dispatched", wait(lambda: js("G.ems.units.some(u => u.role === 'med' && u.inc.peds.includes(_ped))"), 5))
    js("(() => { const u = G.ems.units.find(u => u.role === 'med' && u.inc.peds.includes(_ped)), c = u.car; u.park = { x: _ped.x + 70, y: _ped.y + 40 }; c.x = u.park.x; c.y = u.park.y; c.vx = c.vy = 0; })()")
    check("paramedics give CPR", wait(lambda: js("G.peds.some(p => p.crew === 'med' && p.act === 'cpr')"), 8))
    js("(() => { const P = G.player; P.x = _ped.x - 90; P.y = _ped.y - 50; P.a = Math.atan2(_ped.y - P.y, _ped.x - P.x); })()"); time.sleep(1.5)
    shot("82_ems_cpr")
    check("patient gets back up", wait(lambda: js("!_ped.injured"), 10))

    # ---- first aid by the player
    js("(() => { const P = G.player, p = G.makePed(0, 0, 0); p.x = P.x + 12; p.y = P.y; p.state = 'down'; p.timer = 45; p.injured = true; p.emsSeen = true; G.peds.push(p); window._p2 = p; })()")
    time.sleep(0.4); m0 = js("G.state.money")
    check("first-aid prompt next to an injured person", js("G.ems.available().length") >= 1)
    pg.keyboard.press("KeyE"); time.sleep(0.6)
    check("E gives first aid (+$150)", not js("_p2.injured") and js("G.state.money") - m0 >= 150, f"+{js('G.state.money') - m0}")

    # ---- traffic pulls over for a siren behind it
    js("""(() => { const P = G.player, lp = _lane(P.x, P.y, 200, 500); const n = G.world.nearestNode(lp.x, lp.y);
      const car = new G.Car('sedan', lp.x, lp.y, lp.a); G.initTrafficAI(car, lp.from, lp.to); car.keep = true; G.cars.push(car); window._tr = car;
      const s = new G.Car('police', lp.x - Math.cos(lp.a) * 120, lp.y - Math.sin(lp.a) * 120, lp.a); s.siren = true; s.keep = true; G.cars.push(s); window._siren = s; })()""")
    check("traffic pulls over for a siren behind", wait(lambda: js("(_tr.ai.yield || 0) > 0.5"), 3), js("_tr.ai.yield"))
    js("_siren.siren = false"); time.sleep(2)
    check("and pulls back out once it has passed", js("(_tr.ai.yield || 0) < 0.3"), js("_tr.ai.yield"))

    # ---- stealing an emergency vehicle is a crime
    js("G.clearWanted(); (() => { const P = G.player; const c = new G.Car('ambulance', P.x + 20, P.y, 0); c.driver = 'ems'; c.keep = true; c.ai = { stuck: 0, rev: 0, repath: 0, path: null }; G.cars.push(c); window._amb = c; })()")
    time.sleep(0.3); pg.keyboard.press("KeyF"); time.sleep(0.5)
    check("stealing an ambulance gets you wanted", js("G.player.car === _amb") and js("G.wanted.stars") >= 2, js("G.wanted.stars"))
    time.sleep(0.8); shot("83_ems_ambulance")

    check("no runtime error", not js("G.lastError ? String(G.lastError) : ''"), js("G.lastError ? String(G.lastError) : ''"))
    check("fps", js("G.fps") >= 25, js("G.fps"))
    b.close()
print("ERRORS:", errs[:8] or "none")
print(f"{sum(results)}/{len(results)} checks passed")
