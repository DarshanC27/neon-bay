"""Online multiplayer: two real Chrome players in one room.
Checks connection, seeing each other, smooth interpolation, voice (WebRTC with a fake mic), chat, punches, car contact.
Needs the server running:  python mp_server.py   (default http://localhost:8005; override with MP_URL)
"""
import math, os, pathlib, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
URL = os.environ.get("MP_URL", "http://localhost:8005")
ROOM = "test%d" % (time.time() % 100000)
errs, results = [], []
def check(name, ok, info=""): results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name, info, flush=True)

def wait(fn, timeout=10):
    t = time.time()
    while time.time() - t < timeout:
        if fn(): return True
        time.sleep(0.2)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    pages = []
    for name in ["Alice", "Bob"]:
        ctx = b.new_context(viewport={"width": 1280, "height": 720}, permissions=["microphone"])
        pg = ctx.new_page()
        pg.on("console", lambda m, n=name: m.type == "error" and errs.append(f"{n}: {m.text}"))
        pg.on("pageerror", lambda e, n=name: errs.append(f"{n} pageerror: {e}"))
        pg.goto(f"{URL}/?room={ROOM}&name={name}")
        pages.append(pg)
    A, B = pages
    check("both connect", wait(lambda: A.evaluate("G.net.on") and B.evaluate("G.net.on") and B.evaluate("G.net.peers.size") == 1))
    check("title shows online", "ONLINE" in A.inner_text("#btnOnline"), A.inner_text("#btnOnline"))
    for pg in pages: pg.click("text=NEW GAME")
    time.sleep(2.5)
    A.evaluate("G.debug.tp('velvet')"); B.evaluate("G.debug.tp('velvet'); G.player.x += 60;")
    check("B sees A in the world", wait(lambda: B.evaluate("[...G.net.peers.values()][0].vis")))
    gapf = lambda: B.evaluate("(() => { const p=[...G.net.peers.values()][0]; return Math.hypot(p.x - %f, p.y - %f); })()" % tuple(A.evaluate("[G.player.x, G.player.y]")))
    wait(lambda: gapf() < 30, 3); gap = gapf()
    check("A's position matches on B's screen", gap < 30, f"{gap:.1f} units")
    check("player list shows Alice", "Alice" in B.inner_text("#mpbox"))
    check("time of day synced from host", wait(lambda: abs(A.evaluate("G.state.hour") - B.evaluate("G.state.hour")) < 0.3, 6))

    # ---- smoothness: A drives a car in a circle; B records how A's car moves every frame
    A.evaluate("""(() => { const P=G.player; const c=new G.Car('sports', P.x+40, P.y, 0); G.cars.push(c); G.enterNearestCar(); })()""")
    time.sleep(0.5)
    check("A is in a car", A.evaluate("!!G.player.car"))
    A.keyboard.down("KeyW"); A.keyboard.down("KeyD")
    time.sleep(1.0)
    rec = """window.__trail = []; window.__frames = 0; (function rec(){ const c = %s; window.__frames++; if (c) window.__trail.push([performance.now(), c.x, c.y]); if (window.__frames < 150) requestAnimationFrame(rec); })()"""
    B.evaluate(rec % "(([...G.net.peers.values()][0] || {}).car)"); A.evaluate(rec % "G.player.car")
    time.sleep(3.2)
    A.keyboard.up("KeyW"); A.keyboard.up("KeyD")
    def jerks(tr):  # frames whose speed is way off both neighbours = a visible hitch
        v = [math.hypot(q[1] - p_[1], q[2] - p_[2]) / max(1e-3, (q[0] - p_[0]) / 1000) for p_, q in zip(tr, tr[1:])]
        return v, sum(1 for i in range(1, len(v) - 1) if abs(v[i] - (v[i - 1] + v[i + 1]) / 2) > 0.6 * max(v[i - 1], v[i + 1]) + 60)
    trail = B.evaluate("window.__trail"); vB, jB = jerks(trail); vA, jA = jerks(A.evaluate("window.__trail"))
    if os.environ.get("MP_DEBUG"): print([round(x) for x in vB], [round(x) for x in vA])
    med = sorted(vB)[len(vB) // 2] if vB else 0
    frozen = sum(1 for x in vB if x < 1) if med > 50 else 0
    nfr = B.evaluate("window.__frames")
    check("B renders A's car every frame", len(trail) >= 40 and len(trail) >= nfr - 4, f"{len(trail)}/{nfr} frames")
    check("A's car moves as smoothly on B's screen as on A's own", jB <= jA + 5, f"hitches: B sees {jB}, A itself {jA}, median {med:.0f} u/s")
    check("no stutter/freeze frames", frozen <= 3, f"frozen {frozen}")
    B.screenshot(path=str(OUT / "90_mp_remote_car.png"))

    # ---- car contact: B parks a car right in front of A's car; A drives into it
    A.evaluate("G.player.car.vx = G.player.car.vy = 0")
    time.sleep(0.6)
    B.evaluate("""(() => { const a=[...G.net.peers.values()][0].car, P=G.player; P.x = a.x + Math.cos(a.a)*90; P.y = a.y + Math.sin(a.a)*90 + 25; const c=new G.Car('van', a.x + Math.cos(a.a)*90, a.y + Math.sin(a.a)*90, a.a); G.cars.push(c); G.enterNearestCar(); })()""")
    time.sleep(1.0)
    hp0 = A.evaluate("G.player.car.hp")
    A.keyboard.down("KeyW"); time.sleep(1.6); A.keyboard.up("KeyW")
    gapc = A.evaluate("(() => { const r=[...G.net.peers.values()][0].car, c=G.player.car; return r ? Math.hypot(r.x-c.x, r.y-c.y) : -1; })()")
    check("cars collide instead of driving through each other", gapc > 25, f"centre gap {gapc:.0f}, A car hp {hp0:.0f}->{A.evaluate('G.player.car.hp'):.0f}")

    # ---- punches between players
    for pg in pages: pg.evaluate("G.exitCarForce ? G.exitCarForce() : G.exitCar()")
    time.sleep(0.5)
    A.evaluate("G.debug.tp('velvet'); G.player.a = 0"); B.evaluate("G.debug.tp('velvet'); G.player.x += 18; G.player.hp = 100")
    time.sleep(1.0)
    A.evaluate("G.player.a = 0")
    for _ in range(3): A.keyboard.press("KeyJ"); time.sleep(0.4)
    time.sleep(0.5)
    check("A's punches hurt B", B.evaluate("G.player.hp") < 100, f"B hp {B.evaluate('G.player.hp'):.0f}")
    B.screenshot(path=str(OUT / "91_mp_two_players.png"))

    # ---- voice
    check("voice call connects (WebRTC)", wait(lambda: A.evaluate("[...G.net.voice.pcs.values()].every(c => c.pc.connectionState === 'connected')") and A.evaluate("G.net.voice.pcs.size") == 1, 15))
    check("B receives A's voice stream", wait(lambda: B.evaluate("[...G.net.voice.pcs.values()][0].nodes != null"), 8))
    near = B.evaluate("(() => { const c=[...G.net.voice.pcs.values()][0]; return c.nodes.gain.gain.value; })()")
    B.evaluate("G.player.x += 2500"); time.sleep(1.2)
    far = B.evaluate("(() => { const c=[...G.net.voice.pcs.values()][0]; return c.nodes.gain.gain.value; })()")
    check("proximity voice: loud near, silent far away", near > 0.5 and far < 0.05, f"near {near:.2f} far {far:.3f}")
    B.keyboard.press("KeyY"); time.sleep(0.8)
    party = B.evaluate("(() => { const c=[...G.net.voice.pcs.values()][0]; return c.nodes.gain.gain.value; })()")
    check("party chat (Y): everyone audible", party > 0.5, f"{party:.2f}")
    B.keyboard.press("KeyN"); time.sleep(0.3)
    check("N cycles mic mode to push-to-talk", B.evaluate("G.net.voice.mode") == "ptt" and not B.evaluate("G.net.voice.stream.getAudioTracks()[0].enabled"))
    B.keyboard.down("KeyT"); time.sleep(0.3)
    check("hold T to talk", B.evaluate("G.net.voice.stream.getAudioTracks()[0].enabled")); B.keyboard.up("KeyT")

    # ---- chat
    A.keyboard.press("Enter"); time.sleep(0.3)
    A.keyboard.type("hello bob, wasd should not move me"); A.keyboard.press("Enter")
    check("chat reaches B", wait(lambda: "hello bob" in B.inner_text("#mplog"), 4))
    check("typing in chat doesn't steer the car", A.evaluate("!Input.keys.KeyW"))

    # ---- B rides as A's passenger
    A.evaluate("(() => { const P = G.player; if (P.car) G.exitCar(); const x = 41 * 64, y = 40.5 * 64; G.cars = G.cars.filter(c => Math.hypot(c.x - x, c.y - y) > 300 || c.keep); const c = new G.Car('sedan', x, y, 0, '#e63946'); c.keep = true; G.cars.push(c); P.x = x; P.y = y + 22; P.z = 0; G.enterNearestCar(); })()")
    time.sleep(1.0)
    B.evaluate("(() => { const P = G.player; P.x = 41 * 64; P.y = 40.5 * 64 + 26; P.z = 0; })()")
    time.sleep(0.8); B.keyboard.press("KeyF"); time.sleep(0.8)
    check("B gets in A's car as a passenger (F)", B.evaluate("!!G.player.ride"))
    check("A sees B in the passenger seat", wait(lambda: A.evaluate("G.net.passengersOf(G.player.car).length") == 1, 4))
    hold_s = 2.0; A.keyboard.down("KeyW"); time.sleep(hold_s); A.keyboard.up("KeyW"); time.sleep(0.6)
    gapr = B.evaluate("(() => { const c = G.net.rideCar(); return c ? Math.hypot(c.x - G.player.x, c.y - G.player.y) : 999; })()")
    moved = B.evaluate("G.player.x") - 41 * 64
    check("passenger rides along with the car", gapr < 5 and moved > 150, f"gap {gapr:.1f}, moved {moved:.0f}")
    B.screenshot(path=str(OUT / "92_mp_passenger.png"))
    B.keyboard.press("KeyF"); time.sleep(0.8)
    check("passenger can get out (F)", not B.evaluate("!!G.player.ride") and wait(lambda: A.evaluate("G.net.passengersOf(G.player.car).length") == 0, 4))

    # ---- leave
    A.close(); time.sleep(1.5)
    check("B sees A leave", B.evaluate("G.net.peers.size") == 0)
    check("B becomes host", B.evaluate("G.net.host === G.net.id"))
    check("no JS errors", not errs, errs[:5])
    b.close()
print(f"\n{sum(results)}/{len(results)} passed")
