import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { addCylinderCollider, addOrientedBoxCollider } from "./collision.js";
import { boxOnGround, boxOnPlane, coneOnPlane, gableRoof, insideStructure, lowestSeat, post, structure } from "./buildings/kit.js";
import { mate, anchorsOf } from "./buildings/anchors.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { addCableSpot, addPropSpot, clearPropSpots } from "./propSpots.js";

/**
 * The mining district: Silver Strike Mines, the stamp mill and the company
 * offices, strung along the iron railroad.
 *
 * The works follow the ore. It is hoisted up the shaft under the headframe,
 * dumped into the ore bin beside it, chuted into tram cars, pushed along a
 * level tramway to a loading dock at the rail, carried south to the mill's
 * receiving bin, and trammed into the stamp mill; the tailings go downhill
 * from the mill. Every piece stands where that chain needs it.
 *
 * This used to be scattered: the headframe and a second stamp mill stood in
 * the middle of Iron Valley (placed there only so the audit camera saw them),
 * with no road or rail within 120 m; the mines had smoke over empty ground;
 * the mill shed and the company office were built across the railroad; ore
 * carts sat in fields beside the main line. Iron Valley is now the miners'
 * camp (props.js), and the works are here.
 *
 * Authored models (headframe, hoist house, bins, track, cars) are prop spots
 * drawn by props.js; this builder owns the kit structures, the colliders a
 * spot does not register, and the smoke.
 *
 * Model frames (glTF, see scripts/blender-props/pr_mine.py): long axis +X,
 * front +Z, rotation.y = yaw maps local +X to world (cos yaw, -sin yaw).
 */

// Silver Strike Mines. The ground rises east at ~11 cm/m and is level
// north-south, so the hoist line (headframe -> hoist house) runs along the
// contour, north. Measured sites: the creek is 45+ m west, the rail 55 m
// south, the trailhead arrival 60 m south-west.
export const MINE_SITE = {
  shaft: { x: 1500, z: -750 },
  hoist: { x: 1500, z: -772 },
  oreBin: { x: 1500, z: -744 },
  dockRailOffset: 3.5
};

// The stamp mill stands west of the north-south rail leg (x = 1200), clear
// of the ballast; its receiving bin is trackside to the north.
export const MILL_SITE = {
  mill: { x: 1188, z: -124 },
  bin: { x: 1195.2, z: -156 }
};

// The company offices, moved off the rail corner at the POI centre.
export const OFFICE_SITE = { x: 1178, z: -512, w: 12, d: 9, h: 6 };

const HEADFRAME_SHEAVE_TOP = { x: 0, y: 13.9, z: 0 };
const HOIST_ROPE_PORT = { x: -4.05, y: 2.2, z: 0 };
const HOIST_STACK_TOP = { x: 4.9, y: 11.4, z: 0 };
const TRACK_RAIL_TOP = 0.15;

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

/** World point of a model-local offset under yaw (rotation.y). */
function local(site, yaw, lx, lz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c };
}

function smokePuff(group, x, y, z, radius, material) {
  const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
  puff.position.set(x, y, z);
  group.add(puff);
}

function plume(group, x, y, z, material) {
  smokePuff(group, x, y + 1.2, z, 1.4, material);
  smokePuff(group, x + 0.4, y + 3.3, z + 0.25, 1.9, material);
  smokePuff(group, x + 0.85, y + 5.6, z + 0.55, 2.4, material);
  smokePuff(group, x + 1.3, y + 8.0, z + 0.9, 2.8, material);
}

/**
 * A tramway of 5 m track sections from `a` to `b`, level on the ground and
 * rising over the last `rampLen` metres to `endY` if given. Returns the
 * track height along it, for seating cars.
 */
