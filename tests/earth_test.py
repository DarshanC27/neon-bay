"""Real UK mode (earth.html) on the free OpenStreetMap world: boots with no key, streams real London (buildings with
real footprints and heights, roads, terrain), spawns the car on a road, drives, stops at a building wall, knows the
street name, lists every UK city and landmark, keeps gameplay keys out of the search box, and holds a frame rate.
Needs internet (OpenFreeMap + AWS Terrain Tiles). Screenshots go to screenshots/earth_*.png."""
import sys, time, pathlib, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT))); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs = []; results = {}
def check(name, ok, info=""): results[name] = bool(ok); print(("PASS " if ok else "FAIL ") + name, info)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        js = pg.evaluate
        pg.add_init_script("try { localStorage.removeItem('nb_gmaps_key'); localStorage.setItem('nb_earth_prefs', JSON.stringify({ place: 'Big Ben & Westminster', quality: 'low' })); } catch (e) {}")
        pg.goto(f"http://127.0.0.1:{port}/earth.html")
        for _ in range(40):
            if js("!!(window.__earth && __earth.world)"): break
            time.sleep(0.5)
        check("boots on the free open map with no key", js("__earth.world && __earth.world.kind") == "osm" and js("document.getElementById('keyPanel').hidden"))
        for _ in range(120):
            if js("__earth.P.mode") == "drive": break
            time.sleep(0.5)
        check("the car lands on a real road in Westminster", js("__earth.P.mode") == "drive", js("__earth.world.failed()"))
        st = js("__earth.world.stats()")
        check("real buildings are built", st.get("buildings", 0) > 500, st)
        time.sleep(4)
        check("the HUD knows the street", bool(js("document.getElementById('near').textContent")), js("document.getElementById('near').textContent"))
        pg.screenshot(path=str(OUT / "earth_street.png"))
        p0 = js("({x: __earth.P.pos.x, z: __earth.P.pos.z})"); pg.keyboard.down("w"); time.sleep(8); pg.keyboard.up("w")
        moved = js(f"Math.hypot(__earth.P.pos.x - {p0['x']}, __earth.P.pos.z - {p0['z']})")
        check("it drives on the real streets", moved > 5, round(moved, 1))
        time.sleep(1.5); pg.screenshot(path=str(OUT / "earth_drive.png"))
        # aim at the nearest building wall and floor it: the car must stop at the wall, not drive through it
        hit = js("""(() => { const P = __earth.P, w = __earth.world; let best = null;
            for (let a = 0; a < 64; a++) { const yaw = a / 64 * Math.PI * 2, d = new P.pos.constructor(Math.sin(yaw), 0, Math.cos(yaw));
              const o = P.pos.clone(); o.y += 0.7; const h = w.ray(o, d, 120); if (h !== null && (!best || h < best.h)) best = { h, yaw }; }
            if (best) { P.yaw = best.yaw; P.v = 0; } return best; })()""")
        if hit:  # put the car 5 m from the wall at 60 mph and let it run
            js(f"(() => {{ const P = __earth.P, d = {hit['h']} - 5; P.pos.x += Math.sin(P.yaw) * d; P.pos.z += Math.cos(P.yaw) * d; P.v = 27; }})()")
            q0 = js("({x: __earth.P.pos.x, z: __earth.P.pos.z})"); time.sleep(3)
            went = js(f"Math.hypot(__earth.P.pos.x - {q0['x']}, __earth.P.pos.z - {q0['z']})")
            left = js(f"(() => {{ const P = __earth.P, o = P.pos.clone(); o.y += 0.7; return __earth.world.ray(o, new P.pos.constructor(Math.sin({hit['yaw']}), 0, Math.cos({hit['yaw']})), 200); }})()")
            check("building walls stop the car", left is not None and went < 8, f"moved {went:.1f} m in 3 s at 60 mph into a wall 5 m away; wall still {left:.1f} m ahead")
        else: check("building walls stop the car", False, "no wall found nearby")
        # fly up for an overview of the real city
        js("document.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyF'}))"); pg.keyboard.press("f")
        time.sleep(0.5); pg.keyboard.down("Space"); time.sleep(3); pg.keyboard.up("Space"); time.sleep(4)
        pg.screenshot(path=str(OUT / "earth_fly.png"))
        check("flying works", js("__earth.P.mode") == "fly" and js("__earth.P.pos.y") > 60, round(js("__earth.P.pos.y")))
        check("frame rate (software GPU in the test)", js("__earth.stats.fps") > 4, round(js("__earth.stats.fps"), 1))
        # places menu
        js("document.getElementById('menuBtn').click()")
        n = js("document.querySelectorAll('#places li').length")
        check("every UK city and landmark is listed", n >= 70, n)
        pg.fill("#placeSearch", "edin")
        check("searching filters the places", js("[...document.querySelectorAll('#places li b')].some(b => b.textContent.startsWith('Edinburgh'))"))
        mode = js("__earth.P.mode"); pg.keyboard.press("f")
        check("typing in the search box doesn't control the game", js("__earth.P.mode") == mode)
        pg.fill("#placeSearch", "Edinburgh Castle"); time.sleep(0.3); pg.click("#places li:has-text('Edinburgh Castle')")
        for _ in range(120):
            if js("__earth.P.mode") == "drive": break
            time.sleep(0.5)
        lat = js("__earth.world.toLatLon(__earth.P.pos).lat")
        check("travel to Edinburgh lands there", js("__earth.P.mode") == "drive" and abs(lat - 55.95) < 0.05, round(lat, 4))
        time.sleep(2); pg.screenshot(path=str(OUT / "earth_edinburgh.png"))
        b.close()
finally:
    srv.shutdown()
check("no page errors", not errs, errs[:3])
print(f"{sum(results.values())}/{len(results)} passed")
sys.exit(0 if all(results.values()) else 1)
