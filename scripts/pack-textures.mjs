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

/**
 * Copy a tangent-space normal map, correcting one that was stored sRGB-encoded.
 *
 * A tangent-space normal map is vector data: its R/G channels must average to
 * ~127.5 (no net tilt) and (r,g,b)*2-1 must be roughly unit length. Six of the
 * seven Poly Haven sets in this project satisfy that as downloaded. `gravel`
 * did not: mean RGB (183.9, 183.3, 244.2), mean |n| 1.147, a constant 31.9 deg
 * tangent-space tilt that survived to an 8x8 mip. Decoding it as sRGB lands it
 * exactly in the family (mean 126.2/125.5/231.6, |n| 0.939 +/- 0.096, against
 * dirt's 0.954 +/- 0.076) — it had been through one extra sRGB encode.
 *
 * `pack-textures` used to `copyFileSync` the normal, so that bias went straight
 * into the shipped KTX2 and every gravel surface — which is every road, the
 * splat's channel A — was shaded as a uniform 32 deg slope. That both offsets
 * the road's lighting from the terrain around it and halves the effective
 * contrast of the real gravel detail riding on top of the DC term.
 *
 * Correct rather than throw, but never silently: an unrecognised deviation is
 * a hard error, because silent substitution is how the wrong maps shipped
 * before (HARD_WON 3.2). Byte-copy the good ones so their bundle hashes do not
 * churn on a re-pack.
 */
const NORMAL_MEAN_TOLERANCE = 12;   // levels away from 127.5 that still reads as unbiased

async function copyNormalMap(srcPath, destPath, name) {
  const { data, info } = await sharp(srcPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const meanOf = (map) => {
    let r = 0, g = 0;
    for (let i = 0; i < px; i += 1) {
      r += map(data[i * info.channels]);
      g += map(data[i * info.channels + 1]);
    }
    return [r / px, g / px];
  };
  const bias = ([r, g]) => Math.max(Math.abs(r - 127.5), Math.abs(g - 127.5));

  const asStored = meanOf((c) => c);
  if (bias(asStored) <= NORMAL_MEAN_TOLERANCE) {
    copyFileSync(srcPath, destPath);
    return;
  }

  const toLinear = (c) => {
    const n = c / 255;
    return (n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)) * 255;
  };
  const linearized = meanOf(toLinear);
  if (bias(linearized) > NORMAL_MEAN_TOLERANCE) {
    throw new Error(
      `${name} normal map is biased (mean R/G ${asStored[0].toFixed(1)}/${asStored[1].toFixed(1)}, ` +
      `expected ~127.5) and decoding it as sRGB does not fix it ` +
      `(${linearized[0].toFixed(1)}/${linearized[1].toFixed(1)}). Inspect the source before packing.`
    );
  }

  const out = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[i * 3 + c] = Math.round(toLinear(data[i * info.channels + c]));
    }
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(destPath);
  console.warn(
    `  ! ${name} normal was sRGB-encoded (mean R/G ${asStored[0].toFixed(1)}/${asStored[1].toFixed(1)}); ` +
    `decoded to linear (${linearized[0].toFixed(1)}/${linearized[1].toFixed(1)})`
  );
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
  await copyNormalMap(normal, join(destRoot, `${name}_2k_normal.jpg`), name);

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
// PACK_ONLY=gravel[,rock] repacks a subset. A full re-pack rewrites every
// KTX2, which churns the bundle hash for sets that did not change; when one
// source is corrected, pack only that one so the diff stays legible.
const only = process.env.PACK_ONLY ? new Set(process.env.PACK_ONLY.split(",").map((s) => s.trim())) : null;

if (sets.length === 0) {
  console.warn("No texture sets in assets-src/textures/. Download sources first.");
} else {
  for (const name of sets) {
    if (skip.has(name) || (only && !only.has(name))) {
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