function tramway(a, b, { endY = null, rampLen = 0 } = {}) {
  // Sections into an open-sided building (the mill) are meant to be inside it.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 5));
  const seg = len / n;
  const yaw = Math.atan2(-dz, dx);
  const ground = (t) => lowestSeat(a.x + dx * t, a.z + dz * t, 0.6) - 0.03;
  const yAt = (t) => {
    const g = ground(t);
    if (endY === null || rampLen <= 0) {
      return g;
    }
    const d = t * len;
    const start = len - rampLen;
    if (d <= start) {
      return g;
    }
    const f = (d - start) / rampLen;
    return g + (endY - g) * f;
  };
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const y0 = yAt(t0);
    const y1 = yAt(t1);
    addPropSpot("industry", {
      kind: "mine_track",
      x: a.x + dx * (t0 + t1) / 2,
      z: a.z + dz * (t0 + t1) / 2,
      y: (y0 + y1) / 2,
      yaw,
      pitch: Math.atan2(y1 - y0, seg),
      sx: seg / 5,
      seat: "free",
      trackside: true,
      inside: insideStructure(a.x + dx * (t0 + t1) / 2, a.z + dz * (t0 + t1) / 2, 0)
    });
  }
  return { yaw, at: (t) => ({ x: a.x + dx * t, z: a.z + dz * t, y: yAt(t) + TRACK_RAIL_TOP }) };
}

