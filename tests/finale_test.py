"""Finale & meta systems: chapter cut-scene, full ending + credits, skip, achievements, Progress phone app, save/load of achievements."""
import time, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"; OUT.mkdir(exist_ok=True)
errs, results = [], []
def check(name, ok, info=""): results.append(ok); print(("PASS " if ok else "FAIL ") + name, info)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto((ROOT / "index.html").as_uri()); time.sleep(2.5)
    pg.evaluate("localStorage.clear()"); pg.click("text=NEW GAME"); time.sleep(2)
    js = pg.evaluate

    # chapter cut-scene
    js("G.finale.chapter(0, G.campaign.chapters[0], G.campaign.chapters[1])"); time.sleep(1.5)
    check("chapter cine mode", js("G.state.mode") == "cine" and js("!!G.finale.cam"))
    pg.screenshot(path=str(OUT / "50_chapter_cine.png"))
    time.sleep(6)
    check("chapter cine ends by itself", js("G.state.mode") == "play" and not js("G.finale.active()"))

    # achievements fire as progress is made
    js("for (let i = 0; i < 50; i++) G.state.ops[i] = 3"); time.sleep(8)
    ach = js("Object.keys(G.state.ach)")
    check("achievements unlock", {"first", "ten", "half", "gold1", "gold25"} <= set(ach), ach)
    check("achievement card shown", js("document.querySelectorAll('.achCard').length") >= 1)
    pg.screenshot(path=str(OUT / "51_achievement.png"))

    # progress phone app
    pg.keyboard.press("KeyP"); time.sleep(0.6)
    js("G.finale.phone()"); time.sleep(0.6)
    txt = pg.inner_text("body")
    check("progress app lists achievements", "Completion" in txt and "Golden Touch" in txt)
    pg.screenshot(path=str(OUT / "52_progress_app.png"))
    pg.keyboard.press("KeyP"); time.sleep(0.4)

    # full ending: unlock all, play, capture shots, then let it run its course
    js("for (let i = 0; i < 100; i++) G.state.ops[i] = 3; G.ui.togglePhone && G.state.mode !== 'play' && G.ui.togglePhone(false)")
    js("G.finale.play()"); time.sleep(2)
    check("finale running", js("G.state.mode") == "cine" and js("G.state.hour") > 21)
    for k, w in enumerate([3, 7, 8, 9]):
        time.sleep(w); pg.screenshot(path=str(OUT / f"5{3 + k}_finale_{k + 1}.png"))
    check("credits roll", "NEON BAY" in pg.inner_text("#cine") and "Missions completed" in pg.inner_text("#cine"))
    fps = js("G.fps"); check("finale fps", fps >= 20, f"fps={fps}")
    time.sleep(13)
    check("finale ends to free roam", js("G.state.mode") == "play" and js("G.state.endingSeen") is True)
    pg.screenshot(path=str(OUT / "57_after_ending.png"))

    # skip works
    js("G.finale.play()"); time.sleep(1.5); pg.keyboard.press("Escape"); time.sleep(0.5)
    check("finale skippable", js("G.state.mode") == "play" and not js("G.finale.active()"))

    # save / load
    js("G.save()"); n = js("Object.keys(G.state.ach).length")
    pg.reload(); time.sleep(2.5); pg.click("#btnContinue"); time.sleep(2)
    check("achievements persist", js("Object.keys(G.state.ach).length") == n and js("G.state.endingSeen") is True, f"n={n}")
    check("no runtime error", not js("G.lastError ? String(G.lastError) : ''"))
    b.close()
print("ERRORS:", errs or "none")
print(f"{sum(results)}/{len(results)} checks passed")
