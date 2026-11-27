// Neon Bay: Real UK mode. Drive or fly anywhere in the United Kingdom on the real map.
//   - Default, no key needed: osm_world.js builds the UK from OpenStreetMap (real building footprints and heights,
//     roads, rivers, parks) on real terrain, streamed around the player.
//   - Optional photo-real: google_world.js streams Google Photorealistic 3D Tiles with the player's own key.
// Both worlds share one interface (ground, ray, recenter, toLatLon, ...), so the car, camera and HUD don't care which.
// Local frame: y up, metres. When the player gets far from the origin, the world recentres under them.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "three/addons/objects/Sky.js";
import { buildCar, CAR_TYPES } from "./car_model.js";
import { createOsmWorld } from "./osm_world.js";

const D2R = Math.PI / 180;
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
const prefs = Object.assign({ quality: isTouch ? "low" : "medium", car: "sports", color: "#c1121f", place: "Big Ben & Westminster" }, (() => { try { return JSON.parse(store.get(PREF_STORE) || "{}"); } catch (e) { return {}; } })());
const savePrefs = () => store.set(PREF_STORE, JSON.stringify(prefs));
const QUALITY = { low: { pr: 0.75, et: 40 }, medium: { pr: 1, et: 24 }, high: { pr: 1.5, et: 14 } }; // pixel ratio cap; Google errorTarget
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: "high-performance" });
let PR_MAX = Math.min(devicePixelRatio, QUALITY[prefs.quality].pr), pixelRatio = PR_MAX;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
$("view").appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 3e4);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const sky = new Sky(); sky.scale.setScalar(3e4); scene.add(sky);
const sun = new THREE.Vector3().setFromSphericalCoords(1, (90 - 38) * D2R, 200 * D2R);
sky.material.uniforms.turbidity.value = 6; sky.material.uniforms.rayleigh.value = 1.6;
sky.material.uniforms.mieCoefficient.value = 0.004; sky.material.uniforms.sunPosition.value.copy(sun);
scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x6b6150, 1.25));
const sunLight = new THREE.DirectionalLight(0xfff1dd, 2.0); sunLight.position.copy(sun).multiplyScalar(100); scene.add(sunLight);
const FOG = new THREE.Color(0xc5d3e0);

// soft contact shadow under the car
const shadowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 8, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
blob.rotation.x = -Math.PI / 2; scene.add(blob);

// ---------- the car ----------
let car = null;
function makeCar() {
  if (car) scene.remove(car.root);
  car = buildCar(prefs.car, prefs.color); scene.add(car.root);
  blob.scale.set(car.length * 1.25, car.width * 1.6, 1);
}
makeCar();

// ---------- the world ----------
let world = null;
function useOsm() {
  if (world && world.dispose) world.dispose();
  world = createOsmWorld({ scene, renderer, isTouch });
  $("worldName").textContent = "Open map";
}
async function useGoogle(key) {
  if (world && world.dispose) world.dispose();
  const { createGoogleWorld } = await import("./google_world.js");
  world = createGoogleWorld({ scene, renderer, camera, key, errorTarget: QUALITY[prefs.quality].et, isTouch,
    onAuthError: (msg) => { toast("Google refused the key, so using the free open map instead"); console.warn(msg); useOsm(); goTo(currentPlace, true); } });
  $("worldName").textContent = "Google 3D";
}

// ---------- player state ----------
const P = {
  mode: "drop", // drop: waiting for the ground under a new place to load; drive; fly
  pos: new THREE.Vector3(0, 300, 0), yaw: 0, v: 0, vy: 0, pitch: 0, roll: 0, steer: 0, grounded: false,
  dropT: 0, dropHdg: 0, noGround: 0, crashT: 0, flyPitch: 0, spin: 0, onRoad: true,
};
const fwd = () => new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
function headingToYaw(deg) { // compass heading (0 = north, 90 = east) -> local yaw
  const h = deg * D2R, d = world.axes.north.clone().multiplyScalar(Math.cos(h)).add(world.axes.east.clone().multiplyScalar(Math.sin(h)));
  return Math.atan2(d.x, d.z);
}
function yawToHeading() { const f = fwd(); return (Math.atan2(f.dot(world.axes.east), f.dot(world.axes.north)) / D2R + 360) % 360; }

