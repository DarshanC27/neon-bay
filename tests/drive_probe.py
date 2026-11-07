import time, pathlib, json
from playwright.sync_api import sync_playwright
URL = (pathlib.Path(__file__).resolve().parent.parent / "index.html").as_uri()
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.goto(URL); time.sleep(2); pg.click("text=NEW GAME"); time.sleep(1.5)
    pg.evaluate("(() => { const c = G.cars.find(c => c.type==='compact' && c.color==='#ffb703'); G.player.x = c.x; G.player.y = c.y + 30; window._c = c; })()")
    print("car before:", pg.evaluate("({x:_c.x|0,y:_c.y|0,a:_c.a,hp:_c.hp, tile:G.world.tileAt(_c.x,_c.y), blocked:!!G.world.pointBlocked(_c.x,_c.y,10)})"))
    pg.keyboard.press("KeyF"); time.sleep(0.3)
    pg.keyboard.down("KeyW")
    for i in range(10):
        time.sleep(0.25)
        print(pg.evaluate("({t:+G.time.toFixed(2), x:_c.x|0, y:_c.y|0, v:_c.speed|0, vF:_c.vF|0, hp:_c.hp|0, ctrl:JSON.stringify(_c.ctrl), mode:G.state.mode, driver:_c.driver})"))
    pg.keyboard.up("KeyW"); b.close()
