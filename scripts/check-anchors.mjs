/**
 * Anchor invariants (docs/ANCHORS.md).
 *
 * Porch posts carrying nothing is a required-socket lint, not a screenshot
 * judgement. Literals below are from the spec, not from kit.js.
 *
 * Reintroducing the bug — removing the porch roof — must fail.
 */
import * as THREE from "three/webgpu";
import {
  porch,
  structure,
  hipRoof,
  gableRoof,
  chimney,
  wallX,
  wallZ,
  doorLeaf,
  falseFront,
  steeple,
  parapet,
  footprintsOverlap,
  steps,
  vigas
} from "../src/buildings/kit.js";
import { bakeHeightfield } from "../src/heightfield.js";
import { anchorsOf, unmatedRequired, face, mate, worldAnchor, defineAnchor } from "../src/buildings/anchors.js";

const EPS = 1e-6;

function vecEq(got, expected, label) {
  const g = got.isVector3 ? got : new THREE.Vector3(got.x, got.y, got.z);
  const e = new THREE.Vector3().fromArray(expected);
  if (g.distanceTo(e) > EPS) {
    throw new Error(`${label}: got (${g.x}, ${g.y}, ${g.z}), expected (${e.x}, ${e.y}, ${e.z})`);
  }
}

const wood = new THREE.MeshBasicMaterial({ color: 0x5c4033 });
const shingle = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });

const DEPTH = 4;
const EAVE = 3.4;
const built = porch({
  width: 8,
  depth: DEPTH,
  eave: EAVE,
  material: wood,
  roofMaterial: shingle
});

const anchors = anchorsOf(built);
if (!anchors || typeof anchors.get !== "function") {
  throw new Error("anchorsOf(porch) must return a Map");
}

const wallSide = anchors.get("wallSide");
if (!wallSide) {
  throw new Error("porch is missing wallSide");
}
vecEq(wallSide.position, [0, 0, 0], "wallSide.position");
vecEq(wallSide.normal, [0, 0, -1], "wallSide.normal");

const deckEdge = anchors.get("deckEdge");
if (!deckEdge) {
  throw new Error("porch is missing deckEdge");
}
vecEq(deckEdge.position, [0, 0, DEPTH], "deckEdge.position");
vecEq(deckEdge.normal, [0, 0, 1], "deckEdge.normal");

const roofSocket = anchors.get("roofSocket");
if (!roofSocket) {
  throw new Error("porch is missing roofSocket");
}
vecEq(roofSocket.position, [0, EAVE, DEPTH], "roofSocket.position");
vecEq(roofSocket.normal, [0, 1, 0], "roofSocket.normal");
if (roofSocket.required !== true) {
  throw new Error("roofSocket must be required: true");
}

const intact = unmatedRequired([built]);
if (intact.length !== 0) {
  throw new Error(
    `kit porch should have its roofSocket mated, unmated: ${intact.map((u) => u.name).join(", ")}`
  );
}

const roofs = [];
built.traverse((n) => {
  if (n.userData.role === "roof") {
    roofs.push(n);
  }
});
if (!roofs.length) {
  throw new Error("fixture porch has no roof child to remove — cannot prove the lint");
}
for (const roof of roofs) {
  roof.removeFromParent();
}

const missing = unmatedRequired([built]);
const hit = missing.find((u) => u.obj === built && u.name === "roofSocket");
if (!hit) {
  throw new Error("removing the porch roof must report unmated roofSocket");
}

bakeHeightfield();
const W = 10;
const D = 8;
const STRUCT_EAVE = 3.5;
const house = structure({
  x: 0,
  z: 0,
  w: W,
  d: D,
  eave: STRUCT_EAVE,
  name: "anchorTest"
});
const houseAnchors = anchorsOf(house);

const expectedFaces = [
  ["face.front", [0, 0, D / 2], [0, 0, 1]],
  ["face.back", [0, 0, -D / 2], [0, 0, -1]],
  ["face.right", [W / 2, 0, 0], [1, 0, 0]],
  ["face.left", [-W / 2, 0, 0], [-1, 0, 0]]
];
for (const [name, pos, nrm] of expectedFaces) {
  const a = houseAnchors.get(name);
  if (!a) {
    throw new Error(`structure is missing ${name}`);
  }
  vecEq(a.position, pos, `${name}.position`);
  vecEq(a.normal, nrm, `${name}.normal`);
}

