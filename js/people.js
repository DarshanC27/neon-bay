// ---------- realistic people: rigged, skinned human models (CC0 MakeHuman bodies built with ara3d) ----------
// Every character in the game is still run by the procedural rig in humanoid.js (it knows how to sit in a car, ride a
// bike, throw a punch, lie on the ground...). When the real cast has loaded, a nearby person's procedural rig is hidden
// and a real body is attached in its place:
//  - standing, walking, running, waving, on the phone and driving play motion-captured clips;
//  - every other pose (fights, falls, riding, CPR, swinging...) is retargeted from the procedural rig onto the real
//    skeleton, bone by bone: each joint's rotation away from its rest pose is carried over in world space.
// Phones, file:// pages and anything that fails to load keep the procedural people.
(function () {
  const P = (G.people = { ready: false, active: 0, MAX: 18, failed: false });
  const BASE = "assets/people/";
  const CIVILIANS = ["athletic_man", "athletic_woman", "businesswoman", "elder", "beach_girl", "female_executive", "gamer"];
  const ROLE = { gang: ["gangster"], medic: ["paramedic"], police: ["police_officer_usa"] };
  const MEN = new Set(["athletic_man", "elder", "gamer", "gangster", "paramedic", "police_officer_usa"]);
  P.CAST = CIVILIANS.concat(["gangster", "paramedic", "police_officer_usa"]);
  const cast = {}; let clips = {};
  const CLIP = { idle: "Idle", walk: "Walk", run: "Run", look: "Look around", phone: "Phone call", text: "Texting", talk: "Talk", wave: "Wave", drive: "Drive car", passenger: "Sit (passenger)" };
  P.isMan = (k) => MEN.has(k);

  P.load = function () {
    if (P.loading || P.ready) return; P.loading = true;
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils || location.protocol === "file:" || (G.settings && G.settings.mobile) || (G.settings && G.settings.realPeople === false)) { P.failed = true; return; }
    const loader = new THREE.GLTFLoader(), get = (u) => new Promise((res, rej) => loader.load(BASE + u, res, undefined, rej));
    get("anims.glb").then((g) => {
      for (const c of g.animations) {
        // keep bone rotations + the hips' movement; drop anything aimed at props or face morphs
        c.tracks = c.tracks.filter((t) => t.name.endsWith(".quaternion") || t.name === "Hips.position");
        clips[c.name] = c;
      }
      // the cast streams in one by one; people use whoever has arrived
      let chain = Promise.resolve();
      for (const k of P.CAST) chain = chain.then(() => get(k + ".glb").then((m) => { prepTemplate(k, m.scene); }).catch(() => {}));
      return chain;
    }).then(() => { P.loading = false; }).catch((e) => { P.failed = true; P.loading = false; console.warn("people: cast not loaded", e); });
  };

  function prepTemplate(key, scene) {
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; // skinned bounds don't follow the pose
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { m.envMapIntensity = G.AMBIENT_ENV || 0.42; if (m.transparent && m.alphaTest === 0) { m.alphaTest = 0.4; m.transparent = false; } } // hair cards: cut-out, no sorting
      }
    });
    let hipY = 0.94; scene.traverse((o) => { if (o.isBone && o.name === "Hips") hipY = o.position.y; });
    cast[key] = { scene, hipY }; P.ready = true;
  }
  P.pick = function (key, role) {
    const list = (ROLE[role] || CIVILIANS).filter((k) => cast[k]); if (!list.length) return null;
    let h = 7; const s = String(key); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return list[Math.abs(h) % list.length];
  };
  P.has = (k) => !!cast[k];

  // ---- attach a real body to a procedural rig ----
  const MAP = [ // [bone, rig joint getter, child bone (for the segment direction), rig child joint getter]
    ["Hips", (R) => R.hips], ["Spine", (R) => R.torso], ["Head", (R) => R.head],
    ["LeftArm", (R) => R.L.sh, "LeftForeArm", (R) => R.L.el], ["LeftForeArm", (R) => R.L.el, "LeftHand", (R) => R.L.hand],
    ["RightArm", (R) => R.R.sh, "RightForeArm", (R) => R.R.el], ["RightForeArm", (R) => R.R.el, "RightHand", (R) => R.R.hand],
    ["LeftUpLeg", (R) => R.L.hp, "LeftLeg", (R) => R.L.kn], ["LeftLeg", (R) => R.L.kn, "LeftFoot", (R) => R.L.ft],
    ["RightUpLeg", (R) => R.R.hp, "RightLeg", (R) => R.R.kn], ["RightLeg", (R) => R.R.kn, "RightFoot", (R) => R.R.ft],
    ["LeftFoot", (R) => R.L.ft, "LeftToeBase", null], ["RightFoot", (R) => R.R.ft, "RightToeBase", null],
  ];
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
  P.attach = function (R, key) {
    if (!cast[key] || R.real || P.active >= P.MAX) return false;
    const t = cast[key], model = THREE.SkeletonUtils.clone(t.scene), holder = new THREE.Group();
    holder.rotation.y = Math.PI / 2; holder.scale.setScalar(10); holder.add(model); R.root.add(holder); // model faces +Z in metres; the rig faces +X in decimetres
    const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    for (const m of R.parts) m.visible = false; // the procedural body stays as an invisible skeleton to drive from
    // calibration at rest: both skeletons in their rest pose
    R.root.updateMatrixWorld(true);
    const cal = [];
    for (const [bn, jf, cbn, cjf] of MAP) {
      const b = bones[bn], j = jf(R); if (!b || !j) continue;
      const qB = b.getWorldQuaternion(new THREE.Quaternion()), qJ = j.getWorldQuaternion(new THREE.Quaternion()), A = new THREE.Quaternion();
      if (cbn && bones[cbn]) {
        const bDir = bones[cbn].getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
        let jDir; if (cjf) jDir = cjf(R).getWorldPosition(new THREE.Vector3()).sub(j.getWorldPosition(new THREE.Vector3())).normalize();
        else jDir = new THREE.Vector3(1, -0.25, 0).normalize().applyQuaternion(R.root.getWorldQuaternion(new THREE.Quaternion())); // a foot points forward
        A.setFromUnitVectors(bDir, jDir);
      }
      cal.push({ b, j, restJinv: qJ.clone().invert(), base: A.multiply(qB) });
    }
    const rest = new Map(); model.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
    const mixer = new THREE.AnimationMixer(model), actions = {};
    for (const n in CLIP) { const c = clips[CLIP[n]]; if (c) { const a = mixer.clipAction(c); a.enabled = true; a.setEffectiveWeight(0); a.play(); actions[n] = a; } }
    let h = 0; const s = String(key) + (R.root.id || 0); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    R.real = { key, model, holder, bones, cal, rest, mixer, actions, cur: null, hipY: t.hipY, idleVar: ["idle", "idle", "look", "phone", "text", "talk"][Math.abs(h) % 6], ph: (Math.abs(h) % 100) / 100 };
    for (const a of Object.values(actions)) a.time = R.real.ph * a.getClip().duration;
    P.active++; P.live.add(R);
    return true;
  };
  P.detach = function (R) {
    if (!R.real) return; R.real.mixer.stopAllAction(); R.root.remove(R.real.holder); for (const m of R.parts) m.visible = true; R.real = null; P.active--; P.live.delete(R);
  };
  // bodies whose person left the scene (despawned, car scrapped) go back to the pool
  P.live = new Set();
  P.prune = function (scene) { for (const R of P.live) { let o = R.root; while (o && o !== scene) o = o.parent; if (!o) P.detach(R); } };

  // which clip plays for an animation state (null: retarget the procedural pose instead)
  function clipFor(r, a) {
    if (a.action || a.punch || a.hit) return null;
    switch (a.mode) {
      case "idle": case "wait": return a.speed > 5 ? "walk" : r.idleVar;
      case "walk": return a.speed < 4 ? r.idleVar : "walk";
      case "run": case "sprint": case "flee": return "run";
      case "wave": return "wave";
      case "sit": return a.passenger ? "passenger" : "drive";
      default: return null;
    }
  }
  function fade(r, name, dt) {
    for (const n in r.actions) { const act = r.actions[n], w = act.getEffectiveWeight(), want = n === name ? 1 : 0; if (w !== want) act.setEffectiveWeight(w + (want - w) * Math.min(1, dt * 8)); }
  }
  // called after the procedural rig has been posed for this frame
  P.drive = function (R, a, dt) {
    const r = R.real; if (!r) return;
    const name = clipFor(r, a || {});
    if (name && r.actions[name]) {
      if (r.cur === null) for (const n in r.actions) r.actions[n].setEffectiveWeight(n === name ? 1 : 0); // coming from a retargeted pose: cut straight in
      r.cur = name; fade(r, name, dt);
      const ref = name === "walk" ? 55 : name === "run" ? 140 : 0;
      r.actions[name].timeScale = ref ? Math.min(1.7, Math.max(0.6, (a.speed || ref) / ref)) : 1;
      r.mixer.update(dt);
      r.holder.position.set(0, 0, 0);
      if (name === "drive" || name === "passenger") { // seated clips: put the hips where the rig's seat is
        R.root.updateMatrixWorld(true); R.hips.getWorldPosition(_v); r.bones.Hips.getWorldPosition(_v2);
        _v.sub(_v2); R.root.worldToLocal(_v.add(R.root.getWorldPosition(_v2))); r.holder.position.copy(_v);
      }
      return;
    }
    // ---- retarget: carry each rig joint's rotation (relative to its rest pose) onto the matching bone ----
    r.cur = null; for (const n in r.actions) r.actions[n].setEffectiveWeight(0);
    for (const [b, q] of r.rest) b.quaternion.copy(q); // unmapped bones (spine segments, shoulders, fingers) at rest
    r.holder.position.set(0, 0, 0);
    R.root.updateMatrixWorld(true); r.model.updateMatrixWorld(true);
    for (const c of r.cal) {
      c.j.getWorldQuaternion(_q).multiply(c.restJinv);     // the joint's rotation away from rest, in world space
      _q.multiply(c.base);                                   // ... applied to the bone's (aligned) rest orientation
      c.b.parent.getWorldQuaternion(_q2).invert();
      c.b.quaternion.copy(_q2.multiply(_q));
      c.b.updateMatrixWorld(true);
    }
    // hips follow the rig's pelvis (crouching, lying down, a flip)
    const hb = r.bones.Hips; R.hips.getWorldPosition(_v);
    R.root.getWorldPosition(_v2); _v.sub(_v2).multiplyScalar(r.hipY * 10 / 9.6).add(_v2); // the real pelvis sits a little lower than the rig's
    hb.parent.worldToLocal(_v); hb.position.copy(_v);
  };

  // drive the real body every time the procedural rig is animated
  const H = G.humanoid, animate = H.animate;
  H.animate = function (R, a, dt) { animate(R, a, dt); if (R.real) P.drive(R, a, dt); };
})();
