// Optional photo-real world: Google Photorealistic 3D Tiles (needs the player's own Map Tiles API key). Same interface
// as osm_world.js. Ground and walls come from ray casts against the tile meshes (BVH-accelerated).
import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, ReorientationPlugin, UnloadTilesPlugin } from "3d-tiles-renderer/plugins";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function createGoogleWorld({ scene, renderer, camera, key, errorTarget, isTouch, onAuthError }) {
  let origin = { lat: 0, lon: 0 }, authFailed = false;
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/") }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  const reorient = new ReorientationPlugin({ lat: 0, lon: 0, height: 0 });
  tiles.registerPlugin(reorient);
  tiles.errorTarget = errorTarget;
  tiles.lruCache.minSize = isTouch ? 600 : 1500; tiles.lruCache.maxSize = isTouch ? 1200 : 3000;
  tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera, renderer);
  const bvhQueue = [];
  tiles.addEventListener("load-model", (e) => e.scene.traverse((o) => { if (o.isMesh) bvhQueue.push(o.geometry); }));
  tiles.addEventListener("dispose-model", (e) => e.scene.traverse((o) => { if (o.isMesh && o.geometry.boundsTree) o.geometry.disposeBoundsTree(); }));
  tiles.addEventListener("load-root-tileset", computeAxes);
  tiles.addEventListener("load-error", (e) => {
    const msg = String((e && (e.error && e.error.message)) || e.error || "");
    if ((!tiles.root || /40\d|denied|forbidden|unauthori|invalid|permission/i.test(msg)) && !authFailed) { authFailed = true; onAuthError(msg); }
  });
  scene.add(tiles.group);

  const axes = { east: new THREE.Vector3(1, 0, 0), north: new THREE.Vector3(0, 0, -1) };
  function computeAxes() {
    const e = tiles.ellipsoid, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = tiles.group.matrixWorld;
    e.getCartographicToPosition(origin.lat, origin.lon, 0, a); e.getCartographicToPosition(origin.lat + 1e-5, origin.lon, 0, b); e.getCartographicToPosition(origin.lat, origin.lon + 1e-5, 0, c);
    a.applyMatrix4(m); b.applyMatrix4(m); c.applyMatrix4(m);
    axes.north.copy(b).sub(a).setY(0).normalize(); axes.east.copy(c).sub(a).setY(0).normalize();
  }
  function setOrigin(lat, lon) {
    origin = { lat: lat * D2R, lon: lon * D2R }; reorient.lat = origin.lat; reorient.lon = origin.lon;
    if (tiles.root) { reorient.transformLatLonHeightToOrigin(origin.lat, origin.lon, 0); computeAxes(); }
  }
  function cart(v) { const p = v.clone().applyMatrix4(tiles.group.matrixWorld.clone().invert()), out = {}; tiles.ellipsoid.getPositionToCartographic(p, out); return out; }
  function recenter(pos) {
    const old = tiles.group.matrixWorld.clone(), c = cart(pos);
    origin = { lat: c.lat, lon: c.lon }; reorient.lat = c.lat; reorient.lon = c.lon;
    reorient.transformLatLonHeightToOrigin(c.lat, c.lon, 0); computeAxes();
    return tiles.group.matrixWorld.clone().multiply(old.invert()); // Matrix4 to apply to everything else
  }
  const ray3 = new THREE.Raycaster(); ray3.firstHitOnly = true; const DOWN = new THREE.Vector3(0, -1, 0), tmp = new THREE.Vector3();
  function ground(x, z, yTop = 3000, far = 6000) { ray3.set(tmp.set(x, yTop, z), DOWN); ray3.far = far; const h = ray3.intersectObject(tiles.group, true); return h.length ? h[0].point.y : null; }
  function ray(o, dir, far) { ray3.set(o, dir); ray3.far = far; const h = ray3.intersectObject(tiles.group, true); return h.length ? h[0].distance : null; }
  function update() {
    tiles.setResolutionFromRenderer(camera, renderer); tiles.update();
    const t0 = performance.now();
    while (bvhQueue.length && performance.now() - t0 < 4) { const g = bvhQueue.shift(); if (!g.boundsTree && g.attributes.position) { try { g.computeBoundsTree(); } catch (e) { /* skip */ } } }
  }
  return {
    kind: "google", axes, setOrigin, recenter, update, ground, ray,
    toLatLon: (v) => { if (!tiles.root) return null; const c = cart(v); return { lat: c.lat * R2D, lon: c.lon * R2D }; },
    streetAt: () => null, nearestRoad: () => null,
    centreReady: () => !!tiles.root && tiles.stats.downloading + tiles.stats.parsing < 6,
    busy: () => tiles.stats.downloading + tiles.stats.parsing + tiles.stats.queued,
    failed: () => null, stats: () => ({}),
    attribution: () => "Google" + (tiles.root ? " · " + tiles.getAttributions().filter((a) => a.type === "string").map((a) => a.value).join("; ") : ""),
    setErrorTarget: (v) => { tiles.errorTarget = v; },
    recenterAt: 1500, needsYTop: true,
    dispose() { scene.remove(tiles.group); tiles.dispose(); },
  };
}