const footingA = houseAnchors.get("footing");
if (!footingA) {
  throw new Error("structure is missing footing");
}
vecEq(footingA.position, [0, 0, 0], "footing.position");
vecEq(footingA.normal, [0, 1, 0], "footing.normal");

const wallTop = houseAnchors.get("wallTop");
if (!wallTop) {
  throw new Error("structure is missing wallTop");
}
vecEq(wallTop.position, [0, STRUCT_EAVE, 0], "wallTop.position");
vecEq(wallTop.normal, [0, 1, 0], "wallTop.normal");

const slid = face(house, "right", { along: 2.5 });
vecEq(slid.position, [W / 2, 0, 2.5], "face(right, along: 2.5).position");
vecEq(slid.normal, [1, 0, 0], "face(right, along: 2.5).normal");
vecEq(houseAnchors.get("face.right").position, [W / 2, 0, 0], "face() must not mutate the stored face.right");

const WALL_T = 0.22;
const shell = wallX({ length: W, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
const wallPlug = anchorsOf(shell).get("wallSide");
if (!wallPlug) {
  throw new Error("wallX is missing wallSide");
}
vecEq(wallPlug.position, [0, 0, 0], "wall.wallSide.position");
vecEq(wallPlug.normal, [0, 0, -1], "wall.wallSide.normal");

const wallHouse = structure({ x: 0, z: 0, w: W, d: D, eave: STRUCT_EAVE, name: "wallMate" });
const typedWall = wallX({ length: W, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
typedWall.position.z = D / 2;
wallHouse.add(typedWall);
typedWall.updateMatrixWorld(true);
const wallBefore = typedWall.matrixWorld.clone();
wallHouse.remove(typedWall);

const matedWall = wallX({ length: W, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
mate(matedWall, "wallSide", face(wallHouse, "front"));
matedWall.updateMatrixWorld(true);
function matrixEq(a, b, label) {
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a.elements[i] - b.elements[i]) > 1e-5) {
      throw new Error(`${label}: matrixWorld drifted at element ${i}`);
    }
  }
}
matrixEq(wallBefore, matedWall.matrixWorld, "front wall mate vs typed z = d/2");

const typedEast = wallZ({ length: D, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
typedEast.position.x = W / 2;
wallHouse.add(typedEast);
typedEast.updateMatrixWorld(true);
const eastBefore = typedEast.matrixWorld.clone();
wallHouse.remove(typedEast);

const matedEast = wallX({ length: D, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
mate(matedEast, "wallSide", face(wallHouse, "right"));
matedEast.updateMatrixWorld(true);
matrixEq(eastBefore, matedEast.matrixWorld, "right wall mate vs wallZ at x = w/2");

const OPEN_ALONG = 2.0;
const OPEN_SILL_W = 0.9;
const typedWest = wallZ({
  length: D,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: OPEN_ALONG, w: 1.3, h: 1.5, fromFloor: OPEN_SILL_W }],
  material: wood
});
typedWest.position.x = -W / 2;
wallHouse.add(typedWest);
typedWest.updateMatrixWorld(true);
const westOpenBefore = worldAnchor(typedWest, "opening.0");
wallHouse.remove(typedWest);

const unflippedWest = wallX({
  length: D,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: OPEN_ALONG, w: 1.3, h: 1.5, fromFloor: OPEN_SILL_W }],
  material: wood
});
mate(unflippedWest, "wallSide", face(wallHouse, "left"));
unflippedWest.updateMatrixWorld(true);
if (worldAnchor(unflippedWest, "opening.0").position.distanceTo(westOpenBefore.position) < 1e-3) {
  throw new Error("unflipped west opening matched wallZ — the along-sign flip is not being tested");
}
wallHouse.remove(unflippedWest);

const matedWest = wallX({
  length: D,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: -OPEN_ALONG, w: 1.3, h: 1.5, fromFloor: OPEN_SILL_W }],
  material: wood
});
mate(matedWest, "wallSide", face(wallHouse, "left"));
matedWest.updateMatrixWorld(true);
const westOpenAfter = worldAnchor(matedWest, "opening.0");
if (westOpenAfter.position.distanceTo(westOpenBefore.position) > 1e-4) {
  throw new Error(
    `west opening drifted: ${westOpenAfter.position.toArray()} vs ${westOpenBefore.position.toArray()}`
  );
}
const leftOut = new THREE.Vector3(-1, 0, 0).transformDirection(wallHouse.matrixWorld);
if (westOpenAfter.normal.dot(leftOut) < 1 - 1e-4) {
  throw new Error("west opening must point out of the house (face.left) after mate");
}

const typedBack = wallX({
  length: W,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: OPEN_ALONG, w: 1.25, h: 1.4, fromFloor: OPEN_SILL_W }],
  material: wood
});
typedBack.position.z = -D / 2;
wallHouse.add(typedBack);
typedBack.updateMatrixWorld(true);
const backOpenBefore = worldAnchor(typedBack, "opening.0");
wallHouse.remove(typedBack);

