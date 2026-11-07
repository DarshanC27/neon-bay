// ---------- shared helpers (classic script: top-level consts are visible to all game scripts) ----------
const G = (window.G = {});
G.TILE = 64;

const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const TAU = Math.PI * 2;
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmtMoney = (n) => "$" + Math.floor(n).toLocaleString("en-US");

// ---------- input ----------
const Input = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, down: false, clicked: false, rclicked: false } };
const BLOCK_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"]);
Input.route = (code) => [code]; // replaced by controls.js (rebindable keys)
const typing = (e) => { const t = e.target; return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"); };
addEventListener("keydown", (e) => {
  if (typing(e)) return;
  if (Input.capture) { e.preventDefault(); e.stopPropagation(); Input.capture(e); return; }
  if (BLOCK_KEYS.has(e.code)) e.preventDefault();
  for (const c of Input.route(e.code)) { Input.keys[c] = true; if (!e.repeat) Input.pressed[c] = true; }
}, true);
addEventListener("keyup", (e) => { for (const c of Input.route(e.code)) Input.keys[c] = false; });
addEventListener("blur", () => { Input.keys = {}; });
addEventListener("mousemove", (e) => { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; });
addEventListener("mousedown", (e) => { if (e.button === 0) { Input.mouse.down = true; Input.mouse.clicked = true; } if (e.button === 2) Input.mouse.rclicked = true; });
addEventListener("mouseup", () => { Input.mouse.down = false; });
addEventListener("contextmenu", (e) => e.preventDefault());
Input.down = (...c) => c.some((k) => Input.keys[k]);
Input.hit = (...c) => c.some((k) => Input.pressed[k]);
Input.endFrame = () => { Input.pressed = {}; Input.mouse.clicked = false; Input.mouse.rclicked = false; };
