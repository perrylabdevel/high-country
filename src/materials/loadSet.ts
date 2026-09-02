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

export async function loadTextureSet(name: TextureSetName): Promise<LoadedSet | null> {
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