let currentPlace = LANDMARKS[0];
function goTo(place, quiet) {
  currentPlace = place;
  world.setOrigin(place.lat, place.lon);
  P.mode = "drop"; P.pos.set(0, 400, 0); P.v = 0; P.vy = 0; P.dropT = 0; P.dropHdg = place.hdg || 0; P.onRoad = true;
  camera.position.set(0, 600, 500); camera.lookAt(0, 0, 0); camLook.set(0, 0, 0);
  prefs.place = place.name; savePrefs();
  $("placeName").textContent = place.name; if (!quiet) toast("Travelling to " + place.name + "…");
  $("loading").hidden = false;
  closeMenu();
}
function recenter() {
  const f = fwd(), m = world.recenter(P.pos);
  P.pos.applyMatrix4(m); camera.position.applyMatrix4(m); camLook.applyMatrix4(m);
  f.transformDirection(m); P.yaw = Math.atan2(f.x, f.z);
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
  else if (P.mode === "fly") { P.mode = "drop"; P.dropT = 0; P.dropHdg = yawToHeading(); P.v = 0; P.onRoad = false; toast("Landing…"); }
}
function resetCar() { if (P.mode === "drive") { P.mode = "drop"; P.dropT = 0.4; P.dropHdg = yawToHeading(); P.v = 0; P.onRoad = true; } }
function cycleCar() { prefs.car = CAR_TYPES[(CAR_TYPES.indexOf(prefs.car) + 1) % CAR_TYPES.length]; savePrefs(); makeCar(); toast("Car: " + prefs.car); }

function stepDrop(dt) {
  P.dropT += dt;
  if (!world.centreReady(P.pos) || P.dropT < 0.6) return;
  let yaw = null;
  if (P.onRoad) { const r = world.nearestRoad(P.pos.x, P.pos.z); if (r) { P.pos.x = r.x; P.pos.z = r.z; yaw = r.yaw; } }
  const gy = world.ground(P.pos.x, P.pos.z);
  if (gy === null) return;
  P.pos.y = gy + 0.3; P.vy = 0; P.mode = "drive"; P.grounded = true; P.yaw = yaw !== null ? yaw : headingToYaw(P.dropHdg);
  camLook.copy(P.pos); camera.position.copy(P.pos).addScaledVector(fwd(), -9).add(new THREE.Vector3(0, 4, 0));
  $("loading").hidden = true;
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
    const hit = world.ray(tv, tw.copy(f).multiplyScalar(dir), car.length / 2 + 0.3 + step);
    if (hit !== null) {
      const imp = Math.abs(P.v);
      P.v = -dir * Math.min(imp * 0.25, 4);
      if (imp > 8) { P.crashT = 0.35; audio.crash(Math.min(1, imp / 40)); }
    } else P.pos.addScaledVector(f, P.v * dt);
  }
  // ground under the nose, tail and both sides
  const hl = car.length * 0.38, hw = car.width * 0.4, top = P.pos.y + 0.9;
  side.set(f.z, 0, -f.x);
  const gF = world.ground(P.pos.x + f.x * hl, P.pos.z + f.z * hl, top, 40), gR = world.ground(P.pos.x - f.x * hl, P.pos.z - f.z * hl, top, 40);
  if (frameNo % 3 === 0) {
    const gL = world.ground(P.pos.x + side.x * hw, P.pos.z + side.z * hw, top, 40), gRt = world.ground(P.pos.x - side.x * hw, P.pos.z - side.z * hw, top, 40);
    if (gL !== null && gRt !== null) P.rollT = Math.atan2(gL - gRt, hw * 2);
  }
  if (gF === null && gR === null) { // the ground here hasn't loaded yet: hold still rather than fall through the world
    P.noGround += dt; P.v *= 1 - Math.min(1, dt * 3); if (P.noGround > 6) { P.mode = "drop"; P.dropT = 0; P.dropHdg = yawToHeading(); P.onRoad = false; }
    return;
  }
  P.noGround = 0;
  const gy = gF !== null && gR !== null ? (gF + gR) / 2 : gF !== null ? gF : gR;
  if (gF !== null && gR !== null) P.pitchT = Math.atan2(gF - gR, hl * 2);
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
  const g = frameNo % 4 === 0 ? world.ground(P.pos.x, P.pos.z, P.pos.y + 1, 5000) : null;
  if (g !== null && P.pos.y < g + 15) P.pos.y = g + 15;
  P.pos.y = Math.min(P.pos.y, 12000);
  P.pitch = -P.flyPitch; P.roll = inp.steer * 0.5;
}

