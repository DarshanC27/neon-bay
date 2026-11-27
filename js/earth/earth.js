// Neon Bay: Real UK mode. Drive or fly anywhere in the United Kingdom on Google's Photorealistic 3D Tiles (the real
// buildings, roads, terrain and landmarks, streamed as you move). The car's ground and walls come straight from the
// tile meshes by ray casting, so every street, bridge and hill in the UK is drivable with no map of our own.
//
// Frames: the tiles are re-oriented so a chosen lat/lon sits at the origin with +Y up (local east-north-up). When the
// player gets far from the origin the frame is moved under them (recenter), so float precision stays good everywhere.
import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, ReorientationPlugin, UnloadTilesPlugin } from "3d-tiles-renderer/plugins";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "three/addons/objects/Sky.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";
import { buildCar, CAR_TYPES } from "./car_model.js";

// ray casts against the city use a BVH per tile mesh (built a few per frame as tiles stream in), so the car's ground
// and wall probes test a handful of triangles instead of every triangle in view
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const KEY_STORE = "nb_gmaps_key", PREF_STORE = "nb_earth_prefs";
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

// ---------- places: every UK city (Natural Earth list shipped with the game) plus famous landmarks ----------
const LANDMARKS = [
  ["Big Ben & Westminster", 51.5007, -0.1246, 200], ["Tower Bridge", 51.5055, -0.0754, 0], ["Buckingham Palace", 51.5014, -0.1419, 90],
  ["Piccadilly Circus", 51.5101, -0.1342, 0], ["Wembley Stadium", 51.556, -0.2796, 0], ["Windsor Castle", 51.4839, -0.6044, 0],
  ["Stonehenge", 51.1789, -1.8262, 0], ["White Cliffs of Dover", 51.134, 1.358, 0], ["Brighton Palace Pier", 50.8169, -0.1367, 0],
  ["Oxford, Radcliffe Camera", 51.7534, -1.254, 0], ["Cambridge, King's College", 52.2043, 0.1149, 0], ["Bath, Royal Crescent", 51.3871, -2.3676, 0],
  ["Liverpool Pier Head", 53.4046, -2.9967, 0], ["Old Trafford, Manchester", 53.4631, -2.2913, 0], ["Blackpool Tower", 53.8159, -3.0553, 0],
  ["Angel of the North", 54.9141, -1.5895, 0], ["York Minster", 53.9623, -1.0819, 0], ["Lake Windermere", 54.38, -2.91, 0],
  ["Edinburgh Castle", 55.9486, -3.1999, 0], ["Glasgow, George Square", 55.8611, -4.2502, 0], ["Loch Ness, Urquhart Castle", 57.324, -4.4419, 0],
  ["Ben Nevis", 56.7969, -5.0036, 0], ["Cardiff Castle", 51.4822, -3.1812, 0], ["Snowdon (Yr Wyddfa)", 53.0685, -4.0763, 0],
  ["Belfast City Hall", 54.5964, -5.93, 0], ["Giant's Causeway", 55.2408, -6.5116, 0],
].map(([name, lat, lon, hdg]) => ({ name, lat, lon, hdg, kind: "landmark" }));
let PLACES = LANDMARKS.slice();
async function loadCities() {
  try {
    const uk = await (await fetch("assets/uk/uk.json")).json(), pr = uk.projection;
    const KX = 111.32 * Math.cos(pr.lat0 * D2R), KY = 110.57; // inverse of tools/uk_extract.js
    const cities = uk.places.map((p) => ({ name: p.name, lat: pr.lat0 - p.y / KY, lon: pr.lon0 + p.x / KX, pop: p.pop, kind: "city", hdg: 0 }));
    PLACES = cities.concat(LANDMARKS);
  } catch (e) { /* landmarks only */ }
  renderPlaceList("");
}
function haversine(a, b, c, d) { const dl = (c - a) * D2R, dn = (d - b) * D2R, s = Math.sin(dl / 2) ** 2 + Math.cos(a * D2R) * Math.cos(c * D2R) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(s)); }
function nearestPlace(lat, lon) { let best = null, bd = 1e9; for (const p of PLACES) { if (p.kind !== "city") continue; const d = haversine(lat, lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; }

// ---------- renderer, scene, sky ----------
const isTouch = matchMedia("(pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: "high-performance" });
const PR_MAX = Math.min(devicePixelRatio, isTouch ? 1.25 : 1.5);
let pixelRatio = PR_MAX;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
$("view").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 3e4);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sky = new Sky(); sky.scale.setScalar(3e4); scene.add(sky);
const sun = new THREE.Vector3().setFromSphericalCoords(1, (90 - 35) * D2R, 200 * D2R);
Object.assign(sky.material.uniforms.turbidity, { value: 6 }); sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004; sky.material.uniforms.sunPosition.value.copy(sun);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a5348, 1.1));
const sunLight = new THREE.DirectionalLight(0xfff1dd, 2.2); sunLight.position.copy(sun).multiplyScalar(100); scene.add(sunLight);

