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

function coarseBase(x, z) {
  const sx = WORLD.width / WORLD.segmentsX, sz = WORLD.depth / WORLD.segmentsZ;
  const fx = (x + WORLD.width / 2) / sx, fz = (z + WORLD.depth / 2) / sz;
  const ix = Math.max(0, Math.min(WORLD.segmentsX - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(WORLD.segmentsZ - 1, Math.floor(fz)));
  const tx = fx - ix, tz = fz - iz;
  const at = (x0, z0) => sourceHeightAt(-WORLD.width / 2 + x0 * sx, -WORLD.depth / 2 + z0 * sz);
  const h00 = at(ix, iz), h10 = at(ix + 1, iz), h01 = at(ix, iz + 1), h11 = at(ix + 1, iz + 1);
  return tx + tz <= 1 ? h00 + tx * (h10 - h00) + tz * (h01 - h00) : h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);
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
      const centerBase = coarseBase(center.x, center.z);
      const leftBase = coarseBase(left.x, left.z);
      const rightBase = coarseBase(right.x, right.z);
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
