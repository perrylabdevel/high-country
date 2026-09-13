/**
 * The always-visible biome toggles (?dev only). One chip per biome along the
 * bottom of the HUD: click to switch a biome's content off or on, shift-click
 * to solo it, "All" to restore everything. The chip for the biome the player
 * is standing in is underlined, so it is obvious what you are about to hide.
 *
 * Selection persists across reloads (biomeFilter.js), so a working session
 * on one biome boots straight back into it — the bar is the reminder that
 * something is off.
 */
import {
  BIOMES,
  biomeOn,
  biomesOff,
  setBiomeOn,
  setBiomesOff,
  onBiomeFilterChange
} from "../biomeFilter.js";

export function createBiomeBar({ currentBiome } = {}) {
  const root = document.createElement("div");
  root.id = "biome-bar";
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", "Biome toggles");
  root.title = "Click: toggle · Shift-click: solo";

  const chips = new Map();
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "All";
  all.addEventListener("click", () => setBiomesOff([]));
  root.appendChild(all);

  for (const biome of BIOMES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = biome;
    btn.addEventListener("click", (event) => {
      if (event.shiftKey) {
        setBiomesOff(BIOMES.filter((b) => b !== biome));
      } else {
        setBiomeOn(biome, !biomeOn(biome));
      }
    });
    chips.set(biome, btn);
    root.appendChild(btn);
  }

  // Never take focus: a focused button re-fires on Space, which is jump.
  root.addEventListener("mousedown", (event) => event.preventDefault());
  document.getElementById("hud").appendChild(root);

  let here = null;
  function paint() {
    const anyOff = biomesOff().length > 0;
    root.classList.toggle("filtered", anyOff);
    all.classList.toggle("active", !anyOff);
    for (const [biome, btn] of chips) {
      btn.classList.toggle("off", !biomeOn(biome));
      btn.classList.toggle("here", biome === here);
    }
  }
  onBiomeFilterChange(paint);
  paint();

  if (currentBiome) {
    setInterval(() => {
      const next = currentBiome();
      if (next !== here) {
        here = next;
        paint();
      }
    }, 500);
  }

  return { element: root, paint };
}
