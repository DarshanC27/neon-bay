// Converts an OpenStreetMap extract (Overpass "out geom" JSON) into a compact city file for the game:
// roads as centre-lines with real carriageway widths, buildings as real footprints with real heights, parks and water.
// Coordinates are metres on a local flat projection (x east, y south) around the extract's centre.
// Data (c) OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright): keep the attribution.
// Usage: node tools/osm_city.js <overpass.json> <out.json> <name>
const fs = require("fs");
const [inF, outF, name] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(inF, "utf8"));
let la0 = 0, lo0 = 0, n = 0;
for (const e of j.elements) if (e.geometry) for (const g of e.geometry) { la0 += g.lat; lo0 += g.lon; n++; }
la0 /= n; lo0 /= n;
const KX = 111320 * Math.cos(la0 * Math.PI / 180), KY = 110570;
const P = (g) => [Math.round((g.lon - lo0) * KX * 10) / 10, Math.round(-(g.lat - la0) * KY * 10) / 10];
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9; let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
// carriageway width (m) and lanes by road class; footways are kept as pavements/paths
const ROAD = { motorway: [14, 3], trunk: [13, 2], primary: [12, 2], secondary: [10, 2], tertiary: [9, 2], unclassified: [7, 1], residential: [7, 1], living_street: [6, 1],
  service: [4.5, 1], primary_link: [7, 1], secondary_link: [7, 1], tertiary_link: [6.5, 1], trunk_link: [7, 1], motorway_link: [7, 1], pedestrian: [6, 0] };
const PATH = { footway: 2.5, path: 2, cycleway: 2.5, steps: 2.5 };
const roads = [], paths = [], buildings = [], parks = [], water = [];
for (const e of j.elements) {
  const t = e.tags || {};
  if (e.type === "way" && e.geometry) {
    const pts = e.geometry.map(P);
    if (t.highway && ROAD[t.highway] && !t.area) {
      const [w, lanes] = ROAD[t.highway], width = t.width && !isNaN(+t.width) ? Math.min(30, +t.width) : t.lanes && !isNaN(+t.lanes) ? Math.max(w, +t.lanes * 3.4) : w;
      roads.push({ k: t.highway, w: width, one: t.oneway === "yes" ? 1 : 0, n: t.name || "", p: dp(pts, 0.6).flat() });
    } else if (t.highway && PATH[t.highway] && t.layer !== "-1" && t.tunnel !== "yes" && t.indoor !== "yes") paths.push({ w: PATH[t.highway], p: dp(pts, 0.6).flat() });
    else if (t.building && pts.length >= 4) {
      const lv = parseFloat(t["building:levels"]), hm = parseFloat(t.height), area = Math.abs(pts.reduce((s, q, i) => { const r = pts[(i + 1) % pts.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2);
      const h = !isNaN(hm) ? hm : !isNaN(lv) ? lv * 3.3 + 1 : area > 1500 ? 24 : area > 300 ? 19 : 13; // central London: mostly 5-7 storeys
      buildings.push({ h: Math.round(h * 10) / 10, real: !isNaN(hm) || !isNaN(lv) ? 1 : 0, kind: t.building, n: t.name || "", p: dp(pts.slice(0, -1), 0.25).flat() });
    } else if ((t.leisure === "park" || t.landuse === "grass") && pts.length >= 4) parks.push({ p: dp(pts.slice(0, -1), 0.8).flat() });
    else if (t.natural === "water" && pts.length >= 4) water.push({ p: dp(pts.slice(0, -1), 0.8).flat() });
  } else if (e.type === "relation" && t.natural === "water" && e.members) {
    for (const m of e.members) if (m.role === "outer" && m.geometry) water.push({ p: dp(m.geometry.map(P), 0.8).flat() });
  }
}
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
for (const r of roads) for (let i = 0; i < r.p.length; i += 2) { x0 = Math.min(x0, r.p[i]); x1 = Math.max(x1, r.p[i]); y0 = Math.min(y0, r.p[i + 1]); y1 = Math.max(y1, r.p[i + 1]); }
const out = { name, attribution: "© OpenStreetMap contributors (ODbL)", origin: { lat: +la0.toFixed(6), lon: +lo0.toFixed(6) }, unit: "m", bounds: [x0, y0, x1, y1].map(Math.round), roads, paths, buildings, parks, water };
fs.writeFileSync(outF, JSON.stringify(out));
console.log(name, "roads", roads.length, "paths", paths.length, "buildings", buildings.length, "(" + buildings.filter((b) => b.real).length + " real heights)", "parks", parks.length, "water", water.length, "|", Math.round(x1 - x0) + " x " + Math.round(y1 - y0) + " m |", (fs.statSync(outF).size / 1024 | 0) + " KB");