const unflippedBack = wallX({
  length: W,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: OPEN_ALONG, w: 1.25, h: 1.4, fromFloor: OPEN_SILL_W }],
  material: wood
});
mate(unflippedBack, "wallSide", face(wallHouse, "back"));
unflippedBack.updateMatrixWorld(true);
if (worldAnchor(unflippedBack, "opening.0").position.distanceTo(backOpenBefore.position) < 1e-3) {
  throw new Error("unflipped back opening matched typed z = -d/2 — the along-sign flip is not being tested");
}
wallHouse.remove(unflippedBack);

const matedBack = wallX({
  length: W,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: -OPEN_ALONG, w: 1.25, h: 1.4, fromFloor: OPEN_SILL_W }],
  material: wood
});
mate(matedBack, "wallSide", face(wallHouse, "back"));
matedBack.updateMatrixWorld(true);
const backOpenAfter = worldAnchor(matedBack, "opening.0");
if (backOpenAfter.position.distanceTo(backOpenBefore.position) > 1e-4) {
  throw new Error(
    `back opening drifted: ${backOpenAfter.position.toArray()} vs ${backOpenBefore.position.toArray()}`
  );
}
const backOut = new THREE.Vector3(0, 0, -1).transformDirection(wallHouse.matrixWorld);
if (backOpenAfter.normal.dot(backOut) < 1 - 1e-4) {
  throw new Error("back opening must point out of the house (face.back) after mate");
}