// ---------- camera ----------
let camMode = 0; // 0 chase, 1 far chase, 2 bonnet
const camLook = new THREE.Vector3();
function updateCamera(dt) {
  const f = fwd();
  if (P.mode === "drop") { camLook.lerp(P.pos.clone().setY(0), Math.min(1, dt * 2)); camera.position.lerp(tv.set(P.pos.x, 420, P.pos.z + 420), Math.min(1, dt * 1.5)); camera.lookAt(camLook); return; }
  const fly = P.mode === "fly", sp = Math.abs(P.v);
  if (camMode === 2 && !fly) { camera.position.copy(P.pos).addScaledVector(f, 0.6).y += 1.15; camLook.copy(camera.position).addScaledVector(f, 10); camera.lookAt(camLook); return; }
  const back = (fly ? 26 : camMode ? 13 : 7.5) + sp * (fly ? 0.04 : 0.05), up = (fly ? 8 : camMode ? 4.5 : 2.4) + sp * 0.01;
  const want = tv.copy(P.pos).addScaledVector(f, -back); want.y += up;
  camera.position.lerp(want, Math.min(1, dt * (fly ? 3 : 6)));
  // keep the camera out of walls: pull it in along the line from the car
  const eye = tw.copy(P.pos); eye.y += 1.4;
  const toCam = camera.position.clone().sub(eye), dist = toCam.length();
  if (!fly && dist > 0.5 && frameNo % 3 === 1) { const h = world.ray(eye, toCam.normalize(), dist); if (h !== null) camera.position.copy(eye).addScaledVector(toCam, Math.max(0.6, h - 0.4)); }
  const gC = !fly ? world.ground(camera.position.x, camera.position.z, camera.position.y + 2, 50) : null;
  if (gC !== null && camera.position.y < gC + 0.8) camera.position.y = gC + 0.8;
  camLook.lerp(tv.copy(P.pos).addScaledVector(f, 3).add(new THREE.Vector3(0, 1.1, 0)), Math.min(1, dt * 10));
  camera.lookAt(camLook);
  if (P.crashT > 0) { camera.position.x += (Math.random() - 0.5) * P.crashT; camera.position.y += (Math.random() - 0.5) * P.crashT; }
  camera.fov += ((62 + Math.min(20, sp * 0.2)) - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
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
  blob.position.set(P.pos.x, P.pos.y + 0.05, P.pos.z); blob.rotation.z = P.yaw - Math.PI / 2;
}

// ---------- audio: a simple engine note that follows speed ----------
const audio = {
  ctx: null, osc: null, gain: null,
  start() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
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
function toast(s) { const t = $("toast"); t.textContent = s; t.classList.add("show"); toastT = 3.5; }
function hud() {
  $("speed").textContent = P.mode === "fly" ? Math.round(P.v * 1.94384) : Math.round(Math.abs(P.v) * 2.23694);
  $("unit").textContent = P.mode === "fly" ? "knots" : "mph";
  $("mode").textContent = P.mode === "fly" ? "FLYING" : P.mode === "drop" ? "LOADING" : "DRIVING";
  const c = world.toLatLon(P.pos);
  if (c) {
    const n = nearestPlace(c.lat, c.lon), street = P.mode === "drive" ? world.streetAt(P.pos) : null;
    $("coords").textContent = c.lat.toFixed(5) + ", " + c.lon.toFixed(5) + "  ·  " + Math.round(yawToHeading()) + "°" + (P.mode === "fly" ? "  ·  " + Math.round(P.pos.y) + " m" : "");
    $("near").textContent = (street ? street + "  ·  " : "") + (n ? (n.d < 4 ? n.p.name : Math.round(n.d * 0.621) + " mi from " + n.p.name) : "");
  }
  const busy = world.busy(), err = world.failed();
  $("net").textContent = err ? "Map server problem: " + err : busy ? "Loading " + busy + " map area" + (busy > 1 ? "s" : "") : "";
  $("attr").textContent = world.attribution();
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
for (const q of Object.keys(QUALITY)) {
  const b = $("q_" + q); b.classList.toggle("on", prefs.quality === q);
  b.onclick = () => {
    prefs.quality = q; savePrefs(); PR_MAX = Math.min(devicePixelRatio, QUALITY[q].pr); pixelRatio = PR_MAX; renderer.setPixelRatio(pixelRatio);
    if (world.setErrorTarget) world.setErrorTarget(QUALITY[q].et);
    for (const k of Object.keys(QUALITY)) $("q_" + k).classList.toggle("on", k === q);
  };
}
$("color").value = prefs.color; $("color").oninput = (e) => { prefs.color = e.target.value; savePrefs(); car.paint.color.set(prefs.color); };
$("changeKey").onclick = () => showKeyPanel("");
$("keySkip").onclick = () => { $("keyPanel").hidden = true; store.del(KEY_STORE); if (world.kind !== "osm") { useOsm(); goTo(currentPlace, true); } };

function showKeyPanel(msg) { $("keyPanel").hidden = false; $("keyMsg").textContent = msg || ""; $("keyInput").value = store.get(KEY_STORE) || ""; }
$("keyGo").onclick = async () => {
  const k = $("keyInput").value.trim(); if (k.length < 20) { $("keyMsg").textContent = "That doesn't look like a Google API key (they start with AIza…)."; return; }
  if ($("keyRemember").checked) store.set(KEY_STORE, k); else store.del(KEY_STORE);
  $("keyPanel").hidden = true; $("keyInput").blur(); closeMenu();
  await useGoogle(k); goTo(currentPlace, true);
};

// ---------- main loop ----------
let last = performance.now(), hudT = 0, fpsN = 0, fpsT = 0;
window.__earth = { P, camera, get world() { return world; }, goTo, stats: { fps: 0, frames: 0 } };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); // up to 0.1 s, so a slow frame doesn't slow the car down
  last = now; frameNo++;
  const inp = readInput();
  if (world) {
    if (P.mode === "drop") stepDrop(dt); else if (P.mode === "drive") stepDrive(dt, inp); else stepFly(dt, inp);
    if (Math.hypot(P.pos.x, P.pos.z) > (P.mode === "fly" ? 3 : 1) * world.recenterAt && world.toLatLon(P.pos)) recenter();
  }
  P.crashT = Math.max(0, P.crashT - dt);
  poseCar(dt); updateCamera(dt); audio.update(P.v, inp.thr);
  camera.updateMatrixWorld();
  // view distance: the open map fades into haze at the edge of what's loaded; Google can see much further
  const osm = world && world.kind === "osm", flying = P.mode !== "drive";
  const far = osm ? (flying ? 9000 : 3200) : flying ? 4e5 : 3e4, near = flying ? 2 : 0.5;
  if (camera.far !== far) { camera.far = far; camera.near = near; camera.updateProjectionMatrix(); sky.scale.setScalar(far * 1.05); }
  if (osm) { if (!scene.fog) scene.fog = new THREE.Fog(FOG, 1, 2); scene.fog.near = flying ? 2500 : 500; scene.fog.far = flying ? 8500 : 2900; } else scene.fog = null;
  if (world) world.update(P.pos, P.mode === "fly");
  renderer.render(scene, camera);
  if ((hudT -= dt) <= 0) { hudT = 0.15; if (world) hud(); }
  if (toastT > 0 && (toastT -= dt) <= 0) $("toast").classList.remove("show");
  fpsN++; fpsT += dt; if (fpsT > 1) {
    const fps = (window.__earth.stats.fps = fpsN / fpsT); fpsN = 0; fpsT = 0;
    // dynamic resolution: trade sharpness for a smooth frame rate
    const pr = fps < 38 ? Math.max(0.6, pixelRatio - 0.15) : fps > 55 ? Math.min(PR_MAX, pixelRatio + 0.1) : pixelRatio;
    if (pr !== pixelRatio) { pixelRatio = pr; renderer.setPixelRatio(pr); }
  }
  window.__earth.stats.frames++;
}
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- boot: the free open map straight away; Google only if the player saved a key ----------
(async () => {
  await loadCities();
  const urlKey = new URLSearchParams(location.search).get("key");
  if (urlKey) { store.set(KEY_STORE, urlKey); history.replaceState(null, "", location.pathname); }
  const key = urlKey || store.get(KEY_STORE);
  const start = PLACES.find((p) => p.name === prefs.place) || LANDMARKS[0];
  if (key) { try { await useGoogle(key); } catch (e) { useOsm(); } } else useOsm();
  goTo(start, true);
  requestAnimationFrame(frame);
})();
