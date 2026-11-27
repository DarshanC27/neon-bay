// ---------- dogs: people out walking their dogs ----------
// About one pedestrian in five has a dog at heel. It trots on the owner's left, sits and looks about when they stop,
// and bolts with them if they run. The dog is a realistic CC0 model (Grab3D, see assets/animals/DOG_LICENSE.txt);
// all dogs are drawn in one instanced call, and their gait is done in the vertex shader: the diagonal leg pairs swing
// (a trot), the body bobs, the head nods and the tail wags. Dogs are local scenery, like the pedestrians.
(function () {
  const D = (G.dogs = { list: [], MAX: 24, ready: false });
  let mesh = null, aPhase = null, aGait = null, loading = false, failed = false;
  const MAXI = 32, d = new THREE.Object3D();
  function load(scene) {
    if (loading || failed) return; loading = true;
    if (!THREE.GLTFLoader || location.protocol === "file:") { failed = true; return; }
    new THREE.GLTFLoader().load("assets/animals/dog.glb", (g) => {
      let src = null; g.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
      const geo = src.geometry.clone(); geo.computeBoundingBox();
      // make sure the head is at +X: the highest points (head and ears) sit at the front
      const pa = geo.attributes.position, top = geo.boundingBox.max.y; let hx = 0, hn = 0;
      for (let i = 0; i < pa.count; i++) if (pa.getY(i) > top * 0.85) { hx += pa.getX(i); hn++; }
      if (hn && hx / hn < 0) { geo.rotateY(Math.PI); geo.computeBoundingBox(); }
      const bb = geo.boundingBox, L = bb.max.x - bb.min.x, H = bb.max.y;
      const mat = src.material.clone(); mat.envMapIntensity = G.AMBIENT_ENV || 0.42;
      const u = { uLegTop: { value: H * 0.42 }, uHalf: { value: L / 2 }, uTime: { value: 0 } }; D.u = u;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = "attribute float aPhase; attribute float aGait; uniform float uLegTop, uHalf, uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          {
            float walk = clamp(aGait, 0.0, 1.0), run = clamp(aGait - 1.0, 0.0, 1.0), moving = max(walk, run);
            float front = step(0.0, transformed.x), side = step(0.0, transformed.z);
            // trot: front-left with back-right, front-right with back-left
            float legPh = aPhase + 3.14159 * mod(front + side, 2.0);
            float leg = clamp((uLegTop - transformed.y) / uLegTop, 0.0, 1.0);          // 0 at the hip / shoulder, 1 at the paw
            float swing = sin(legPh) * (0.32 * walk + 0.5 * run) * leg;
            transformed.x += swing * (uLegTop - min(transformed.y, uLegTop)) * 0.9;
            transformed.y += max(0.0, -cos(legPh)) * 0.35 * moving * leg;              // paws lift on the forward swing
            float body = 1.0 - leg;
            transformed.y += abs(sin(aPhase)) * (0.12 * walk + 0.35 * run) * body;      // the body bobs twice a stride
            // tail: everything well behind the hips wags (fast when standing happily, slower on the move)
            float tail = smoothstep(-uHalf * 0.62, -uHalf * 0.95, transformed.x) * step(uLegTop * 0.7, transformed.y);
            transformed.z += sin(uTime * (moving > 0.5 ? 9.0 : 13.0) + aPhase) * tail * (-transformed.x - uHalf * 0.62) * 0.55;
            // head: a nod with the stride, or a slow look around when sitting
            float head = smoothstep(uHalf * 0.55, uHalf * 0.85, transformed.x) * step(uLegTop, transformed.y);
            transformed.y += head * (sin(aPhase * 2.0) * 0.18 * moving);
            transformed.z += head * sin(uTime * 0.7 + aPhase) * 0.6 * (1.0 - moving) * (transformed.x - uHalf * 0.55);
          }`);
      };
      mat.customProgramCacheKey = () => "dog";
      aPhase = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1); aGait = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
      geo.setAttribute("aPhase", aPhase); geo.setAttribute("aGait", aGait);
      mesh = new THREE.InstancedMesh(geo, mat, MAXI); mesh.castShadow = mesh.receiveShadow = true; mesh.count = 0; mesh.frustumCulled = false;
      scene.add(mesh); D.ready = true; D.length = L;
    }, undefined, () => { failed = true; });
  }
  const hash = (s) => { let h = 7; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  let spawnT = 0;
  D.update = function (dt, time, scene, cx, cz) {
    if (!D.ready) { if (G.state.started) load(scene); return; }
    D.u.uTime.value = time;
    // owners: one walker in five (picked by their id, so the same people always have dogs)
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.8;
      for (const p of G.peds) {
        if (D.list.length >= D.MAX) break;
        if (p.crew || p._dogChecked || Math.abs(p.x - cx) > 700 || Math.abs(p.y - cz) > 700) continue;
        p._dogChecked = true;
        if (p.state === "down" || hash(p._pid = p._pid || (Math.random() * 1e9 | 0)) % 5) continue;
        const a = p.a || 0;
        D.list.push({ owner: p, x: p.x - Math.cos(a) * 8, y: p.y - Math.sin(a) * 8, a, ph: Math.random() * 6, gait: 0, sp: 0, look: Math.random() * 6 });
      }
    }
    let n = 0;
    for (let i = D.list.length - 1; i >= 0; i--) {
      const g = D.list[i], o = g.owner;
      if (!G.peds.includes(o) || Math.abs(g.x - cx) > 1100 || Math.abs(g.y - cz) > 1100) { D.list.splice(i, 1); if (o) o._dogChecked = false; continue; }
      // heel position: a body length behind and to the owner's left
      const oa = o.a || 0, fx = Math.cos(oa), fy = Math.sin(oa), tx = o.x - fx * 7 + fy * 9, ty = o.y - fy * 7 - fx * 9;
      const dx = tx - g.x, dy = ty - g.y, dd = Math.hypot(dx, dy), flee = o.state === "flee" || o.state === "fleeAway";
      const want = o.state === "down" ? 0 : dd < 2 ? 0 : Math.min(flee ? 230 : 120, dd * (flee ? 4 : 2.6));
      g.sp += (want - g.sp) * Math.min(1, dt * 5);
      if (dd > 0.01) { g.x += dx / dd * Math.min(dd, g.sp * dt); g.y += dy / dd * Math.min(dd, g.sp * dt); }
      if (dd > 400) { g.x = tx; g.y = ty; } // left far behind (teleported owner): catch up at once
      const ha = g.sp > 8 ? Math.atan2(dy, dx) : oa + Math.sin(time * 0.4 + g.look) * 0.5;
      g.a += angDiff(g.a, ha) * Math.min(1, dt * 6);
      g.gait = g.sp < 6 ? 0 : g.sp < 90 ? Math.min(1, g.sp / 40) : 1 + Math.min(1, (g.sp - 90) / 80);
      g.ph += dt * (g.gait > 1 ? 14 : 3 + g.sp * 0.09);
      if (n >= MAXI) continue;
      const [gr] = G.world.groundAt(g.x, g.y);
      d.position.set(g.x, Math.max(0, gr || 0), g.y); d.rotation.set(0, -g.a, 0); d.updateMatrix(); mesh.setMatrixAt(n, d.matrix);
      aPhase.setX(n, g.ph); aGait.setX(n, g.gait); n++;
    }
    mesh.count = n; mesh.visible = n > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; aPhase.needsUpdate = true; aGait.needsUpdate = true; }
  };
  D.count = () => (mesh ? mesh.count : 0);
})();
