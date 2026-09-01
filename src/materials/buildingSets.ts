/**
 * Building-surface texture sets (adobe, wood, siding, roof, rock). Loaded before the
 * statics are built so createLandmarks can bind real maps; every builder also
 * works without them (flat fallback colours), which keeps the headless
 * geometry checks deterministic.
 */
import { loadTextureSet, type LoadedSet } from "./loadSet.ts";

export type BuildingMaps = {
  adobe: LoadedSet;
  /** Laid boarding: floors, decks, interior planking. */
  wood: LoadedSet;
  /** Exterior wall cladding. A different texture from `wood` on purpose. */
  siding: LoadedSet;
  roof: LoadedSet;
  rock: LoadedSet;
};

export async function loadBuildingMaps(): Promise<BuildingMaps | null> {
  const [adobe, wood, siding, roof, rock] = await Promise.all([
    loadTextureSet("adobe"),
    loadTextureSet("wood"),
    loadTextureSet("siding"),
    loadTextureSet("roof"),
    loadTextureSet("rock")
  ]);
  if (!adobe || !wood || !siding || !roof || !rock) {
    return null;
  }
  return { adobe, wood, siding, roof, rock };
}
