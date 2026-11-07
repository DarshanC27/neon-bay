"""Plays Neon Bay 3D in real Chrome: suits, climbing, swinging, powers, gang fights, driving. Saves screenshots."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs = []
def js(pg, c): return pg.evaluate(c)
def hold(pg, keys, s):
    for k in keys: pg.keyboard.down(k)
    time.sleep(s)
    for k in keys: pg.keyboard.up(k)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--use-gl=angle", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(3); pg.screenshot(path=str(OUT / "30_title3d.png"))
    pg.click("text=NEW GAME"); time.sleep(2)
    js(pg, "G.debug.setTime(13)")
    # transform via C
    pg.keyboard.press("KeyC"); time.sleep(0.4); pg.screenshot(path=str(OUT / "31_transform.png")); time.sleep(0.8)
    print("suit after C:", js(pg, "G.player.hero"))
    # climb a downtown tower as Spindle
    js(pg, """(() => { const b = G.world.buildings.filter(b => b.h3 > 250)[0]; const P = G.player;
      P.x = b.x + b.w/2; P.y = b.y + b.h + 20; P.z = 0; G.render.snapCamera(); G.cam3.yaw = -Math.PI/2; window._b = b; })()""")
    hold(pg, ["KeyW"], 2.0); pg.screenshot(path=str(OUT / "32_climb.png"))
    print("climbing:", js(pg, "({mode:G.player.mode, z:Math.round(G.player.z), top:Math.round(_b.h3)})"))
    hold(pg, ["KeyW", "ShiftLeft"], 5)
    print("after climb:", js(pg, "({mode:G.player.mode, z:Math.round(G.player.z)})"))
    # swing: run off the roof holding space
    js(pg, "G.cam3.yaw = -Math.PI/2")
    pg.keyboard.down("KeyW"); pg.keyboard.down("ShiftLeft"); time.sleep(0.8); pg.keyboard.down("Space")
    swung = False
    for i in range(30):
        time.sleep(0.1)
        if js(pg, "G.player.mode") == "swing":
            swung = True
            if i > 2: break
    pg.screenshot(path=str(OUT / "33_swing.png"))
    pg.keyboard.up("Space"); time.sleep(1.5)
    for k in ["KeyW", "ShiftLeft"]: pg.keyboard.up(k)
    print("swung:", swung, js(pg, "({mode:G.player.mode, z:Math.round(G.player.z)})"))
    time.sleep(3)
    # gang fight as Nova
    js(pg, "G.debug.tp('velvet'); G.debug.hero('nova'); G.gang = [];")
    js(pg, """(() => { const P = G.player; for (let i = 0; i < 3; i++) G.gang.push({x:P.x+30+i*12, y:P.y+10, z:0, vx:0, vy:0, vz:0, a:Math.PI, hp:60, state:'chase', t:0, crew:999, roof:null, aware:true, cd:1, windup:0,
      outfit:{style:'gang', skin:'#c68642', shirt:'#eee', pants:'#333', accent:'#1d7fbf', hair:'#111', bat:i==0}, anim:{mode:'idle'}}); })()""")
    time.sleep(0.5)
    for _ in range(6): pg.keyboard.press("KeyJ"); time.sleep(0.3)
    pg.screenshot(path=str(OUT / "34_fight.png"))
    pg.keyboard.down("Space"); time.sleep(0.25); pg.keyboard.up("Space"); time.sleep(0.45); pg.keyboard.press("KeyK"); time.sleep(1.2)
    pg.screenshot(path=str(OUT / "35_pound.png"))
    print("gang:", js(pg, "G.gang.map(e => e.state)"), "kos:", js(pg, "G.stats.kos"), "hp:", js(pg, "Math.round(G.player.hp)"))
    # wraith takedown
    js(pg, "G.debug.hero('wraith'); G.gang=[]; G.heroes.spawnCrew();"); time.sleep(0.3)
    js(pg, "(() => { const e = G.gang[0]; G.player.x = e.x - 20; G.player.y = e.y; G.player.z = e.z; G.player.mode='ground'; G.render.snapCamera(); })()")
    time.sleep(0.3); pg.keyboard.press("KeyK"); time.sleep(0.3); pg.screenshot(path=str(OUT / "36_takedown.png")); time.sleep(0.6)
    print("takedown:", js(pg, "G.gang[0] && G.gang[0].state"))
    # night drive
    js(pg, "G.debug.setTime(22); G.gang=[]; G.debug.hero('kai'); (() => { const c = G.cars.find(c => c.starter); G.player.x = c.x; G.player.y = c.y + 20; G.player.z = 0; })()")
    time.sleep(0.3); pg.keyboard.press("KeyF"); time.sleep(0.4)
    hold(pg, ["KeyW"], 2.5); pg.screenshot(path=str(OUT / "37_night_drive.png"))
    print("straight drive speed:", js(pg, "Math.round(G.player.car.speed)"))
    js(pg, "G.debug.rain(1)"); hold(pg, ["KeyW", "KeyD", "Space"], 1.0); pg.screenshot(path=str(OUT / "38_rain_drift.png"))
    js(pg, "G.debug.wanted(4)"); hold(pg, ["KeyW"], 4); pg.screenshot(path=str(OUT / "39_cops_heli.png"))
    print("drive:", js(pg, "({car:!!G.player.car, v:Math.round(G.player.car ? G.player.car.speed : 0), stars:G.wanted.stars, heli:!!G.heli, fps:G.fps})"))
    print("lastError:", js(pg, "String(G.lastError || '')"))
    b.close()
print("ERRORS:", errs[:10] or "none")
