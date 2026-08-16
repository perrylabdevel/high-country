/**
 * ?dev HTML nameplates for kit structures. Lives under #hud so __captureMode
 * hides them with the rest of the HUD.
 */
import * as THREE from "three/webgpu";
import { LOOK_MAX_DIST } from "../buildings/lookingAt.js";

const ndc = new THREE.Vector3();

function structureName(item) {
  return item.userData?.name || item.name || "structure";
}

export function createStructureLabels() {
  const hud = document.getElementById("hud");
  if (!hud) {
    return { update() {} };
  }

  const layer = document.createElement("div");
  layer.id = "structure-labels";
  hud.appendChild(layer);

  const aimEl = document.createElement("div");
  aimEl.id = "look-name";
  aimEl.className = "hidden";
  hud.appendChild(aimEl);

  const chips = new Map();

  function chipFor(item) {
    let el = chips.get(item);
    if (el) {
      return el;
    }
    el = document.createElement("div");
    el.className = "structure-label hidden";
    el.textContent = structureName(item);
    layer.appendChild(el);
    chips.set(item, el);
    return el;
  }

  function update(camera, structures, aimed) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = camera.position;
    const aimedItem = aimed || null;

    for (const item of structures) {
      const el = chipFor(item);
      const u = item.userData;
      const dx = u.x - cam.x;
      const dz = u.z - cam.z;
      const dist = Math.hypot(dx, dz);
      if (dist > LOOK_MAX_DIST) {
        el.classList.add("hidden");
        continue;
      }
      ndc.set(u.x, (u.placementY || 0) + (u.eave || 0), u.z).project(camera);
      const inFront = ndc.z > -1 && ndc.z < 1 && ndc.x > -1.15 && ndc.x < 1.15 && ndc.y > -1.15 && ndc.y < 1.15;
      if (!inFront) {
        el.classList.add("hidden");
        continue;
      }
      el.classList.remove("hidden");
      el.classList.toggle("aim", item === aimedItem);
      el.style.left = `${(ndc.x * 0.5 + 0.5) * w}px`;
      el.style.top = `${(-ndc.y * 0.5 + 0.5) * h}px`;
    }

    if (aimedItem) {
      aimEl.textContent = structureName(aimedItem);
      aimEl.classList.remove("hidden");
    } else {
      aimEl.classList.add("hidden");
    }
  }

  return { update };
}
