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
    `geometry (setUsage(THREE.DynamicDrawUsage), geometry.setAttribute(name, ` +
    `attrib)), read it in the shader with attribute(name, type), and set ` +
    `needsUpdate on the attribute rather than on the node.`
);

// The ground cover is where this bit, and its per-instance data changes on
// every rescatter. Assert the whole path end to end so the wiring cannot be
// half-undone: real attribute, dynamic usage, and marked dirty when rewritten.
const veg = await readFile("src/vegetation.js", "utf8");
const wired = [];
for (const [attr, array] of [["aTint", "tints"], ["aSpecies", "speciesUV"]]) {
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
  assert(
    new RegExp(`${name}\\.setUsage\\(THREE\\.DynamicDrawUsage\\)`).test(veg),
    `src/vegetation.js: ${name} (${array}) is rewritten every rescatter but is ` +
      `not marked DynamicDrawUsage. Add ${name}.setUsage(THREE.DynamicDrawUsage).`
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

console.log(JSON.stringify({
  filesScanned: files.length,
  tslNodeBindings: nodeBindings,
  nodesMarkedDirty: offenders.length,
  perInstanceAttributes: wired
}, null, 2));
console.log("PASS");