// soft contact shadow under the car (the tiles are unlit photo-textures, so this is what grounds the car)
const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
blob.rotation.x = -Math.PI / 2; scene.add(blob);

// ---------- prefs ----------
const prefs = Object.assign({ quality: isTouch ? "low" : "medium", car: "sports", color: "#c1121f", place: "Big Ben & Westminster" }, (() => { try { return JSON.parse(store.get(PREF_STORE) || "{}"); } catch (e) { return {}; } })());
const savePrefs = () => store.set(PREF_STORE, JSON.stringify(prefs));
const QUALITY = { low: 40, medium: 24, high: 14 }; // tiles errorTarget: higher = fewer, coarser tiles

// ---------- the car ----------
let car = null;
function makeCar() {
  if (car) scene.remove(car.root);
  car = buildCar(prefs.car, prefs.color); scene.add(car.root);
  blob.scale.set(car.length * 1.25, car.width * 1.6, 1);
}
makeCar();

// ---------- tiles ----------
let tiles = null, reorient = null, origin = { lat: 51.5007 * D2R, lon: -0.1246 * D2R };
const axes = { east: new THREE.Vector3(1, 0, 0), north: new THREE.Vector3(0, 0, 1) };
let authFailed = false;
function startTiles(key) {
  if (tiles) { scene.remove(tiles.group); tiles.dispose(); }
  authFailed = false;
  tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
  const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/");
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  reorient = new ReorientationPlugin({ lat: origin.lat, lon: origin.lon, height: 0 });
  tiles.registerPlugin(reorient);
  tiles.errorTarget = QUALITY[prefs.quality] || 12;
  tiles.lruCache.minSize = isTouch ? 600 : 1500; tiles.lruCache.maxSize = isTouch ? 1200 : 3000;
  tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
  tiles.addEventListener("load-model", (e) => e.scene.traverse((o) => { if (o.isMesh) bvhQueue.push(o.geometry); }));
  tiles.addEventListener("dispose-model", (e) => e.scene.traverse((o) => { if (o.isMesh && o.geometry.boundsTree) o.geometry.disposeBoundsTree(); }));
  tiles.addEventListener("load-root-tileset", () => { computeAxes(); toast("Connected to Google 3D Tiles"); });
  tiles.addEventListener("load-error", (e) => {
    const msg = String((e && (e.error && e.error.message)) || e.error || "");
    if ((!tiles.root || /40\d|denied|forbidden|unauthori|invalid|permission/i.test(msg)) && !authFailed) { authFailed = true; showKeyPanel("Google refused the key: " + msg.slice(0, 160)); }
  });
  scene.add(tiles.group);
}
function computeAxes() {
  if (!tiles) return;
  const e = tiles.ellipsoid, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = tiles.group.matrixWorld;
  e.getCartographicToPosition(origin.lat, origin.lon, 0, a); e.getCartographicToPosition(origin.lat + 1e-5, origin.lon, 0, b); e.getCartographicToPosition(origin.lat, origin.lon + 1e-5, 0, c);
  a.applyMatrix4(m); b.applyMatrix4(m); c.applyMatrix4(m);
  axes.north.copy(b).sub(a).setY(0).normalize(); axes.east.copy(c).sub(a).setY(0).normalize();
}
function localToLatLon(v) {
  const inv = tiles.group.matrixWorld.clone().invert(), p = v.clone().applyMatrix4(inv), out = {};
  tiles.ellipsoid.getPositionToCartographic(p, out); return out; // radians
}

