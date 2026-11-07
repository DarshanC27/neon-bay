"""Exercises Neon Bay's jobs and failure states: rideshare, delivery, busted, blackout, wreck, save/continue."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs = []; results = {}
def js(pg, c): return pg.evaluate(c)
def check(name, ok, info=""): results[name] = ok; print(("PASS " if ok else "FAIL ") + name, info)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2); pg.click("text=NEW GAME"); time.sleep(1.5)
    js(pg, "(() => { const c = G.cars.find(c => c.starter); G.player.x = c.x; G.player.y = c.y + 30; })()"); pg.keyboard.press("KeyF"); time.sleep(0.3)
    check("enter car", js(pg, "!!G.player.car"))
    # --- rideshare: start, teleport to passenger, pick up, teleport to destination ---
    js(pg, "G.missions.startRideshare()"); time.sleep(0.5)
    js(pg, "(() => { const m = G.missions.active, c = G.player.car; c.x = m.ped.x; c.y = m.ped.y + 40; c.vx = c.vy = 0; })()"); time.sleep(0.6)
    check("rideshare pickup", js(pg, "G.missions.active.stage") == "drop")
    m0 = js(pg, "G.state.money")
    js(pg, "(() => { const m = G.missions.active, c = G.player.car; c.x = m.target.x; c.y = m.target.y; c.vx = c.vy = 0; })()"); time.sleep(0.6)
    check("rideshare paid", js(pg, "G.state.money") > m0, f"{m0} -> {js(pg, 'G.state.money')}")
    pg.screenshot(path=str(OUT / "20_rideshare.png"))
    js(pg, "G.missions.active = null")
    # --- delivery ---
    js(pg, "G.debug.tp('depot'); G.player.car.vx = G.player.car.vy = 0"); time.sleep(0.5); pg.keyboard.press("KeyE"); time.sleep(0.4)
    check("delivery started", js(pg, "G.missions.active && G.missions.active.kind") == "delivery")
    m0 = js(pg, "G.state.money")
    js(pg, "(() => { const m = G.missions.active, c = G.player.car; c.x = m.target.x; c.y = m.target.y; c.vx = c.vy = 0; })()"); time.sleep(0.6)
    check("delivery paid", js(pg, "G.state.money") > m0 and js(pg, "G.missions.active") is None)
    # --- delivery fail by damage ---
    js(pg, "G.debug.tp('depot'); G.player.car.vx = G.player.car.vy = 0"); time.sleep(0.4); pg.keyboard.press("KeyE"); time.sleep(0.3)
    js(pg, "G.player.car.damage(40)"); time.sleep(0.4)
    check("fragile package fails", js(pg, "G.missions.active") is None)
    # --- busted ---
    js(pg, "G.player.car.hp = G.player.car.s.hp; G.debug.wanted(2)"); time.sleep(0.2)
    js(pg, """(() => { const c = G.player.car; c.vx = c.vy = 0; const cop = new G.Car('police', c.x + 50, c.y, 0); cop.driver='police'; cop.siren=true; cop.ai={stuck:0,rev:0,repath:0,path:null}; cop.keep=true; G.cars.push(cop); window._cop = cop; })()""")
    for _ in range(12):
        js(pg, "G.player.car && (G.player.car.vx = G.player.car.vy = 0); _cop.x = G.player.x + 50; _cop.y = G.player.y; _cop.vx = _cop.vy = 0")
        time.sleep(0.25)
    check("busted", js(pg, "G.stats.busted") == 1 and js(pg, "G.wanted.stars") == 0, f"busted={js(pg, 'G.stats.busted')} stars={js(pg, 'G.wanted.stars')}")
    time.sleep(0.4); pg.screenshot(path=str(OUT / "21_busted.png"))
    # --- blackout on foot ---
    js(pg, "G.player.hp = 1"); js(pg, """(() => { const c = new G.Car('van', G.player.x - 60, G.player.y, 0); c.vx = 600; c.driver = null; c.keep = true; G.cars.push(c); })()"""); time.sleep(1.0)
    check("blackout -> hospital", js(pg, "G.player.hp") == 100 and js(pg, "Math.hypot(G.player.x - G.world.pois.hospital.x, G.player.y - G.world.pois.hospital.y)") < 120)
    # --- wreck ---
    js(pg, "(() => { const c = new G.Car('sedan', G.player.x, G.player.y, 0); c.keep = true; G.cars.push(c); G.player.x = c.x; G.player.y = c.y; })()"); time.sleep(0.2); pg.keyboard.press("KeyF"); time.sleep(0.2)
    js(pg, "G.player.car.damage(500)"); time.sleep(0.6)
    check("wreck ejects player", js(pg, "G.player.car") is None)
    pg.screenshot(path=str(OUT / "22_wreck.png"))
    # --- token pickup ---
    m0 = js(pg, "G.state.money"); js(pg, "(() => { const t = G.world.tokens.find(t => !t.got); G.player.x = t.x; G.player.y = t.y; })()"); time.sleep(0.4)
    check("token collected", js(pg, "G.world.tokens.filter(t=>t.got).length") == 1 and js(pg, "G.state.money") > m0)
    # --- save + continue ---
    js(pg, "G.save()"); money = js(pg, "G.state.money")
    pg.reload(); time.sleep(2)
    check("continue button shown", pg.is_visible("#btnContinue"))
    pg.click("#btnContinue"); time.sleep(1.2)
    check("save restored", js(pg, "G.state.money") == money and js(pg, "G.world.tokens.filter(t=>t.got).length") == 1, f"money {money} vs {js(pg, 'G.state.money')}")
    # --- performance over 5s of driving downtown at night ---
    js(pg, "G.debug.setTime(23)"); js(pg, "(() => { const c = G.cars.find(c => c.parked); G.player.x = c.x; G.player.y = c.y; })()"); pg.keyboard.press("KeyF"); time.sleep(0.2)
    pg.keyboard.down("KeyW"); time.sleep(5); pg.keyboard.up("KeyW")
    check("fps >= 40", js(pg, "G.fps") >= 40, f"fps={js(pg, 'G.fps')} cars={js(pg, 'G.cars.length')} peds={js(pg, 'G.peds.length')}")
    check("no runtime error", js(pg, "G.lastError") is None)
    b.close()
print("ERRORS:", errs or "none")
print(f"{sum(results.values())}/{len(results)} checks passed")
