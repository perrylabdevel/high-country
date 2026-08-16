/**
 * Pack roughness / AO / height into a single RGB map (R=AO G=Rough B=Height)
 * and copy albedo + OpenGL normals into public/textures/.
 *
 *   npm run pack-textures
 *
 * Reads gitignored assets-src/textures/<set>/{diff,nor_gl,rough,ao,disp}.jpg
 * Writes public/textures/<set>_2k_{albedo,normal,orm}.*
 */
import { mkdirSync, copyFileSync, existsSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";

// KTX2 keeps textures compressed in GPU memory (the 403 MB budget problem).
// UASTC is a GPU-compressed format, so the .ktx2 file can be larger on disk
// than the source JPEG while still cutting VRAM by ~4x.
const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(Buffer.from(buffer)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

async function encodeKtx2(srcPath, destPath) {
  const buf = readFileSync(srcPath);
  const out = await encodeToKTX2(new Uint8Array(buf), { isUASTC: true, generateMipmap: true, imageDecoder });
  writeFileSync(destPath, out);
  console.log(`  → ${destPath} (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "assets-src/textures");
const hdrSrc = join(root, "assets-src/hdris");
const destRoot = join(root, "public/textures");

function assertFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

async function packSet(name) {
  const dir = join(srcRoot, name);
  const diff = join(dir, "diff.jpg");
  const normal = join(dir, "nor_gl.jpg");
  const rough = join(dir, "rough.jpg");
  const ao = join(dir, "ao.jpg");
  const disp = join(dir, "disp.jpg");
  assertFile(diff, `${name} albedo`);
  assertFile(normal, `${name} normal`);
  assertFile(rough, `${name} roughness`);
  assertFile(ao, `${name} AO`);
  assertFile(disp, `${name} height`);

  mkdirSync(destRoot, { recursive: true });
  copyFileSync(diff, join(destRoot, `${name}_2k_albedo.jpg`));
  copyFileSync(normal, join(destRoot, `${name}_2k_normal.jpg`));

  const [aoBuf, roughBuf, dispBuf] = await Promise.all([
    sharp(ao).greyscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(rough).greyscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(disp).greyscale().raw().toBuffer({ resolveWithObject: true })
  ]);
  const { width, height } = aoBuf.info;
  if (roughBuf.info.width !== width || dispBuf.info.width !== width) {
    throw new Error(`${name}: AO / roughness / height must be the same size`);
  }
  const pixels = width * height;
  const packed = Buffer.alloc(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    packed[i * 3] = aoBuf.data[i];
    packed[i * 3 + 1] = roughBuf.data[i];
    packed[i * 3 + 2] = dispBuf.data[i];
  }
  const ormPath = join(destRoot, `${name}_2k_orm.png`);
  await sharp(packed, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(ormPath);
  console.log(`packed ${name} (${width}×${height})`);

  // Encode the packed outputs to KTX2 (UASTC, mipmapped) for GPU-compressed
  // loading. The .jpg/.png remain as the source-of-truth fallback.
  await encodeKtx2(join(destRoot, `${name}_2k_albedo.jpg`), join(destRoot, `${name}_2k_albedo.ktx2`));
  await encodeKtx2(join(destRoot, `${name}_2k_normal.jpg`), join(destRoot, `${name}_2k_normal.ktx2`));
  await encodeKtx2(ormPath, join(destRoot, `${name}_2k_orm.ktx2`));
}

function copyHdris() {
  const dest = join(destRoot, "env");
  mkdirSync(dest, { recursive: true });
  const map = {
    "midday_2k.hdr": "midday_2k.hdr",
    "golden_2k.hdr": "golden_2k.hdr"
  };
  for (const file of Object.keys(map)) {
    const from = join(hdrSrc, file);
    if (!existsSync(from)) {
      console.warn(`skip HDRI ${file}`);
      continue;
    }
    copyFileSync(from, join(dest, map[file]));
    console.log(`copied env/${map[file]}`);
  }
}

const sets = existsSync(srcRoot)
  ? readdirSync(srcRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];

const skip = new Set(["leaf"]);

if (sets.length === 0) {
  console.warn("No texture sets in assets-src/textures/. Download sources first.");
} else {
  for (const name of sets) {
    if (skip.has(name)) {
      continue;
    }
    await packSet(name);
  }
}

async function packLeafAtlas() {
  const diff = join(srcRoot, "leaf/diff.png");
  if (!existsSync(diff)) {
    console.warn("skip leaf atlas (missing assets-src/textures/leaf/diff.png)");
    return;
  }
  mkdirSync(destRoot, { recursive: true });
  const out = join(destRoot, "pine_twig_2k.png");
  // pine_tree_01's twig map is a packed atlas (cones, bark, several sprigs).
  // Crop the top-left sprig and rotate so the stem runs along +X, matching
  // makePineCanopy's card long axis.
  await sharp(diff)
    .extract({ left: 0, top: 0, width: 512, height: 768 })
    .rotate(90)
    .png()
    .toFile(out);
  console.log(`packed leaf atlas → ${out}`);
}

await packLeafAtlas();
copyHdris();
