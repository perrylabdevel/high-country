/**
 * Road geometry regression: raycast the actual mixed-resolution terrain mesh.
 * This intentionally does not inspect the rut formula directly; it catches
 * missed coarse cells, seams, and divergence between meshHeightAt and the
 * rendered triangles.
 */
import * as THREE from "three/webgpu";
import { makeTerrainGeometry } from "../src/environment.js";
import { ROADS, WORLD, mapToWorld } from "../src/map.js";
import { bakeHeightfield, heightAt, meshHeightAt, sourceHeightAt } from "../src/heightfield.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function worldPoint(road, i, t, lateral = 0) {
  const a = mapToWorld(...road.pts[i]);
  const b = mapToWorld(...road.pts[Math.min(i + 1, road.pts.length - 1)]);
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    x: a.x + dx * t - dz / len * lateral,
    z: a.z + dz * t + dx / len * lateral
  };
}

function rayHeight(mesh, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 300, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(mesh, false)[0];
  assert(hit, `terrain ray missed at ${x.toFixed(2)},${z.toFixed(2)}`);
  return hit.point.y;
}

// The ground without ruts. Refined road cells now evaluate the road carve per
// vertex (HARD_WON 2.12), so the rut-free surface is the real source height,
// not the coarse triangles: measured against those, the carve's own curvature
// across 0.9 m (~0.06 m on a 3 m trail) was mistaken for a missing trough.
function groundBase(x, z) {
  return sourceHeightAt(x, z);
}

bakeHeightfield();
const geometry = makeTerrainGeometry();
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
const roads = ["stage", "townMain", "cabinTrail"].map((name) => ROADS.find((r) => r.name === name)).filter(Boolean);
assert(roads.length === 3, "road geometry fixture roads are missing");

let samples = 0;
let maxQueryError = 0;
let minTroughDepth = Infinity;
for (const road of roads) {
  for (const i of [0, Math.floor((road.pts.length - 2) / 2)]) {
    for (const t of [0.25, 0.5, 0.75]) {
      const center = worldPoint(road, i, t, 0);
      const left = worldPoint(road, i, t, 0.9);
      const right = worldPoint(road, i, t, -0.9);
      const centerY = rayHeight(mesh, center.x, center.z);
      const leftY = rayHeight(mesh, left.x, left.z);
      const rightY = rayHeight(mesh, right.x, right.z);
      const centerBase = groundBase(center.x, center.z);
      const leftBase = groundBase(left.x, left.z);
      const rightBase = groundBase(right.x, right.z);
      const expectedLeft = meshHeightAt(left.x, left.z);
      const expectedRight = meshHeightAt(right.x, right.z);
      maxQueryError = Math.max(maxQueryError, Math.abs(leftY - expectedLeft), Math.abs(rightY - expectedRight));
      assert(Math.abs(leftY - expectedLeft) < 0.01, `${road.name} left rut query diverges from mesh by ${Math.abs(leftY - expectedLeft).toFixed(3)} m`);
      assert(Math.abs(rightY - expectedRight) < 0.01, `${road.name} right rut query diverges from mesh by ${Math.abs(rightY - expectedRight).toFixed(3)} m`);
      assert(Math.abs(centerY - meshHeightAt(center.x, center.z)) < 0.01, `${road.name} center query diverges from mesh`);
      const leftDepth = (centerY - centerBase) - (leftY - leftBase);
      const rightDepth = (centerY - centerBase) - (rightY - rightBase);
      minTroughDepth = Math.min(minTroughDepth, leftDepth, rightDepth);
      assert(leftDepth > 0.05 && rightDepth > 0.05, `${road.name} lacks paired recessed troughs at segment ${i} phase ${t}`);
      samples += 1;
    }
  }
}

assert(minTroughDepth > 0.05, `minimum physical trough depth ${minTroughDepth.toFixed(3)} m is too shallow`);
// A cell crossed by a road must be refined even when no coarse corner lies
// within the old 2.4 m threshold. The fixture uses the town road's first leg.
const crossing = worldPoint(roads[1], 0, 0.5, 0);
const fx = (crossing.x + 2000) / 12.5, fz = (crossing.z + 2500) / 12.5;
assert(Math.abs(meshHeightAt(crossing.x, crossing.z) - heightAt(crossing.x, crossing.z)) < 0.01, "interior road crossing query does not match refined terrain");

for (const road of roads) {
  for (const lateral of [-road.width * 0.5, road.width * 0.5]) {
    const edge = worldPoint(road, 0, 0.5, lateral);
    assert(Math.abs(rayHeight(mesh, edge.x, edge.z) - meshHeightAt(edge.x, edge.z)) < 0.01, `${road.name} refined boundary seam diverges from query`);
  }
}

console.log(JSON.stringify({ roads: roads.map((r) => r.name), samples, minTroughDepth, maxQueryError, crossingCell: [Math.floor(fx), Math.floor(fz)] }, null, 2));
console.log("PASS");