const PART_LEN = 6;
const PART_ALONG = -2;
const typedPart = wallX({ length: PART_LEN, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
typedPart.position.set(PART_ALONG, 0, -D / 2);
wallHouse.add(typedPart);
typedPart.updateMatrixWorld(true);
const partBoxBefore = new THREE.Box3().setFromObject(typedPart);
wallHouse.remove(typedPart);

const matedPart = wallX({ length: PART_LEN, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
mate(matedPart, "wallSide", face(wallHouse, "back", { along: PART_ALONG }));
matedPart.updateMatrixWorld(true);
const partBoxAfter = new THREE.Box3().setFromObject(matedPart);
if (
  partBoxBefore.min.distanceTo(partBoxAfter.min) > 1e-4 ||
  partBoxBefore.max.distanceTo(partBoxAfter.max) > 1e-4
) {
  throw new Error("partial back wall world box drifted from typed position + along");
}

const ID_W = 22.5;
const ID_D = 12.35;
const idHouse = structure({
  x: 0,
  z: 0,
  w: ID_W,
  d: ID_D,
  eave: 6.2,
  name: "mateIdentity"
});
const oldSouth = porch({
  width: ID_W,
  depth: 4.6,
  eave: 3.4,
  material: wood,
  roofMaterial: shingle
});
oldSouth.position.z = ID_D / 2;
idHouse.add(oldSouth);
oldSouth.updateMatrixWorld(true);
const southBefore = oldSouth.matrixWorld.clone();
idHouse.remove(oldSouth);

const newSouth = porch({
  width: ID_W,
  depth: 4.6,
  eave: 3.4,
  material: wood,
  roofMaterial: shingle
});
mate(newSouth, "wallSide", face(idHouse, "front"));
newSouth.updateMatrixWorld(true);
matrixEq(southBefore, newSouth.matrixWorld, "south porch mate vs typed z = d/2");

const east = porch({
  width: 9.2,
  depth: 4.2,
  eave: 3.4,
  material: wood,
  roofMaterial: shingle
});
mate(east, "wallSide", face(idHouse, "right", { along: 1.75 }));
idHouse.updateMatrixWorld(true);
east.updateMatrixWorld(true);
const socket = {
  position: new THREE.Vector3(ID_W / 2, 0, 1.75).applyMatrix4(idHouse.matrixWorld),
  normal: new THREE.Vector3(1, 0, 0).transformDirection(idHouse.matrixWorld).normalize()
};
const plug = worldAnchor(east, "wallSide");
if (plug.position.distanceTo(socket.position) > 1e-5) {
  throw new Error(
    `east porch wallSide not coincident with face.right: ` +
      `${plug.position.toArray()} vs ${socket.position.toArray()}`
  );
}
if (plug.normal.dot(socket.normal) > -1 + 1e-5) {
  throw new Error(
    `east porch wallSide must oppose face.right, dot ${plug.normal.dot(socket.normal)}`
  );
}

const roofHouse = structure({
  x: 0,
  z: 0,
  w: 10,
  d: 8,
  eave: 4,
  name: "roofMate"
});
const oldRoof = hipRoof({ w: 10, d: 8, pitch: 0.5, overhang: 0.45, eave: 4, material: shingle });
roofHouse.add(oldRoof);
oldRoof.updateMatrixWorld(true);
const roofBefore = oldRoof.matrixWorld.clone();
roofHouse.remove(oldRoof);
const newRoof = hipRoof({ w: 10, d: 8, pitch: 0.5, overhang: 0.45, eave: 4, material: shingle });
mate(newRoof, "base", anchorsOf(roofHouse).get("wallTop"));
newRoof.updateMatrixWorld(true);
matrixEq(roofBefore, newRoof.matrixWorld, "hipRoof mate vs structure.add at origin");

const CH_W = 22.5;
const CH_D = 12.35;
const CH_EAVE = 6.2;
const CH_OVER = 0.45;
const chHouse = structure({
  x: 0,
  z: 0,
  w: CH_W,
  d: CH_D,
  eave: CH_EAVE,
  name: "chimneyTest"
});
const chRoof = hipRoof({
  w: CH_W,
  d: CH_D,
  pitch: 0.5,
  overhang: CH_OVER,
  eave: CH_EAVE,
  material: shingle
});
mate(chRoof, "base", anchorsOf(chHouse).get("wallTop"));
const rise = ((CH_D + CH_OVER * 2) / 2) * 0.5;
const ridgeLocal = anchorsOf(chRoof).get("ridge");
if (!ridgeLocal) {
  throw new Error("hipRoof is missing ridge");
}
vecEq(ridgeLocal.position, [0, CH_EAVE + rise, 0], "ridge.position");
vecEq(ridgeLocal.normal, [0, 1, 0], "ridge.normal");

const chH = CH_EAVE + rise + 0.8;
const lx = -6.8 - 0.75;
const lz = -3.4 - 0.825;
const oldStack = new THREE.Mesh(new THREE.BoxGeometry(1.15, chH, 1.15), wood);
oldStack.position.set(lx, chH / 2, lz);
chHouse.add(oldStack);
oldStack.updateMatrixWorld(true);
const oldBox = new THREE.Box3().setFromObject(oldStack);
chHouse.remove(oldStack);

const stack = chimney({ width: 1.15, height: chH, material: wood });
mate(stack, "base", anchorsOf(chHouse).get("footing"), { offset: { x: lx, y: 0, z: lz } });
stack.updateMatrixWorld(true);
const newBox = new THREE.Box3().setFromObject(stack);
if (oldBox.min.distanceTo(newBox.min) > 1e-5 || oldBox.max.distanceTo(newBox.max) > 1e-5) {
  throw new Error("chimney() world box drifted from the centered-mesh placement");
}

const exit = worldAnchor(stack, "exit");
const ridgeW = worldAnchor(chRoof, "ridge");
if (exit.position.y + 1e-6 < ridgeW.position.y + 0.6) {
  throw new Error(
    `chimney exit y=${exit.position.y.toFixed(2)} is not 0.6 m above ridge y=${ridgeW.position.y.toFixed(2)}`
  );
}

const OPEN_X = -1;
const OPEN_W = 0.92;
const OPEN_SILL = 0;
const JAMB_X = OPEN_X - OPEN_W / 2;
const wall = wallX({
  length: 10,
  height: 4,
  thickness: 0.22,
  openings: [{ x: OPEN_X, w: OPEN_W, h: 2.1, fromFloor: OPEN_SILL }],
  material: wood
});
const opening = anchorsOf(wall).get("opening.0");
if (!opening) {
  throw new Error("wallX is missing opening.0");
}
vecEq(opening.position, [OPEN_X, OPEN_SILL, 0], "opening.0.position");
vecEq(opening.normal, [0, 0, 1], "opening.0.normal");

const houseDoor = structure({ x: 0, z: 0, w: 10, d: 8, eave: 4, name: "doorMate" });
wall.position.z = 4;
houseDoor.add(wall);
const leaf = doorLeaf({
  width: 0.86,
  height: 2.03,
  thickness: 0.18,
  hinge: -0.46,
  swing: Math.PI / 2,
  material: wood
});
mate(leaf, "frame", anchorsOf(wall).get("opening.0"), { offset: { x: 0, y: 0, z: -0.11 } });
houseDoor.updateMatrixWorld(true);
leaf.updateMatrixWorld(true);
const frameW = worldAnchor(leaf, "frame");
const openW = opening.position.clone();
openW.z -= 0.11;
openW.applyMatrix4(wall.matrixWorld);
if (frameW.position.distanceTo(openW) > 1e-4) {
  throw new Error(`door frame not on opening: ${frameW.position.toArray()} vs ${openW.toArray()}`);
}
if (frameW.normal.dot(new THREE.Vector3(0, 0, 1).transformDirection(wall.matrixWorld)) > -1 + 1e-4) {
  throw new Error("door frame must oppose the wall opening normal");
}

if (Math.abs(leaf.position.x - JAMB_X) > 1e-4) {
  throw new Error(
    `door hinge at x=${leaf.position.x}, want left jamb ${JAMB_X} (opening center is ${OPEN_X})`
  );
}
let pane = null;
leaf.traverse((o) => {
  if (o.isMesh && !pane) {
    pane = o;
  }
});
if (!pane) {
  throw new Error("doorLeaf has no mesh");
}
const paneLocal = pane.getWorldPosition(new THREE.Vector3());
wall.worldToLocal(paneLocal);
if (Math.abs(paneLocal.x - JAMB_X) > 0.15) {
  throw new Error(
    `swung leaf is at wall x=${paneLocal.x.toFixed(3)}, not the jamb ${JAMB_X} — hanging in the opening`
  );
}

const WIN_SILL = 0.9;
const WIN_W = 1.3;
const WIN_H = 1.5;
const winWall = wallX({
  length: 10,
  height: 4,
  thickness: 0.22,
  openings: [{ x: 0, w: WIN_W, h: WIN_H, fromFloor: WIN_SILL }],
  material: wood
});
const sills = [];
winWall.traverse((n) => {
  if (n.userData.role === "sill") {
    sills.push(n);
  }
});
if (sills.length !== 1) {
  throw new Error(`window opening must emit one sill, got ${sills.length}`);
}
winWall.updateMatrixWorld(true);
const sillBox = new THREE.Box3().setFromObject(sills[0]);
if (Math.abs(sillBox.max.y - WIN_SILL) > 1e-4) {
  throw new Error(`sill top y=${sillBox.max.y}, want ${WIN_SILL}`);
}
if (sillBox.min.y > 0.05) {
  throw new Error(`sill must sit on the floor, min y=${sillBox.min.y}`);
}
const doorSills = [];
wall.traverse((n) => {
  if (n.userData.role === "sill") {
    doorSills.push(n);
  }
});
if (doorSills.length !== 0) {
  throw new Error("a fromFloor=0 doorway must not grow a sill");
}

const FF_W = 9;
const FF_D = 8;
const FF_EAVE = 4.4;
const FF_H = 2.4;
const ffHouse = structure({
  x: 0,
  z: 0,
  w: FF_W,
  d: FF_D,
  eave: FF_EAVE,
  name: "falseFrontMate"
});
const typedFf = new THREE.Group();
const typedBoard = new THREE.Mesh(new THREE.BoxGeometry(FF_W + 0.6, FF_H, 0.4), wood);
typedBoard.position.set(0, FF_EAVE + FF_H / 2, FF_D / 2 + 0.3);
typedFf.add(typedBoard);
for (const sx of [-FF_W / 2 - 0.3, FF_W / 2 + 0.3]) {
  const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, FF_EAVE + FF_H, FF_D + 0.6), wood);
  ret.position.set(sx, (FF_EAVE + FF_H) / 2, 0);
  typedFf.add(ret);
}
const typedCap = new THREE.Mesh(new THREE.BoxGeometry(FF_W + 1.0, 0.32, 0.8), shingle);
typedCap.position.set(0, FF_EAVE + FF_H + 0.02, FF_D / 2 + 0.42);
typedFf.add(typedCap);
ffHouse.add(typedFf);
typedFf.updateMatrixWorld(true);
const ffBefore = new THREE.Box3().setFromObject(typedFf);
ffHouse.remove(typedFf);

const matedFf = falseFront({
  w: FF_W,
  d: FF_D,
  eave: FF_EAVE,
  height: FF_H,
  material: wood,
  capMaterial: shingle
});
mate(matedFf, "wallSide", face(ffHouse, "front"));
matedFf.updateMatrixWorld(true);
const ffAfter = new THREE.Box3().setFromObject(matedFf);
if (ffBefore.min.distanceTo(ffAfter.min) > 1e-4 || ffBefore.max.distanceTo(ffAfter.max) > 1e-4) {
  throw new Error("falseFront world box drifted from typed parapet at z = d/2 + 0.3");
}

const ST_W = 8;
const ST_D = 8;
const ST_EAVE = 7.2;
const stHouse = structure({ x: 0, z: 0, w: ST_W, d: ST_D, eave: ST_EAVE, name: "steepleMate" });
const stRoof = gableRoof({ w: ST_W, d: ST_D, pitch: 0.5, overhang: 0.45, eave: ST_EAVE, material: shingle });
mate(stRoof, "base", anchorsOf(stHouse).get("wallTop"));
const gableFront = anchorsOf(stRoof).get("gableEnd.front");
if (!gableFront) {
  throw new Error("gableRoof is missing gableEnd.front");
}
vecEq(gableFront.position, [ST_W / 2, ST_EAVE, 0], "gableEnd.front.position");
vecEq(gableFront.normal, [1, 0, 0], "gableEnd.front.normal");
vecEq(anchorsOf(stRoof).get("gableEnd.back").position, [-ST_W / 2, ST_EAVE, 0], "gableEnd.back.position");
vecEq(anchorsOf(stRoof).get("gableEnd.back").normal, [-1, 0, 0], "gableEnd.back.normal");

const typedTower = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.5, 1.4), wood);
typedTower.position.set(ST_W / 2, ST_EAVE + 2.25, 0);
stHouse.add(typedTower);
const typedSpire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 4), wood);
typedSpire.position.set(ST_W / 2, ST_EAVE + 4.5 + 1.1, 0);
stHouse.add(typedSpire);
stHouse.updateMatrixWorld(true);
const steepleBefore = new THREE.Box3().setFromObject(typedTower).union(new THREE.Box3().setFromObject(typedSpire));
stHouse.remove(typedTower);
stHouse.remove(typedSpire);