export function createIndustry(scene, maps = {}) {
  clearPropSpots("industry");
  const group = new THREE.Group();
  const rust = mat(0xb55220);
  const slag = mat(0x3a342c);
  const iron = mat(0x55555c, { metalness: 0.55, roughness: 0.42 });
  const dark = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  const siding = maps?.siding
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xd8c4a4, gain: 1.15 })
    : mat(0xc4a574);
  const roof = maps?.roof
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xc9a87f, gain: 1.35 })
    : mat(0x4a3020);
  const stone = maps?.rock
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);
  const smokeMat = new THREE.MeshBasicNodeMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.18, fog: true });

  // ---------------- Silver Strike Mines ----------------
  const { shaft, hoist, oreBin } = MINE_SITE;
  // Hoist line runs north: both models' +X points at world -Z (yaw PI/2).
  const lineYaw = Math.PI / 2;
  addPropSpot("industry", { kind: "headframe", x: shaft.x, z: shaft.z, yaw: lineYaw, collide: true });
  // The back legs' footing stones, 6.2 m along the hoist line.
  for (const lz of [-1.5, 1.5]) {
    const foot = local(shaft, lineYaw, 6.2, lz);
    addCylinderCollider(foot.x, foot.z, 0.45);
  }
  // On an 11 % slope a lowest-terrain seat buried the uphill wall 1.4 m.
  // Engine houses stood on a stone foundation stepped into the hill: seat
  // the house at its centre and let the foundation show on the downhill side.
  const hoistY = heightAt(hoist.x, hoist.z) - 0.1;
  const footY = lowestSeat(hoist.x, hoist.z, Math.hypot(4.4, 3.4));
  boxOnPlane(group, hoist.x, footY, hoist.z, 6.5, hoistY + 0.2 - footY, 8.5, stone, false);
  addPropSpot("industry", { kind: "hoist_house", x: hoist.x, z: hoist.z, y: hoistY, yaw: lineYaw, collide: true, seat: "free" });
  const stack = local(hoist, lineYaw, HOIST_STACK_TOP.x, 0);
  addCylinderCollider(stack.x, stack.z, 0.7);
  const shaftY = lowestSeat(shaft.x, shaft.z, Math.hypot(2.2, 2.2));
  plume(group, stack.x, hoistY + HOIST_STACK_TOP.y, stack.z, smokeMat);
  // Hoist rope from the drum's port in the hoist house to the sheave.
  const port = local(hoist, lineYaw, HOIST_ROPE_PORT.x, 0);
  addCableSpot("industry", {
    ax: port.x, ay: hoistY + HOIST_ROPE_PORT.y, az: port.z,
    bx: shaft.x, by: shaftY + HEADFRAME_SHEAVE_TOP.y, bz: shaft.z,
    sag: 0.25, r: 0.022, kind: "hoist"
  });

  // Ore bin on the headframe's rail side, chute south over the tramway.
  addPropSpot("industry", { kind: "ore_bin", x: oreBin.x, z: oreBin.z, yaw: 0, collide: true });
  addPropSpot("industry", { kind: "timber_stack", x: shaft.x - 11, z: shaft.z + 1, yaw: Math.PI / 2 + 0.05, collide: true });
  addPropSpot("industry", { kind: "powder_crates", x: shaft.x - 7.5, z: shaft.z - 6, yaw: 0.4, collide: true });
  addPropSpot("industry", { kind: "water_tank", x: hoist.x + 12, z: hoist.z + 1, yaw: 0.2, collide: true });
  // Powder magazine well away from the works, door toward the trail.
  addPropSpot("industry", { kind: "powder_magazine", x: 1548, z: -808, yaw: -0.64, collide: true });
  addPropSpot("industry", { kind: "powder_crates", x: 1546.3, z: -805.2, yaw: -0.3, collide: true });

  // Waste dump downhill (west) of the collar, clear of the creek.
  const dumpY = lowestSeat(1478, -774, 8);
  coneOnPlane(group, 1478, dumpY, -774, 8, 4.6, slag, true, 0, 6.4, 11);
  coneOnPlane(group, 1483, lowestSeat(1483, -792, 5), -792, 5, 2.8, slag, true, 0, 4, 9);

  // Tramway from under the chute to a loading dock on the rail's verge.
  const chuteEnd = { x: oreBin.x, z: oreBin.z + 3.4 };
  // Rail centreline at x = 1500 on the (1560,-675)->(1440,-700) leg.
  const railZ = -675 + ((1560 - oreBin.x) / 120) * -25;
  const railDir = { x: -120 / 122.58, z: -25 / 122.58 };
  const railNormal = { x: railDir.z, z: -railDir.x };
  // Dock: 7 m along the rail, 2.2 m deep, 0.9 m deck, its near edge on the ballast.
  const off = 2.1 + 1.1 + 0.2;
  const dock = { x: oreBin.x - railNormal.x * off, z: railZ - railNormal.z * off };
  const dockYaw = Math.atan2(-railDir.z, railDir.x);
  const dockTop = lowestSeat(dock.x, dock.z, 3.7) + 0.9;
  const dockMesh = boxOnPlane(group, dock.x, dockTop - 0.9, dock.z, 7, 0.9, 2.2, dark, false);
  dockMesh.parent.rotation.y = dockYaw;
  addOrientedBoxCollider(dock.x, dock.z, 3.5, 1.1, -dockYaw);
  const tramEnd = { x: dock.x - railNormal.x * 1.0, z: dock.z - railNormal.z * 1.0 };
  const tram = tramway(chuteEnd, tramEnd, { endY: dockTop, rampLen: 9 });
  // Earth ramp under the last 9 m of track up to the dock deck.
  {
    const len = Math.hypot(tramEnd.x - chuteEnd.x, tramEnd.z - chuteEnd.z);
    const f0 = (len - 9) / len;
    const p0 = tram.at(f0);
    const p1 = tram.at(1);
    const g = lowestSeat((p0.x + p1.x) / 2, (p0.z + p1.z) / 2, 2);
    const rise = p1.y - TRACK_RAIL_TOP - g;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.6, Math.max(rise, 0.2), 9), dark);
    ramp.position.set((p0.x + p1.x) / 2, g + Math.max(rise, 0.2) / 2 - 0.05, (p0.z + p1.z) / 2);
    ramp.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    group.add(ramp);
  }
  // Three cars: under the chute, part way down the tramway, on the dock.
  for (const [t, yawOff] of [[0.04, 0], [0.45, 0.01], [0.985, 0]]) {
    const c = tram.at(t);
    addPropSpot("industry", { kind: "mine_car", x: c.x, z: c.z, y: c.y, yaw: tram.yaw + yawOff, seat: "free", trackside: true });
    addOrientedBoxCollider(c.x, c.z, 0.7, 0.5, -tram.yaw);
  }

  // ---------------- Stamp mill ----------------
  // An open-sided shed with a battery of stamp rods and a camshaft, beside the
  // rail it is served by.
  const { mill: m, bin } = MILL_SITE;
  const smShed = structure({ name: "stampMill", x: m.x, z: m.z, yaw: 0, w: 16, d: 12, eave: 6, foundation: true, openSided: true, material: stone });
  const smRoof = gableRoof({ w: 16, d: 12, pitch: 0.55, overhang: 0.5, eave: 6, material: roof });
  mate(smRoof, "base", anchorsOf(smShed).get("wallTop"));
  const millFloor = anchorsOf(smShed).get("footing");
  for (let i = 0; i < 6; i += 1) {
    mate(post({ rTop: 0.28, rBot: 0.28, h: 5.5, material: iron, radialSegments: 6 }), "base", millFloor, {
      offset: { x: -6 + i * 2.4 }
    });
  }
  const camshaft = post({ rTop: 0.4, rBot: 0.4, h: 14, material: iron });
  // The mill seats at its lowest footing corner on an eastward-rising slope,
  // so a shaft at floor + 1.4 dove underground at the shed's east end. Ride
  // the shaft just clear of the highest terrain it crosses instead.
  let camBase = smShed.userData.placementY;
  for (let i = 0; i <= 8; i += 1) {
    camBase = Math.max(camBase, heightAt(m.x - 7 + (i * 14) / 8, m.z));
  }
  const camY = camBase + 0.5;
  mate(camshaft, "base", millFloor, { offset: { y: camY - smShed.userData.placementY - 7 } });
  camshaft.children[0].rotation.z = Math.PI / 2;
  // Open on all four faces: the camshaft is the only interior obstacle.
  addOrientedBoxCollider(m.x, m.z, 7, 0.4, 0, { minY: camY - 0.4, maxY: camY + 0.4 });
  group.add(smShed);

  // Receiving bin north of the mill: ore trains unload into it from the
  // rail side, and its chute feeds cars trammed south into the mill.
  addPropSpot("industry", { kind: "ore_bin", x: bin.x, z: bin.z, yaw: 0, collide: true });
  const millTram = tramway({ x: bin.x, z: bin.z + 3.4 }, { x: bin.x, z: m.z - 3 });
  for (const t of [0.12, 0.9]) {
    const c = millTram.at(t);
    addPropSpot("industry", { kind: "mine_car", x: c.x, z: c.z, y: c.y, yaw: millTram.yaw, seat: "free", trackside: true, inside: t > 0.5 });
    addOrientedBoxCollider(c.x, c.z, 0.7, 0.5, -millTram.yaw);
  }
  // Boiler stack west of the mill, and the tailings downhill (west) of it.
  const millStack = { x: m.x - 6, z: m.z - 13 };
  addPropSpot("industry", { kind: "smokestack", x: millStack.x, z: millStack.z, yaw: 0, collide: true });
  plume(group, millStack.x, lowestSeat(millStack.x, millStack.z, 1) + 13, millStack.z, smokeMat);
  const tailA = { x: m.x - 22, z: m.z + 16 };
  const tailB = { x: m.x - 30, z: m.z + 4 };
  coneOnPlane(group, tailA.x, lowestSeat(tailA.x, tailA.z, 7), tailA.z, 7, 5, rust, true, 0, 5.6, 10);
  coneOnPlane(group, tailB.x, lowestSeat(tailB.x, tailB.z, 5), tailB.z, 5, 3.5, rust, true, 0, 4, 8);
  addPropSpot("industry", { kind: "timber_stack", x: m.x - 12, z: m.z - 12, yaw: 0.1, collide: true });

  // ---------------- Company offices ----------------
  // Off the rail corner it used to be built across, west of the track.
  const o = OFFICE_SITE;
  boxOnGround(group, o.x, o.z, o.w, o.h, o.d, siding);
  const roofY = lowestSeat(o.x, o.z, Math.hypot(o.w, o.d) / 2) + o.h;
  const officeRoof = gableRoof({ w: o.w, d: o.d, pitch: 0.5, overhang: 0.4, eave: 0, material: roof });
  officeRoof.position.set(o.x, roofY, o.z);
  group.add(officeRoof);
  // Freight platform on the west verge of the rail's north-south leg, which
  // starts at the corner (1200, -500) and runs south (+z); north of the
  // corner the line has already turned north-east and passes 20 m away.
  const fp = { x: 1200 - 2.1 - 1.2, z: -478 };
  boxOnGround(group, fp.x, fp.z, 2.4, 1.0, 9, dark);
  addPropSpot("industry", { kind: "crate", x: fp.x - 0.2, z: fp.z - 2.5, y: lowestSeat(fp.x, fp.z, 4.7) + 1.0, yaw: 0.1, seat: "free", trackside: true });
  addPropSpot("industry", { kind: "barrel", x: fp.x + 0.1, z: fp.z + 1.8, y: lowestSeat(fp.x, fp.z, 4.7) + 1.0, yaw: 0.6, seat: "free", trackside: true });
  addPropSpot("industry", { kind: "powder_crates", x: fp.x - 6.5, z: fp.z + 3, yaw: 1.2, collide: true });

  scene.add(group);
  return { group, mine: MINE_SITE, mill: MILL_SITE, office: OFFICE_SITE };
}