const bvhQueue = [];
function buildBVHs(budgetMs) { // spread BVH builds over frames so streaming never stalls a frame
  const t0 = performance.now();
  while (bvhQueue.length && performance.now() - t0 < budgetMs) { const g = bvhQueue.shift(); if (!g.boundsTree && g.index !== undefined && g.attributes.position) { try { g.computeBoundsTree(); } catch (e) { /* skip odd tiles */ } } }
}
// ---------- ray casting against the real world ----------
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0), tmpO = new THREE.Vector3();
let rayCount = 0;
function castDown(x, y, z, far) {
  if (!tiles) return null; rayCount++;
  ray.set(tmpO.set(x, y, z), DOWN); ray.far = far;
  const hit = ray.intersectObject(tiles.group, true); return hit.length ? hit[0] : null;
}
function castDir(o, dir, far) {
  if (!tiles) return null; rayCount++;
  ray.set(o, dir); ray.far = far;
  const hit = ray.intersectObject(tiles.group, true); return hit.length ? hit[0] : null;
}

// ---------- player state ----------
const P = {
  mode: "drop", // drop: waiting for the ground to stream in under a new place; drive; fly
  pos: new THREE.Vector3(0, 300, 0), yaw: 0, v: 0, vy: 0, pitch: 0, roll: 0, steer: 0, grounded: false,
  dropT: 0, dropHdg: 0, noGround: 0, crashT: 0, flyPitch: 0, spin: 0,
};
const fwd = () => new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
function headingToYaw(deg) { // compass heading (0 = north, 90 = east) -> local yaw
  const h = deg * D2R, d = axes.north.clone().multiplyScalar(Math.cos(h)).add(axes.east.clone().multiplyScalar(Math.sin(h)));
  return Math.atan2(d.x, d.z);
}
function yawToHeading() { const f = fwd(); return (Math.atan2(f.dot(axes.east), f.dot(axes.north)) * R2D + 360) % 360; }

function goTo(place) {
  origin = { lat: place.lat * D2R, lon: place.lon * D2R };
  if (reorient) { reorient.lat = origin.lat; reorient.lon = origin.lon; if (tiles.root) reorient.transformLatLonHeightToOrigin(origin.lat, origin.lon, 0); }
  computeAxes();
  P.mode = "drop"; P.pos.set(0, 400, 0); P.v = 0; P.vy = 0; P.dropT = 0; P.dropHdg = place.hdg || 0;
  camera.position.set(0, 700, -500); camera.lookAt(0, 0, 0);
  prefs.place = place.name; savePrefs();
  $("placeName").textContent = place.name; toast("Travelling to " + place.name + "…");
  closeMenu();
}
// keep the origin under the player so the numbers stay small (float precision) anywhere in the UK
function recenter() {
  const old = tiles.group.matrixWorld.clone(), c = localToLatLon(P.pos);
  const f = fwd();
  origin = { lat: c.lat, lon: c.lon }; reorient.lat = c.lat; reorient.lon = c.lon;
  reorient.transformLatLonHeightToOrigin(c.lat, c.lon, 0);
  const delta = tiles.group.matrixWorld.clone().multiply(old.invert());
  P.pos.applyMatrix4(delta); camera.position.applyMatrix4(delta); camLook.applyMatrix4(delta);
  f.transformDirection(delta); P.yaw = Math.atan2(f.x, f.z);
  computeAxes();
}