const matedSteeple = steeple({ material: wood });
mate(matedSteeple, "gable", gableFront);
stHouse.updateMatrixWorld(true);
matedSteeple.updateMatrixWorld(true);
const steepleAfter = new THREE.Box3().setFromObject(matedSteeple);
if (
  steepleBefore.min.distanceTo(steepleAfter.min) > 1e-4 ||
  steepleBefore.max.distanceTo(steepleAfter.max) > 1e-4
) {
  throw new Error("steeple world box drifted from typed tower+spire at the +X gable");
}
const gablePlug = worldAnchor(matedSteeple, "gable");
const gableSocket = worldAnchor(stRoof, "gableEnd.front");
if (gablePlug.position.distanceTo(gableSocket.position) > 1e-5) {
  throw new Error("steeple gable is not coincident with gableEnd.front");
}
if (gablePlug.normal.dot(gableSocket.normal) > -1 + 1e-5) {
  throw new Error("steeple gable must oppose gableEnd.front");
}

const PART_X = -4.75;
const PART_Y = 0.12;
const PART_OPEN = 1.8;
const partHouse = structure({ x: 0, z: 0, w: W, d: D, eave: STRUCT_EAVE, name: "partitionMate" });
const typedPartA = wallZ({
  length: D,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: PART_OPEN, w: 0.92, h: 2.03, fromFloor: 0 }],
  material: wood
});
typedPartA.position.set(PART_X, PART_Y, 0);
partHouse.add(typedPartA);
typedPartA.updateMatrixWorld(true);
const partABefore = new THREE.Box3().setFromObject(typedPartA);
const partAOpenBefore = worldAnchor(typedPartA, "opening.0");
partHouse.remove(typedPartA);

