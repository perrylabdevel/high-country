/**
 * Anchor invariants (docs/ANCHORS.md).
 *
 * Porch posts carrying nothing is a required-socket lint, not a screenshot
 * judgement. Literals below are from the spec, not from kit.js.
 *
 * Reintroducing the bug — removing the porch roof — must fail.
 */
import * as THREE from "three/webgpu";
import { porch, structure, hipRoof, chimney } from "../src/buildings/kit.js";
import { bakeHeightfield } from "../src/heightfield.js";
import { anchorsOf, unmatedRequired, face, mate, worldAnchor } from "../src/buildings/anchors.js";

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

function matrixEq(a, b, label) {
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a.elements[i] - b.elements[i]) > 1e-5) {
      throw new Error(`${label}: matrixWorld drifted at element ${i}`);
    }
  }
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
stack.position.set(lx, 0, lz);
chHouse.add(stack);
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

console.log("PASS");
