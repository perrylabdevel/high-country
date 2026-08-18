/**
 * Dev overlay: flat colour fills keyed to the kit's `tag()` roles, plus an
 * x-ray pass that draws those fills through everything in front of them.
 *
 * This exists because the expensive bugs in this project have been spatial
 * relationships between parts, not bad pixels: a boardwalk mirrored 17.2 deg
 * off its row, a deck riding over the door sills it serves, props floating a
 * few centimetres off their footing. Lit screenshots hide those — everything
 * is the same brown, and the defect is behind a wall. A flat fill per role
 * with depth testing off makes the relationship the subject of the frame.
 *
 * Roles come from `tag()` in buildings/kit.js. ROLE_COLORS must cover every
 * role the source tags, so a newly tagged part cannot render as anonymous
 * grey — scripts/check-debug.mjs enforces that.
 *
 * Cycle with X in ?dev, or drive it from a capture script:
 *   window.__xray(0)  off
 *   window.__xray(1)  flat colour fills
 *   window.__xray(2)  x-ray — fills draw through occluders
 */
import * as THREE from "three/webgpu";

export const MODES = ["off", "roles", "xray"];

/**
 * One colour per tagged role. Chosen so neighbouring parts of the same
 * building never share a hue: wall/roof/foundation are the three that most
 * often need telling apart at a glance.
 */
export const ROLE_COLORS = {
  wall: 0x4f8fd0,
  roof: 0xd0503f,
  foundation: 0x8a6b3a,
  floor: 0x7a5fa8,
  ceiling: 0x46466a,
  door: 0xffd24a,
  window: 0x7fe6ff,
  sill: 0xb06fd0,
  lintel: 0xc07fd8,
  header: 0xa05fc0,
  falseFront: 0xff8a3d,
  parapet: 0xd0a04f,
  boardwalk: 0x3ec98a,
  steeple: 0xe05aa0,
  porch: 0x9ad04f,
  chimney: 0xa0563a,
  steps: 0xc8c8c8,
  vigas: 0x8a5a2a,
  anvil: 0x9090a0
};

/** Everything the kit never tagged, so the tagged parts stay legible. */
const UNTAGGED = 0x2a2a30;

const cache = new Map();
const materials = new Map();

function fillFor(color, xray) {
  const key = `${color}:${xray ? 1 : 0}`;
  let mat = materials.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicNodeMaterial({ color });
    // Flat and unfogged: the colour has to mean the role, not the distance.
    mat.fog = false;
    if (xray) {
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthTest = false;
      mat.depthWrite = false;
    }
    materials.set(key, mat);
  }
  return mat;
}

function roleOf(obj) {
  let node = obj;
  while (node) {
    const role = node.userData?.role;
    if (role && ROLE_COLORS[role] !== undefined) {
      return role;
    }
    node = node.parent;
  }
  return null;
}

/**
 * Swap every mesh under `root` for a flat fill, remembering what it had.
 * Returns the roles actually found, with counts, for the legend.
 */
function apply(root, xray) {
  const counts = new Map();
  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }
    if (!cache.has(obj)) {
      cache.set(obj, obj.material);
    }
    const role = roleOf(obj);
    const color = role === null ? UNTAGGED : ROLE_COLORS[role];
    obj.material = fillFor(color, xray);
    if (role !== null) {
      counts.set(role, (counts.get(role) || 0) + 1);
    }
  });
  return counts;
}

function restore() {
  for (const [obj, mat] of cache) {
    obj.material = mat;
  }
  cache.clear();
}

function legendMarkup(counts) {
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => {
      const hex = `#${ROLE_COLORS[role].toString(16).padStart(6, "0")}`;
      return `<div style="display:flex;align-items:center;gap:6px">
        <span style="width:11px;height:11px;background:${hex};border:1px solid #0008;flex:none"></span>
        <span>${role}</span><span style="opacity:.55">${n}</span>
      </div>`;
    })
    .join("");
  return rows || '<div style="opacity:.6">no tagged roles in scene</div>';
}

/**
 * @param {THREE.Object3D} root scene root to recolour
 * @returns {{ setMode: (n: number) => void, cycle: () => number, mode: () => number, dispose: () => void }}
 */
export function createXray(root) {
  let mode = 0;

  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:30;display:none;pointer-events:none;" +
    "font:11px/1.5 monospace;color:#e8e8ea;background:#0b0b0ecc;border:1px solid #ffffff22;" +
    "border-radius:4px;padding:7px 9px;min-width:104px";
  document.body.appendChild(panel);

  function setMode(next) {
    mode = ((next % MODES.length) + MODES.length) % MODES.length;
    restore();
    if (mode === 0) {
      panel.style.display = "none";
      return mode;
    }
    const counts = apply(root, mode === 2);
    panel.innerHTML =
      `<div style="margin-bottom:5px;letter-spacing:.06em;opacity:.75">XRAY · ${MODES[mode].toUpperCase()}</div>` +
      legendMarkup(counts) +
      `<div style="margin-top:5px;opacity:.45">X to cycle</div>`;
    panel.style.display = "block";
    return mode;
  }

  function cycle() {
    return setMode(mode + 1);
  }

  function onKey(event) {
    if (event.code !== "KeyX" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
      return;
    }
    cycle();
  }
  window.addEventListener("keydown", onKey);

  return {
    setMode,
    cycle,
    mode: () => mode,
    dispose() {
      window.removeEventListener("keydown", onKey);
      restore();
      panel.remove();
    }
  };
}
