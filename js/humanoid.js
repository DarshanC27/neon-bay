// ---------- articulated 3D humanoid: build + procedural animation ----------
// Model faces +X, up is +Y, its right side is +Z. Feet at y=0, about 20 units tall.
(function () {
  const H = (G.humanoid = {});
  const geoCache = {}, matCache = {};
  const box = (w, h, d) => geoCache[`b${w},${h},${d}`] || (geoCache[`b${w},${h},${d}`] = new THREE.BoxGeometry(w, h, d));
  const sph = (r) => geoCache[`s${r}`] || (geoCache[`s${r}`] = new THREE.SphereGeometry(r, 12, 9));
  const cap = (r, len) => geoCache[`p${r},${len}`] || (geoCache[`p${r},${len}`] = new THREE.CapsuleGeometry(r, len, 2, 8));
  const torsoGeo = () => geoCache.torso || (geoCache.torso = (() => { const g = new THREE.CylinderGeometry(1, 0.8, 7, 14, 3); g.scale(1.9, 1, 2.95); return g; })());
  const cyl = (r1, r2, h, n = 8) => geoCache[`c${r1},${r2},${h},${n}`] || (geoCache[`c${r1},${r2},${h},${n}`] = new THREE.CylinderGeometry(r1, r2, h, n));
  H.mat = (color, o = {}) => {
    const k = color + JSON.stringify(o);
    return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.05 }, o)));
  };
  const M = H.mat;
  function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true;
    if (parent) parent.add(m); return m;
  }
  const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };
  const hashStr = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };
  // painted face (eyes, brows, lips) on the head sphere: tinted by the skin colour, costs no extra meshes.
  // SphereGeometry puts +X (the way the body faces) at u = 0.5.
  const faceTex = {};
  function faceMap(kind) {
    if (faceTex[kind]) return faceTex[kind];
    const c = document.createElement("canvas"); c.width = 256; c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 128);
    const cx = 128, ey = 56;
    for (const sx of [-1, 1]) {
      const x = cx + sx * 11;
      g.fillStyle = "#f7f4ee"; g.beginPath(); g.ellipse(x, ey, 5.2, 3.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = kind % 3 === 0 ? "#3b2a1c" : kind % 3 === 1 ? "#2d4a63" : "#3d5a2a"; g.beginPath(); g.arc(x + sx * 0.4, ey + 0.3, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0c0c0c"; g.beginPath(); g.arc(x + sx * 0.4, ey + 0.3, 1.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(x - 1.4, ey - 1.6, 1.1, 1.1);
      g.strokeStyle = "rgba(60,35,25,0.55)"; g.lineWidth = 1; g.beginPath(); g.ellipse(x, ey, 5.4, 3.6, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); // upper lid
      g.fillStyle = "rgba(45,28,18,0.85)"; g.beginPath(); g.ellipse(x, ey - 7.5, 6.5, 1.4, sx * -0.12, 0, Math.PI * 2); g.fill(); // brow
    }
    g.fillStyle = "rgba(140,70,60,0.55)"; g.beginPath(); g.ellipse(cx, ey + 20, 6.5, 2.1, 0, 0, Math.PI * 2); g.fill(); // lips
    g.strokeStyle = "rgba(90,40,35,0.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 6.5, ey + 20); g.quadraticCurveTo(cx, ey + 21.5, cx + 6.5, ey + 20); g.stroke();
    g.fillStyle = "rgba(150,80,70,0.12)"; for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * 15, ey + 12, 5, 0, Math.PI * 2); g.fill(); } // cheeks
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return (faceTex[kind] = t);
  }
  const capGeo = (r, cover) => geoCache[`hc${r},${cover}`] || (geoCache[`hc${r},${cover}`] = new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI * cover));

  // outfit: { style, skin, shirt, pants, hair, shoes, accent }
  H.build = function (o) {
    const st = o.style || "civ";
    const skin = M(o.skin || "#c68642"), shirt = M(o.shirt || "#457b9d"), pants = M(o.pants || "#1b263b"), shoes = M(o.shoes || "#1a1a1a");
    const hair = M(o.hair || "#2b1d14"), accent = M(o.accent || "#ffffff");
    const root = new THREE.Group();
    const pose = grp(root);              // whole-body pose (lying down, rolls, flips)
    const hips = grp(pose, 0, 9.6, 0);
    const torso = grp(hips);
    const R = { root, pose, hips, torso, style: st };
    const sleeve = st === "civ" || st === "gang" || st === "kai" ? skin : shirt;
    // torso + pelvis (rounded, not a box)
    const pel = mesh(cap(1.45, 2.6), pants, 0, -0.5, 0, hips); pel.rotation.x = Math.PI / 2; pel.scale.set(1.22, 1, 1);
    R.chest = mesh(torsoGeo(), shirt, 0, 3.6, 0, torso);
    // head
    const head = (R.head = grp(torso, 0, 8.3, 0));
    mesh(cyl(0.9, 1.1, 1.4), skin, 0, -0.9, 0, head);
    R.skull = mesh(sph(2.25), st === "spindle" || st === "crimson" ? shirt : skin, 0.15, 1.3, 0, head);
    // limbs
    const limb = (side) => {
      const z = side * 3.75;
      const armMat = sleeve === skin && st === "gang" ? skin : sleeve;
      const sh = grp(torso, 0, 6.4, z);
      const up = mesh(cap(0.9, 2.9), armMat, 0, -1.75, 0, sh);                                      // upper arm
      mesh(sph(1.12), st === "civ" || st === "kai" || st === "gang" ? shirt : armMat, 0, -0.35, 0, sh).scale.set(1, 0.95, 1); // shoulder
      if ((st === "civ" || st === "kai") && hashStr(o.shirt + o.skin) % 3) mesh(cap(1.0, 1.2), shirt, 0, -1.25, 0, sh);   // t-shirt sleeve
      const el = grp(sh, 0, -4.1, 0);
      mesh(cap(0.74, 2.4), st === "civ" || st === "kai" || st === "gang" ? skin : shirt, 0, -1.8, 0, el); // forearm
      const hand = mesh(sph(0.82), st === "spindle" || st === "nova" || st === "crimson" ? M(o.accent || "#222") : st === "agent" ? M(o.gloves || "#1b1b22") : skin, 0, -4.1, 0, el);
      hand.scale.set(0.95, 1.15, 0.75); hand.castShadow = false;
      const hp = grp(hips, 0, -0.4, side * 1.45);
      const thigh = mesh(cap(1.15, 2.6), pants, 0, -2.4, 0, hp);                                    // thigh
      const kn = grp(hp, 0, -4.8, 0);
      mesh(cap(0.98, 2.5), pants, 0, -2.2, 0, kn);                                                 // shin
      const ft = grp(kn, 0, -4.2, 0);                                                              // ankle joint
      mesh(box(2.4, 1.05, 1.95), shoes, 0.35, -0.45, 0, ft);                                         // shoe body
      const toe = mesh(sph(1.0), shoes, 1.55, -0.5, 0, ft); toe.scale.set(1.15, 0.55, 0.98); toe.castShadow = false; // rounded toe box
      return { sh, el, hand, hp, kn, ft, up, thigh };
    };
    R.L = limb(-1); R.R = limb(1);

    // ----- style extras -----
    if (st === "civ" || st === "kai" || st === "gang") {
      const v = o.look !== undefined ? o.look : hashStr((o.skin || "") + (o.shirt || "") + (o.hair || "") + (o.pants || ""));
      // face painted on a slightly egg-shaped head, plus a nose
      R.skull.material = matCache["face" + (o.skin || "") + (v % 3)] || (matCache["face" + (o.skin || "") + (v % 3)] = new THREE.MeshStandardMaterial({ color: o.skin || "#c68642", map: faceMap(v % 3), roughness: 0.7 }));
      R.skull.scale.set(0.97, 1.08, 0.92);
      const nose = mesh(cap(0.38, 0.6), skin, 2.25, 1.15, 0, head); nose.scale.set(1.1, 1, 0.9); nose.castShadow = false;
      // hair: six styles chosen from the outfit, all rounded
      const hs = st === "gang" ? 1 : v % 6, hc = (r, cover, tilt, y = 1.42) => { const m = mesh(capGeo(r, cover), hair, 0.08, y, 0, head); m.rotation.z = tilt; m.scale.set(1, 1.02, 0.95); m.castShadow = false; return m; };
      if (hs === 0) hc(2.42, 0.52, 0.6);                                                 // short
      else if (hs === 1) hc(2.34, 0.5, 0.7);                                             // buzz cut
      else if (hs === 2) { hc(2.45, 0.55, 0.55); const back = mesh(cap(2.0, 3.0), hair, -1.15, -0.1, 0, head); back.scale.set(0.55, 1, 1.05); } // long
      else if (hs === 3) { hc(2.42, 0.52, 0.6); mesh(sph(1.15), hair, -1.6, 3.2, 0, head); } // bun
      else if (hs === 4) { const af = hc(2.85, 0.5, 0.3, 1.6); af.scale.set(1, 1.08, 1); } // curly / afro
      else if (hs === 5) { hc(2.44, 0.52, 0.6); const fr = mesh(cap(0.7, 3.4), hair, 1.55, 3.1, 0, head); fr.rotation.x = Math.PI / 2; fr.rotation.y = 0.0; fr.scale.set(1, 1, 1); } // quiff
    }
    if (st === "gang") { // bandana + tank-top straps
      mesh(box(4.7, 1.1, 4.7), M(o.accent || "#1d7fbf"), 0.1, 2.0, 0, head);
      mesh(box(3.7, 0.8, 0.9), M(o.accent || "#1d7fbf"), 0, 2.4, 0, R.chest);
      if (o.bat) { R.bat = mesh(cyl(0.45, 0.8, 11, 6), M("#8a5a2b"), 0, -4.4, 0, R.R.el); R.bat.rotation.z = Math.PI / 2; R.bat.position.set(4.6, -4.2, 0); }
    }
    if (st === "spindle") { // original masked acrobat: navy suit, teal bands, big white lenses
      const teal = M(o.accent || "#19e3d0", { emissive: "#0a5550", emissiveIntensity: 0.4 });
      mesh(box(1.25, 1.1, 1.6), M("#f4fbff", { emissive: "#bfefff", emissiveIntensity: 0.6 }), 2.1, 1.6, -0.85, head);
      mesh(box(1.25, 1.1, 1.6), M("#f4fbff", { emissive: "#bfefff", emissiveIntensity: 0.6 }), 2.1, 1.6, 0.85, head);
      mesh(box(3.7, 0.7, 5.9), teal, 0, 1.4, 0, torso); mesh(box(3.7, 0.7, 5.9), teal, 0, 4.4, 0, torso);
      mesh(box(0.4, 2.6, 2.6), teal, 1.85, 4.4, 0, torso).rotation.x = Math.PI / 4; // chest diamond
      for (const s of [R.L, R.R]) { mesh(box(1.8, 0.6, 1.8), teal, 0, -3.2, 0, s.sh); mesh(box(2.4, 0.6, 2.4), teal, 0, -3.8, 0, s.hp); }
      mesh(box(1.6, 0.5, 1.7), teal, 0.2, 0, 0, R.R.hand); // web shooter
    }
    if (st === "wraith") { // original hooded free-runner: charcoal coat, violet sash, shadowed face
      const coat = M(o.shirt || "#2b2b36"), sash = M(o.accent || "#8b3dff", { emissive: "#3a0f80", emissiveIntensity: 0.35 });
      R.skull.material = M("#151319");
      const hood = mesh(box(5.2, 5.2, 5.4), coat, -0.5, 1.7, 0, head);
      mesh(box(1.4, 3.6, 4.2), M("#07060a"), 2.0, 1.2, 0, head); // dark hood opening
      mesh(box(1.0, 0.5, 2.4), M("#c9c4ff", { emissive: "#8a7bff", emissiveIntensity: 1.2 }), 2.55, 1.7, 0, head); // eye glint
      hood.rotation.z = 0.05;
      mesh(box(3.8, 1.2, 6.0), sash, 0, 0.4, 0, torso);
      R.coat = mesh(box(3.0, 6.5, 5.6), coat, -0.4, -3.6, 0, hips); // coat tail
      R.coat.geometry = box(3.0, 6.5, 5.6);
      for (const s of [R.L, R.R]) mesh(box(1.8, 1.8, 1.8), M("#6c6c78", { metalness: 0.6, roughness: 0.4 }), 0, -2.4, 0, s.el); // bracers
      R.blade = mesh(box(3.2, 0.3, 0.5), M("#e6e6f0", { metalness: 0.9, roughness: 0.2 }), 1.2, -4.2, 0, R.R.el); R.blade.visible = false;
    }
    if (st === "nova") { // original powerhouse: white/gold suit, glowing core, cape
      const gold = M(o.accent || "#ffc83d", { metalness: 0.6, roughness: 0.35 });
      mesh(box(3.7, 1.5, 4.7), gold, 0.1, 2.6, 0, head); // visor band
      mesh(box(0.6, 0.6, 3.6), M("#9ff8ff", { emissive: "#55f0ff", emissiveIntensity: 1.5 }), 2.2, 1.6, 0, head);
      R.core = mesh(sph(1.1), M("#aef9ff", { emissive: "#38e8ff", emissiveIntensity: 2 }), 1.9, 4.6, 0, torso);
      mesh(box(3.8, 0.9, 6.0), gold, 0, 0.2, 0, torso);
      for (const s of [R.L, R.R]) mesh(box(1.9, 1.4, 1.9), gold, 0, -3.5, 0, s.kn);
      const capeP = (R.capeP = grp(torso, -1.9, 7.0, 0));
      R.cape = mesh(box(0.35, 10.5, 6.4), M(o.cape || "#c1121f", { side: THREE.DoubleSide }), 0, -5.2, 0, capeP);
    }
    if (st === "crimson") { // original red & black nano-suit: angular lenses, black panels, chevron emblem, glowing seams
      const blk = M("#121216", { roughness: 0.45, metalness: 0.25 }), glow = M("#ff2a44", { emissive: "#ff1f3d", emissiveIntensity: 1.6 });
      const lens = M("#ffffff", { emissive: "#dff4ff", emissiveIntensity: 0.9 }), silver = M("#e9edf5", { metalness: 0.8, roughness: 0.25, emissive: "#ffffff", emissiveIntensity: 0.15 });
      R.chest.material = M(o.shirt || "#c8102e", { roughness: 0.5, metalness: 0.1 });
      for (const z of [-0.95, 0.95]) {
        const fr = mesh(box(1.1, 1.6, 1.9), blk, 2.05, 1.65, z, head); fr.rotation.x = z > 0 ? 0.38 : -0.38;
        const l = mesh(box(1.12, 1.15, 1.45), lens, 2.18, 1.65, z, head); l.rotation.x = z > 0 ? 0.38 : -0.38;
      }
      mesh(box(4.0, 0.7, 0.7), blk, 0.0, 3.35, 0, head); mesh(box(0.7, 2.6, 0.5), blk, 2.2, 2.6, 0, head); // black crown seam running into the brow
      for (const z of [-0.7, 0.7]) { const c = mesh(box(0.3, 3.3, 0.75), silver, 1.86, 4.7, z, torso); c.rotation.x = z > 0 ? -0.62 : 0.62; } // chevron emblem
      mesh(box(0.25, 1.0, 0.5), glow, 1.9, 2.6, 0, torso);
      for (const z of [-2.6, 2.6]) mesh(box(3.72, 7.05, 0.75), blk, 0, 3.6, z, torso); // side panels
      mesh(box(3.75, 0.8, 5.95), blk, 0, 0.25, 0, torso); // belt
      mesh(box(3.75, 0.25, 5.95), glow, 0, 0.7, 0, torso);
      for (const s2 of [R.L, R.R]) {
        mesh(box(1.85, 2.3, 1.85), blk, 0, -1.0, 0, s2.sh);                 // black shoulders
        mesh(box(0.3, 3.2, 0.3), glow, 0.82, -1.9, 0, s2.el);              // forearm seam
        mesh(box(2.15, 3.0, 2.15), blk, 0, -3.0, 0, s2.kn);                // boots
        mesh(box(0.3, 4.0, 0.35), glow, 1.2, -2.4, 0, s2.hp);              // thigh seam
      }
      mesh(box(1.7, 0.6, 1.8), glow, 0.2, 0.1, 0, R.R.hand); // web shooter
      mesh(box(1.7, 0.6, 1.8), glow, 0.2, 0.1, 0, R.L.hand);
    }
    if (st === "agent") { // original tactical agents: vest, shoulder plate, glowing trim, hair / visor / mask variants
      const acc = M(o.accent || "#ff4655", { emissive: o.accent || "#ff4655", emissiveIntensity: 0.9 });
      const vest = M(o.vest || "#22232b", { roughness: 0.55, metalness: 0.2 }), hairM = M(o.hair || "#1a1a1a");
      mesh(box(3.85, 4.6, 6.05), vest, 0, 4.3, 0, torso);
      const strap = mesh(box(0.25, 7.2, 0.6), acc, 1.95, 3.8, 0, torso); strap.rotation.x = 0.55;
      mesh(box(3.85, 0.7, 6.05), M("#15151a"), 0, 0.3, 0, torso);
      for (const z of [-1.8, 1.8]) mesh(box(1.4, 1.2, 1.2), vest, 1.6, 0.0, z, torso); // pouches
      const pad = mesh(box(2.4, 1.2, 2.4), M(o.pad || o.vest || "#2c2d36", { metalness: 0.5, roughness: 0.4 }), 0, 0.2, 0, (o.padSide < 0 ? R.L : R.R).sh);
      mesh(box(2.45, 0.3, 2.45), acc, 0, -0.35, 0, pad.parent);
      for (const s2 of [R.L, R.R]) { mesh(box(1.7, 0.4, 1.7), acc, 0, -3.3, 0, s2.el); mesh(box(2.2, 0.45, 2.2), acc, 0, -0.6, 0, s2.kn); }
      if (o.hairStyle === "spiky") for (let k = 0; k < 5; k++) { const sp = mesh(box(1.2, 2.4, 1.2), hairM, -0.6 + (k % 2) * 0.6, 3.6, -1.6 + k * 0.8, head); sp.rotation.z = -0.5; sp.rotation.x = (k - 2) * 0.25; }
      if (o.hairStyle === "bun") { mesh(box(3.8, 1.5, 4.5), hairM, -0.3, 3.0, 0, head); mesh(sph(1.2), hairM, -1.6, 3.6, 0, head); }
      if (o.hairStyle === "long") { mesh(box(3.8, 1.5, 4.6), hairM, -0.3, 3.0, 0, head); mesh(box(1.2, 4.6, 4.4), hairM, -1.7, 0.9, 0, head); }
      if (o.hairStyle === "hood") { mesh(box(5.0, 5.0, 5.2), vest, -0.6, 1.7, 0, head); mesh(box(1.2, 3.4, 4.0), M("#07060a"), 1.95, 1.2, 0, head); }
      if (o.hairStyle === "helmet") { mesh(box(4.9, 3.2, 5.0), M(o.vest || "#2c2d36", { metalness: 0.6, roughness: 0.3 }), -0.2, 2.6, 0, head); }
      if (o.visor) mesh(box(0.6, 0.8, 4.3), acc, 2.2, 1.65, 0, head);
      else if (o.mask) mesh(box(0.5, 1.3, 3.6), acc, 2.25, 0.6, 0, head); // lower-face mask with glowing edge
      if (!o.visor) { mesh(box(0.4, 0.5, 0.5), M(o.eyes || "#111", o.eyes ? { emissive: o.eyes, emissiveIntensity: 1.5 } : {}), 2.25, 1.6, -0.8, head); mesh(box(0.4, 0.5, 0.5), M(o.eyes || "#111", o.eyes ? { emissive: o.eyes, emissiveIntensity: 1.5 } : {}), 2.25, 1.6, 0.8, head); }
    }
    // web / grapple line (world-space, managed by the renderer)
    R.parts = [];
    root.traverse((m) => m.isMesh && R.parts.push(m));
    R.anim = { phase: Math.random() * 10, t: 0, blend: 0, look: Math.random() * 50 };
    R.joints = [pose, hips, torso, R.head, R.L.sh, R.L.el, R.L.hp, R.L.kn, R.L.ft, R.R.sh, R.R.el, R.R.hp, R.R.kn, R.R.ft];
    return R;
  };

  // ---------- procedural animation (biomechanical gait + pose blending) ----------
  const sin = Math.sin, cos = Math.cos, max = Math.max, pow = Math.pow;
  // gait profiles: hip/knee amplitudes (rad), arm swing, trunk lean, pelvis twist, lateral weight shift, flight lift, cadence
  const GAIT = {
    walk:   { hip: 0.42, fwd: 0.02, knee: 1.05, stance: 0.2,  arm: 0.36, elbow: 0.22, elbowSw: 0.38, lean: -0.05, twist: 0.1,  sway: 0.32, flight: 0,   ref: 55,  step: 24, toe: 0.5 },
    run:    { hip: 0.7,  fwd: 0.12, knee: 1.75, stance: 0.32, arm: 0.72, elbow: 1.35, elbowSw: 0.25, lean: -0.2,  twist: 0.14, sway: 0.14, flight: 0.8, ref: 130, step: 40, toe: 0.65 },
    sprint: { hip: 0.92, fwd: 0.18, knee: 2.15, stance: 0.34, arm: 1.05, elbow: 1.5,  elbowSw: 0.2,  lean: -0.36, twist: 0.16, sway: 0.1,  flight: 1.2, ref: 200, step: 50, toe: 0.75 },
  };
  GAIT.flee = Object.assign({}, GAIT.run, { lean: -0.08, arm: 0.4 });
  const GROUND = { walk: 1, run: 1, sprint: 1, flee: 1, idle: 1, wait: 1, wave: 1, stagger: 1 };
  const SEAT = { sit: 1, ride: 1, pedal: 1, pillion: 1 };
  // seated: driving a car, riding a motorbike (tucked, hands on the bars), pedalling a bicycle, or riding pillion
  function seated(R, S, m, sp, dt) {
    const L = R.L, Rr = R.R, both = (f) => { f(L, 1); f(Rr, -1); };
    if (m === "sit") {
      both((s, sd) => { s.hp.rotation.z = 1.45; s.kn.rotation.z = -1.35; s.ft.rotation.z = 0.25; s.sh.rotation.z = 1.05; s.el.rotation.z = 0.55; s.sh.rotation.x = -sd * 0.22; });
      R.torso.rotation.z = 0.14; R.head.rotation.z = -0.08;
    } else if (m === "ride" || m === "pillion") {
      const p = m === "pillion";
      both((s, sd) => { s.hp.rotation.z = p ? 1.25 : 1.15; s.kn.rotation.z = -2.05; s.ft.rotation.z = 0.7; s.hp.rotation.x = sd * 0.12; s.sh.rotation.z = p ? 0.6 : 1.2; s.el.rotation.z = p ? 0.9 : 0.35; s.sh.rotation.x = -sd * (p ? 0.35 : 0.12); });
      R.torso.rotation.z = p ? -0.3 : -0.62; R.head.rotation.z = p ? 0.15 : 0.5;
    } else { // pedal: legs turn the cranks, a little body rock
      S.phase += dt * clamp(sp * 0.085, 0, 11);
      const ph = S.phase;
      both((s, sd) => { const q = ph + (sd > 0 ? 0 : Math.PI); s.hp.rotation.z = 1.05 + 0.42 * sin(q); s.kn.rotation.z = -1.25 - 0.55 * cos(q); s.ft.rotation.z = 0.35 + 0.2 * sin(q); s.sh.rotation.z = 0.95; s.el.rotation.z = 0.35; s.sh.rotation.x = -sd * 0.1; });
      R.torso.rotation.z = -0.38; R.torso.rotation.x = sin(ph) * 0.05 * clamp(sp / 60, 0, 1); R.head.rotation.z = 0.3;
    }
  }
  const HIPS_REST = 9.6, LEG_REST = 9.95; // pelvis height, hip-pivot-to-sole length

  function reset(R) {
    R.pose.rotation.set(0, 0, 0); R.pose.position.set(0, 0, 0);
    R.hips.position.set(0, HIPS_REST, 0); R.hips.rotation.set(0, 0, 0); R.torso.rotation.set(0, 0, 0); R.head.rotation.set(0, 0, 0);
    for (const s of [R.L, R.R]) { s.sh.rotation.set(0, 0, 0); s.el.rotation.set(0, 0, 0); s.hp.rotation.set(0, 0, 0); s.kn.rotation.set(0, 0, 0); s.ft.rotation.set(0, 0, 0); }
    if (R.blade) R.blade.visible = false;
  }
  // keep the stance foot on the ground: pelvis height follows the longest (planted) leg
  function plant(R, extra = 0) {
    const reach = (s) => 4.8 * cos(s.hp.rotation.z) + 5.15 * cos(s.hp.rotation.z + s.kn.rotation.z);
    R.hips.position.y = HIPS_REST - (LEG_REST - max(reach(R.L), reach(R.R))) + extra;
  }
  // keep the feet roughly parallel to the ground whatever the legs are doing
  const levelFeet = (R, w = 0.85) => { for (const s of [R.L, R.R]) s.ft.rotation.z += -(s.hp.rotation.z + s.kn.rotation.z) * w; };

  function gait(R, S, m, sp, dt) {
    const c = GAIT[m], k = clamp(sp / c.ref, 0.35, 1.2);
    S.phase += Math.PI * clamp(sp / c.step, 1.2, 4.4) * dt;
    const p = S.phase, L = R.L, Rr = R.R;
    const leg = (s, th, side) => {
      const swing = pow(max(0, cos(th + 0.5)), 1.6);                    // knee flexes right after toe-off
      const load = cos(th) < 0 ? max(0, -sin(2 * th)) : 0;              // loading-response flex after heel strike
      const h = c.hip * k * sin(th) + c.fwd * k;
      const kn = -(c.knee * k * swing + c.stance * k * load + 0.05);
      s.hp.rotation.z = h; s.kn.rotation.z = kn; s.hp.rotation.x = side * 0.04; // slight toe-out
      s.ft.rotation.z = -(h + kn) * 0.7 - c.toe * 2 * max(0, -sin(th)) * max(0, cos(th)) + 0.4 * k * max(0, sin(th)) * max(0, cos(th));
    };
    leg(L, p, 1); leg(Rr, p + Math.PI, -1);
    const arm = (s, th, side) => {
      const fwd = -sin(th - 0.3);                                       // opposite to the same-side leg, slight lag
      s.sh.rotation.z = c.arm * k * fwd + 0.05;
      s.el.rotation.z = c.elbow * (0.6 + 0.4 * k) + c.elbowSw * max(0, fwd);
      s.sh.rotation.x = side * (0.1 + 0.04 * k);
      s.sh.rotation.y = side * 0.12 * fwd * k;                          // arms swing slightly across the body
    };
    arm(L, p, 1); arm(Rr, p + Math.PI, -1);
    const tw = c.twist * k * sin(p);
    R.hips.rotation.y = -tw; R.torso.rotation.y = tw * 1.7;             // pelvis and shoulders counter-rotate
    R.head.rotation.y = -tw * 0.65;                                     // gaze stays on the path
    R.hips.position.z = c.sway * cos(p) * (m === "walk" ? 1 : k);       // weight shifts over the stance foot
    R.hips.rotation.x = 0.045 * cos(p) * k;                             // pelvic drop on the swing side
    R.torso.rotation.z = c.lean * Math.min(1, k) + 0.035 * k * sin(2 * p + 0.6);
    R.torso.rotation.x = -0.035 * cos(p) * k;
    R.head.rotation.z = -R.torso.rotation.z * 0.45;
    R.pose.rotation.x = clamp(-S.turn * (m === "walk" ? 0.02 : 0.05) * k, -0.32, 0.32); // lean into turns
    plant(R, c.flight * k * pow(sin(p), 2));
  }

  function idle(R, S, a) {
    const t = S.t, L = R.L, Rr = R.R, br = sin(t * 1.7);               // breathing
    const shift = sin(t * 0.33 + S.look) * 0.5 + 0.5;                   // slow weight shift between feet
    R.hips.position.z = (shift - 0.5) * 0.6; R.hips.rotation.x = (shift - 0.5) * 0.07;
    L.kn.rotation.z = -0.05 - 0.22 * (1 - shift); Rr.kn.rotation.z = -0.05 - 0.22 * shift; // relaxed knee on the unloaded leg
    L.hp.rotation.z = 0.1 * (1 - shift); Rr.hp.rotation.z = 0.1 * shift;
    R.torso.rotation.z = -0.02 + br * 0.018; R.torso.rotation.x = -(shift - 0.5) * 0.05;
    const g = sin(t * 0.21 + S.look * 1.3), gl = Math.sign(g) * pow(Math.abs(g), 3); // glance around now and then
    R.head.rotation.y = gl * 0.55 + sin(t * 0.9) * 0.04; R.head.rotation.z = sin(t * 0.37 + S.look) * 0.06 + 0.02;
    for (const [s, side] of [[L, 1], [Rr, -1]]) { s.sh.rotation.x = side * (0.12 + br * 0.015); s.sh.rotation.z = 0.06 + br * 0.02; s.el.rotation.z = 0.18; s.sh.rotation.y = side * 0.1; }
    if (a.guard) { // bladed fighting stance with a bounce
      const b = sin(t * 5.5);
      R.torso.rotation.y = -0.35; R.head.rotation.y = 0.3; R.torso.rotation.z = -0.12; R.head.rotation.z = 0.1; R.hips.position.z = 0;
      L.hp.rotation.z = 0.32; Rr.hp.rotation.z = -0.22; L.kn.rotation.z = -0.42 - b * 0.05; Rr.kn.rotation.z = -0.38 - b * 0.05;
      L.sh.rotation.z = 1.05; Rr.sh.rotation.z = 0.85; L.el.rotation.z = 1.95; Rr.el.rotation.z = 2.1; L.sh.rotation.x = 0.25; Rr.sh.rotation.x = -0.3;
    }
    if (a.mode === "wave") { Rr.sh.rotation.x = -2.6; Rr.sh.rotation.z = 0.2; Rr.el.rotation.x = 0; Rr.el.rotation.z = 0.7 + sin(t * 9) * 0.45; R.head.rotation.y = 0; R.torso.rotation.z = 0.05; }
    levelFeet(R, 1);
    plant(R, br * 0.04);
  }

  const AX = ["x", "y", "z"];
  function smooth(R, S, rate, poseRate, snapPose, dt) {
    const J = R.joints, n = J.length, init = !S.cur;
    if (init) S.cur = new Float32Array(n * 3 + 6);
    const c = S.cur, kf = 1 - Math.exp(-rate * dt), kp = 1 - Math.exp(-poseRate * dt);
    for (let i = 0; i < n; i++) {
      const r = J[i].rotation, f = i === 0 ? kp : kf, snap = init || (i === 0 && snapPose);
      for (let ax = 0; ax < 3; ax++) {
        const key = AX[ax], j = i * 3 + ax, tv = r[key];
        c[j] = snap || Math.abs(tv - c[j]) > 3 ? tv : c[j] + (tv - c[j]) * f;
        r[key] = c[j];
      }
    }
    const P = [R.pose.position, R.hips.position];
    for (let i = 0; i < 2; i++) for (let ax = 0; ax < 3; ax++) {
      const key = AX[ax], j = n * 3 + i * 3 + ax, tv = P[i][key];
      c[j] = init || (i === 0 && snapPose) ? tv : c[j] + (tv - c[j]) * (i === 0 ? kp : kf);
      P[i][key] = c[j];
    }
  }

  // a: { mode, speed (units/s), t (seconds in state), action, actionT (0..1), lean, swingPitch }
  H.animate = function (R, a, dt) {
    const S = R.anim; dt = Math.min(dt || 0.016, 0.1); S.t += dt;
    // turn rate from the root's yaw (set by the renderer after the previous frame)
    const yaw = R.root.rotation.y; if (S.yaw === undefined) { S.yaw = yaw; S.turn = 0; }
    let dy = yaw - S.yaw; dy -= Math.round(dy / TAU) * TAU; S.yaw = yaw;
    S.turn += (clamp(dy / dt, -9, 9) - S.turn) * Math.min(1, dt * 7);
    reset(R);
    const L = R.L, Rr = R.R, m = a.mode || "idle", sp = a.speed || 0;
    let rate = 12, poseRate = 12, snapPose = false;
    if (SEAT[m]) { rate = 16; seated(R, S, m, sp, dt); }
    else if (GAIT[m]) {
      rate = 22;
      gait(R, S, m, sp, dt);
      if (m === "flee") { // panicked: hands up by the head, looking back
        L.sh.rotation.z = 2.4 + sin(S.phase * 2) * 0.35; Rr.sh.rotation.z = 2.4 - sin(S.phase * 2) * 0.35; L.sh.rotation.x = 0.45; Rr.sh.rotation.x = -0.45;
        L.el.rotation.z = 1.2; Rr.el.rotation.z = 1.2; R.head.rotation.y = sin(S.t * 1.3) * 0.7;
      } else if (m === "sprint" && (R.style === "spindle" || R.style === "crimson")) { // low hero sprint, arms swept back
        L.sh.rotation.z = -1.25; Rr.sh.rotation.z = -1.25; L.sh.rotation.x = 0.3; Rr.sh.rotation.x = -0.3; L.el.rotation.z = 0.3; Rr.el.rotation.z = 0.3;
        R.torso.rotation.z -= 0.15; R.head.rotation.z = 0.35;
      }
    } else if (m === "idle" || m === "wait" || m === "wave") {
      rate = a.guard ? 14 : 8; idle(R, S, a);
    } else if (m === "air" || m === "jump") {
      rate = 10; poseRate = 14;
      const u = clamp((a.vz || 0) / 260, -1, 1), up = max(0, u), dn = max(0, -u), fl = sin(S.t * 7) * 0.12;
      // rising: knees tucked, arms driving up; falling: legs reach for the ground, arms out for balance
      L.sh.rotation.z = 1.2 + up * 1.3 + fl; Rr.sh.rotation.z = 1.0 + up * 1.2 - fl; L.sh.rotation.x = 0.55 + dn * 0.5; Rr.sh.rotation.x = -0.55 - dn * 0.5;
      L.el.rotation.z = 0.5 + up * 0.4; Rr.el.rotation.z = 0.6;
      L.hp.rotation.z = 0.45 + up * 0.6 - dn * 0.15; L.kn.rotation.z = -0.7 - up * 0.9 + dn * 0.3;
      Rr.hp.rotation.z = 0.05 + up * 0.15 + dn * 0.25; Rr.kn.rotation.z = -0.45 - up * 0.5;
      R.torso.rotation.z = -0.12 * up + 0.08 * dn; R.head.rotation.z = 0.1 * dn;
      levelFeet(R, 0.5);
      if (a.flip) { R.pose.rotation.z = -a.flip; snapPose = true; L.hp.rotation.z = 1.8; Rr.hp.rotation.z = 1.8; L.kn.rotation.z = -2.2; Rr.kn.rotation.z = -2.2; }
    } else if (m === "dive") { // leap of faith: swan dive, arms spread wide
      poseRate = 6; R.pose.rotation.z = -1.25; L.sh.rotation.x = 1.5; Rr.sh.rotation.x = -1.5; L.sh.rotation.z = 0.25; Rr.sh.rotation.z = 0.25;
      L.hp.rotation.z = -0.1; Rr.hp.rotation.z = -0.05; L.kn.rotation.z = -0.15; Rr.kn.rotation.z = -0.3; R.head.rotation.z = 0.5;
      L.ft.rotation.z = -0.8; Rr.ft.rotation.z = -0.8; L.hp.rotation.x = 0.06; Rr.hp.rotation.x = -0.06;
    } else if (m === "climb") { // hand-over-hand: reach, grab, pull, foot pushes
      rate = 16;
      const p = (S.phase += dt * (sp > 2 ? 6.5 : 0)), s1 = sin(p), reachL = max(0, s1), reachR = max(0, -s1);
      L.sh.rotation.z = 2.4 + reachL * 0.6; Rr.sh.rotation.z = 2.4 + reachR * 0.6; L.sh.rotation.x = 0.3; Rr.sh.rotation.x = -0.3;
      L.el.rotation.z = 0.3 + (1 - reachL) * 1.1; Rr.el.rotation.z = 0.3 + (1 - reachR) * 1.1;
      L.hp.rotation.z = 0.6 + reachR * 0.6; Rr.hp.rotation.z = 0.6 + reachL * 0.6; L.kn.rotation.z = -1.0 - reachR * 0.8; Rr.kn.rotation.z = -1.0 - reachL * 0.8;
      R.pose.position.x = -2.2; R.torso.rotation.z = 0.08; R.torso.rotation.y = s1 * 0.12; R.head.rotation.z = 0.25; R.hips.position.y = HIPS_REST + s1 * 0.4;
      levelFeet(R, 0.6);
    } else if (m === "wallrun") {
      rate = 24; const p = (S.phase += dt * 16);
      R.pose.rotation.x = (a.side || 1) * 0.6; L.hp.rotation.z = sin(p) * 1.1; Rr.hp.rotation.z = -sin(p) * 1.1;
      L.kn.rotation.z = -max(0, -sin(p)) * 1.6 - 0.1; Rr.kn.rotation.z = -max(0, sin(p)) * 1.6 - 0.1; L.sh.rotation.z = -1 + sin(p) * 0.4; Rr.sh.rotation.z = -1 - sin(p) * 0.4;
      R.torso.rotation.z = -0.3; levelFeet(R, 0.6);
    } else if (m === "swing") { // one arm on the line, legs trailing the arc, body follows the pendulum
      rate = 9; poseRate = 10;
      const pitch = a.swingPitch || 0, kick = sin(S.t * 3.1) * 0.12;
      R.pose.rotation.z = -pitch;
      Rr.sh.rotation.z = 2.95; Rr.sh.rotation.x = -0.2; Rr.el.rotation.z = 0.05;
      L.sh.rotation.z = 0.5 + pitch * 0.4; L.sh.rotation.x = 1.0; L.el.rotation.z = 1.0;
      L.hp.rotation.z = 0.7 + pitch * 0.5 + kick; L.kn.rotation.z = -1.4 - kick; Rr.hp.rotation.z = 0.25 + pitch * 0.35 - kick; Rr.kn.rotation.z = -0.6;
      R.torso.rotation.z = 0.1 - pitch * 0.25; R.head.rotation.z = pitch * 0.3 - 0.1; levelFeet(R, 0.3);
    } else if (m === "down" || m === "ko") { // collapses to the ground and stays limp
      rate = 7; poseRate = 6;
      R.pose.rotation.z = Math.PI / 2; R.pose.position.y = 2.6; R.pose.position.x = -9;
      L.sh.rotation.x = 1.3; L.sh.rotation.z = 0.4; Rr.sh.rotation.x = -0.5; Rr.sh.rotation.z = -0.3; L.el.rotation.z = 0.6; Rr.el.rotation.z = 0.2;
      L.hp.rotation.x = 0.25; L.hp.rotation.z = 0.15; Rr.hp.rotation.z = 0.5; Rr.kn.rotation.z = -0.9; R.head.rotation.x = 0.4; R.head.rotation.z = -0.2;
      L.ft.rotation.z = -0.6; Rr.ft.rotation.z = -0.4;
    } else if (m === "webbed") { // cocooned, struggling
      L.sh.rotation.x = 0.05; Rr.sh.rotation.x = -0.05; R.pose.rotation.z = sin(S.t * 9) * 0.06; R.head.rotation.y = sin(S.t * 6) * 0.3;
    } else if (m === "swim") { // front crawl with flutter kick
      rate = 18; poseRate = 8;
      const p = (S.phase += dt * 5); R.pose.rotation.z = -1.35; R.pose.position.y = -6;
      L.sh.rotation.z = p % TAU; Rr.sh.rotation.z = (p + Math.PI) % TAU; L.el.rotation.z = 0.3; Rr.el.rotation.z = 0.3;
      L.hp.rotation.z = sin(p * 3) * 0.3; Rr.hp.rotation.z = -sin(p * 3) * 0.3; L.kn.rotation.z = -0.2 - max(0, sin(p * 3)) * 0.3; Rr.kn.rotation.z = -0.2 - max(0, -sin(p * 3)) * 0.3;
      R.head.rotation.x = sin(p) * 0.35; R.pose.rotation.x = sin(p) * 0.15; L.ft.rotation.z = -0.9; Rr.ft.rotation.z = -0.9;
    } else if (m === "crouch") {
      rate = 16;
      L.hp.rotation.z = 1.35; Rr.hp.rotation.z = 0.85; L.kn.rotation.z = -2.25; Rr.kn.rotation.z = -1.9; R.torso.rotation.z = -0.5;
      L.sh.rotation.z = 0.5; Rr.sh.rotation.z = 0.6; L.el.rotation.z = 1.0; Rr.el.rotation.z = 1.0; R.head.rotation.z = 0.35;
      levelFeet(R, 1); plant(R);
    } else if (m === "land") { // impact absorption, then recover (superhero landing)
      rate = 26;
      const k = 1 - clamp(a.t / 0.45, 0, 1), e = k * k * (3 - 2 * k);
      L.hp.rotation.z = 1.5 * e; Rr.hp.rotation.z = -0.4 * e; L.kn.rotation.z = -2.2 * e; Rr.kn.rotation.z = -1.6 * e;
      R.torso.rotation.z = -0.7 * e; Rr.sh.rotation.z = -0.4 * e; Rr.sh.rotation.x = -0.4 * e; L.sh.rotation.z = 1.2 * e; L.el.rotation.z = 0.4 * e; R.head.rotation.z = 0.4 * e;
      levelFeet(R, 1); plant(R);
    } else if (m === "roll") {
      rate = 30; snapPose = true;
      R.pose.position.y = 4; R.pose.rotation.z = -clamp(a.t / 0.5, 0, 1) * TAU; R.hips.position.y = 6;
      L.hp.rotation.z = 1.9; Rr.hp.rotation.z = 1.9; L.kn.rotation.z = -2.4; Rr.kn.rotation.z = -2.4; L.sh.rotation.z = 1.4; Rr.sh.rotation.z = 1.4; R.head.rotation.z = 0.6;
    } else if (m === "dash") {
      rate = 22;
      R.torso.rotation.z = -0.9; L.sh.rotation.z = -1.6; Rr.sh.rotation.z = -1.6; L.hp.rotation.z = 0.9; L.kn.rotation.z = -0.5; Rr.hp.rotation.z = -0.9; Rr.kn.rotation.z = -1.2;
      R.head.rotation.z = 0.6; levelFeet(R, 0.7); plant(R);
    } else if (m === "stagger") { // hit reaction: head snaps, torso recoils, a step back
      rate = 20;
      const k = sin(clamp(a.t / 0.4, 0, 1) * Math.PI);
      R.torso.rotation.z = 0.5 * k; R.head.rotation.z = 0.45 * k; R.head.rotation.y = 0.3 * k; L.sh.rotation.z = -0.8 * k; Rr.sh.rotation.z = -0.6 * k; L.sh.rotation.x = 0.7 * k; Rr.sh.rotation.x = -0.7 * k;
      L.hp.rotation.z = -0.35 * k; L.kn.rotation.z = -0.3 * k; Rr.kn.rotation.z = -0.25 * k; levelFeet(R, 1); plant(R);
    }
    // ----- upper-body action overlays (attacks, shots) -----
    if (a.action) {
      rate = Math.max(rate, 30);
      const t = clamp(a.actionT || 0, 0, 1), hit = sin(t * Math.PI); // 0 -> 1 -> 0
      const ext = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55, ee = 1 - pow(1 - ext, 3); // snappy extension
      switch (a.action) {
        case "jab": L.sh.rotation.z = 0.6 + ee * 1.0; L.el.rotation.z = 1.9 * (1 - ee); L.sh.rotation.x = 0.3 - 0.25 * ee; R.torso.rotation.y = -0.35 * ee; R.head.rotation.y = 0.25 * ee; Rr.sh.rotation.z = 1.0; Rr.el.rotation.z = 2.0; break;
        case "cross": Rr.sh.rotation.z = 0.6 + ee * 1.05; Rr.el.rotation.z = 1.9 * (1 - ee); Rr.sh.rotation.x = -0.3 + 0.25 * ee; R.torso.rotation.y = 0.55 * ee; R.hips.rotation.y = 0.25 * ee; R.head.rotation.y = -0.4 * ee; Rr.ft.rotation.z = -0.4 * ee; L.sh.rotation.z = 1.0; L.el.rotation.z = 2.0; break;
        case "kick": Rr.hp.rotation.z = 1.7 * ee; Rr.kn.rotation.z = -1.6 * (1 - ee); Rr.ft.rotation.z = -0.6 * ee; L.kn.rotation.z = -0.25; R.torso.rotation.z = 0.35 * ee; L.sh.rotation.z = 1.0; Rr.sh.rotation.z = -0.6; L.sh.rotation.x = 0.8; break;
        case "uppercut": Rr.sh.rotation.z = 0.2 + ee * 2.6; Rr.el.rotation.z = 1.2; L.kn.rotation.z -= (1 - ee) * 0.7; Rr.kn.rotation.z -= (1 - ee) * 0.7; L.hp.rotation.z += (1 - ee) * 0.35; Rr.hp.rotation.z += (1 - ee) * 0.35; R.torso.rotation.z = -0.3 + ee * 0.5; break;
        case "batswing": Rr.sh.rotation.z = 2.4 - ee * 2.0; Rr.sh.rotation.x = -1.0; R.torso.rotation.y = 0.9 - ee * 1.6; R.hips.rotation.y = 0.3 - ee * 0.6; break;
        case "windup": Rr.sh.rotation.z = 2.4; Rr.sh.rotation.x = -0.9; Rr.el.rotation.z = 1.4; R.torso.rotation.y = 0.6; R.hips.rotation.y = 0.2; break;
        case "shoot": Rr.sh.rotation.z = 1.6; Rr.el.rotation.z = 0; Rr.sh.rotation.x = -0.1; L.sh.rotation.z = 1.35; L.sh.rotation.x = -0.35; L.el.rotation.z = 0.5; R.torso.rotation.y = 0.25; R.head.rotation.y = -0.15; break;
        case "zip": Rr.sh.rotation.z = 2.3; Rr.el.rotation.z = 0; L.sh.rotation.z = 2.1; L.el.rotation.z = 0.2; break;
        case "takedown": R.blade && (R.blade.visible = true); Rr.sh.rotation.z = 0.4 + hit * 1.4; Rr.el.rotation.z = 1.3 - hit; R.torso.rotation.z = -0.5 * hit; L.sh.rotation.z = 1.4 * hit; L.kn.rotation.z -= hit * 1.0; Rr.kn.rotation.z -= hit * 1.2; L.hp.rotation.z += hit * 0.5; Rr.hp.rotation.z += hit * 0.6; break;
        case "pound": R.pose.position.y = 0; L.sh.rotation.z = 2.6 - hit * 3.6; Rr.sh.rotation.z = 2.6 - hit * 3.6; L.kn.rotation.z = -hit * 2; Rr.kn.rotation.z = -hit * 2; L.hp.rotation.z = hit * 1.4; Rr.hp.rotation.z = hit * 1.4; R.torso.rotation.z = -hit * 0.8; levelFeet(R, 1); plant(R); break;
        case "smoke": Rr.sh.rotation.z = 2.0 * hit; Rr.el.rotation.z = 0.6; break;
        case "transform": snapPose = true; R.pose.rotation.y = t * TAU * 2; L.sh.rotation.x = 1.4 * hit; Rr.sh.rotation.x = -1.4 * hit; R.hips.position.y += hit * 2; break;
      }
      if (GROUND[m] && a.action !== "transform" && a.action !== "pound") plant(R);
    }
    smooth(R, S, rate, poseRate, snapPose, dt);
    // secondary motion: coat tail and cape react to speed
    if (R.coat) R.coat.rotation.z = clamp(sp / 400, 0, 0.9) + sin(S.t * 9) * 0.04 * clamp(sp / 100, 0, 1);
    if (R.capeP) R.capeP.rotation.z = clamp(0.12 + sp / 260 + (m === "air" || m === "dash" ? 0.6 : 0), 0, 1.45) + sin(S.t * 11) * 0.07 * (0.3 + clamp(sp / 200, 0, 1));
    if (R.core) R.core.material.emissiveIntensity = 1.6 + sin(S.t * 5) * 0.5;
  };
})();
