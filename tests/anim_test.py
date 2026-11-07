"""Animation check: close-up frames of idle, walk, run, sprint, jump, punch, ko + pedestrians; no runtime errors."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs, results = [], []
def check(name, ok, info=""): results.append(bool(ok)); print(("PASS " if ok else "FAIL ") + name, info, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2.5)
    pg.evaluate("localStorage.clear()"); pg.click("text=NEW GAME"); time.sleep(2.5)
    js = pg.evaluate
    js("G.debug.tp('velvet'); G.debug.setTime(13)"); time.sleep(1)
    # side-on close-up camera that follows the player
    js("""window.__follow = setInterval(() => { const P = G.player, a = P.a + Math.PI / 2;
        G.finale.cam = { px: P.x + Math.cos(a) * 58, py: P.y + Math.sin(a) * 58, pz: (P.z || 0) + 12, lx: P.x, ly: P.y, lz: (P.z || 0) + 10, fov: 50 }; }, 16)""")
    shot = lambda n: pg.screenshot(path=str(OUT / f"{n}.png"))
    time.sleep(1.2); shot("80_anim_idle")
    js("G.cam3.yaw = 0; G.cam3.lastMouse = G.time")
    pg.keyboard.down("KeyW"); time.sleep(0.12); pg.keyboard.up("KeyW"); time.sleep(0.05)
    def hold(keys, secs, name, frames=3):
        for k in keys: pg.keyboard.down(k)
        time.sleep(secs * 0.5)
        for i in range(frames): shot(f"{name}_{i}"); time.sleep(0.11)
        modes = js("G.player.anim && G.player.anim.mode")
        for k in reversed(keys): pg.keyboard.up(k)
        return modes
    m_run = hold(["KeyW"], 1.0, "81_anim_run")
    time.sleep(0.6)
    m_spr = hold(["ShiftLeft", "KeyW"], 1.6, "82_anim_sprint")
    check("locomotion modes", m_run in ("run", "walk", "sprint") and m_spr in ("run", "sprint"), f"{m_run}/{m_spr}")
    time.sleep(0.8); pg.keyboard.press("Space"); time.sleep(0.18); shot("83_anim_jump"); time.sleep(1.2)
    pg.mouse.click(640, 360); time.sleep(0.09); shot("84_anim_punch"); time.sleep(0.6)
    # pedestrians close-up
    js("clearInterval(window.__follow)")
    js("""(() => { const p = G.peds.find(q => q.state === 'walk') || G.peds[0]; window.__ped = p;
        window.__follow = setInterval(() => { const a = p.a + Math.PI / 2; G.finale.cam = { px: p.x + Math.cos(a) * 52, py: p.y + Math.sin(a) * 52, pz: 12, lx: p.x, ly: p.y, lz: 9, fov: 50 }; }, 16); })()""")
    time.sleep(0.8)
    for i in range(4): shot(f"85_anim_ped_walk_{i}"); time.sleep(0.12)
    js("window.__ped.state = 'down'; window.__ped.timer = 5"); time.sleep(1.0); shot("86_anim_ped_ko")
    js("clearInterval(window.__follow); G.finale.cam = null")
    check("no runtime error", not js("G.lastError ? String(G.lastError) : ''"), js("G.lastError ? String(G.lastError) : ''"))
    check("fps", js("G.fps") >= 25, js("G.fps"))
    b.close()
print("ERRORS:", errs[:8] or "none")
print(f"{sum(results)}/{len(results)} checks passed")