// ---------- input: keyboard, gamepad, touch ----------
const keys = new Set();
const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable); };
addEventListener("keydown", (e) => {
  if (typing()) { if (e.key === "Escape") e.target.blur(); return; }
  keys.add(e.code); audio.start();
  if (e.code === "KeyF") toggleFly();
  if (e.code === "KeyM" || e.code === "Tab") { e.preventDefault(); toggleMenu(); }
  if (e.code === "Escape") closeMenu();
  if (e.code === "KeyR") resetCar();
  if (e.code === "KeyV") camMode = (camMode + 1) % 3;
  if (e.code === "KeyT") cycleCar();
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
const touch = { gas: 0, brake: 0, left: 0, right: 0, up: 0, down: 0 };
for (const b of document.querySelectorAll("[data-t]")) {
  const k = b.dataset.t;
  const on = (e) => { e.preventDefault(); touch[k] = 1; b.classList.add("on"); audio.start(); }, off = (e) => { e.preventDefault(); touch[k] = 0; b.classList.remove("on"); };
  b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointercancel", off); b.addEventListener("pointerleave", off);
}
const padPrev = {};
function readInput() {
  const k = (c) => keys.has(c);
  let thr = (k("KeyW") || k("ArrowUp") || touch.gas ? 1 : 0) - (k("KeyS") || k("ArrowDown") || touch.brake ? 1 : 0);
  let steer = (k("KeyD") || k("ArrowRight") || touch.right ? 1 : 0) - (k("KeyA") || k("ArrowLeft") || touch.left ? 1 : 0);
  let lift = (k("Space") || touch.up ? 1 : 0) - (k("KeyC") || k("ControlLeft") || touch.down ? 1 : 0);
  let hand = k("Space"), boost = k("ShiftLeft") || k("ShiftRight");
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, bt = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0), pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (Math.abs(ax) > 0.12) steer = ax;
    const t = bt(7) - bt(6); if (Math.abs(t) > 0.05) thr = t;
    if (Math.abs(gp.axes[3] || 0) > 0.2) lift = -(gp.axes[3]);
    if (pressed(0)) hand = true; if (pressed(1)) boost = true;
    const edge = (i, fn) => { const p = pressed(i); if (p && !padPrev[gp.index + ":" + i]) fn(); padPrev[gp.index + ":" + i] = p; };
    edge(3, toggleFly); edge(9, toggleMenu); edge(2, resetCar); edge(5, () => (camMode = (camMode + 1) % 3));
  }
  return { thr, steer, lift, hand: P.mode === "drive" && hand, boost };
}

// ---------- simulation ----------
const MAX_V = 100, ACC = 15, BRAKE = 24, REV_MAX = 16; // m/s: 100 = 224 mph, boost 125 = 280 mph
function toggleFly() {
  if (P.mode === "drive") { P.mode = "fly"; P.pos.y += 40; P.v = Math.max(P.v, 40); P.flyPitch = 0; toast("Flying: W/S speed, A/D turn, Space/C climb and dive. F to land."); }
  else if (P.mode === "fly") { P.mode = "drop"; P.dropT = 0; P.dropHdg = yawToHeading(); P.v = 0; toast("Landing…"); }
}
function resetCar() { if (P.mode === "drive") { P.mode = "drop"; P.dropT = 0.8; P.dropHdg = yawToHeading(); P.v = 0; P.pos.y += 20; } }
function cycleCar() { prefs.car = CAR_TYPES[(CAR_TYPES.indexOf(prefs.car) + 1) % CAR_TYPES.length]; savePrefs(); makeCar(); toast("Car: " + prefs.car); }

function stepDrop(dt) {
  P.dropT += dt;
  const hit = castDown(P.pos.x, 3000, P.pos.z, 6000);
  if (hit && P.dropT > 1.2 && tiles.stats.downloading + tiles.stats.parsing < 6) {
    P.pos.y = hit.point.y + 0.4; P.vy = 0; P.mode = "drive"; P.grounded = true; P.yaw = headingToYaw(P.dropHdg);
    camLook.copy(P.pos); camera.position.copy(P.pos).addScaledVector(fwd(), -9).add(new THREE.Vector3(0, 4, 0));
    $("loading").hidden = true;
  } else if (hit) { P.pos.y = hit.point.y + 0.4; }
}

