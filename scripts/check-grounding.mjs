/**
 * Trees must sit on the visible terrain mesh, and walking hills
 * must not produce nauseating high-frequency camera motion.
 */
import { WORLD, heightAt, sourceHeightAt, bakeHeightfield } from "../src/heightfield.js";
import { POS } from "../src/map.js";

const SPACING_X = WORLD.width / WORLD.segmentsX;
const SPACING_Z = WORLD.depth / WORLD.segmentsZ;
const HALF_X = WORLD.width / 2;
const HALF_Z = WORLD.depth / 2;

function meshHeight(x, z) {
  const fx = (x + HALF_X) / SPACING_X;
  const fz = (z + HALF_Z) / SPACING_Z;
  const ix = Math.max(0, Math.min(WORLD.segmentsX - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(WORLD.segmentsZ - 1, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const x0 = -HALF_X + ix * SPACING_X;
  const z0 = -HALF_Z + iz * SPACING_Z;
  const h00 = sourceHeightAt(x0, z0);
  const h10 = sourceHeightAt(x0 + SPACING_X, z0);
  const h01 = sourceHeightAt(x0, z0 + SPACING_Z);
  const h11 = sourceHeightAt(x0 + SPACING_X, z0 + SPACING_Z);
  const a = h00 * (1 - tx) + h10 * tx;
  const b = h01 * (1 - tx) + h11 * tx;
  return a * (1 - tz) + b * tz;
}

function treeFloatStats() {
  let placed = 0;
  let maxFloat = 0;
  let overHalf = 0;
  for (let ix = 0; ix <= 24; ix += 1) {
    for (let iz = 0; iz <= 24; iz += 1) {
      const x = -HALF_X + 40 + (ix / 24) * (WORLD.width - 80);
      const z = -HALF_Z + 40 + (iz / 24) * (WORLD.depth - 80);
      const y = heightAt(x, z);
      const gap = y - meshHeight(x, z);
      maxFloat = Math.max(maxFloat, Math.abs(gap));
      if (Math.abs(gap) > 0.5) overHalf += 1;
      placed += 1;
    }
  }
  return { placed, maxFloat, overHalf };
}

function walkBobble() {
  const speed = 3.4;
  const dt = 1 / 60;
  const step = speed * dt;
  const yK = 5.2;
  let x = POS.ranch.x + 40;
  let z = POS.ranch.z + 80;
  let camY = heightAt(x, z) + 1.62;
  let prevCam = camY;
  let maxDy = 0;
  let dizzyWindows = 0;
  const window = [];
  for (let i = 0; i < 60 * 20; i += 1) {
    z += step;
    const eyeY = heightAt(x, z) + 1.62;
    camY += (eyeY - camY) * (1 - Math.exp(-yK * dt));
    const dy = Math.abs(camY - prevCam);
    maxDy = Math.max(maxDy, dy);
    window.push(camY);
    if (window.length > 30) window.shift();
    if (window.length === 30) {
      const peak = Math.max(...window) - Math.min(...window);
      if (peak > 1.2) dizzyWindows += 1;
    }
    prevCam = camY;
  }
  return { maxDyPerFrame: maxDy, dizzyWindows };
}

bakeHeightfield();
const trees = treeFloatStats();
const bobble = walkBobble();
console.log(JSON.stringify({ trees, bobble }, null, 2));

const treeFail = trees.maxFloat > 0.05 || trees.overHalf > 0;
const bobbleFail = bobble.maxDyPerFrame > 0.08 || bobble.dizzyWindows > 8;
if (treeFail || bobbleFail) {
  console.error("FAIL: trees float and/or camera bobbles on hills");
  process.exit(1);
}
console.log("PASS");
