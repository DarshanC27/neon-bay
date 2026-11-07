"""iPhone emulation: touch UI, joystick, look-drag, buttons, BACK, portrait warning, UI scaling, no errors."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs, results = [], []
def check(name, ok, info=""): results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name, info, flush=True)
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((ROOT / "index.html").as_uri() + "?touch=1"); time.sleep(2.5)
    js = pg.evaluate
    shot = lambda n: pg.screenshot(path=str(OUT / f"{n}.png"))
    check("touch mode detected", js("G.touch.on && G.settings.mobile"))
    shot("90_mobile_title")
    js("localStorage.clear()"); pg.tap("text=NEW GAME"); time.sleep(3)
    js("G.debug.tp('velvet'); G.debug.setTime(14)"); time.sleep(1)
    # dismiss any opening dialog / cutscene
    for _ in range(12):
        if js("G.state.mode") == "play": break
        pg.mouse.click(420, 200); time.sleep(0.35)
    time.sleep(0.5)
    check("touch UI visible in play", js("document.getElementById('touchUI').classList.contains('on')"), js("G.state.mode"))
    shot("91_mobile_hud")
    # joystick: drag up from the left zone
    x0, y0 = js("[G.player.x, G.player.y]")
    pg.mouse.move(150, 260); pg.mouse.down(); pg.mouse.move(150, 200, steps=5); time.sleep(1.2); shot("92_mobile_joystick")
    moved = js(f"Math.hypot(G.player.x - {x0}, G.player.y - {y0})")
    pg.mouse.up(); time.sleep(0.2)
    check("joystick moves the player", moved > 30, f"moved={moved:.0f}")
    check("joystick released", not js("Input.keys.KeyW"))
    # look: drag on the right side
    yaw0 = js("G.cam3.yaw")
    pg.mouse.move(600, 150); pg.mouse.down(); pg.mouse.move(700, 150, steps=6); pg.mouse.up(); time.sleep(0.2)
    check("drag rotates the camera", abs(js("G.cam3.yaw") - yaw0) > 0.3, f"dyaw={js('G.cam3.yaw') - yaw0:.2f}")
    # jump button
    box = pg.locator("#bJump").bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2); pg.mouse.down(); time.sleep(0.15)
    z = js("G.player.z || 0"); pg.mouse.up(); time.sleep(0.2)
    check("jump button", z > 1 or js("G.player.mode") == "air", f"z={z:.1f}")
    time.sleep(1)
    # crimson suit button
    pg.locator("#tCrimson").dispatch_event("pointerdown"); pg.locator("#tCrimson").dispatch_event("pointerup"); time.sleep(1.8)
    check("suit button -> crimson", js("G.player.hero") == "crimson", js("G.player.hero"))
    check("swing label for web hero", "SWING" in pg.inner_text("#bJump"))
    # map + BACK
    pg.locator("#tMap").dispatch_event("pointerdown"); time.sleep(0.1); pg.locator("#tMap").dispatch_event("pointerup"); time.sleep(0.5)
    check("map opens", js("G.state.mode") == "map")
    check("BACK button shown in menus", js("document.getElementById('tBack').classList.contains('on')"))
    shot("93_mobile_map")
    pg.locator("#tBack").dispatch_event("pointerdown"); time.sleep(0.5)
    check("BACK closes map", js("G.state.mode") == "play", js("G.state.mode"))
    # phone + BACK
    pg.locator("#tPhone").dispatch_event("pointerdown"); time.sleep(0.1); pg.locator("#tPhone").dispatch_event("pointerup"); time.sleep(0.5)
    shot("94_mobile_phone")
    pg.locator("#tBack").dispatch_event("pointerdown"); time.sleep(0.5)
    check("BACK closes phone", js("G.state.mode") == "play", js("G.state.mode"))
    # car: drive with the joystick
    js("(() => { const c = G.cars.filter(c => !c.wreck).sort((a, b) => Math.hypot(a.x - G.player.x, a.y - G.player.y) - Math.hypot(b.x - G.player.x, b.y - G.player.y))[0]; if (c) { G.player.x = c.x + 12; G.player.y = c.y; } })()"); time.sleep(0.3)
    pg.locator("#bCar").dispatch_event("pointerdown"); time.sleep(0.1); pg.locator("#bCar").dispatch_event("pointerup"); time.sleep(0.8)
    incar = js("!!G.player.car")
    if incar:
        pg.mouse.move(150, 260); pg.mouse.down(); pg.mouse.move(150, 190, steps=5)
        spd = 0
        for i in range(6):
            time.sleep(0.25); spd = max(spd, js("G.player.car ? G.player.car.speed : 0"))
            if i == 2: shot("95_mobile_driving")
        pg.mouse.up()
        check("drive with joystick", spd > 20, f"speed={spd:.0f}")
        check("car buttons relabel", "EXIT" in pg.inner_text("#bCar") and "NITRO" in pg.inner_text("#bSprint"))
    else:
        check("entered a car", False)
    # UI scale applied
    z = js("getComputedStyle(document.documentElement).getPropertyValue('--uiz')")
    check("HUD scaled for phone", 0.4 < float(z) < 1, z)
    # portrait
    pg.set_viewport_size({"width": 390, "height": 844}); time.sleep(0.6); shot("96_mobile_portrait")
    check("portrait shows rotate message", js("getComputedStyle(document.getElementById('rotateMsg')).display") == "flex")
    pg.set_viewport_size({"width": 844, "height": 390}); time.sleep(0.4)
    check("manifest + iOS meta", js("!!document.querySelector('link[rel=manifest]') && !!document.querySelector('meta[name=apple-mobile-web-app-capable]')"))
    check("no runtime error", not js("G.lastError ? String(G.lastError) : ''"), js("G.lastError ? String(G.lastError) : ''"))
    b.close()
print("ERRORS:", errs[:8] or "none")
print(f"{sum(results)}/{len(results)} checks passed")
