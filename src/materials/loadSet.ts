/**
 * Targets three@0.185.1.
 * Loads a TEXTURE_SETS entry (albedo sRGB, normal + ORM linear).
 */
import type { Texture } from "three/webgpu";
import { TEXTURE_SETS, type TextureSetName } from "./textureManifest.ts";
import { tryLoadTexture } from "./loadTexture.ts";

export type LoadedSet = {
  /** Which TEXTURE_SETS entry this is; materials carry it in userData so the invariant checks can tell a wall texture from a floor texture. */
  name: TextureSetName;
  albedo: Texture;
  normal: Texture | null;
  orm: Texture | null;
};

export type TerrainMaps = Record<"grass" | "dirt" | "rock" | "gravel", LoadedSet>;

/**
 * One load per set, shared by every caller.
 *
 * `rock` belongs to BOTH the terrain set (grass/dirt/rock/gravel) and the
 * building set (adobe/wood/siding/roof/rock), and the two loaders run at
 * different points in boot — terrain before the statics, buildings after — so
 * the browser cache did not collapse them either (the preview server sends
 * Cache-Control: no-cache). Measured at boot: rock_2k_albedo, rock_2k_normal,
 * rock_2k_orm and gravel_2k_albedo were each fetched TWICE, 68.7 MB of
 * duplicated requests, and every duplicate paid a second KTX2 transcode and a
 * second GPU upload on the main thread.
 *
 * Caching the PROMISE (not the result) also collapses concurrent callers:
 * MaterialLab asks for grass/dirt/rock/gravel and loadTerrainMaps() in one
 * Promise.all, which would otherwise load each of those sets twice over.
 *
 * Consequence to respect: callers now share one THREE.Texture per map. Nothing
 * may mutate a returned texture's state — colour space, wrapping and anisotropy
 * are set centrally in loadTexture.ts before it is handed out. (loadVegetationMaps
 * does mutate wrapping, but only on foliage atlases it loads directly through
 * tryLoadTexture, never through this cache.)
 *
 * A failed load resolves null and is NOT cached, so a transient failure can be
 * retried rather than poisoning the set for the session.
 */
const SET_CACHE = new Map<TextureSetName, Promise<LoadedSet | null>>();

export function loadTextureSet(name: TextureSetName): Promise<LoadedSet | null> {
  const cached = SET_CACHE.get(name);
  if (cached) {
    return cached;
  }
  const pending = loadTextureSetUncached(name).then((set) => {
    if (!set) {
      SET_CACHE.delete(name);
    }
    return set;
  }, (err) => {
    SET_CACHE.delete(name);
    throw err;
  });
  SET_CACHE.set(name, pending);
  return pending;
}

async function loadTextureSetUncached(name: TextureSetName): Promise<LoadedSet | null> {
  const spec = TEXTURE_SETS[name];
  const albedo = await tryLoadTexture(spec.albedo, "albedo");
  if (!albedo) {
    return null;
  }
  const [normal, orm] = await Promise.all([
    tryLoadTexture(spec.normal, "linear"),
    tryLoadTexture(spec.orm, "linear")
  ]);
  return { name, albedo, normal, orm };
}

export async function loadTerrainMaps(): Promise<TerrainMaps | null> {
  const [grass, dirt, rock, gravel] = await Promise.all([
    loadTextureSet("grass"),
    loadTextureSet("dirt"),
    loadTextureSet("rock"),
    loadTextureSet("gravel")
  ]);
  if (!grass || !dirt || !rock || !gravel) {
    return null;
  }
  return { grass, dirt, rock, gravel };
}
