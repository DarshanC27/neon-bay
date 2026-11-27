"""Re-encodes the character textures as WebP (max 1024 px, alpha kept) with headless Chrome's own encoder, then points
the packed GLBs at the .webp files. Usage: python tools/webp_textures.py assets/people"""
import sys, pathlib, base64, json, struct
from playwright.sync_api import sync_playwright
root = pathlib.Path(sys.argv[1]); tex = root / "tex"
files = [f for f in tex.iterdir() if f.suffix in (".png", ".jpg")]
done = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page()
    pg.set_content("<canvas id=c></canvas>")
    for f in files:
        mime = "image/png" if f.suffix == ".png" else "image/jpeg"
        src = "data:%s;base64,%s" % (mime, base64.b64encode(f.read_bytes()).decode())
        out = pg.evaluate("""async ([src, maxS]) => { const im = new Image(); im.src = src; await im.decode();
            const k = Math.min(1, maxS / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
            const c = document.getElementById('c'); c.width = w; c.height = h; const g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
            return c.toDataURL('image/webp', 0.82); }""", [src, 1024])
        data = base64.b64decode(out.split(",", 1)[1])
        dst = f.with_suffix(".webp"); dst.write_bytes(data); done[f.name] = dst.name; f.unlink()
    b.close()
# point the GLBs at the new files
for g in root.glob("*.glb"):
    raw = g.read_bytes(); jl = struct.unpack_from("<I", raw, 12)[0]; j = json.loads(raw[20:20 + jl])
    for im in j.get("images", []):
        u = im.get("uri", ""); name = u.split("/")[-1]
        if name in done: im["uri"] = u[: len(u) - len(name)] + done[name]; im.pop("mimeType", None)
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
    rest = raw[20 + jl:]
    total = 12 + 8 + len(js) + len(rest)
    g.write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest)
print("textures:", len(done), "->", sum(f.stat().st_size for f in tex.iterdir()) // 1024, "KB")