const tv = new THREE.Vector3(), tw = new THREE.Vector3(), side = new THREE.Vector3();
let frameNo = 0;
function stepDrive(dt, inp) {
  const f = fwd();
  // engine, brakes, drag
  if (inp.thr > 0) P.v += ACC * (inp.boost ? 1.8 : 1) * inp.thr * dt * Math.max(0, 1 - (P.v / (MAX_V * (inp.boost ? 1.25 : 1))) ** 2);
  else if (inp.thr < 0) P.v -= (P.v > 0.5 ? BRAKE : 6) * -inp.thr * dt;
  P.v = Math.max(-REV_MAX, P.v - (P.v * 0.02 + Math.sign(P.v) * 0.2) * dt);
  if (inp.hand) P.v -= Math.sign(P.v) * Math.min(Math.abs(P.v), 9 * dt);
  if (Math.abs(P.v) < 0.05 && inp.thr === 0) P.v = 0;
  if (!P.grounded) P.v *= 1 - 0.1 * dt;
  // steering: bicycle model with less lock at speed, extra yaw on handbrake
  const lock = 0.6 / (1 + Math.abs(P.v) / 18);
  P.steer += (inp.steer * lock - P.steer) * Math.min(1, dt * 8);
  if (P.grounded) P.yaw -= (P.v / 2.7) * Math.tan(P.steer) * dt * (inp.hand ? 1.6 : 1);
  // walls: a ray along the direction of travel at bumper height
  const dir = Math.sign(P.v) || 1, step = Math.abs(P.v) * dt;
  if (step > 0.001) {
    tv.copy(P.pos).y += 0.7;
    const hit = castDir(tv, tw.copy(f).multiplyScalar(dir), car.length / 2 + 0.3 + step);
    if (hit) {
      const imp = Math.abs(P.v);
      P.v = -dir * Math.min(imp * 0.25, 4);
      if (imp > 8) { P.crashT = 0.35; audio.crash(Math.min(1, imp / 40)); }
    } else P.pos.addScaledVector(f, P.v * dt);
  }
  // ground: rays down from just above the car at the nose, tail and both sides (stepping up ~0.9 m at most, so
  // tree canopies and bridges overhead are ignored)
  const hl = car.length * 0.38, hw = car.width * 0.4, top = P.pos.y + 0.9;
  side.set(f.z, 0, -f.x);
  const gF = castDown(P.pos.x + f.x * hl, top, P.pos.z + f.z * hl, 40), gR = castDown(P.pos.x - f.x * hl, top, P.pos.z - f.z * hl, 40);
  if (frameNo % 3 === 0) {
    const gL = castDown(P.pos.x + side.x * hw, top, P.pos.z + side.z * hw, 40), gRt = castDown(P.pos.x - side.x * hw, top, P.pos.z - side.z * hw, 40);
    if (gL && gRt) P.rollT = Math.atan2(gL.point.y - gRt.point.y, hw * 2);
  }
  const hits = [gF, gR].filter(Boolean);
  if (!hits.length) { // nothing under us yet (tiles still streaming): hold still rather than fall through the world
    P.noGround += dt; P.v *= 1 - Math.min(1, dt * 3); if (P.noGround > 4) { P.mode = "drop"; P.dropT = 0; P.dropHdg = yawToHeading(); }
    return;
  }
  P.noGround = 0;
  const gy = hits.reduce((s, h) => s + h.point.y, 0) / hits.length;
  if (gF && gR) P.pitchT = Math.atan2(gF.point.y - gR.point.y, hl * 2);
  if (P.pos.y <= gy + 0.05 || (P.grounded && P.pos.y - gy < 0.6)) {
    P.pos.y += (gy - P.pos.y) * Math.min(1, dt * 18); P.vy = 0; P.grounded = true;
  } else {
    P.grounded = false; P.vy -= 9.81 * dt; P.pos.y += P.vy * dt; if (P.pos.y < gy) { P.pos.y = gy; P.vy = 0; }
  }
  P.pitch += ((P.pitchT || 0) - P.pitch) * Math.min(1, dt * 10);
  P.roll += ((P.rollT || 0) - P.roll) * Math.min(1, dt * 10);
}
function stepFly(dt, inp) {
  P.v = THREE.MathUtils.clamp(P.v + inp.thr * 60 * dt * (inp.boost ? 3 : 1), 0, inp.boost ? 900 : 320);
  P.yaw -= inp.steer * 0.9 * dt;
  P.flyPitch += ((inp.lift * 0.5) - P.flyPitch) * Math.min(1, dt * 3);
  const f = fwd();
  P.pos.addScaledVector(f, P.v * dt * Math.cos(P.flyPitch)); P.pos.y += P.v * dt * Math.sin(P.flyPitch) + inp.lift * 25 * dt;
  const g = frameNo % 4 === 0 ? castDown(P.pos.x, P.pos.y + 1, P.pos.z, 5000) : null;
  if (g && P.pos.y < g.point.y + 15) P.pos.y = g.point.y + 15;
  P.pos.y = Math.min(P.pos.y, 12000);
  P.pitch = -P.flyPitch; P.roll = inp.steer * 0.5;
}

