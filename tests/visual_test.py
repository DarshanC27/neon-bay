"""Screenshots of the spectacle layer and the mission UI animations."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs = []
def js(pg, c): return pg.evaluate(c)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2.5); pg.click("text=NEW GAME"); time.sleep(2)
    look = "(yaw, pitch) => { G.cam3.yaw = yaw; G.cam3.pitch = pitch; G.cam3.lastMouse = G.time + 999; }"
    # 1. night beach: ferris wheel + fireworks show
    js(pg, "G.debug.setTime(22.2); G.player.x = 86.5*64; G.player.y = 30*64; G.render.snapCamera()")
    pg.evaluate(f"({look})(0, 0.05)"); time.sleep(1.2)
    js(pg, "G.campaign.fireworks(93*64, 30*64, 10)"); time.sleep(2.1); pg.screenshot(path=str(OUT / "40_wheel_fireworks.png"))
    # 2. dusk skyline: blimp, billboards, balloons, searchlights
    js(pg, "G.debug.setTime(19.4); G.player.x = 40*64; G.player.y = 66*64; G.render.snapCamera()")
    pg.evaluate(f"({look})(-1.57, -0.12)"); time.sleep(2.5); pg.screenshot(path=str(OUT / "41_skyline_dusk.png"))
    js(pg, "G.debug.setTime(23)"); time.sleep(1.5); pg.screenshot(path=str(OUT / "42_skyline_night.png"))
    # 3. mission intro card
    js(pg, "G.debug.setTime(17); G.cam3.lastMouse = -99"); js(pg, "for (let i = 0; i < 5; i++) G.state.ops[i] = 3; G.campaign.start(5)"); time.sleep(0.9); pg.screenshot(path=str(OUT / "43_mission_intro.png"))
    for _ in range(12):
        if js(pg, "G.state.mode") != "dialog": time.sleep(0.2); continue
        pg.keyboard.press("Space"); time.sleep(0.05); pg.keyboard.press("Space"); time.sleep(0.05)
    # 4. drift meter mid-way
    js(pg, "(() => { const c = new G.Car('muscle', G.player.x, G.player.y, 0); c.keep = true; G.cars.push(c); G.player.x = c.x; G.player.y = c.y; G.enterNearestCar(); })()"); time.sleep(0.5)
    js(pg, "G.missions.active.st.score = 1700"); time.sleep(0.4); pg.screenshot(path=str(OUT / "44_drift_meter.png"))
    js(pg, "G.missions.active.st.score = 99999"); time.sleep(0.9); pg.screenshot(path=str(OUT / "45_medal.png"))
    time.sleep(2.5); pg.screenshot(path=str(OUT / "46_medal_fireworks.png"))
    # 5. objective arrow: next mission marker off-screen
    time.sleep(3); pg.evaluate(f"({look})(G.cam3.yaw + 3.1, 0.3)"); time.sleep(0.8); pg.screenshot(path=str(OUT / "47_arrow.png"))
    print("arrow visible:", js(pg, "document.getElementById('opArrow').style.display"), "| fps:", js(pg, "G.fps"), "| lastError:", js(pg, "G.lastError ? String(G.lastError) : null"))
    b.close()
print("JS ERRORS:", errs or "none")
