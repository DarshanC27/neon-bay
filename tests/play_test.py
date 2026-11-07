"""Plays Neon Bay in real Chrome: title, driving, night, rain, cops, map, phone, shop, story, race. Saves screenshots."""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
URL = (ROOT / "index.html").as_uri()
errs = []
def shot(pg, name): pg.screenshot(path=str(OUT / f"{name}.png"))
def js(pg, code): return pg.evaluate(code)
def hold(pg, keys, sec):
    for k in keys: pg.keyboard.down(k)
    time.sleep(sec)
    for k in keys: pg.keyboard.up(k)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(URL); time.sleep(3); shot(pg, "01_title")
    pg.click("text=NEW GAME"); time.sleep(2.5); shot(pg, "02_start")
    print("start:", js(pg, "({mode:G.state.mode, cars:G.cars.length, peds:G.peds.length, fps:G.fps})"))
    # walk to the starter car and get in
    js(pg, "(() => { const c = G.cars.find(c => c.starter); G.player.x = c.x; G.player.y = c.y + 30; })()")
    time.sleep(0.3); pg.keyboard.press("KeyF"); time.sleep(0.5)
    print("in car:", js(pg, "!!G.player.car && G.player.car.s.name"))
    hold(pg, ["KeyW"], 2.2); shot(pg, "03_driving")
    hold(pg, ["KeyW", "KeyD", "Space"], 0.9); shot(pg, "04_drift")
    print("speed/pos:", js(pg, "({v:Math.round(G.player.car.speed), x:Math.round(G.player.x), y:Math.round(G.player.y), hp:Math.round(G.player.car.hp)})"))
    hold(pg, ["KeyW", "ShiftLeft"], 1.5)
    # night + neon downtown
    js(pg, "G.debug.setTime(22.3); G.debug.tp('velvet')"); time.sleep(2.0); shot(pg, "05_night_downtown")
    # rain
    js(pg, "G.debug.rain(0.9)"); time.sleep(1.5); shot(pg, "06_rain"); js(pg, "G.debug.rain(0)")
    # story dialog
    js(pg, "G.debug.setTime(19); (() => { const v = G.world.pois.velvet; G.player.car.x = v.x; G.player.car.y = v.y; G.player.car.vx = G.player.car.vy = 0; })()"); time.sleep(0.6)
    print("prompt:", js(pg, "document.getElementById('prompt').textContent"))
    pg.keyboard.press("KeyE"); time.sleep(1.2); shot(pg, "07_dialog")
    for _ in range(8): pg.keyboard.press("Space"); time.sleep(0.25); pg.keyboard.press("Space"); time.sleep(0.25)
    print("story mission:", js(pg, "G.missions.active && [G.missions.active.title, G.missions.active.step]"), "mode:", js(pg, "G.state.mode"))
    time.sleep(0.5); js(pg, "G.debug.tp('spray')"); time.sleep(1.0)
    print("after spray:", js(pg, "({story:G.state.story, money:G.state.money, active:!!G.missions.active})"))
    for _ in range(10):
        if js(pg, "G.state.mode") != "dialog": break
        pg.keyboard.press("Space"); time.sleep(0.2); pg.keyboard.press("Space"); time.sleep(0.2)
    time.sleep(1.2); shot(pg, "08_mission_done")
    print("story after outro:", js(pg, "({story:G.state.story, money:G.state.money, mode:G.state.mode})"))
    # cops chase
    js(pg, "G.debug.setTime(21); G.debug.wanted(4)"); hold(pg, ["KeyW"], 4); time.sleep(3); shot(pg, "09_cops")
    print("cops:", js(pg, "({stars:G.wanted.stars, cops:G.cars.filter(c=>c.driver==='police').length, heli:!!G.heli})"))
    js(pg, "G.clearWanted(); G.cars = G.cars.filter(c=>c.driver!=='police')")
    # map + phone
    pg.keyboard.press("KeyM"); time.sleep(0.6); pg.mouse.click(1000, 300); time.sleep(0.4); shot(pg, "10_map"); pg.keyboard.press("KeyM"); time.sleep(0.3)
    pg.keyboard.press("KeyP"); time.sleep(0.8); shot(pg, "11_phone"); pg.keyboard.press("KeyP"); time.sleep(0.3)
    # dealership shop
    js(pg, "G.debug.money(40000); G.debug.tp('dealer'); G.player.car.vx = G.player.car.vy = 0"); time.sleep(0.6); pg.keyboard.press("KeyE"); time.sleep(0.6); shot(pg, "12_shop")
    pg.keyboard.press("Escape"); time.sleep(0.3)
    # stunt ramp
    js(pg, """(() => { const r = G.world.ramps[0], c = G.player.car; c.x = r.x - Math.cos(r.a)*260; c.y = r.y - Math.sin(r.a)*260; c.a = r.a; c.vx = Math.cos(r.a)*420; c.vy = Math.sin(r.a)*420; })()""")
    hold(pg, ["KeyW"], 0.75); shot(pg, "13_stunt_air"); time.sleep(1.5); shot(pg, "14_stunt_land")
    print("stunts:", js(pg, "G.stats.stunts"), "money:", js(pg, "G.state.money"))
    # race
    js(pg, "G.missions.active = null; G.missions.startRace(0)"); time.sleep(4.5); hold(pg, ["KeyW"], 2.5); shot(pg, "15_race")
    print("race:", js(pg, "G.missions.active && ({idx:G.missions.active.idx, pos:G.missions.active.pos, racerIdx:G.missions.active.racers.map(r=>r.ai.idx)})"))
    time.sleep(6)
    print("racers after 6s:", js(pg, "G.missions.active && G.missions.active.racers.map(r=>[r.ai.idx, Math.round(r.speed)])"))
    print("FPS:", js(pg, "G.fps"), "| lastError:", js(pg, "G.lastError ? String(G.lastError.stack||G.lastError) : null"))
    b.close()
print("ERRORS:", errs or "none")