// ---------- camera ----------
let camMode = 0; // 0 chase, 1 far chase, 2 bonnet
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const f = fwd();
  if (P.mode === "drop") { camLook.lerp(P.pos, Math.min(1, dt * 2)); camera.position.lerp(tv.copy(P.pos).add(new THREE.Vector3(0, 120, 0)).addScaledVector(axes.north, -160), Math.min(1, dt * 1.5)); camera.lookAt(camLook); return; }
  const fly = P.mode === "fly", sp = Math.abs(P.v);
  if (camMode === 2 && !fly) { camera.position.copy(P.pos).addScaledVector(f, 0.6).y += 1.15; camLook.copy(camera.position).addScaledVector(f, 10); camLook.y += Math.sin(-P.pitch) * -10; camera.lookAt(camLook); return; }
  const back = (fly ? 26 : camMode ? 13 : 7.5) + sp * (fly ? 0.04 : 0.05), up = (fly ? 8 : camMode ? 4.5 : 2.4) + sp * 0.01;
  const want = tv.copy(P.pos).addScaledVector(f, -back); want.y += up;
  camera.position.lerp(want, Math.min(1, dt * (fly ? 3 : 6)));
  // never let the camera sink into a wall or the road: pull it in along the ray from the car
  const eye = tw.copy(P.pos); eye.y += 1.4;
  const toCam = camera.position.clone().sub(eye), dist = toCam.length();
  if (!fly && dist > 0.5 && frameNo % 3 === 1) { const h = castDir(eye, toCam.normalize(), dist); if (h) camera.position.copy(eye).addScaledVector(toCam, Math.max(0.6, h.distance - 0.4)); }
  camLook.lerp(tv.copy(P.pos).addScaledVector(f, 3).add(new THREE.Vector3(0, 1.1, 0)), Math.min(1, dt * 10));
  camera.lookAt(camLook);
  if (P.crashT > 0) { camera.position.x += (Math.random() - 0.5) * P.crashT; camera.position.y += (Math.random() - 0.5) * P.crashT; }
  camera.fov += ((62 + Math.min(18, sp * 0.18)) - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
}

// ---------- car pose ----------
function poseCar(dt) {
  const show = P.mode !== "drop";
  car.root.visible = show; blob.visible = show && P.mode === "drive";
  if (!show) return;
  car.root.position.copy(P.pos);
  car.root.rotation.set(0, 0, 0); car.root.rotation.order = "YXZ";
  car.root.rotation.y = P.yaw - Math.PI / 2; car.root.rotation.z = P.pitch; car.root.rotation.x = P.roll;
  P.spin += (P.v / car.wheelR) * dt;
  for (const w of car.wheels) w.rotation.z = -P.spin;
  for (const s of car.steer) s.rotation.y = P.steer;
  car.tail.emissiveIntensity = keys.has("KeyS") || keys.has("ArrowDown") || touch.brake ? 2.2 : 0.4;
  blob.position.set(P.pos.x, P.pos.y + 0.03, P.pos.z); blob.rotation.z = P.yaw - Math.PI / 2;
}

