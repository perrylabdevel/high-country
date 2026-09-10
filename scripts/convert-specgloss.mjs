/**
 * Convert KHR_materials_pbrSpecularGlossiness materials to core
 * metallic-roughness, in place, on a .glb.
 *
 * three.js dropped the specular-glossiness extension loader, so a GLB that
 * carries ONLY specGloss materials (no pbrMetallicRoughness fallback) loads as
 * flat white with no maps however many textures the file contains — the settler
 * woman arrived exactly that way. The glTF spec's own conversion guidance is
 * the approximation used here: the diffuse channel becomes base colour, the
 * material is fully dielectric, and roughness is the complement of glossiness.
 * Specular colour is discarded; for cloth and skin that is close to free.
 *
 *   node scripts/convert-specgloss.mjs <file.glb>
 */
import fs from "node:fs";

const EXT = "KHR_materials_pbrSpecularGlossiness";
const file = process.argv[2];
if (!file) throw new Error("usage: convert-specgloss.mjs <file.glb>");

const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB (bad magic)");

// GLB: 12-byte header, then length-prefixed chunks. Only the JSON chunk changes;
// the binary chunk is copied through byte for byte.
const chunks = [];
let off = 12;
while (off < buf.length) {
  const len = buf.readUInt32LE(off);
  const type = buf.readUInt32LE(off + 4);
  chunks.push({ type, data: buf.subarray(off + 8, off + 8 + len) });
  off += 8 + len;
}
const jsonChunk = chunks.find((c) => c.type === 0x4e4f534a);
if (!jsonChunk) throw new Error("GLB has no JSON chunk");
const gltf = JSON.parse(new TextDecoder().decode(jsonChunk.data));

let converted = 0;
for (const material of gltf.materials ?? []) {
  const sg = material.extensions?.[EXT];
  if (!sg) continue;
  const pbr = material.pbrMetallicRoughness ?? {};
  if (sg.diffuseTexture) pbr.baseColorTexture = sg.diffuseTexture;
  if (sg.diffuseFactor) pbr.baseColorFactor = sg.diffuseFactor;
  pbr.metallicFactor = 0;
  // glossiness 1 is a mirror, 0 is fully diffuse — roughness is its complement.
  pbr.roughnessFactor = 1 - (sg.glossinessFactor ?? 1);
  material.pbrMetallicRoughness = pbr;
  delete material.extensions[EXT];
  if (!Object.keys(material.extensions).length) delete material.extensions;
  converted += 1;
}
if (!converted) {
  console.log(`${file}: no ${EXT} materials — unchanged`);
  process.exit(0);
}
const drop = (list) => (list ?? []).filter((name) => name !== EXT);
if (gltf.extensionsUsed) gltf.extensionsUsed = drop(gltf.extensionsUsed);
if (gltf.extensionsRequired) gltf.extensionsRequired = drop(gltf.extensionsRequired);
for (const key of ["extensionsUsed", "extensionsRequired"]) {
  if (gltf[key] && !gltf[key].length) delete gltf[key];
}

// Chunks are 4-byte aligned; JSON pads with spaces, binary with zeroes.
const encoded = new TextEncoder().encode(JSON.stringify(gltf));
const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
Buffer.from(encoded).copy(padded);
jsonChunk.data = padded;

const total = 12 + chunks.reduce((sum, c) => sum + 8 + c.data.length, 0);
const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
let w = 12;
for (const c of chunks) {
  out.writeUInt32LE(c.data.length, w);
  out.writeUInt32LE(c.type, w + 4);
  c.data.copy(out, w + 8);
  w += 8 + c.data.length;
}
fs.writeFileSync(file, out);
console.log(`${file}: converted ${converted} ${EXT} material(s) to metallic-roughness`);
