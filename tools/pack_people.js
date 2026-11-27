// Packs ara3d character exports (CC0, MakeHuman-based) for the web game:
//  - drops parts nobody sees at game distance (teeth, tongue) and face morph targets
//  - quantizes vertex data (KHR_mesh_quantization): normals int8, UVs uint16, skin joints/weights uint8
//  - moves textures out to content-hashed files shared by every character (eyes, hair, shoes... download once)
//  - keeps animations only where asked (one shared clip library; every character has the same skeleton)
// Usage: node tools/pack_people.js <in.glb> <out.glb> <texDir> [--keep-anims] [--anims-only]
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [inF, outF, texDir] = process.argv.slice(2), keepAnims = process.argv.includes("--keep-anims"), animsOnly = process.argv.includes("--anims-only");
const src = fs.readFileSync(inF), jl = src.readUInt32LE(12), j = JSON.parse(src.slice(20, 20 + jl).toString());
const binStart = 20 + jl + 8, bin = src.slice(binStart, binStart + src.readUInt32LE(20 + jl));
const viewBytes = (i) => { const v = j.bufferViews[i]; return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }, CB = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function readAcc(i) { // -> { arr: Float64Array (or ints), n, comps }
  const a = j.accessors[i], v = j.bufferViews[a.bufferView], n = a.count, comps = SIZE[a.type], cb = CB[a.componentType], stride = v.byteStride || comps * cb;
  const buf = bin, base = (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(n * comps);
  const rd = { 5120: (o) => buf.readInt8(o), 5121: (o) => buf.readUInt8(o), 5122: (o) => buf.readInt16LE(o), 5123: (o) => buf.readUInt16LE(o), 5125: (o) => buf.readUInt32LE(o), 5126: (o) => buf.readFloatLE(o) }[a.componentType];
  for (let k = 0; k < n; k++) for (let c = 0; c < comps; c++) out[k * comps + c] = rd(base + k * stride + c * cb);
  if (a.normalized) { const d = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType]; for (let k = 0; k < out.length; k++) out[k] = Math.max(-1, out[k] / d); }
  return { arr: out, n, comps, a };
}
// ---- new binary
const chunks = []; let off = 0;
const newViews = [], newAccs = [];
function pushView(buf, target, stride) { const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } const v = { buffer: 0, byteOffset: off, byteLength: buf.length }; if (target) v.target = target; if (stride) v.byteStride = stride; chunks.push(buf); off += buf.length; newViews.push(v); return newViews.length - 1; }
function addAcc(acc) { newAccs.push(acc); return newAccs.length - 1; }
function copyAcc(i, target) { // unchanged accessor, repacked tightly
  const a = j.accessors[i], v = j.bufferViews[a.bufferView], comps = SIZE[a.type], cb = CB[a.componentType], el = comps * cb, stride = v.byteStride || el;
  const base = (v.byteOffset || 0) + (a.byteOffset || 0), buf = Buffer.alloc(a.count * el);
  for (let k = 0; k < a.count; k++) bin.copy(buf, k * el, base + k * stride, base + k * stride + el); // raw element bytes, de-interleaved
  const o = { bufferView: pushView(buf, target), componentType: a.componentType, count: a.count, type: a.type }; if (a.min) o.min = a.min; if (a.max) o.max = a.max; if (a.normalized) o.normalized = true;
  return addAcc(o);
}
const qCache = new Map();
function quant(i, kind) { const key = i + kind; if (!qCache.has(key)) qCache.set(key, quant0(i, kind)); return qCache.get(key); }
function quant0(i, kind) {
  const r = readAcc(i), n = r.n, c = r.comps;
  if (kind === "normal") { const b = Buffer.alloc(n * 4); for (let k = 0; k < n; k++) for (let q = 0; q < 3; q++) b.writeInt8(Math.round(Math.max(-1, Math.min(1, r.arr[k * 3 + q])) * 127), k * 4 + q); return addAcc({ bufferView: pushView(b, 34962, 4), componentType: 5120, normalized: true, count: n, type: "VEC3" }); }
  if (kind === "uv") { let ok = true; for (const v of r.arr) if (v < 0 || v > 1) { ok = false; break; } if (!ok) return copyAcc(i, 34962); const b = Buffer.alloc(n * 4); for (let k = 0; k < n * 2; k++) b.writeUInt16LE(Math.round(r.arr[k] * 65535), k * 2); return addAcc({ bufferView: pushView(b, 34962), componentType: 5123, normalized: true, count: n, type: "VEC2" }); }
  if (kind === "joints") { const b = Buffer.alloc(n * 4); for (let k = 0; k < n * 4; k++) b.writeUInt8(r.arr[k], k); return addAcc({ bufferView: pushView(b, 34962), componentType: 5121, count: n, type: "VEC4" }); }
  if (kind === "weights") { // uint8, renormalised so each vertex still sums to exactly 255
    const b = Buffer.alloc(n * 4);
    for (let k = 0; k < n; k++) { const w = [0, 1, 2, 3].map((q) => r.arr[k * 4 + q]), s = w.reduce((x, y) => x + y, 0) || 1, q8 = w.map((x) => Math.round(x / s * 255)); let d = 255 - q8.reduce((x, y) => x + y, 0); const big = q8.indexOf(Math.max(...q8)); q8[big] += d; q8.forEach((v, q) => b.writeUInt8(Math.max(0, v), k * 4 + q)); }
    return addAcc({ bufferView: pushView(b, 34962), componentType: 5121, normalized: true, count: n, type: "VEC4" });
  }
}
const DROP = /^(teeth|tongue)/i;
const accMap = new Map(), keep = (i, target) => { if (!accMap.has(i)) accMap.set(i, copyAcc(i, target)); return accMap.get(i); };
// meshes
if (!animsOnly) for (const m of j.meshes) {
  m.primitives = m.primitives.filter((p) => !(p.material != null && DROP.test(j.materials[p.material].name || "")));
  for (const p of m.primitives) {
    const at = {};
    for (const k in p.attributes) {
      const i = p.attributes[k];
      at[k] = k === "NORMAL" ? quant(i, "normal") : k.startsWith("TEXCOORD") ? quant(i, "uv") : k.startsWith("JOINTS") ? quant(i, "joints") : k.startsWith("WEIGHTS") ? quant(i, "weights") : k === "TANGENT" ? null : keep(i, 34962);
      if (at[k] === null) delete at[k];
    }
    p.attributes = at; if (p.indices != null) p.indices = keep(p.indices, 34963); delete p.targets;
  }
  delete m.weights; if (m.extras) delete m.extras.targetNames;
}
if (animsOnly) { j.meshes = []; }
// skins
for (const s of j.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = keep(s.inverseBindMatrices);
// animations: rotations for every bone, translation only for the hips (each body keeps its own bone lengths)
if (keepAnims || animsOnly) {
  for (const a of j.animations || []) {
    a.channels = a.channels.filter((c) => c.target.node != null && (c.target.path === "rotation" || (c.target.path === "translation" && j.nodes[c.target.node].name === "Hips")));
    const used = [...new Set(a.channels.map((c) => c.sampler))], remap = new Map(used.map((s, k) => [s, k]));
    a.samplers = used.map((s) => { const sp = a.samplers[s]; return { input: keep(sp.input), output: keep(sp.output), interpolation: sp.interpolation }; });
    for (const c of a.channels) c.sampler = remap.get(c.sampler);
  }
} else delete j.animations;
// textures -> shared external files named by content hash
fs.mkdirSync(texDir, { recursive: true });
const rel = path.relative(path.dirname(outF), texDir).split(path.sep).join("/");
if (animsOnly) { j.images = []; j.textures = []; j.materials = []; j.samplers = []; }
// only images that a kept primitive's material can reach get written (teeth, tongue... are never requested)
const usedImg = new Set();
if (!animsOnly) { const mats = new Set(); for (const m of j.meshes) for (const p of m.primitives) if (p.material != null) mats.add(p.material);
  const walk = (o) => { if (o && typeof o === "object") { if (typeof o.index === "number" && o.texCoord !== undefined || (o.index !== undefined && Object.keys(o).length <= 4 && typeof o.index === "number")) { const t = j.textures[o.index]; if (t) usedImg.add(t.source); } for (const k in o) walk(o[k]); } };
  for (const mi of mats) walk(j.materials[mi]); }
for (const [ii, im] of (j.images || []).entries()) {
  if (im.bufferView == null) continue;
  if (!usedImg.has(ii)) { delete im.bufferView; im.uri = "unused.png"; continue; }
  const data = viewBytes(im.bufferView), ext = im.mimeType === "image/png" ? "png" : "jpg", h = crypto.createHash("sha1").update(data).digest("hex").slice(0, 16), name = h + "." + ext;
  const dst = path.join(texDir, name); if (!fs.existsSync(dst)) fs.writeFileSync(dst, data);
  delete im.bufferView; im.uri = (rel ? rel + "/" : "") + name;
}
// mesh-less nodes that pointed at dropped meshes
if (animsOnly) for (const nd of j.nodes) { delete nd.mesh; delete nd.skin; }
j.accessors = newAccs; j.bufferViews = newViews; j.buffers = [{ byteLength: off }];
const used = new Set(j.extensionsUsed || []); if (!animsOnly) used.add("KHR_mesh_quantization");
j.extensionsUsed = [...used]; if (!animsOnly) j.extensionsRequired = [...new Set([...(j.extensionsRequired || []), "KHR_mesh_quantization"])];
const outBin = Buffer.concat(chunks.concat([Buffer.alloc((4 - (off % 4)) % 4)])); j.buffers[0].byteLength = outBin.length;
let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + outBin.length, 8);
const c1 = Buffer.alloc(8); c1.writeUInt32LE(js.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
const c2 = Buffer.alloc(8); c2.writeUInt32LE(outBin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(outF, Buffer.concat([head, c1, js, c2, outBin]));
console.log(path.basename(outF), (src.length / 1048576).toFixed(1) + " MB ->", ((12 + 16 + js.length + outBin.length) / 1048576).toFixed(2) + " MB (+ shared textures)");