// ---------- audio: a simple engine note that follows speed ----------
const audio = {
  ctx: null, osc: null, gain: null,
  start() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      this.osc = this.ctx.createOscillator(); this.osc.type = "sawtooth";
      const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600;
      this.gain = this.ctx.createGain(); this.gain.gain.value = 0;
      this.osc.connect(lp); lp.connect(this.gain); this.gain.connect(this.ctx.destination); this.osc.start();
    } catch (e) { this.ctx = null; }
  },
  update(v, thr) {
    if (!this.ctx) return; const t = this.ctx.currentTime, sp = Math.abs(v), gear = sp / 14 % 1;
    this.osc.frequency.setTargetAtTime(P.mode === "fly" ? 90 + sp * 0.2 : 45 + gear * 70 + sp * 1.1, t, 0.05);
    this.gain.gain.setTargetAtTime(P.mode === "drop" ? 0 : 0.035 + Math.abs(thr) * 0.04, t, 0.1);
  },
  crash(k) {
    if (!this.ctx) return; const n = this.ctx.createBufferSource(), b = this.ctx.createBuffer(1, 8000, 22050), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const g = this.ctx.createGain(); g.gain.value = 0.4 * k; n.buffer = b; n.connect(g); g.connect(this.ctx.destination); n.start();
  },
};

// ---------- HUD, menu, key panel ----------
let toastT = 0;
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); toastT = 3.2; }
function hud() {
  const mph = Math.round(Math.abs(P.v) * 2.23694);
  $("speed").textContent = P.mode === "fly" ? Math.round(P.v * 1.94384) : mph;
  $("unit").textContent = P.mode === "fly" ? "knots" : "mph";
  $("mode").textContent = P.mode === "fly" ? "FLYING" : P.mode === "drop" ? "LOADING" : "DRIVING";
  if (tiles && tiles.root) {
    const c = localToLatLon(P.pos), lat = c.lat * R2D, lon = c.lon * R2D, n = nearestPlace(lat, lon);
    $("coords").textContent = lat.toFixed(5) + ", " + lon.toFixed(5) + "  ·  " + Math.round(yawToHeading()) + "°" + (P.mode === "fly" ? "  ·  " + Math.round(P.pos.y) + " m" : "");
    if (n) $("near").textContent = n.d < 4 ? n.p.name : Math.round(n.d * 0.621) + " mi from " + n.p.name;
    const st = tiles.stats, busy = st.downloading + st.parsing + st.queued;
    $("net").textContent = busy ? "Streaming " + busy + " tiles" : "";
    const attr = tiles.getAttributions().filter((a) => a.type === "string").map((a) => a.value).join("; ");
    $("attr").textContent = attr ? "Map data: " + attr : "";
  }
}
function renderPlaceList(q) {
  const ul = $("places"); ul.innerHTML = ""; q = q.trim().toLowerCase();
  const list = PLACES.filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => (a.kind === b.kind ? (b.pop || 0) - (a.pop || 0) : a.kind === "landmark" ? -1 : 1));
  for (const p of list.slice(0, 80)) { const li = document.createElement("li"); li.innerHTML = `<b></b><small>${p.kind}</small>`; li.firstChild.textContent = p.name; li.onclick = () => goTo(p); ul.appendChild(li); }
}
let searchTimer = 0;
$("placeSearch").addEventListener("input", (e) => { renderPlaceList(e.target.value); clearTimeout(searchTimer); searchTimer = setTimeout(() => geocode(e.target.value), 700); });
$("placeSearch").addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = $("places").querySelector("li"); if (first) first.click(); } });
// any street, town or postcode in the UK: OpenStreetMap's Nominatim search, only when the player types a query
async function geocode(q) {
  if (q.trim().length < 3) return;
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=gb&limit=6&q=" + encodeURIComponent(q), { headers: { "Accept-Language": "en-GB" } });
    const res = await r.json(), ul = $("places");
    for (const x of res) { const li = document.createElement("li"); li.innerHTML = "<b></b><small>search</small>"; li.firstChild.textContent = x.display_name.split(",").slice(0, 3).join(","); li.onclick = () => goTo({ name: li.firstChild.textContent, lat: +x.lat, lon: +x.lon, hdg: 0 }); ul.prepend(li); }
  } catch (e) { /* offline */ }
}
function toggleMenu() { $("menu").hidden ? openMenu() : closeMenu(); }
function openMenu() { $("menu").hidden = false; $("placeSearch").value = ""; renderPlaceList(""); setTimeout(() => !isTouch && $("placeSearch").focus(), 30); }
function closeMenu() { $("menu").hidden = true; $("placeSearch").blur(); }
$("menuBtn").onclick = toggleMenu; $("closeMenu").onclick = closeMenu;
$("flyBtn").onclick = toggleFly; $("carBtn").onclick = cycleCar; $("camBtn").onclick = () => (camMode = (camMode + 1) % 3);
for (const q of Object.keys(QUALITY)) { const b = $("q_" + q); b.classList.toggle("on", prefs.quality === q); b.onclick = () => { prefs.quality = q; savePrefs(); if (tiles) tiles.errorTarget = QUALITY[q]; for (const k of Object.keys(QUALITY)) $("q_" + k).classList.toggle("on", k === q); }; }
$("color").value = prefs.color; $("color").oninput = (e) => { prefs.color = e.target.value; savePrefs(); car.paint.color.set(prefs.color); };
$("changeKey").onclick = () => showKeyPanel("");

