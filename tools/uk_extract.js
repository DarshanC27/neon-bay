// Builds assets/uk/uk.json from Natural Earth (public domain): the outlines of England, Scotland, Wales and Northern
// Ireland, and the UK's towns and cities with their real positions. Coordinates are kilometres on a flat projection
// centred on the UK (x east, y south, so it reads like a map), coastlines simplified to ~0.3 km.
// Usage: node tools/uk_extract.js <ne_10m_admin_0_map_units.geojson> <ne_10m_populated_places_simple.geojson> <out.json>
const fs = require("fs");
const [unitsF, placesF, outF] = process.argv.slice(2);
const LON0 = -3.2, LAT0 = 54.6, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
const proj = ([lon, lat]) => [+((lon - LON0) * KX).toFixed(3), +(-(lat - LAT0) * KY).toFixed(3)];
function dp(pts, eps) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9; let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(s / 2); };
const units = JSON.parse(fs.readFileSync(unitsF, "utf8")), want = { England: "england", Scotland: "scotland", Wales: "wales", "Northern Ireland": "northern_ireland" };
const nations = [];
for (const f of units.features) {
  const n = want[f.properties.GEOUNIT]; if (!n) continue;
  const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates, rings = [];
  for (const p of polys) { const ring = p[0].map(proj), h = ring.length >> 1, r = dp(ring.slice(0, h + 1), 0.3).concat(dp(ring.slice(h), 0.3).slice(1));
    if (r.length >= 4 && area(r) > 2) rings.push(r); } // closed rings are simplified half by half; islands above 2 km2
  nations.push({ id: n, name: f.properties.GEOUNIT, rings });
}
const places = JSON.parse(fs.readFileSync(placesF, "utf8")).features
  .filter((f) => f.properties.adm0_a3 === "GBR" && (f.properties.pop_max || 0) >= 60000)
  .map((f) => { const [x, y] = proj(f.geometry.coordinates); return { name: f.properties.name, x, y, pop: f.properties.pop_max, capital: !!(f.properties.adm0cap || /Admin-1 capital/.test(f.properties.featurecla || "")) }; })
  .sort((a, b) => b.pop - a.pop);
const out = { source: "Natural Earth (public domain), naturalearthdata.com", projection: { lon0: LON0, lat0: LAT0, unit: "km", x: "east", y: "south" }, nations, places };
fs.mkdirSync(require("path").dirname(outF), { recursive: true });
fs.writeFileSync(outF, JSON.stringify(out));
const pts = nations.reduce((s, n) => s + n.rings.reduce((t, r) => t + r.length, 0), 0);
console.log(nations.map((n) => n.name + ":" + n.rings.length + " rings").join(", "), "|", pts, "points |", places.length, "places |", (fs.statSync(outF).size / 1024 | 0) + " KB");
console.log(places.slice(0, 25).map((p) => p.name + (p.capital ? "*" : "") + "(" + Math.round(p.x) + "," + Math.round(p.y) + ")").join(" "));
