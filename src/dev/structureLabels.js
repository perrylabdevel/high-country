/**
 * ?dev HTML nameplates for kit structures and openings. Lives under #hud so
 * __captureMode hides them with the rest of the HUD.
 */
import * as THREE from "three/webgpu";
import { anchorsOf, worldAnchor } from "../buildings/anchors.js";
import {
  LOOK_MAX_DIST,
  LOOK_OPENING_DIST,
  lookingAtStructure,
  openingKind
} from "../buildings/lookingAt.js";

const ndc = new THREE.Vector3();
const lookDir = new THREE.Vector3();

function structureName(item) {
  return item.userData?.name || item.name || "structure";
}

function collectOpenings(structures) {
  const out = [];
  for (const s of structures) {
    s.traverse((node) => {
      if (node.userData?.role !== "wall") {
        return;
      }
      const list = node.userData.openings || [];
      list.forEach((o, i) => {
        if (!anchorsOf(node).get(`opening.${i}`)) {
          return;
        }
        const world = worldAnchor(node, `opening.${i}`);
        const kind = openingKind(o);
        out.push({
          key: `${s.uuid}:${node.uuid}:${i}`,
          name: `${s.userData.name} ${kind}`,
          kind,
          x: world.position.x,
          y: world.position.y,
          z: world.position.z,
          w: o.w || 1,
          d: 0.4,
          eave: 0
        });
      });
    });
  }
  return out;
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

  function chipFor(key, className) {
    let el = chips.get(key);
    if (el) {
      return el;
    }
    el = document.createElement("div");
    el.className = className;
    layer.appendChild(el);
    chips.set(key, el);
    return el;
  }

  function place(el, x, y, z, camera, w, h) {
    ndc.set(x, y, z).project(camera);
    const inFront = ndc.z > -1 && ndc.z < 1 && ndc.x > -1.15 && ndc.x < 1.15 && ndc.y > -1.15 && ndc.y < 1.15;
    if (!inFront) {
      el.classList.add("hidden");
      return false;
    }
    el.classList.remove("hidden");
    el.style.left = `${(ndc.x * 0.5 + 0.5) * w}px`;
    el.style.top = `${(-ndc.y * 0.5 + 0.5) * h}px`;
    return true;
  }

  function update(camera, structures, aimed) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = camera.position;
    const aimedItem = aimed || null;
    const openings = collectOpenings(structures);
    const aimedOpen = lookingAtStructure(openings, cam, camera.getWorldDirection(lookDir), LOOK_OPENING_DIST);

    for (const item of structures) {
      const el = chipFor(item.uuid || item, "structure-label hidden");
      const u = item.userData;
      const dist = Math.hypot(u.x - cam.x, u.z - cam.z);
      if (dist > LOOK_MAX_DIST) {
        el.classList.add("hidden");
        continue;
      }
      el.textContent = structureName(item);
      el.classList.toggle("aim", item === aimedItem && !aimedOpen);
      place(el, u.x, (u.placementY || 0) + (u.eave || 0), u.z, camera, w, h);
    }

    const seen = new Set();
    for (const o of openings) {
      seen.add(o.key);
      const el = chipFor(o.key, "structure-label opening-label hidden");
      const dist = Math.hypot(o.x - cam.x, o.z - cam.z);
      if (dist > LOOK_OPENING_DIST) {
        el.classList.add("hidden");
        continue;
      }
      el.textContent = o.kind;
      el.classList.toggle("aim", o === aimedOpen);
      place(el, o.x, o.y + 0.15, o.z, camera, w, h);
    }
    for (const [key, el] of chips) {
      if (typeof key === "string" && key.includes(":") && !seen.has(key)) {
        el.classList.add("hidden");
      }
    }

    const label = aimedOpen?.name || (aimedItem ? structureName(aimedItem) : "");
    if (label) {
      aimEl.textContent = label;
      aimEl.classList.remove("hidden");
    } else {
      aimEl.classList.add("hidden");
    }
  }

  return { update };
}