function showKeyPanel(msg) { $("keyPanel").hidden = false; $("keyMsg").textContent = msg || ""; $("keyInput").value = store.get(KEY_STORE) || ""; }
$("keyGo").onclick = () => {
  const k = $("keyInput").value.trim(); if (k.length < 20) { $("keyMsg").textContent = "That doesn't look like a Google API key (they start with AIza…)."; return; }
  if ($("keyRemember").checked) store.set(KEY_STORE, k); else store.del(KEY_STORE);
  $("keyPanel").hidden = true; $("keyInput").blur(); boot(k);
};

// ---------- main loop ----------
let last = performance.now(), hudT = 0, fpsN = 0, fpsT = 0;
window.__earth = { P, camera, get tiles() { return tiles; }, goTo, stats: { fps: 0, rays: 0, frames: 0 } };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); // up to 0.1 s so a slow frame doesn't slow the car down last = now; frameNo++; rayCount = 0;
  const inp = readInput();
  if (tiles) {
    if (P.mode === "drop") stepDrop(dt); else if (P.mode === "drive") stepDrive(dt, inp); else stepFly(dt, inp);
    if (tiles.root && Math.hypot(P.pos.x, P.pos.z) > (P.mode === "fly" ? 4000 : 1500)) recenter();
  }
  P.crashT = Math.max(0, P.crashT - dt);
  poseCar(dt); updateCamera(dt); audio.update(P.v, inp.thr);
  camera.updateMatrixWorld();
  // flying needs a deep view; driving a short one (better depth precision, cheaper)
  const far = P.mode === "drive" ? 3e4 : 4e5, near = P.mode === "drive" ? 0.5 : 2;
  if (camera.far !== far) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); sky.scale.setScalar(far * 1.05); }
  if (tiles) { tiles.setResolutionFromRenderer(camera, renderer); tiles.update(); buildBVHs(P.mode === "drop" ? 12 : 4); }
  renderer.render(scene, camera);
  if ((hudT -= dt) <= 0) { hudT = 0.12; hud(); }
  if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
  fpsN++; fpsT += dt; if (fpsT > 1) {
    const fps = (window.__earth.stats.fps = fpsN / fpsT); fpsN = 0; fpsT = 0;
    // dynamic resolution: trade sharpness for a smooth frame rate
    const pr = fps < 38 ? Math.max(0.6, pixelRatio - 0.15) : fps > 55 ? Math.min(PR_MAX, pixelRatio + 0.1) : pixelRatio;
    if (pr !== pixelRatio) { pixelRatio = pr; renderer.setPixelRatio(pr); }
  }
  window.__earth.stats.rays = rayCount; window.__earth.stats.frames++;
}
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

function boot(key) {
  const start = PLACES.find((p) => p.name === prefs.place) || LANDMARKS[0];
  origin = { lat: start.lat * D2R, lon: start.lon * D2R };
  startTiles(key); goTo(start);
  $("loading").hidden = false;
}
loadCities();
requestAnimationFrame(frame);
const urlKey = new URLSearchParams(location.search).get("key");
if (urlKey) { store.set(KEY_STORE, urlKey); history.replaceState(null, "", location.pathname); }
const key = urlKey || store.get(KEY_STORE);
if (key) boot(key); else showKeyPanel("");
