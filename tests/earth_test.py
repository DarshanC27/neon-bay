"""Real UK mode (earth.html): the Google 3D Tiles page boots, asks for a key, lists every UK city and landmark,
draws the car, keeps gameplay keys out of text boxes, and reports a refused key. With GMAPS_KEY set it also drives
on the real tiles in Westminster and checks the car moves on real ground at a playable frame rate."""
import os, sys, time, pathlib, threading, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
KEY = os.environ.get("GMAPS_KEY", "")
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT))); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
errs = []; results = {}
def check(name, ok, info=""): results[name] = bool(ok); print(("PASS " if ok else "FAIL ") + name, info)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        js = pg.evaluate
        pg.goto(f"http://127.0.0.1:{port}/earth.html")
        for _ in range(40):
            if js("!!window.__earth"): break
            time.sleep(0.5)
        check("the page and its CDN modules load", js("!!window.__earth"))
        check("it asks for a Google key first", js("!document.getElementById('keyPanel').hidden"))
        time.sleep(1)
        js("document.getElementById('keyPanel').hidden = true; document.getElementById('menuBtn').click()")
        n = js("document.querySelectorAll('#places li').length")
        check("every UK city and landmark is listed", n >= 70, n)
        pg.fill("#placeSearch", "edin")
        check("searching filters the places", js("[...document.querySelectorAll('#places li b')].some(b => b.textContent.startsWith('Edinburgh'))"))
        pg.keyboard.press("w"); pg.keyboard.press("f")
        check("typing in the search box doesn't drive or fly", js("__earth.P.mode") == "drop")
        js("document.getElementById('closeMenu').click()")
        # show the car on its own (no tiles yet) to check the model renders
        js("__earth.P.mode = 'drive'; __earth.P.pos.set(0, 0, 0); __earth.P.yaw = 0.6; __earth.camera.position.set(-6, 2.5, -5)")
        f0 = js("__earth.stats.frames"); time.sleep(4); pg.screenshot(path=str(OUT / "earth_car.png"))
        check("the car is drawn", js("__earth.stats.frames") > f0, js("__earth.stats.frames") - f0)
        js("__earth.P.mode = 'drop'")
        # a bad key is refused and the player is told why
        js("document.getElementById('keyPanel').hidden = false"); pg.fill("#keyInput", "AIzaSyINVALID-KEY-FOR-TESTING-000000000")
        js("document.getElementById('keyRemember').checked = false"); pg.click("#keyGo")
        for _ in range(30):
            if js("!document.getElementById('keyPanel').hidden"): break
            time.sleep(0.5)
        check("a refused key brings the key panel back", js("!document.getElementById('keyPanel').hidden"), js("document.getElementById('keyMsg').textContent"))
        if KEY:
            js(f"localStorage.setItem('nb_gmaps_key', {KEY!r})"); pg.goto(f"http://127.0.0.1:{port}/earth.html")
            for _ in range(120):
                if js("window.__earth && __earth.P.mode === 'drive'"): break
                time.sleep(0.5)
            check("the car lands on the real ground", js("__earth.P.mode") == "drive")
            p0 = js("__earth.P.pos.clone()"); pg.keyboard.down("w"); time.sleep(4); pg.keyboard.up("w")
            moved = js(f"Math.hypot(__earth.P.pos.x - {p0['x']}, __earth.P.pos.z - {p0['z']})")
            check("it drives on the real streets", moved > 5, round(moved, 1))
            time.sleep(3); pg.screenshot(path=str(OUT / "earth_drive.png"))
            check("frame rate", js("__earth.stats.fps") > 20, round(js("__earth.stats.fps"), 1))
        b.close()
finally:
    srv.shutdown()
bad = [e for e in errs if "googleapis" not in e]
check("no page errors", not bad, bad[:3])
print(f"{sum(results.values())}/{len(results)} passed")
sys.exit(0 if all(results.values()) else 1)
