/**
 * Per-instance data must reach the GPU after the first frame.
 *
 * This is the check for the floating grass, which took seven passes and
 * fifteen green checks to find because nothing on the CPU was ever wrong.
 *
 * The ground cover carried two per-instance arrays, `tints` and `speciesUV`,
 * built as TSL nodes with `instancedBufferAttribute(...)`. When the amortised
 * scatter rewrote them it marked them dirty the obvious way:
 *
 *     tintAttr.needsUpdate = true;
 *     speciesAttr.needsUpdate = true;
 *
 * `BufferAttributeNode` has no `needsUpdate` property. Those lines set an
 * inert field on a plain object and did nothing, and `instancedBufferAttribute`
 * builds its buffer with StaticDrawUsage, so both arrays were uploaded once at
 * first render and never again. `grass.instanceMatrix` is a real
 * BufferAttribute, so matrices DID update - and the ring grid rescatters
 * constantly as the camera moves. Every instance kept getting a new position,
 * size and rotation while holding the first scatter's species: a card sized for
 * blue grama (fill 0.4, a card 2.5x the plant's height) drawing bluestem's
 * panel, whose blades fill 93% of it, renders that clump most of the way up a
 * card two and a half times too tall. Grass hanging in mid-air.
 *
 * Nothing throws, nothing logs, and every CPU-side measurement - card
 * placement, card size, the atlas and its alpha, the mip chain, a raycast
 * against the drawn terrain - reports the scene as correct, because it is. The
 * only wrong thing is a stale copy of one attribute in GPU memory, which no
 * headless check can read.
 *
 * So check the invariant that guarantees it instead: a TSL node is never the
 * thing you mark dirty. Per-instance data that changes at runtime must be a
 * real BufferAttribute on the geometry, read back with attribute(), and marked
 * dirty on the attribute.
 *
 * And the mirror-image bug, which this file used to REQUIRE. Marking those
 * attributes `setUsage(THREE.DynamicDrawUsage)` is the WebGL idiom for "this
 * buffer gets rewritten", and it is harmless there. Under three's WebGPU
 * backend it is a per-frame tax:
 *
 *     if ( data.version < bufferAttribute.version ||
 *          bufferAttribute.usage === DynamicDrawUsage )
 *         this.backend.updateAttribute( attribute );   // Attributes.update
 *
 * The usage flag short-circuits the version check, so every aWind, aTint and
 * aSpecies buffer was re-uploaded on every frame whether or not anything had
 * changed. Measured on an M2 MacBook Air at the northernPines vantage with the
 * camera parked and settled: 22 queue.writeBuffer calls, 2.6 MB and 44 ms of
 * main-thread time per frame, 90% of all CPU samples in the frame. Removing
 * the flag took p95 frame time from 306 ms to 57 ms there, and from 209 to 31
 * at the ranch, with the dirty flags alone keeping the data current.
 *
 * So both halves are asserted below: the data must be a real attribute that is
 * marked dirty when it changes, and it must NOT be marked DynamicDrawUsage.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sourceFiles(full)));
    } else if (/\.(ts|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * TSL factories that return a node. A node is a description of how to read a
 * value in a shader, not the buffer behind it, so marking one dirty is always
 * a no-op - there is nothing to upload.
 */
const NODE_FACTORIES = [
  "instancedBufferAttribute",
  "instancedDynamicBufferAttribute",
  "bufferAttribute",
  "attribute",
  "uniform",
  "varyingProperty",
  "instanceIndex"
];

const files = await sourceFiles("src");
const offenders = [];
let nodeBindings = 0;

for (const file of files) {
  const src = await readFile(file, "utf8");
  const lines = src.split("\n");

  // Names bound to a TSL node in this file.
  const nodes = new Map();
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\(/);
    if (m && NODE_FACTORIES.includes(m[2])) {
      nodes.set(m[1], { factory: m[2], line: i + 1 });
      nodeBindings += 1;
    }
  });

  // Anything marking one of them dirty is the bug.
  lines.forEach((line, i) => {
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\.needsUpdate\s*=/);
    if (m && nodes.has(m[1])) {
      const node = nodes.get(m[1]);
      offenders.push(
        `${file}:${i + 1}  ${m[1]}.needsUpdate — ${m[1]} is a TSL node ` +
          `(${node.factory}(...) at ${file}:${node.line}), not a BufferAttribute`
      );
    }
  });
}

assert(
  offenders.length === 0,
  `needsUpdate set on a TSL node, which does nothing: the data is written on ` +
    `the CPU and never uploaded, so the GPU keeps whatever it had at first ` +
    `render while every other per-instance value keeps changing.\n  ` +
    offenders.join("\n  ") +
    `\n\nHold the data in a real THREE.InstancedBufferAttribute on the ` +
    `geometry (geometry.setAttribute(name, attrib)), read it in the shader ` +
    `with attribute(name, type), and set needsUpdate on the attribute rather ` +
    `than on the node. Do NOT reach for setUsage(THREE.DynamicDrawUsage) — ` +
    `see below for what that costs under WebGPU.`
);

// Nowhere in the renderer, not just on the three attributes named below. The
// tree and sage wind frames are built by a shared helper (makeWindAttrib), so
// the per-name loop cannot see them, and they were 19 of the 22 per-frame
// uploads. One flag anywhere in src is the whole cost back.
const dynamicUsage = [];
for (const file of files) {
  const src = await readFile(file, "utf8");
  src.split("\n").forEach((line, i) => {
    if (/setUsage\(\s*THREE\.DynamicDrawUsage\s*\)/.test(line)) {
      dynamicUsage.push(`${file}:${i + 1}`);
    }
  });
}
assert(
  dynamicUsage.length === 0,
  `setUsage(THREE.DynamicDrawUsage) under WebGPU means "re-upload this whole ` +
    `buffer every frame, forever" — Attributes.update skips its version check ` +
    `for it. Mark the attribute needsUpdate where it is written instead.\n  ` +
    dynamicUsage.join("\n  ")
);

