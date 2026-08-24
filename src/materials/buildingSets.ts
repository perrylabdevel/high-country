/**
 * Building-surface texture sets (adobe, wood, roof). Loaded before the
 * statics are built so createLandmarks can bind real maps; every builder also
 * works without them (flat fallback colours), which keeps the headless
 * geometry checks deterministic.
 */
import { loadTextureSet, type LoadedSet } from "./loadSet.ts";

export type BuildingMaps = {
  adobe: LoadedSet;
  wood: LoadedSet;
  roof: LoadedSet;
  rock: LoadedSet;
};

export async function loadBuildingMaps(): Promise<BuildingMaps | null> {
  const [adobe, wood, roof, rock] = await Promise.all([
    loadTextureSet("adobe"),
    loadTextureSet("wood"),
    loadTextureSet("roof"),
    loadTextureSet("rock")
  ]);
  if (!adobe || !wood || !roof || !rock) {
    return null;
  }
  return { adobe, wood, roof, rock };
}
