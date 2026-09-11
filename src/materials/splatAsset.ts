/**
 * Targets three@0.185.1.
 *
 * Three ways to get the terrain splat, fastest first:
 *
 *   1. the prebaked file shipped with the textures  (~1.5 MB fetch + decompress)
 *   2. this browser's IndexedDB cache               (no network)
 *   3. bake it here and now                         (~17.8 s of main thread)
 *
 * Tier 3 is what shipped before, on every boot, for every player: bakeSplatMap
 * walks 5.24 M pixels calling biomeAt / creekFactor / lakeFactor /
 * lakeWaterSignedDistance and a road polyline search at each one. It is a pure
 * function of the authored world, so paying it per boot bought nothing.
 *
 * Tier 1 covers everyone on a normal run. Tier 2 covers the gap while someone
 * is editing map.js locally and the shipped file is stale or absent — it makes
 * only the FIRST boot after such an edit slow. Tier 3 is the guarantee that a
 * missing file or a blocked store costs speed and never correctness.
 */
import * as THREE from "three/webgpu";
import { bakeSplatMap, SPLAT_W, SPLAT_H } from "./splatMap.ts";
import { readSplatCache, writeSplatCache, SPLAT_CACHE_VERSION } from "./splatCache.ts";

/**
 * Bump together with SPLAT_CACHE_VERSION whenever anything the bake reads
 * changes — map polylines, biome rectangles, the lake ellipse, the splat
 * weights, or the heightfield. The version is in the FILENAME so a stale
 * prebake 404s rather than silently pinning the terrain to the old world,
 * which is a genuinely confusing failure: the ground disagrees with the
 * geometry and nothing errors.
 */
export const SPLAT_ASSET_VERSION = "v1";

/**
 * The literal below is what scripts/check-assets.mjs scans for. It must stay a
 * plain double-quoted texture path, and the file must have a manifest entry, or
 * a fresh clone silently falls back to baking at boot.
 *
 * Do not write an example texture path in a comment here: the check scans for
 * the quoted pattern anywhere in src/, so a comment containing one is reported
 * as an unlisted asset. (It flagged this file for exactly that reason.)
 */
const SPLAT_URL = "/textures/splat_v1.bin.gz";

function textureFrom(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  // These settings must match bakeSplatMap's exactly — the material samples
  // this texture in worldToMap UV and packs a signed lateral offset into B,
  // so any filtering or flip change corrupts the road wheel-track decode.
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

async function fetchPrebaked(): Promise<Uint8Array | null> {
  if (typeof fetch === "undefined") {
    return null;
  }
  try {
    const res = await fetch(SPLAT_URL);
    if (!res.ok) {
      return null;
    }
    // Who decompresses depends on the host, so decide from the BYTES, not from
    // headers or hope. Vite's preview server infers Content-Encoding: gzip from
    // the .gz extension, so the browser has already inflated the body by the
    // time we see it — piping that through DecompressionStream throws
    // "Failed to fetch" (measured: 20,971,520 bytes arriving with first bytes
    // 00 b0 5a 00, not the 1f 8b gzip magic). A plain static host that serves
    // it as application/octet-stream with no encoding header hands over the
    // gzip bytes instead. Sniff the magic and only inflate when it is there.
    let buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") {
        return null;
      }
      const stream = new Response(buf).body!.pipeThrough(new DecompressionStream("gzip"));
      buf = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    // A truncated or wrong-version file must not become a corrupt terrain.
    if (buf.length !== SPLAT_W * SPLAT_H * 4) {
      console.warn(
        `[splat] ${SPLAT_URL} decompressed to ${buf.length} bytes, expected ` +
        `${SPLAT_W * SPLAT_H * 4} — ignoring it and baking instead`
      );
      return null;
    }
    return buf;
  } catch (err) {
    console.warn("[splat] prebaked fetch failed, falling back:", err);
    return null;
  }
}

/**
 * The splat texture, by whichever route is available. Never throws: the last
 * resort is the bake that always worked.
 */
export async function loadSplatMap(): Promise<THREE.DataTexture> {
  const prebaked = await fetchPrebaked();
  if (prebaked) {
    return textureFrom(prebaked, SPLAT_W, SPLAT_H);
  }

  const key = `${SPLAT_CACHE_VERSION}-${SPLAT_W}x${SPLAT_H}`;
  const cached = await readSplatCache(key, SPLAT_W, SPLAT_H);
  if (cached) {
    return textureFrom(cached.data, cached.width, cached.height);
  }

  const tex = bakeSplatMap();
  const data = tex.image.data as Uint8Array;
  // Fire-and-forget: a slow or refused write must not hold up the first frame.
  void writeSplatCache(key, data, SPLAT_W, SPLAT_H);
  return tex;
}
