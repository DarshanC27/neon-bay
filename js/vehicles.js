// ---------- vehicles: physics, collisions, drawing ----------
(function () {
  const TYPES = (G.CAR_TYPES = {
    compact: { name: "Pico", w: 36, h: 19, accel: 380, max: 300, grip: 7.5, hp: 80, mass: 0.8, price: 2500, colors: ["#e63946", "#f1faee", "#a8dadc", "#ffb703", "#8ecae6"] },
    sedan: { name: "Cruiser", w: 44, h: 22, accel: 420, max: 350, grip: 7, hp: 100, mass: 1, price: 5000, colors: ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#adb5bd", "#6c757d", "#1d3557"] },
    taxi: { name: "Bay Cab", w: 44, h: 22, accel: 420, max: 350, grip: 7, hp: 100, mass: 1, colors: ["#ffc300"], taxi: true },
    van: { name: "Hauler", w: 54, h: 26, accel: 300, max: 290, grip: 6, hp: 160, mass: 1.6, price: 4000, colors: ["#f8f9fa", "#ced4da", "#8d99ae"] },
    muscle: { name: "Brute", w: 47, h: 23, accel: 560, max: 440, grip: 6.2, hp: 120, mass: 1.2, price: 9000, colors: ["#d00000", "#111111", "#ff7b00", "#3a0ca3"] },
    sports: { name: "Vortex GT", w: 45, h: 21, accel: 650, max: 520, grip: 8.6, hp: 100, mass: 0.95, price: 15000, colors: ["#00b4d8", "#f72585", "#06d6a0", "#ffd60a"] },
    super: { name: "Neon X", w: 47, h: 21, accel: 820, max: 640, grip: 9.6, hp: 110, mass: 0.95, price: 35000, colors: ["#c77dff", "#00f5d4", "#fee440"] },
    police: { name: "Interceptor", w: 46, h: 22, accel: 600, max: 500, grip: 8.8, hp: 170, mass: 1.3, colors: ["#0b132b"], police: true },
    hatch: { name: "Breeze HB", w: 39, h: 20, accel: 410, max: 330, grip: 7.8, hp: 85, mass: 0.85, price: 3500, colors: ["#d62828", "#f1faee", "#3a86ff", "#8ac926", "#ffbe0b", "#6c757d"] },
    suv: { name: "Terrain XL", w: 48, h: 24, accel: 440, max: 350, grip: 6.8, hp: 145, mass: 1.45, price: 8500, colors: ["#1b263b", "#e9ecef", "#495057", "#7f5539", "#2d6a4f", "#9d0208"] },
    pickup: { name: "Workhorse", w: 53, h: 24, accel: 410, max: 335, grip: 6.5, hp: 155, mass: 1.55, price: 7000, colors: ["#e63946", "#f8f9fa", "#264653", "#bc6c25", "#343a40"] },
    sportbike: { name: "Raptor 600", w: 22, h: 8, accel: 720, max: 540, grip: 9.2, hp: 55, mass: 0.35, price: 7500, colors: ["#e63946", "#1d3557", "#ffd60a", "#f8f9fa", "#06d6a0", "#111111"], bike: true },
    heli: { name: "Skylark H1", w: 50, h: 18, accel: 520, max: 420, grip: 0, hp: 160, mass: 1.6, price: 60000, colors: ["#e9ecef", "#1d3557", "#d62828", "#ffd60a", "#2a9d8f"], air: true },
    boat: { name: "Wave Runner 24", w: 50, h: 18, accel: 320, max: 340, grip: 2.4, hp: 130, mass: 1.4, price: 12000, colors: ["#f8f9fa", "#1d3557", "#e63946", "#ffb703", "#2a9d8f"], boat: true },
    // emergency services (not for sale): they share the van / pickup body shapes, with their own kit on top
    ambulance: { name: "Medic Unit", w: 56, h: 26, accel: 440, max: 390, grip: 7, hp: 220, mass: 1.7, colors: ["#f4f4f2"], ems: "med", body: "van" },
    firetruck: { name: "Engine 7", w: 80, h: 28, accel: 330, max: 330, grip: 6.4, hp: 340, mass: 2.6, colors: ["#b3121f"], ems: "fire", body: "van" },
    tow: { name: "Hook & Haul", w: 58, h: 25, accel: 380, max: 340, grip: 6.6, hp: 240, mass: 2, colors: ["#f6a700"], ems: "tow", body: "pickup" },
    bicycle: { name: "Urban Pedal", w: 18, h: 6, accel: 150, max: 110, grip: 9.5, hp: 30, mass: 0.15, price: 400, colors: ["#3a86ff", "#ff006e", "#8ac926", "#f8f9fa", "#111111"], bike: true, pedal: true },
  });
  G.TRAFFIC_MIX = ["sedan", "sedan", "sedan", "compact", "compact", "taxi", "van", "muscle", "sports", "hatch", "hatch", "suv", "suv", "pickup", "sportbike"];
  // manual gearbox: each gear tops out (at the 7200 rpm redline) at this fraction of the car's top speed
  const RAT = (G.GEAR_RATIOS = [0, 0.2, 0.36, 0.52, 0.68, 0.84, 1.02]), REV_TOP = 0.3, IDLE = 900, RED = 7200;
  // torque curve: soft at idle, peak around 5000 rpm, tailing off towards the limiter
  const torque = (r) => clamp(0.45 + 1.4 * r - 1.1 * r * r, 0.3, 1);
  let nextId = 1;

  class Car {
    constructor(type, x, y, a = 0, color) {
      this.id = nextId++; this.type = type; this.s = TYPES[type];
      this.x = x; this.y = y; this.a = a; this.vx = 0; this.vy = 0; this.z = 0; this.vz = 0;
      this.hp = this.s.hp; this.color = color || pick(this.s.colors);
      this.driver = null; // null | 'ai' | 'player' | 'police' | 'racer'
      this.ctrl = { t: 0, s: 0, hb: false, boost: false };
      this.speed = 0; this.vF = 0; this.slip = 0; this.air = 0; this.justLanded = 0;
      this.wrecked = false; this.braking = false; this.dents = []; this.wreckT = 0;
      this.manual = false; this.gear = 1; this.shiftT = 0; this.rpm = IDLE; this.limiter = 0;
      this.sim = false; this.r = 0; this.delta = 0; this.axLong = 0; // tyre-model handling (player cars)
      this.rotor = 0; this.ctrl.lift = 0; this.bob = Math.random() * 10;       // helicopter rotor speed, boat bobbing
    }
    // ---- manual gearbox (the clutch is automatic: a shift just cuts drive for a moment) ----
    gearTop(g = this.gear) { return this.s.max * (g > 0 ? RAT[g] : g < 0 ? REV_TOP : 1); }
    shift(dir) {
      if (!this.manual || this.s.pedal) return false;
      const g = clamp(this.gear + dir, -1, 6); if (g === this.gear) return false;
      const fwd = this.vF || 0;
      if (g === -1 && fwd > 25) return "moving"; // can't drop into reverse while rolling forward
      if (dir < 0 && g > 0 && fwd > this.gearTop(g) * 1.08) return "overrev"; // would blow the engine past the redline
      this.gear = g; this.shiftT = g === 0 ? 0 : 0.17; return true;
    }
    update(dt, env) {
      const c = this.ctrl, s = this.s;
      if (this.wrecked) { c.t = 0; c.s = 0; c.hb = true; c.boost = false; c.lift = 0; }
      if (s.air) return this.heliUpdate(dt, c);
      const ox = this.x, oy = this.y, oa = this.a;
      if ((this.z > 0 || this.vz > 0) && !s.boat) {
        this.air += dt; this.vz -= 980 * dt; this.z += this.vz * dt;
        if (this.z <= 0) { this.z = 0; this.vz = 0; this.justLanded = this.air; this.air = 0; }
        this.slip = 0;
      } else {
        let fx = Math.cos(this.a), fy = Math.sin(this.a);
        let vF = this.vx * fx + this.vy * fy;
        const spd = Math.min(1, Math.abs(vF) / 140);
        const steerRate = (c.hb ? 3.4 : 2.5) * (s.bike ? 1.25 : 1) * (s.bike ? Math.min(1, Math.abs(vF) / 60) : spd) * (1 - Math.min(0.4, Math.abs(vF) / 1700));
        const sim = this.sim && !s.bike && !s.boat;
        if (!sim) this.a += c.s * steerRate * dt * (vF >= -5 ? 1 : -1);
        fx = Math.cos(this.a); fy = Math.sin(this.a);
        const rx = -fy, ry = fx;
        vF = this.vx * fx + this.vy * fy;
        let vR = this.vx * rx + this.vy * ry;
        const dmg = this.hp < s.hp * 0.25 ? 0.7 : 1;
        const max = s.max * (c.boost ? 1.32 : 1) * dmg, acc = s.accel * (c.boost ? 1.7 : 1) * dmg;
        this.braking = false;
        // realistic powertrain (player cars on "realistic" handling): traction-limited launch, aero drag, real braking distances
        const real = this.sim && !s.bike && !s.boat;
        const v0 = vF;
        if (real) vF = this.realDrive(vF, c, max, acc, dt, env);
        else if (this.manual && !s.pedal) vF = this.manualDrive(vF, c, max, acc, dt);
        else if (c.t > 0) { if (vF < -10) vF += 900 * dt * c.t; else if (vF < max) vF += acc * c.t * dt * (1 - Math.max(0, vF) / max * 0.55); }
        else if (c.t < 0) { if (vF > 10) { vF -= 950 * dt * -c.t; this.braking = true; } else if (vF > -max * 0.35) vF += acc * 0.6 * c.t * dt; }
        else vF -= Math.sign(vF) * Math.min(Math.abs(vF), 130 * dt);
        if (!real) this.wheelspin = 0;
        if (c.hb) vF -= Math.sign(vF) * Math.min(Math.abs(vF), (real ? 70 : 240) * dt);
        if (vF > max * 1.02) vF -= (vF - max) * 2 * dt;
        if (s.bike && this.z === 0) { // two wheels: brakes and grip are weaker, the rear steps out under the handbrake
          if (c.hb && Math.abs(vF) > 80) vR += c.s * Math.abs(vF) * 0.9 * dt;
        }
        if (!real) vF *= 1 - (s.boat ? 0.5 : 0.22) * dt; // boats: water drag (realistic cars get rolling resistance + aero in realDrive)
        else if (Math.abs(vF - v0) < 1e-9 && Math.abs(vF) < 0.5) vF = 0;
        if (sim) { // tyre model: slip angles, saturating grip, weight transfer, yaw inertia
          const prevF = this.vF || 0; [vF, vR] = this.tyres(vF, vR, c, env, dt);
          this.axLong += ((vF - prevF) / Math.max(dt, 1e-3) - this.axLong) * Math.min(1, dt * 8);
          fx = Math.cos(this.a); fy = Math.sin(this.a);
          this.slip = Math.abs(vR) * 1.4;
          this.vx = fx * vF - fy * vR; this.vy = fy * vF + fx * vR; this.vF = vF;
        } else {
          const grip = s.grip * (c.hb ? 0.16 : 1) * env.grip;
          this.slip = Math.abs(vR);
          vR *= Math.max(0, 1 - grip * dt);
          this.vx = fx * vF + rx * vR; this.vy = fy * vF + ry * vR; this.vF = vF;
        }
      }
      this.speed = Math.hypot(this.vx, this.vy);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (!this.manual) this.rpm = 0;
      if (s.boat) this.keepInWater(ox, oy, oa);
      if (!this.sim) { this.r = 0; this.delta = 0; this.axLong = 0; } // tyre-model state starts fresh next time
    }
    // ---- tyre model (bicycle model): front/rear slip angles -> saturating lateral forces -> sideways velocity + yaw ----
    tyres(u, v, c, env, dt) {
      const s = this.s, L = s.w, lf = L * 0.32, lr = L * 0.32, Iz = (lf * lf + lr * lr) * 0.5;
      const gLat = 59 * 1.5 * (s.grip / 7.5) * env.grip;    // peak sideways grip: ~1.4 g for a saloon, ~1.9 g for a supercar (1 g = 59 units/s^2)
      const N = 8, h = dt / N;
      for (let k = 0; k < N; k++) {
        const spd = Math.abs(u), dir = u >= 0 ? 1 : -1;
        const steerMax = 0.62 / (1 + spd / 230);              // less lock at speed, like a real steering rack
        this.delta += (c.s * steerMax - this.delta) * Math.min(1, h * 9);
        // weight transfer: braking loads the front (more steering), accelerating loads the rear
        const wf = clamp(0.5 - this.axLong * 0.0025, 0.3, 0.7), wr = 1 - wf;
        const Ff_max = gLat * wf * 2, Fr_max = gLat * wr * 2 * (c.hb ? 0.32 : 1);
        const Cf = Ff_max / 0.11, Cr = Fr_max / 0.13;
        const af = Math.atan2(v + lf * this.r, spd + 4) - this.delta * dir, ar = Math.atan2(v - lr * this.r, spd + 4);
        const Ff = -Ff_max * Math.tanh((af * Cf) / Math.max(Ff_max, 1)), Fr = -Fr_max * Math.tanh((ar * Cr) / Math.max(Fr_max, 1));
        let dv = Ff * Math.cos(this.delta) + Fr - u * this.r, dr = (lf * Ff * Math.cos(this.delta) - lr * Fr) / Iz;
        // below walking pace blend into a kinematic model (the tyre equations get stiff as speed -> 0)
        const kin = clamp(1 - (spd - 25) / 70, 0, 1);
        if (kin > 0) { const rK = (u * Math.tan(this.delta)) / (lf + lr); this.r += (rK - this.r) * Math.min(1, h * 25) * kin; v *= 1 - Math.min(1, h * 20) * kin; dr *= 1 - kin; dv *= 1 - kin; }
        // cornering costs speed: the front tyre's force points partly backwards, and sliding tyres scrub
        v += dv * h; this.r += dr * h;
        const drag = (Math.abs(Ff * Math.sin(this.delta)) + Math.abs(v) * 0.9) * (1 - kin) * h; // never enough to reverse the car
        u = Math.sign(u) * Math.max(0, Math.abs(u) - drag) + v * this.r * (1 - kin) * h;
        this.r *= 1 - h * 0.6; // a little yaw damping (suspension, tyre scrub)
        this.a += this.r * h;
      }
      return [u, v];
    }
    // ---- boats: stay on water (bridges count as water underneath) ----
    keepInWater(ox, oy, oa) {
      const W = G.world, fx = Math.cos(this.a), fy = Math.sin(this.a), hl = this.s.w / 2 - 3;
      const ok = (x, y) => W.waterAt(x, y);
      if (ok(this.x + fx * hl, this.y + fy * hl) && ok(this.x - fx * hl, this.y - fy * hl) && ok(this.x, this.y)) return;
      const imp = this.speed; this.x = ox; this.y = oy; this.a = oa; // undo the move AND the turn, so the bow never ends up stuck over land
      if (imp > 20) { this.vx *= -0.25; this.vy *= -0.25; this.vF = (this.vF || 0) * -0.25; } else { this.vx = this.vy = 0; this.vF = 0; }
      if (imp > 160) this.damage((imp - 160) * 0.08);
      if (imp > 90) G.events.push({ type: "boatBump", car: this, imp });
    }
    // ---- helicopter: rotor spin-up, lift / descend, pitch to fly forward, yaw to turn, lands on roofs ----
    heliUpdate(dt, c) {
      const W = G.world, on = !!this.driver && !this.wrecked;
      this.rotor = clamp(this.rotor + (on ? 0.5 : -0.25) * dt, 0, 1);
      const [ground] = W.groundAt(this.x, this.y, 10), flying = this.z > ground + 2;
      const vzT = on && this.rotor > 0.85 ? (c.lift || 0) * 170 : -60 - (this.wrecked ? 260 : 0);
      this.vz += (vzT - this.vz) * Math.min(1, dt * 2.5);
      if (this.wrecked) this.vz -= 400 * dt;
      // flight: nose down to go forward; the closer to the ground, the less you can pitch
      const thrust = flying ? (c.t || 0) * this.s.accel * this.rotor : 0;
      const fx = Math.cos(this.a), fy = Math.sin(this.a);
      this.vx += fx * thrust * dt; this.vy += fy * thrust * dt;
      const drag = flying ? 0.75 : 4; this.vx *= 1 - Math.min(1, drag * dt); this.vy *= 1 - Math.min(1, drag * dt);
      const sp = Math.hypot(this.vx, this.vy); if (sp > this.s.max) { this.vx *= this.s.max / sp; this.vy *= this.s.max / sp; }
      if (flying || on) this.a += (c.s || 0) * (flying ? 1.7 : 0.9) * dt * this.rotor;
      // hitting the side of a building: stop, bounce, take damage
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, [gNext] = W.groundAt(nx, ny, 14);
      if (gNext > this.z + 3 || (this.z < 3 && W.waterAt(nx, ny))) { // walls, or taxiing off the shore on its skids
        const imp = Math.hypot(this.vx, this.vy); this.vx *= -0.3; this.vy *= -0.3;
        if (imp > 120) { this.damage((imp - 120) * 0.15); G.events.push({ type: "heliBump", car: this, imp }); }
      } else { this.x = nx; this.y = ny; }
      this.z += this.vz * dt;
      const [g2] = W.groundAt(this.x, this.y, 10);
      if (this.z <= g2) { if (this.vz < -220 && !this.wrecked) this.damage((-this.vz - 220) * 0.2); this.z = g2; this.vz = Math.max(0, this.vz); }
      this.speed = Math.hypot(this.vx, this.vy); this.vF = this.vx * fx + this.vy * fy; this.slip = 0; this.justLanded = 0; this.air = 0;
      this.rpm = 0;
    }
    // ---- realistic longitudinal model (1 g = 59 game units/s^2, since km/h = units/s * 0.6) ----
    // engine force fades with speed and balances rolling resistance + aero drag right at top speed; tyre friction caps
    // both the launch (extra torque becomes wheelspin) and the brakes (about 1.2 g on dry tarmac, less in the rain)
    realDrive(vF, c, max, acc, dt, env) {
      const s = this.s, G1 = 59, mu = (s.grip / 7.5) * env.grip, v = Math.abs(vF), x = v / max, sg = Math.sign(vF);
      const trac = G1 * 0.95 * mu, brk = G1 * 1.2 * mu, drag = v > 0.5 ? 7 + 38 * x * x : 0, accR = acc * 0.14; // accR: 1st-gear pull (~1 g for a saloon, ~2 g for a supercar)
      let a = 0; this.wheelspin = 0;
      if (this.manual && !s.pedal) {
        const after = this.manualDrive(vF, c, max, accR, dt);
        a = (after - vF) / Math.max(dt, 1e-4);
        if (this.braking) a = Math.sign(a) * Math.min(Math.abs(a), brk * Math.max(0.3, -c.t));
        else if (Math.abs(a) > trac) { this.wheelspin = Math.abs(a) / trac - 1; a = Math.sign(a) * trac; }
        a -= sg * drag;
      } else if (c.t > 0) {
        if (vF < -10) a = brk * c.t; // rolling backwards: the brakes stop it first
        else { const eng = (accR * Math.max(0, 1 - x * x) + drag) * c.t; this.wheelspin = eng > trac ? eng / trac - 1 : 0; a = Math.min(eng, trac) - sg * drag; }
      } else if (c.t < 0) {
        if (vF > 10) { a = -brk * -c.t; this.braking = true; }
        else { const rmax = max * 0.35, eng = (accR * 0.6 * Math.max(0, 1 - (v / rmax) ** 2) + drag) * -c.t; a = -Math.min(eng, trac) - sg * drag; }
      } else a = -sg * (drag + (v > 3 ? G1 * 0.06 : 0)); // coasting: drag + a little engine braking
      const nv = vF + a * dt;
      // resistive forces stop the car, they never push it backwards
      return sg !== 0 && Math.sign(nv) !== sg && !(c.t > 0 && vF < 0) && !(c.t < 0 && vF <= 10) ? 0 : nv;
    }
    // ---- crash damage: crumple zones (front, rear, left, right) in body units, used to deform the 3D body ----
    hitFrom(nx, ny, imp) {
      if (imp < 90 || this.s.air || this.s.boat) return;
      const fx = Math.cos(this.a), fy = Math.sin(this.a), f = nx * fx + ny * fy, r = -nx * fy + ny * fx; // (nx, ny): direction of the blow, from the car
      const cr = this.crush || (this.crush = [0, 0, 0, 0]), add = Math.min(4, (imp - 90) * 0.012), lim = this.s.w * 0.14;
      const k = Math.abs(f) > Math.abs(r) ? (f > 0 ? 0 : 1) : r > 0 ? 3 : 2;
      cr[k] = Math.min(k < 2 ? lim : this.s.h * 0.2, cr[k] + add);
      this.crushV = (this.crushV || 0) + 1;
    }
    manualDrive(vF, c, max, acc, dt) {
      const g = this.gear, v = Math.abs(vF);
      this.shiftT = Math.max(0, this.shiftT - dt);
      const engaged = g !== 0 && this.shiftT <= 0, top = this.gearTop(g) * (max / this.s.max);
      // engine speed follows the wheels while in gear, free-revs in neutral or mid-shift
      let target = engaged ? IDLE + (v / top) * (RED - IDLE) : IDLE + Math.max(0, c.t) * (RED - 700 - IDLE);
      if (engaged && target < IDLE + 400 && c.t > 0) target = IDLE + 1300; // clutch slips to pull away
      target = Math.min(target, RED + 150);
      this.rpm += (Math.max(IDLE, target) - this.rpm) * Math.min(1, dt * (engaged ? 30 : 8));
      const r = clamp((this.rpm - IDLE) / (RED - IDLE), 0, 1.2);
      this.limiter = engaged && this.rpm >= RED - 40 && c.t > 0 ? this.limiter + dt : 0;
      if (c.t < 0 && v > 5) { vF -= Math.sign(vF) * Math.min(v, 950 * dt * -c.t); this.braking = true; return vF; }
      if (!engaged) return vF - Math.sign(vF) * Math.min(v, 55 * dt); // coasting in neutral / clutch in
      const dir = g < 0 ? -1 : 1, mult = g < 0 ? 1.3 : Math.min(1.5, 0.45 / RAT[g]);
      if (c.t > 0) {
        if (vF * dir < -10) vF += dir * 900 * dt; // rolling the wrong way: the drivetrain fights it
        else if (this.rpm < RED - 40) vF += dir * acc * c.t * mult * torque(r) * dt;
        else vF -= dir * 30 * dt; // fuel cut on the limiter
      } else if (c.t === 0) vF -= Math.sign(vF) * Math.min(v, (40 + 160 * r) * dt * (g < 0 ? 1 : Math.min(1.6, 0.5 / RAT[g]))); // engine braking
      if (v > top * 1.04 && vF * dir > 0) vF -= dir * (v - top) * 3 * dt; // can't go faster than the gear allows
      return vF;
    }
    circles() {
      if (this.s.bike) { const off = this.s.w / 2 - 4, fx = Math.cos(this.a), fy = Math.sin(this.a); return [[fx * off, fy * off, 4.5], [-fx * off, -fy * off, 4.5]]; }
      const off = this.s.w / 2 - this.s.h / 2, fx = Math.cos(this.a), fy = Math.sin(this.a), r = this.s.h / 2 + 1;
      return [[fx * off, fy * off, r], [-fx * off, -fy * off, r]];
    }
    damage(amount) {
      if (this.wrecked || amount <= 0) return;
      this.hp -= amount;
      if (this.dents.length < 6 && amount > 6) this.dents.push([rand(-0.4, 0.4), rand(-0.4, 0.4), rand(3, 7)]);
      if (this.hp <= 0) { this.hp = 0; this.wrecked = true; G.events.push({ type: "wreck", car: this }); }
    }
  }
  G.Car = Car;

  // ---- collisions: entity (x,y,vx,vy) with circle offsets vs world solids ----
  G.collideWorld = function (e, circles, z = 0, bounce = 0.35) {
    let impact = 0;
    for (const [ox, oy, r] of circles) {
      for (const s of G.world.query(e.x + ox, e.y + oy, r + 4)) {
        if (z > 0 && s.height < z * 0.55 && !s.water) continue; // flying over it
        const cx = e.x + ox, cy = e.y + oy;
        let px, py;
        if (s.kind === "rect") { px = clamp(cx, s.x, s.x + s.w); py = clamp(cy, s.y, s.y + s.h); }
        else { const d = dist(cx, cy, s.x, s.y) || 1; px = s.x + ((cx - s.x) / d) * s.r; py = s.y + ((cy - s.y) / d) * s.r; }
        let dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy);
        const inside = s.kind === "rect" ? cx > s.x && cx < s.x + s.w && cy > s.y && cy < s.y + s.h : dist(cx, cy, s.x, s.y) < s.r;
        if (!inside && d >= r) continue;
        if (inside || d < 0.001) { // pushed fully inside: escape along shortest axis
          if (s.kind === "rect") {
            const opts = [[cx - s.x, -1, 0], [s.x + s.w - cx, 1, 0], [cy - s.y, 0, -1], [s.y + s.h - cy, 0, 1]].sort((a, b) => a[0] - b[0])[0];
            dx = opts[1]; dy = opts[2]; d = -opts[0];
          } else { dx = cx - s.x || 1; dy = cy - s.y; const l = Math.hypot(dx, dy); dx /= l; dy /= l; d = -(s.r - dist(cx, cy, s.x, s.y)); }
        } else { dx /= d; dy /= d; }
        const pen = r - d;
        e.x += dx * pen; e.y += dy * pen;
        const vn = e.vx * dx + e.vy * dy;
        if (vn < 0) {
          e.vx -= (1 + bounce) * vn * dx; e.vy -= (1 + bounce) * vn * dy;
          e.vx *= 0.92; e.vy *= 0.92;
          if (-vn > impact) { impact = -vn; e.hitNx = -dx; e.hitNy = -dy; } // remember where the blow came from (crumple zones)
        }
      }
    }
    return impact;
  };

  G.collideCars = function (a, b) {
    if (Math.abs(a.z - b.z) > 18) return 0;
    if (Math.abs(a.x - b.x) > 70 || Math.abs(a.y - b.y) > 70) return 0;
    let impact = 0;
    for (const [ax, ay, ar] of a.circles())
      for (const [bx, by, br] of b.circles()) {
        const dx = b.x + bx - (a.x + ax), dy = b.y + by - (a.y + ay), d = Math.hypot(dx, dy);
        if (d >= ar + br || d < 0.01) continue;
        const nx = dx / d, ny = dy / d, pen = ar + br - d, ma = a.s.mass, mb = b.s.mass, tm = ma + mb;
        a.x -= nx * pen * (mb / tm); a.y -= ny * pen * (mb / tm);
        b.x += nx * pen * (ma / tm); b.y += ny * pen * (ma / tm);
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel < 0) {
          const j = (-(1 + 0.3) * vrel) / (1 / ma + 1 / mb);
          a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny; b.vx += (j / mb) * nx; b.vy += (j / mb) * ny;
          impact = Math.max(impact, -vrel);
        }
      }
    return impact;
  };

  // ---- drawing ----
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * f), 0, 255); g = clamp(Math.round(g * f), 0, 255); b = clamp(Math.round(b * f), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  G.shade = shade;
  G.drawCar = function (ctx, car, time) {
    const { w, h } = car.s, z = car.z;
    ctx.save();
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.translate(car.x + 5 + z * 0.35, car.y + 7 + z * 0.35);
    ctx.rotate(car.a);
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 7); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(car.x, car.y - z * 0.7);
    if (z > 0) ctx.scale(1 + z / 260, 1 + z / 260);
    ctx.rotate(car.a);
    const col = car.wrecked ? "#2a2a2a" : car.color;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(col.startsWith("#") ? col : "#555555", 1.25)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col.startsWith("#") ? col : "#555555", 0.7));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, car.type === "van" ? 4 : 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    // cabin
    const isVan = car.type === "van";
    const cabF = isVan ? w * 0.36 : w * 0.18, cabB = isVan ? -w * 0.46 : -w * 0.26;
    ctx.fillStyle = car.wrecked ? "#111" : "#16202c";
    ctx.beginPath(); ctx.roundRect(cabB, -h / 2 + 3, cabF - cabB, h - 6, 4); ctx.fill();
    ctx.fillStyle = car.wrecked ? "#1d1d1d" : shade(col.startsWith("#") ? col : "#555555", 1.05);
    ctx.beginPath(); ctx.roundRect(cabB + (isVan ? 4 : w * 0.1), -h / 2 + 4.5, (cabF - cabB) - (isVan ? 10 : w * 0.18), h - 9, 3); ctx.fill();
    // windshield shine
    ctx.fillStyle = "rgba(160,220,255,0.35)";
    ctx.fillRect(cabF - 5, -h / 2 + 4, 3, h - 8);
    if (!car.wrecked) {
      // lights
      ctx.fillStyle = "#fffbe0";
      ctx.fillRect(w / 2 - 3, -h / 2 + 2, 3, 5); ctx.fillRect(w / 2 - 3, h / 2 - 7, 3, 5);
      ctx.fillStyle = car.braking ? "#ff3030" : "#a01818";
      ctx.fillRect(-w / 2, -h / 2 + 2, 3, 5); ctx.fillRect(-w / 2, h / 2 - 7, 3, 5);
      if (car.s.taxi) { ctx.fillStyle = "#111"; ctx.fillRect(-5, -4, 10, 8); ctx.fillStyle = "#ffe066"; ctx.fillRect(-4, -3, 8, 6); }
      if (car.s.police) {
        ctx.fillStyle = "#e9ecef"; ctx.fillRect(-w * 0.12, -h / 2, w * 0.3, h);
        ctx.fillStyle = "#0b132b"; ctx.fillRect(-w * 0.04, -h / 2 + 4, w * 0.14, h - 8);
        const on = car.siren && Math.floor(time * 8) % 2 === 0;
        ctx.fillStyle = car.siren ? (on ? "#ff2040" : "#400") : "#522"; ctx.fillRect(-3, -h / 2 + 3, 5, h / 2 - 3);
        ctx.fillStyle = car.siren ? (!on ? "#2080ff" : "#024") : "#225"; ctx.fillRect(-3, 0, 5, h / 2 - 3);
      }
      if (car.type === "sports" || car.type === "super") { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-w / 2 + 2, -2, w * 0.3, 4); }
      if (car.type === "muscle") { ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fillRect(cabF, -3, w / 2 - cabF - 3, 2); ctx.fillRect(cabF, 1, w / 2 - cabF - 3, 2); }
    }
    for (const [dx, dy, r] of car.dents) { ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(dx * w, dy * h, r, 0, TAU); ctx.fill(); }
    ctx.restore();
  };

  G.drawPerson = function (ctx, p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(3, 4, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.a);
    if (p.state === "down") {
      ctx.fillStyle = p.shirt; ctx.fillRect(-12, -5, 18, 10);
      ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(9, 0, 5, 0, TAU); ctx.fill();
      ctx.restore(); return;
    }
    const sw = Math.sin(p.walk || 0) * 5;
    ctx.fillStyle = p.pants || "#333";
    ctx.fillRect(sw - 3, -5, 6, 3.5); ctx.fillRect(-sw - 3, 1.5, 6, 3.5);
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(-sw * 0.6, -9, 2.6, 0, TAU); ctx.arc(sw * 0.6, 9, 2.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(1, 0, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = p.hair || "#2b1d14"; ctx.beginPath(); ctx.arc(-0.5, 0, 4.4, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    ctx.restore();
  };
})();
