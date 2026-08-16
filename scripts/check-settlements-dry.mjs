/**
 * Ranch yard and Silver Creek main street must sit above the water plane.
 * High Country Creek crosses at the existing south bridge, not through the house.
 */
import { POS, WATER, CREEKS, BRIDGES, distToPolyline, mapToWorld } from "../src/map.js";
import { heightAt, bakeHeightfield } from "../src/heightfield.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

bakeHeightfield();

const ranchH = heightAt(POS.ranch.x, POS.ranch.z);
const spawnH = heightAt(POS.ranch.x + 6, POS.ranch.z + 18);
const houseH = heightAt(POS.ranch.x, POS.ranch.z - 8);
const townH = heightAt(POS.silverCreek.x, POS.silverCreek.z);

assert(ranchH > WATER + 2, `ranch pad underwater: ${ranchH} vs water ${WATER}`);
assert(spawnH > WATER + 2, `spawn underwater: ${spawnH} vs water ${WATER}`);
assert(houseH > WATER + 2, `house pad underwater: ${houseH} vs water ${WATER}`);
assert(townH > WATER + 2, `town pad underwater: ${townH} vs water ${WATER}`);

const high = CREEKS.find((c) => c.name === "highCountry");
const silver = CREEKS.find((c) => c.name === "silver");
assert(high && silver, "named creeks missing");

const ranchCreek = distToPolyline(POS.ranch.x, POS.ranch.z, high.pts);
const townCreek = distToPolyline(POS.silverCreek.x, POS.silverCreek.z, silver.pts);
assert(ranchCreek > 80, `High Country Creek still cuts the yard: dist ${ranchCreek}`);
assert(townCreek > 50, `Silver Creek still cuts main street: dist ${townCreek}`);

const ranchBridge = BRIDGES.find((b) => b.name === "ranchCreek");
assert(ranchBridge, "ranchCreek bridge missing");
const bridgePos = mapToWorld(ranchBridge.u, ranchBridge.v);
const bridgeToCreek = distToPolyline(bridgePos.x, bridgePos.z, high.pts);
assert(bridgeToCreek < 20, `ranch creek bridge is ${bridgeToCreek} from the creek`);

console.log(JSON.stringify({
  water: WATER,
  heights: { ranch: ranchH, spawn: spawnH, house: houseH, town: townH },
  creekClearance: { ranch: ranchCreek, town: townCreek },
  bridgeToCreek
}, null, 2));
console.log("PASS");
