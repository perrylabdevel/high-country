/**
 * Dev-only biome isolation: switch a biome's CONTENT off while working on
 * another, so a frame or a screenshot is not paying for (or cluttered by)
 * country nobody is looking at.
 *
 * A biome is a region of the map (map.js biomeAtWithLake), not a module, so
 * "off" means every consumer that places things by biome skips that region:
 * trees, ground cover, shrubs, rocks and the merged structures. Terrain,
 * water, colliders, nav and missions are untouched — hidden buildings still
 * block the player, and this is not evidence against a shipping baseline.
 *
 * Everything defaults on. Only a ?dev build calls loadBiomeFilter(), so a
 * shipping build can never boot with a biome missing.
 */

export const BIOMES = [
  "town",
  "ranch",
  "lake",
  "burn",
  "pines",
  "valley",
  "foothills",
  "range",
  "tribal",
  "iron",
  "badlands"
];

const STORAGE = "hc-biomes-off";
const off = new Set();
const listeners = new Set();

export function biomeOn(biome) {
  return off.size === 0 || !off.has(biome);
}

/** True when any biome is off, so hot paths can skip the lookup entirely. */
export function biomeFilterActive() {
  return off.size > 0;
}

export function biomesOff() {
  return [...off];
}

/** Restore the last dev session's selection. */
export function loadBiomeFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "[]");
    for (const name of saved) {
      if (BIOMES.includes(name)) {
        off.add(name);
      }
    }
  } catch {
    // No storage (private window, headless): everything stays on.
  }
}

/** Replace the off set. Listeners run once per actual change. */
export function setBiomesOff(names) {
  const next = new Set((names || []).filter((n) => BIOMES.includes(n)));
  if (next.size === off.size && [...next].every((n) => off.has(n))) {
    return;
  }
  off.clear();
  next.forEach((n) => off.add(n));
  try {
    localStorage.setItem(STORAGE, JSON.stringify([...off]));
  } catch {
    // Not persisted; the toggle still applies to this session.
  }
  listeners.forEach((fn) => fn());
}

export function setBiomeOn(biome, on) {
  const next = new Set(off);
  if (on) {
    next.delete(biome);
  } else {
    next.add(biome);
  }
  setBiomesOff([...next]);
}

export function onBiomeFilterChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
