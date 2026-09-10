/**
 * Kit props seated on the terrain must not float above a slope.
 *
 * boxOnGround / cylOnGround / coneOnGround used to seat every prop at the
 * single centre sample heightAt(x, z). On any slope the downhill edge of a
 * wide piece hovered — the same silent defect the grass tufts had. Measured
 * before the fix: an ironValley ore cart 0.46 m up at its downhill edge, a
 * sheepCamp tipi 0.35 m, timberCamp log stacks and charcoal-pit discs
 * 0.11–0.25 m. Nothing threw and nothing logged; the pieces simply hovered
 * (close-camera U4 "bases appear slightly detached"). The fix seats each pad
 * at the LOWEST terrain sample under its footprint (kit.js lowestSeat); this
 * check keeps that invariant true.
 *
 * Runs headless and offline: dry-build the world, then for every piece the
 * kit grounded on terrain (stamped userData.groundSeat) whose seated offset
 * is ground-level, assert its base is within 5 cm of the lowest terrain under
 * its footprint. Pieces mated higher up (ladder rungs, tent cones, sawbuck
 * tops) rest on other pieces, not the terrain, and are excluded by their
 * yOff.
 */
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") {
      return {};
    }
    return {
      width: 256,
      height: 256,
      getContext() {
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

import * as THREE from "three/webgpu";
const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearColliders } = await import("../src/collision.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createRanch } = await import("../src/buildings.js");
const { buildFootprintIndex } = await import("../src/buildings/kit.js");
const { POS } = await import("../src/map.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createPines } = await import("../src/pines.js");
const { createHomestead } = await import("../src/homestead.js");

/**
 * Anything built as walkable footing must be registered as a deck at the
 * height it actually renders.
 *
 * Three separate places got this wrong at once and nothing failed:
 *   - the town boardwalk seated its slab with a literal `height + 0.2` while
 *     the slab is 0.5 thick (surface is height + 0.25), so every townsperson
 *     stood 0.050 m inside the boards;
 *   - `porch()` laid a deck but no caller ever registered it, so the ranch
 *     front porch dropped Harlan 0.096 m through its floor;
 *   - the hunting-cabin porch had no deck either, and a first fix that
 *     recomputed its height from heightAt() floated it 0.135 m, because
 *     boxOnGround seats on the LOWEST terrain under the footprint.
 *
 * Grounding bugs are silent — nothing throws, the character just stands in the
 * boards — so the invariant is asserted rather than eyeballed. Each registration
 * stamps userData.walkSurface with the surface it claims; this asserts
 * deckHeightAt actually answers that height there.
 */
const TOL = 0.02;

clearColliders();
bakeHeightfield();
const roots = [];
const scene = { add: (...o) => roots.push(...o), remove: (...o) => { for (const x of o) { const i = roots.indexOf(x); if (i >= 0) roots.splice(i, 1); } } };
createLandmarks(scene);
createInteriors(scene);
roots.push(createRanch());
buildFootprintIndex();
createIndustry(scene, {});
createFort(scene, {});
createPines(scene);
createHomestead(scene, {});

const { deckHeightAt } = await import("../src/collision.js");

const claims = [];
const _v = new THREE.Vector3();
for (const root of roots) {
  if (!root?.isObject3D) continue;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const d = o.userData;
    if (!d) return;
    // Derive the surface from the part's OWN geometry, never from the value the
    // registration used. A first version of this check stamped what
    // addDeckPlatform was told and compared it to what deckHeightAt answered —
    // the same number on both sides, so it passed even with the boardwalk
    // seating bug deliberately reintroduced. Geometry is the only honest
    // witness here.
    if (d.role === "porch" && d.deckTop != null) {
      _v.set(0, d.deckTop, d.deckCenterZ).applyMatrix4(o.matrixWorld);
    } else if (d.role === "boardwalk" && d.surfaceOffset != null) {
      _v.set(0, d.surfaceOffset, 0).applyMatrix4(o.matrixWorld);
    } else if (d.walkSurface) {
      // Raw-box decks (the hunting-cabin porch) carry no kit role; their seat
      // height IS the geometry, since boxOnGround records where it sat them.
      _v.set(d.walkSurface.x, d.walkSurface.y, d.walkSurface.z);
    } else {
      return;
    }
    claims.push({ x: _v.x, y: _v.y, z: _v.z, role: d.role ?? "deck" });
  });
}

if (claims.length < 15) {
  throw new Error(`check-deck-grounding found only ${claims.length} walkable surfaces. The world builders must stamp userData.walkSurface wherever they register a deck — if that changed, update this harness rather than lowering the bar.`);
}

const failures = [];
for (const c of claims) {
  const ground = heightAt(c.x, c.z);
  const deck = deckHeightAt(c.x, c.z, ground + 1.2);
  if (!Number.isFinite(deck)) {
    failures.push(`no deck registered at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) — a walkable surface at y ${c.y.toFixed(3)} grounds to terrain ${ground.toFixed(3)}, sinking anyone on it by ${(c.y - ground).toFixed(3)} m`);
    continue;
  }
  const off = deck - c.y;
  if (Math.abs(off) > TOL) {
    failures.push(`deck at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) answers ${deck.toFixed(3)} but the surface renders at ${c.y.toFixed(3)} — ${off > 0 ? "floating" : "sunk"} ${Math.abs(off).toFixed(3)} m`);
  }
}

if (failures.length) {
  for (const f of failures) console.error("  -", f);
  throw new Error(`check-deck-grounding: ${failures.length} failure(s) of ${claims.length} walkable surfaces`);
}
console.log(JSON.stringify({ walkableSurfaces: claims.length, toleranceMeters: TOL }));
console.log("DECK GROUNDING PASS — every registered walking surface matches the geometry it renders.");