// The ground cover is where this bit, and its per-instance data changes on
// every rescatter. Assert the whole path end to end so the wiring cannot be
// half-undone: real attribute, no per-frame usage flag, and marked dirty when
// rewritten.
const veg = await readFile("src/vegetation.js", "utf8");
const wired = [];
// aFade joins the list because it is load-bearing in exactly the way aTint
// was: it is written per tuft by the scatter and read only in the shader, so a
// stale copy in GPU memory is silent. If it never uploads, every tuft compares
// the two dissolves against whatever the first tile to occupy that slot
// happened to hash to, and they degenerate back into the tile-at-a-time pop
// they exist to prevent — with nothing on the CPU side wrong to find.
for (const [attr, array] of [
  ["aTint", "tints"],
  ["aSpecies", "speciesUV"],
  ["aWind", "windRot"],
  ["aFade", "fade"],
  // The shrubs' half of the same wiring. Sage keeps the ring scheme rather
  // than the tile cache, so its dither rides its own buffer and is published
  // by finishRing instead of finishTile — a separate path that can rot on its
  // own, and whose failure is the same silent one: bushes comparing the fade
  // against a stale hash.
  ["aDither", "sageDither"]
]) {
  const varMatch = veg.match(
    new RegExp(`const\\s+([\\w$]+)\\s*=\\s*new THREE\\.InstancedBufferAttribute\\(\\s*${array}\\b`)
  );
  assert(
    varMatch,
    `src/vegetation.js: the per-instance array "${array}" is not held in a ` +
      `THREE.InstancedBufferAttribute. It changes on every rescatter, so a TSL ` +
      `instancedBufferAttribute() node would upload it once and never again — ` +
      `see the header of this file for what that looked like on screen.`
  );
  const name = varMatch[1];
  // The inverse of what this used to assert, and the reason is measured. See
  // the second half of this file's header: under WebGPU, DynamicDrawUsage
  // means "re-upload every frame regardless of version", not "expect writes".
  assert(
    !new RegExp(`${name}\\.setUsage\\(THREE\\.DynamicDrawUsage\\)`).test(veg),
    `src/vegetation.js: ${name} (${array}) is marked DynamicDrawUsage. Under ` +
      `three's WebGPU backend that skips the version check in ` +
      `Attributes.update and re-uploads the whole buffer on EVERY frame, ` +
      `parked camera or not — measured at northernPines on an M2 Air as 22 ` +
      `uploads, 2.6 MB and 44 ms of queue.writeBuffer per frame, which was ` +
      `the largest single cost in the frame. needsUpdate is the dirty ` +
      `contract; the assertion below checks it is set.`
  );
  assert(
    new RegExp(`setAttribute\\(\\s*"${attr}"\\s*,\\s*${name}\\s*\\)`).test(veg),
    `src/vegetation.js: ${name} (${array}) is never attached to the tuft ` +
      `geometry as "${attr}", so the shader cannot read it.`
  );
  assert(
    new RegExp(`attribute\\(\\s*"${attr}"`).test(veg),
    `src/vegetation.js: the shader never reads attribute("${attr}").`
  );
  assert(
    new RegExp(`${name}\\.needsUpdate\\s*=\\s*true`).test(veg),
    `src/vegetation.js: ${name} (${array}) is rewritten by the scatter but ` +
      `never marked dirty, so the GPU keeps the first scatter's values while ` +
      `the instance matrices keep changing. Set ${name}.needsUpdate = true ` +
      `wherever grass.instanceMatrix.needsUpdate is set.`
  );
  wired.push(`${array} -> ${attr} (${name})`);
}

// aWind rides on the tree canopies too, and the tree side is the same trap
// one level up: bucketTrees rewrites the crown matrices (and reshuffles their
// slots) every time the camera crosses the LOD shell, so the wind frames must
// be rewritten and flagged dirty in exactly the same passes. These are built
// by makeWindAttrib (a shared helper, so the loop above cannot see them) and
// filled from the per-tree arrays treeWind / cottonWind.
for (const host of ["pines[t]", "broads[t]"]) {
  for (const lod of ["Near", "Far", "Dist"]) {
    const flag = `${host}.wind${lod}.needsUpdate = true`;
    assert(
      veg.includes(flag),
      `src/vegetation.js: ${host}.wind${lod} is never marked dirty. The crown ` +
        `matrices are rewritten by the seeding loop and bucketTrees, so a stale ` +
        `wind frame is the floating-grass bug again, on the trees: each crown ` +
        `keeps a rotation belonging to a different tree and leans the wrong ` +
        `way. Set needsUpdate wherever ${host}.crown${lod}` +
        `.instanceMatrix.needsUpdate is set.`
    );
  }
}
for (const array of ["treeWind", "cottonWind"]) {
  assert(
    new RegExp(`const ${array} = new Float32Array\\(`).test(veg),
    `src/vegetation.js: the per-tree wind frame array ${array} is missing; ` +
      `windBend reads attribute("aWind") on every wind-blown canopy, so each ` +
      `crown instance needs (cos a / sx, sin a / sx) written wherever its ` +
      `matrix is written.`
  );
}

console.log(JSON.stringify({
  filesScanned: files.length,
  dynamicDrawUsageSites: dynamicUsage.length,
  tslNodeBindings: nodeBindings,
  nodesMarkedDirty: offenders.length,
  perInstanceAttributes: wired
}, null, 2));
console.log("PASS");
