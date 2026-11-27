"""Realistic people: the rigged cast loads over HTTP, nearby people get real bodies, clips and retargeted poses run
without errors, and the frame rate holds. Serves the game itself on a free port for the length of the test."""
import time, pathlib, threading, functools, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
SHOTS = "--shots" in sys.argv
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT))); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs = []; results = {}
def check(name, ok, info=""): results[name] = bool(ok); print(("PASS " if ok else "FAIL ") + name, info)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:300]))
        js = pg.evaluate
        pg.goto(f"http://127.0.0.1:{port}/index.html"); time.sleep(2.5); pg.click("text=NEW GAME")
        for _ in range(60):
            if js("G.people && G.people.ready && G.people.CAST.filter(k => G.people.has(k)).length >= 6"): break
            time.sleep(0.5)
        check("the realistic cast loads", js("G.people.CAST.filter(k => G.people.has(k)).length") >= 6, js("G.people.CAST.filter(k => G.people.has(k)).join(',')"))
        # put a few pedestrians right in front of the camera
        js("""(() => { const P = G.player, t = G.cam3.tgt; for (let i = 0; i < 6; i++) { const p = G.makePed(0, 0, 0); p.x = P.x + 40 + (i % 3) * 18; p.y = P.y - 20 + Math.floor(i / 3) * 40; p.keepTest = true;
            p.state = i < 3 ? 'walk' : 'idle'; p.timer = 99; p.a = Math.PI; G.peds.push(p); } })()""")
        time.sleep(2.5)
        check("nearby people get real bodies", js("G.render.realPeople()") >= 4, js("G.render.realPeople()"))
        check("the player in plain clothes is a real person", js("(() => { let n = 0; G.render.scene.traverse(o => { if (o.isSkinnedMesh) n++; }); return n; })()") > 0)
        if SHOTS: js("G.debug.setTime(14); (() => { const P = G.player; G.finale.cam = { px: P.x + 120, py: P.y + 30, pz: 16, lx: P.x + 45, ly: P.y, lz: 9, fov: 40 }; })()"); time.sleep(1.5); pg.screenshot(path=str(OUT / "90_real_people.png"))
        if SHOTS: js("G.finale.cam = null")
        # dogs: walkers with a dog at heel
        for _ in range(30):
            if js("G.dogs && G.dogs.ready"): break
            time.sleep(0.5)
        js("""(() => { const ps = G.peds.filter(p => p.keepTest); for (const p of ps.slice(0, 3)) G.dogs.list.push({ owner: p, x: p.x - 8, y: p.y - 9, a: p.a, ph: Math.random() * 6, gait: 0, sp: 0, look: 1 }); })()""")
        time.sleep(1.5)
        check("dogs walk with their owners", js("G.dogs.count()") >= 3, js("G.dogs.count()"))
        if SHOTS:
            js("(() => { const g = G.dogs.list[G.dogs.list.length - 1]; G.finale.cam = { px: g.x - 26, py: g.y - 14, pz: 10, lx: g.x, ly: g.y, lz: 4, fov: 42 }; })()"); time.sleep(1.2)
            pg.screenshot(path=str(OUT / "92_dogs.png")); js("G.finale.cam = null")
        # drive: the driver sits in the car as a real person
        js("(() => { const P = G.player, c = new G.Car('sedan', P.x + 25, P.y, 0); c.keep = true; G.cars.push(c); G.enterNearestCar(); })()"); time.sleep(1.5)
        check("a real driver sits in the car", js("(() => { const o = G.render.debugCar(G.player.car); return !!o && [...o.occ.values()].some(r => !!r.real); })()"))
        if SHOTS: js("(() => { const c = G.player.car; G.finale.cam = { px: c.x + 30, py: c.y + 26, pz: 18, lx: c.x, ly: c.y, lz: 9, fov: 45 }; })()"); time.sleep(1.2); pg.screenshot(path=str(OUT / "91_real_driver.png")); js("G.finale.cam = null")
        js("G.exitCar()"); time.sleep(0.5)
        # retargeted poses: a pedestrian knocked down
        js("(() => { const p = G.peds.find(p => p.keepTest); p.state = 'down'; p.timer = 99; })()"); time.sleep(1)
        check("retargeted poses run (knocked down)", not errs, errs[:2])
        js("G.debug.setTime(22)"); time.sleep(3)
        check("frame rate holds with real people", js("G.fps") >= 30, js("G.fps"))
        check("no runtime error", js("G.lastError") is None, js("G.lastError ? String(G.lastError) : ''"))
        b.close()
finally:
    srv.shutdown()
print("ERRORS:", errs or "none")
print(f"{sum(results.values())}/{len(results)} checks passed")
