/**
 * Anchor invariants (docs/ANCHORS.md).
 *
 * Porch posts carrying nothing is a required-socket lint, not a screenshot
 * judgement. Literals below are from the spec, not from kit.js.
 *
 * Reintroducing the bug — removing the porch roof — must fail.
 */
import * as THREE from "three/webgpu";
import { porch, structure } from "../src/buildings/kit.js";
import { bakeHeightfield } from "../src/heightfield.js";
import { anchorsOf, unmatedRequired, face } from "../src/buildings/anchors.js";

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

console.log("PASS");
