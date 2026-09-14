import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { TOWER_OFFSET } from "./landmarks.js";
import { addPropSpot, clearPropSpots } from "./propSpots.js";

/**
 * Timber camp charcoal pits, the fire lookout's yard and the Burn's wreckage.
 * Every piece is an authored model (props.js) recorded here as a spot; this
 * builder keeps the colliders the old primitive pieces owned.
 */
export function createPines(scene) {
  const group = new THREE.Group();
  clearPropSpots("pines");

  const camp = POS.timberCamp;
  const tower = POS.fireWatch;
  const burn = POS.burn;

  const pitPositions = [
    { x: camp.x - 8, z: camp.z - 14, yaw: 0.4 },
    { x: camp.x + 10, z: camp.z + 8, yaw: 2.1 },
    { x: camp.x - 16, z: camp.z + 22, yaw: 4.0 }
  ];
  for (const pit of pitPositions) {
    addPropSpot("pines", { kind: "charcoal_pit", x: pit.x, z: pit.z, yaw: pit.yaw, cluster: "timberCamp" });
  }

  // The camp's stumps, sawbuck, log decks and tent are props now
  // (props.js TIMBER_CAMP), placed clear of the three roads that meet here.

  // The lookout's own ladder is part of the tower model.
  const crate = { x: tower.x + TOWER_OFFSET.dx + 3.4, z: tower.z + TOWER_OFFSET.dz - 2.0 };
  addPropSpot("pines", { kind: "crate", x: crate.x, z: crate.z, yaw: 0.2, collide: true, cluster: "fireWatch" });

  const wagon = { x: burn.x + 28, z: burn.z - 16 };
  addPropSpot("pines", { kind: "wagon_broken", x: wagon.x, z: wagon.z, yaw: 0.35, collide: true, cluster: "burn" });
  const chimney = { x: burn.x - 22, z: burn.z + 10 };
  addPropSpot("pines", { kind: "chimney_ruin", x: chimney.x, z: chimney.z, yaw: 0.25, collide: true, cluster: "burn" });

  const trunks = [
    [burn.x + 8, burn.z + 22, 4.8, 0.4],
    [burn.x - 8, burn.z - 24, 5.4, 1.15],
    [burn.x + 32, burn.z + 6, 4.2, -0.55],
    [burn.x - 30, burn.z + 1, 5.1, 2.05],
    [burn.x + 4, burn.z + 28, 4.6, 0.85],
    [burn.x - 14, burn.z + 24, 3.9, -1.3]
  ];
  for (const [x, z, len, yaw] of trunks) {
    addPropSpot("pines", { kind: "log_charred", x, z, yaw, sx: len / 5, cluster: "burn" });
  }

  scene.add(group);
  return {
    group,
    charcoalPits: pitPositions.length,
    crates: 1,
    wagons: 1,
    chimneys: 1,
    fallenTrunks: trunks.length,
    pitPositions: pitPositions.map(({ x, z }) => ({ x, z })),
    wagonPosition: wagon
  };
}