defineAnchor(partHouse, "partition.west", {
  position: { x: PART_X, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 }
});
const matedPartA = wallX({
  length: D,
  height: STRUCT_EAVE,
  thickness: WALL_T,
  openings: [{ x: PART_OPEN, w: 0.92, h: 2.03, fromFloor: 0 }],
  material: wood
});
mate(matedPartA, "wallSide", anchorsOf(partHouse).get("partition.west"), { offset: { y: PART_Y } });
matedPartA.updateMatrixWorld(true);
const partAAfter = new THREE.Box3().setFromObject(matedPartA);
if (partABefore.min.distanceTo(partAAfter.min) > 1e-4 || partABefore.max.distanceTo(partAAfter.max) > 1e-4) {
  throw new Error("interior wallZ partition world box drifted from mate to +X socket");
}
const partAOpenAfter = worldAnchor(matedPartA, "opening.0");
if (partAOpenAfter.position.distanceTo(partAOpenBefore.position) > 1e-4) {
  throw new Error("interior partition doorway drifted");
}

const JOIN_ALONG = 3.2;
const typedJoin = wallX({ length: 3.2, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
typedJoin.position.set(JOIN_ALONG, PART_Y, -D / 2);
partHouse.add(typedJoin);
typedJoin.updateMatrixWorld(true);
const joinBefore = new THREE.Box3().setFromObject(typedJoin);
partHouse.remove(typedJoin);

const matedJoin = wallX({ length: 3.2, height: STRUCT_EAVE, thickness: WALL_T, material: wood });
mate(matedJoin, "wallSide", face(partHouse, "back", { along: JOIN_ALONG }), { offset: { y: PART_Y } });
matedJoin.updateMatrixWorld(true);
const joinAfter = new THREE.Box3().setFromObject(matedJoin);
if (joinBefore.min.distanceTo(joinAfter.min) > 1e-4 || joinBefore.max.distanceTo(joinAfter.max) > 1e-4) {
  throw new Error("back-join partition world box drifted from typed wallX at z = -d/2");
}

const PARA_H = 0.42;
const paraHouse = structure({ x: 0, z: 0, w: W, d: D, eave: STRUCT_EAVE, name: "parapetMate" });
const typedPara = new THREE.Group();
for (const [px, pz, pw, pd] of [
  [0, D / 2, W + 0.24, 0.2],
  [0, -D / 2, W + 0.24, 0.2],
  [W / 2, 0, 0.2, D],
  [-W / 2, 0, 0.2, D]
]) {
  const cap = new THREE.Mesh(new THREE.BoxGeometry(pw, PARA_H, pd), wood);
  cap.position.set(px, STRUCT_EAVE + PARA_H / 2, pz);
  typedPara.add(cap);
}
paraHouse.add(typedPara);
typedPara.updateMatrixWorld(true);
const paraBefore = new THREE.Box3().setFromObject(typedPara);
paraHouse.remove(typedPara);

const matedPara = parapet({ w: W, d: D, height: PARA_H, material: wood });
mate(matedPara, "base", anchorsOf(paraHouse).get("wallTop"));
matedPara.updateMatrixWorld(true);
const paraAfter = new THREE.Box3().setFromObject(matedPara);
if (paraBefore.min.distanceTo(paraAfter.min) > 1e-4 || paraBefore.max.distanceTo(paraAfter.max) > 1e-4) {
  throw new Error("parapet world box drifted from typed caps at y = eave");
}

const boxA = { x: 0, z: 0, w: 10, d: 8, yaw: 0 };
const boxB = { x: 6, z: 0, w: 10, d: 8, yaw: 0 };
if (!footprintsOverlap(boxA, boxB)) {
  throw new Error("axis-aligned boxes 6 m apart must overlap");
}
const boxC = { x: 20, z: 0, w: 10, d: 8, yaw: 0 };
if (footprintsOverlap(boxA, boxC, 0.8)) {
  throw new Error("boxes 20 m apart must not overlap");
}
const boxD = { x: 5.53, z: 0, w: 8, d: 7, yaw: Math.PI / 2 };
if (!footprintsOverlap({ x: 0, z: 0, w: 9.5, d: 8, yaw: 0 }, boxD, 0.8)) {
  throw new Error("store vs cross-street lot at 5.53 m must overlap (the church-door blocker)");
}

const STEP_W = 1.6;
const STEP_RISE = 0.16;
const STEP_TREAD = 0.5;
const PORCH_D = 4.6;
const STEP_OUT = 0.55;
const stepHouse = structure({ x: 0, z: 0, w: W, d: D, eave: STRUCT_EAVE, name: "stepsMate" });
const stepPorch = porch({
  width: W,
  depth: PORCH_D,
  eave: 3.4,
  material: wood,
  roofMaterial: shingle
});
mate(stepPorch, "wallSide", face(stepHouse, "front"));
const typedSteps = new THREE.Group();
for (let i = 0; i < 2; i += 1) {
  const step = new THREE.Mesh(new THREE.BoxGeometry(STEP_W, STEP_RISE, STEP_TREAD), wood);
  step.position.set(0, STEP_RISE / 2 + i * 0.14, PORCH_D + STEP_OUT - i * STEP_TREAD);
  typedSteps.add(step);
}
stepPorch.add(typedSteps);
typedSteps.updateMatrixWorld(true);
const stepsBefore = new THREE.Box3().setFromObject(typedSteps);
stepPorch.remove(typedSteps);

const matedSteps = steps({
  count: 2,
  width: STEP_W,
  rise: STEP_RISE,
  tread: STEP_TREAD,
  material: wood
});
mate(matedSteps, "wallSide", anchorsOf(stepPorch).get("deckEdge"), { offset: { z: STEP_OUT } });
matedSteps.updateMatrixWorld(true);
const stepsAfter = new THREE.Box3().setFromObject(matedSteps);
if (stepsBefore.min.distanceTo(stepsAfter.min) > 1e-4 || stepsBefore.max.distanceTo(stepsAfter.max) > 1e-4) {
  throw new Error("steps world box drifted from typed treads beyond the porch deck");
}

const VG_W = 10.5;
const VG_D = 6.2;
const VG_EAVE = 3.05;
const vgHouse = structure({ x: 0, z: 0, w: VG_W, d: VG_D, eave: VG_EAVE, name: "vigasMate" });
const typedVigas = new THREE.Group();
const nVigas = Math.max(3, Math.round(VG_W / 1.6));
for (let i = 0; i < nVigas; i += 1) {
  const vx = -VG_W / 2 + 0.7 + (i / (nVigas - 1)) * (VG_W - 1.4);
  const viga = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), wood);
  viga.rotation.x = Math.PI / 2;
  viga.position.set(vx, VG_EAVE - 0.12, VG_D / 2 + 0.45);
  typedVigas.add(viga);
}
vgHouse.add(typedVigas);
typedVigas.updateMatrixWorld(true);
const vigasBefore = new THREE.Box3().setFromObject(typedVigas);
vgHouse.remove(typedVigas);

