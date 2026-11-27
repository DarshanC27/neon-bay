"""Reduces a static GLB to a game-ready triangle count with three.js's SimplifyModifier (run in headless Chrome),
re-centres it on the ground facing +X, and writes a binary glTF.
Usage: python tools/simplify_model.py <in.glb> <out.glb> <target_triangles> [length_in_game_units]"""
import sys, base64, pathlib, json
from playwright.sync_api import sync_playwright
src, dst, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), int(sys.argv[3])
length = float(sys.argv[4]) if len(sys.argv) > 4 else 0
PAGE = """<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.159.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three"; import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"; import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { SimplifyModifier } from "three/addons/modifiers/SimplifyModifier.js"; import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
window.run = async (b64, target, length) => {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  const g = await new GLTFLoader().parseAsync(buf, "");
  const meshes = []; g.scene.updateMatrixWorld(true); g.scene.traverse((o) => o.isMesh && meshes.push(o));
  const m = meshes[0]; let geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
  const before = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
  for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
  geo = mergeVertices(geo, 1e-4);
  const verts = geo.attributes.position.count, keepV = Math.max(200, Math.round(verts * target / before));
  const simp = new SimplifyModifier().modify(geo, verts - keepV);
  simp.computeVertexNormals();
  // ground it, centre it, make the longest horizontal axis point along +X, scale to the wanted length
  simp.computeBoundingBox(); let bb = simp.boundingBox, sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z;
  if (sz > sx) simp.rotateY(Math.PI / 2);
  simp.computeBoundingBox(); bb = simp.boundingBox;
  simp.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  if (length) { simp.computeBoundingBox(); const s = length / (simp.boundingBox.max.x - simp.boundingBox.min.x); simp.scale(s, s, s); }
  simp.computeBoundingBox();
  const out = new THREE.Mesh(simp, m.material); out.name = "model";
  const glb = await new GLTFExporter().parseAsync(out, { binary: true, maxTextureSize: 1024 });
  let s = ""; const u = new Uint8Array(glb); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return { b64: btoa(s), before, after: (simp.index ? simp.index.count : simp.attributes.position.count) / 3, box: [simp.boundingBox.min.toArray(), simp.boundingBox.max.toArray()] };
};
window.ready = true;
</script>"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True); pg = b.new_page()
    pg.set_content(PAGE); pg.wait_for_function("window.ready === true", timeout=60000)
    r = pg.evaluate("([b, t, l]) => window.run(b, t, l)", [base64.b64encode(src.read_bytes()).decode(), target, length])
    dst.write_bytes(base64.b64decode(r["b64"]))
    print(json.dumps({k: v for k, v in r.items() if k != "b64"}), dst.stat().st_size // 1024, "KB")
    b.close()
