/**
 * Bake the terrain splat map offline and ship it as a compressed binary.
 *
 *   node scripts/bake-splat.mjs
 *
 * WHY THIS EXISTS
 *
 * bakeSplatMap walks 2048 x 2560 = 5.24 M pixels, calling biomeAt, creekFactor,
 * lakeFactor, lakeWaterSignedDistance and a road polyline search at every one.
 * Measured standalone: ~17.8 s. The boot CPU profile attributed the largest
 * block of main-thread time to it and its callees, and it ran on EVERY boot for
 * EVERY player — recomputing a pure function of the authored world that never
 * changes between runs.
 *
 * The raw RGBA is 20.00 MB, but it is mostly large flat biome regions (98.6% of
 * pixels carry a zero road channel), so it gzips to ~1.5 MB. That is a smaller
 * download than a single terrain normal map, in exchange for deleting ~17.8 s
 * of startup CPU.
 *
 * Gzip rather than brotli: the browser decompresses via DecompressionStream,
 * which supports "gzip" and "deflate" but not brotli. Vite serves public/ files
 * as-is with no compression middleware, so the compression has to be in the
 * file itself.
 *
 * AFTER RUNNING THIS you must republish the asset bundle, or a fresh clone will
 * not get the file:
 *   npm run assets:bundle
 *   upload the tarball to the `textures` release tag
 *   commit assets/manifest.json
 * See the asset-bundle skill. check:assets asserts the "/textures/..." literal
 * in src/ has a manifest entry, so it will fail loudly if this is skipped.
 */
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") return {};
    const canvas = {
      width: 256, height: 256,
      getContext() {
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        const imageData = (w, h) => {
          const width = typeof w === "number" ? w : canvas.width;
          const height = typeof h === "number" ? h : canvas.height;
          return { width, height, data: new Uint8ClampedArray(width * height * 4) };
        };
        return new Proxy({}, {
          get: (_t, p) => (p === "createImageData" || p === "getImageData") ? imageData : noop
        });
      }
    };
    return canvas;
  }
};

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const { bakeHeightfield } = await import("../src/heightfield.js");
const { bakeSplatMap, SPLAT_W, SPLAT_H } = await import("../src/materials/splatMap.ts");
const { SPLAT_ASSET_VERSION } = await import("../src/materials/splatAsset.ts");

console.log("baking heightfield…");
let t = Date.now();
bakeHeightfield();
console.log(`  heightfield ${Date.now() - t} ms`);

console.log(`baking splat ${SPLAT_W} x ${SPLAT_H}…`);
t = Date.now();
const tex = bakeSplatMap();
const bakeMs = Date.now() - t;
const raw = Buffer.from(tex.image.data.buffer, tex.image.data.byteOffset, tex.image.data.byteLength);
console.log(`  splat ${bakeMs} ms, ${(raw.length / 1048576).toFixed(2)} MB raw`);

// Determinism gate: a second bake must be byte-identical, or this file would
// drift between machines and the bundle hash would churn for no reason.
t = Date.now();
const again = bakeSplatMap();
const raw2 = Buffer.from(again.image.data.buffer, again.image.data.byteOffset, again.image.data.byteLength);
if (!raw.equals(raw2)) {
  throw new Error(
    "bake is not deterministic — two runs produced different bytes. " +
    "Something in the splat path has unseeded randomness; fix that rather than shipping the drift."
  );
}
console.log(`  determinism check passed (second bake ${Date.now() - t} ms, identical bytes)`);

const gz = zlib.gzipSync(raw, { level: 9 });
const dest = join(ROOT, "public", "textures", `splat_${SPLAT_ASSET_VERSION}.bin.gz`);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, gz);

console.log("");
console.log(`wrote ${dest}`);
console.log(`  ${(gz.length / 1048576).toFixed(2)} MB gzipped (${(gz.length / raw.length * 100).toFixed(1)}% of raw)`);
console.log(`  replaces ~${(bakeMs / 1000).toFixed(1)} s of per-boot CPU with a ${(gz.length / 1048576).toFixed(2)} MB fetch`);
console.log("");
console.log("NEXT: npm run assets:bundle, upload to the `textures` release, commit assets/manifest.json");