const matedVigas = vigas({ w: VG_W, eave: VG_EAVE, material: wood });
mate(matedVigas, "wallSide", face(vgHouse, "front"));
matedVigas.updateMatrixWorld(true);
const vigasAfter = new THREE.Box3().setFromObject(matedVigas);
if (vigasBefore.min.distanceTo(vigasAfter.min) > 1e-4 || vigasBefore.max.distanceTo(vigasAfter.max) > 1e-4) {
  throw new Error("vigas world box drifted from typed beams at z = d/2 + 0.45");
}

const IN_T = 0.22;
const IN_H = 4.4;
const inHouse = structure({ x: 0, z: 0, w: W, d: D, eave: IN_H, name: "interiorShell" });
const typedFront = wallX({
  length: W,
  height: IN_H,
  thickness: IN_T,
  openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }],
  material: wood
});
typedFront.position.z = D / 2 - IN_T / 2;
inHouse.add(typedFront);
typedFront.updateMatrixWorld(true);
const inFrontBefore = typedFront.matrixWorld.clone();
inHouse.remove(typedFront);

const matedFront = wallX({
  length: W,
  height: IN_H,
  thickness: IN_T,
  openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }],
  material: wood
});
mate(matedFront, "wallSide", face(inHouse, "front"), { offset: { z: -IN_T / 2 } });
matedFront.updateMatrixWorld(true);
matrixEq(inFrontBefore, matedFront.matrixWorld, "interior front wall mate vs typed z = d/2 - t/2");

const typedInBack = wallX({ length: W, height: IN_H, thickness: IN_T, material: wood });
typedInBack.position.z = -D / 2 + IN_T / 2;
inHouse.add(typedInBack);
typedInBack.updateMatrixWorld(true);
const inBackBefore = new THREE.Box3().setFromObject(typedInBack);
inHouse.remove(typedInBack);
const matedInBack = wallX({ length: W, height: IN_H, thickness: IN_T, material: wood });
mate(matedInBack, "wallSide", face(inHouse, "back"), { offset: { z: IN_T / 2 } });
matedInBack.updateMatrixWorld(true);
const inBackAfter = new THREE.Box3().setFromObject(matedInBack);
if (inBackBefore.min.distanceTo(inBackAfter.min) > 1e-4 || inBackBefore.max.distanceTo(inBackAfter.max) > 1e-4) {
  throw new Error("interior back wall world box drifted from typed z = -d/2 + t/2");
}

console.log("PASS");
