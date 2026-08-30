/**
 * Territory layout from the overhead map. 1 mile = 500 world units.
 *
 * AXES — the standard Three.js / glTF right-handed frame. Do not change these:
 *   +X = east      +Y = up      -Z = north  (so +Z is south)
 *
 * Map space is (u, v) with u east-ward and v north-ward, matching the overhead art.
 * Because v is north and north is -Z, mapToWorld negates v. Making north +Z instead
 * seems harmless but silently mirrors the whole territory: in a right-handed Y-up
 * world the direction on your screen-right is (look × up), so looking along +Z puts
 * +X on your LEFT. The world then renders as a mirror of the chart, the minimap
 * needle appears to swing opposite the camera, and no amount of tuning the needle
 * can reconcile it. scripts/check-handedness.mjs locks this down.
 */

export const WORLD = {
  width: 4000,
  depth: 5000,
  segmentsX: 320,
  segmentsZ: 400
};

export const WATER = 13;

export function mapToWorld(u, v) {
  return {
    x: (u - 0.5) * WORLD.width,
    z: (0.5 - v) * WORLD.depth
  };
}

export function worldToMap(x, z) {
  return {
    u: x / WORLD.width + 0.5,
    v: 0.5 - z / WORLD.depth
  };
}

/**
 * The one definition of what a yaw means on the ground: 0 = north, π/2 = east.
 * Everything that turns a heading into motion goes through this.
 */
export function headingVector(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

/**
 * Compass heading -> Object3D.rotation.y, for meshes whose long axis is local +Z.
 */
export function headingRotationY(yaw) {
  return Math.PI - yaw;
}

export function overlayPoint(x, z) {
  const { u, v } = worldToMap(x, z);
  return {
    left: Math.max(0, Math.min(1, u)),
    top: Math.max(0, Math.min(1, 1 - v))
  };
}

export function clampWorld(x, z) {
  const mx = WORLD.width / 2 - 24;
  const mz = WORLD.depth / 2 - 24;
  return {
    x: Math.max(-mx, Math.min(mx, x)),
    z: Math.max(-mz, Math.min(mz, z))
  };
}

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const PLACE_DEFS = {
  ranch: { u: 0.4, v: 0.44, name: "High Country Ranch", radius: 140 },
  silverCreek: { u: 0.56, v: 0.54, name: "Silver Creek", radius: 110 },
  lakeMercy: { u: 0.52, v: 0.66, name: "Lake Mercy", radius: 220 },
  northernPines: { u: 0.32, v: 0.86, name: "Northern Pines", radius: 180 },
  burn: { u: 0.46, v: 0.86, name: "Ashes on the Divide", radius: 140 },
  timberCamp: { u: 0.3, v: 0.82, name: "Timber camps", radius: 70 },
  fireWatch: { u: 0.36, v: 0.92, name: "Fire-watch tower", radius: 50 },
  westernRange: { u: 0.14, v: 0.5, name: "Western Range", radius: 160 },
  barrett: { u: 0.18, v: 0.48, name: "Barrett Ranch", radius: 70 },
  fortGrant: { u: 0.1, v: 0.38, name: "Abandoned Fort Grant", radius: 70 },
  sheepCamp: { u: 0.12, v: 0.58, name: "Sheep camp", radius: 50 },
  ironValley: { u: 0.84, v: 0.58, name: "Iron Valley", radius: 160 },
  mines: { u: 0.86, v: 0.64, name: "Silver Strike Mines", radius: 70 },
  stampMill: { u: 0.82, v: 0.52, name: "Stamp mill", radius: 55 },
  company: { u: 0.8, v: 0.6, name: "Company offices", radius: 50 },
  foothills: { u: 0.66, v: 0.36, name: "Foothills", radius: 140 },
  tribal: { u: 0.64, v: 0.22, name: "Tribal Lands", radius: 110 },
  badlands: { u: 0.42, v: 0.1, name: "Southern Badlands", radius: 180 },
  mission: { u: 0.5, v: 0.12, name: "La Esperanza Mission", radius: 55 },
  vipers: { u: 0.22, v: 0.08, name: "Viper's Roost", radius: 55 },
  hideout: { u: 0.34, v: 0.06, name: "Hidden Canyon", radius: 50 },
  elPaso: { u: 0.84, v: 0.06, name: "El Paso Verde", radius: 70 },
  cemetery: { u: 0.43, v: 0.41, name: "Family cemetery", radius: 40 },
  huntingCabin: { u: 0.38, v: 0.58, name: "Hunting cabin", radius: 40 },
  overlook: { u: 0.46, v: 0.58, name: "Ranch overlook", radius: 45 },
  ranchGate: { u: 0.36, v: 0.44, name: "Ranch gate", radius: 35 }
};

export const POS = {};
for (const [id, def] of Object.entries(PLACE_DEFS)) {
  const w = mapToWorld(def.u, def.v);
  POS[id] = { id, ...def, x: w.x, z: w.z };
}

export const ROAD_LIFT = 0.08;

export const ROADS = [
  {
    name: "stage",
    kind: "stage",
    width: 9,
    pts: [
      [0.02, 0.34],
      [0.06, 0.36],
      [0.1, 0.38],
      [0.14, 0.43],
      // The corner bends short of Barrett's house standing at the POI centre
      // (0.18,0.48): the last edge into it crossed the house footprint and the
      // impassable drop severed the whole western stage line from the network.
      [0.1785, 0.4816],
      [0.22, 0.5],
      [0.3, 0.46],
      [0.36, 0.44],
      [0.4, 0.44]
    ]
  },
  {
    // The final leg hooks through the gap west of town and lands on the cross
    // street's south end — the direct line into the town centre rides straight
    // through the storefront blocks (the hotel at (225,-192): an edge priced
    // impassable under BLOCK_DROP, severing the whole western map from town).
    name: "ranchTown",
    kind: "road",
    width: 6.5,
    pts: [
      [0.4, 0.44],
      [0.48, 0.49],
      [0.5375, 0.548],
      [0.54756, 0.54919]
    ]
  },
  {
    name: "ranchSouth",
    kind: "road",
    width: 6,
    pts: [
      [0.4, 0.44],
      [0.4, 0.32],
      [0.44, 0.22],
      [0.5, 0.12]
    ]
  },
  {
    // Leaves town on the cross street's south end (the town's roads sit inside
    // the storefront rows; the centre itself is walled in by facades), then
    // runs south-west over the open ground to the lake's west arm.
    name: "silverNorth",
    kind: "road",
    width: 6,
    pts: [
      [0.54756, 0.54919],
      [0.525, 0.58],
      [0.5, 0.64],
      [0.44, 0.76],
      [0.46, 0.86],
      [0.38, 0.88],
      [0.32, 0.86],
      [0.3, 0.82]
    ]
  },
  {
    // The street itself, painted along the storefront axis (STREETS yaw 0.15
    // in landmarks.js) instead of the old N-S diagonal that ran through the
    // hotel: from the cross-street junction west of the storefront row,
    // through the town centre, out the east end.
    name: "townMain",
    kind: "road",
    width: 7,
    lift: 0.11,
    pts: [
      [0.54764, 0.54149],
      [0.56, 0.54],
      [0.58101, 0.53746]
    ]
  },
  {
    // The cross street as built (landmarks.js crossAlong -56, yaw 0.15+PI/2):
    // it only opens to the south — its north leg ends inside the main
    // storefront row, so it runs from the main-street junction south to the
    // town gate that ranchTown, silverNorth and lakeShore all share.
    name: "townCross",
    kind: "road",
    width: 5.5,
    lift: 0.11,
    pts: [
      [0.54615, 0.54168],
      [0.54756, 0.54919]
    ]
  },
  {
    name: "rangeRanch",
    kind: "trail",
    width: 3.2,
    pts: [
      [0.14, 0.5],
      // Sheep camp's hut stands at the POI centre the old corner sample hit;
      // the impassable drop detached the entire western-range leg of this road.
      [0.12625, 0.578],
      [0.22, 0.54],
      [0.32, 0.5],
      [0.4, 0.44]
    ]
  },
  {
    name: "logA",
    kind: "trail",
    width: 2.8,
    pts: [
      [0.3, 0.82],
      [0.28, 0.88],
      [0.36, 0.92],
      [0.4, 0.9],
      [0.46, 0.86]
    ]
  },
  {
    name: "logB",
    kind: "trail",
    width: 2.8,
    pts: [
      [0.3, 0.82],
      [0.24, 0.84],
      [0.22, 0.9],
      [0.3, 0.94],
      [0.36, 0.92]
    ]
  },
  {
    name: "logC",
    kind: "trail",
    width: 2.8,
    pts: [
      [0.32, 0.86],
      [0.36, 0.84],
      [0.4, 0.82],
      [0.38, 0.78]
    ]
  },
  {
    name: "foothillsTribal",
    kind: "trail",
    width: 3,
    pts: [
      [0.66, 0.36],
      [0.58, 0.3],
      // Bends short of the tribal-lands structure at the POI centre: the old
      // corner sample sat inside it and the drop cut off the whole elPaso leg.
      [0.6365, 0.2248],
      [0.72, 0.12],
      [0.84, 0.06]
    ]
  },
  {
    // Starts at townMain's east end: leaving from the old centre start angled
    // through the east row of lots and its first edge priced impassable.
    name: "ironTrail",
    kind: "trail",
    width: 3.2,
    pts: [
      [0.58101, 0.53746],
      [0.68, 0.56],
      [0.8, 0.58],
      [0.86, 0.64]
    ]
  },
  {
    // Shares the town's southern cross-street gate with silverNorth, then
    // diverges south-west down the shore toward the lake trail.
    name: "lakeShore",
    kind: "trail",
    width: 3,
    pts: [
      [0.54756, 0.54919],
      [0.54, 0.6],
      [0.5, 0.64]
    ]
  },
  {
    // Bends west around the ranch house instead of bearing through it: the
    // centre start was fine for the yard, but a straight line from there to
    // the second point crosses every wall of the house and ends at its 0.9 m
    // front door — a gap a rider can slip through and a horse (1.56 m across)
    // wedges against forever. The edge pricing only surcharges a collider
    // crossing, so the graph happily plotted through the house.
    name: "cabinTrail",
    kind: "trail",
    width: 2.6,
    pts: [
      [0.4, 0.44],
      [0.39675, 0.44],
      [0.3965, 0.454],
      [0.38, 0.52],
      // Ends at the cabin's south face, not its centre: the centre is inside
      // the building, where the trail's last edge is unwalkable by definition.
      [0.38, 0.5788],
      [0.46, 0.58]
    ]
  },
  {
    name: "ironRail",
    kind: "rail",
    width: 4.2,
    pts: [
      [0.88, 0.74],
      [0.86, 0.64],
      [0.8, 0.6],
      [0.82, 0.52],
      [0.84, 0.42]
    ]
  }
];

export const CREEKS = [
  {
    name: "highCountry",
    width: 16,
    pts: [
      [0.28, 0.28],
      [0.36, 0.36],
      [0.4, 0.37],
      [0.47, 0.4],
      [0.5, 0.5],
      [0.5, 0.6],
      [0.52, 0.64]
    ]
  },
  {
    name: "silver",
    width: 14,
    pts: [
      [0.54, 0.62],
      [0.59, 0.56],
      [0.58, 0.4],
      [0.6, 0.24],
      [0.62, 0.08]
    ]
  },
  {
    name: "toxic",
    width: 12,
    pts: [
      [0.88, 0.72],
      [0.84, 0.6],
      [0.8, 0.48],
      [0.76, 0.36]
    ]
  },
  {
    name: "granite",
    width: 12,
    pts: [
      [0.78, 0.96],
      [0.82, 0.9],
      [0.86, 0.84],
      [0.88, 0.76]
    ]
  },
  {
    name: "twin",
    width: 11,
    pts: [
      [0.9, 0.62],
      [0.84, 0.54],
      [0.82, 0.52],
      [0.78, 0.46],
      [0.74, 0.4]
    ]
  },
  {
    name: "deadman",
    width: 18,
    dry: true,
    pts: [
      [0.48, 0.16],
      [0.5, 0.12],
      [0.46, 0.08],
      [0.42, 0.04],
      [0.4, 0.0]
    ]
  }
];

export const BRIDGES = [
  { name: "ranchCreek", u: 0.4, v: 0.37, yaw: 0, width: 7.2, length: 18 },
  { name: "tribalCreek", u: 0.59, v: 0.31, yaw: 1.15, width: 5.2, length: 16 }
];

function distPointSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len = abx * abx + abz * abz;
  if (len < 1e-8) {
    return Math.hypot(px - ax, pz - az);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/** World-space segment cache so road/creek queries do not remap every sample. */
const POLYLINE_CACHE = new WeakMap();

export function polylineCache(pts) {
  let c = POLYLINE_CACHE.get(pts);
  if (!c) {
    const segs = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = mapToWorld(pts[i][0], pts[i][1]);
      const b = mapToWorld(pts[i + 1][0], pts[i + 1][1]);
      segs.push(a.x, a.z, b.x, b.z);
      minX = Math.min(minX, a.x, b.x);
      maxX = Math.max(maxX, a.x, b.x);
      minZ = Math.min(minZ, a.z, b.z);
      maxZ = Math.max(maxZ, a.z, b.z);
    }
    c = { segs, minX, maxX, minZ, maxZ };
    POLYLINE_CACHE.set(pts, c);
  }
  return c;
}

export function distToPolyline(x, z, pts) {
  const { segs } = polylineCache(pts);
  let best = Infinity;
  for (let i = 0; i < segs.length; i += 4) {
    const d = distPointSeg(x, z, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

export function polylineLength(pts) {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = mapToWorld(pts[i][0], pts[i][1]);
    const b = mapToWorld(pts[i + 1][0], pts[i + 1][1]);
    len += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return len;
}

export function samplePolyline(pts, spacing = 8) {
  const samples = [];
  if (pts.length < 2) {
    return samples;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = mapToWorld(pts[i][0], pts[i][1]);
    const b = mapToWorld(pts[i + 1][0], pts[i + 1][1]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / spacing));
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      samples.push({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t
      });
    }
  }
  const last = mapToWorld(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  samples.push({ x: last.x, z: last.z });
  return samples;
}

export function nearestRoadDistance(x, z, kinds = null) {
  let best = Infinity;
  for (const road of ROADS) {
    if (kinds && !kinds.includes(road.kind)) {
      continue;
    }
    const d = distToPolyline(x, z, road.pts);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

export function bridgeLift(x, z) {
  let add = 0;
  for (const br of BRIDGES) {
    const p = mapToWorld(br.u, br.v);
    const d = Math.hypot(x - p.x, z - p.z);
    const reach = br.length * 0.75;
    if (d < reach) {
      const t = 1 - d / reach;
      add = Math.max(add, t * t * (3 - 2 * t) * 3.5);
    }
  }
  return add;
}

/**
 * Lake Mercy's nominal rim (where lakeCoords d = 1) in metres. The lake lives
 * at u 0.52 +/- 0.125 and v 0.66 +/- 0.095 of a 4000 x 5000 m world.
 */
export const LAKE_NOMINAL_RX = 0.125 * WORLD.width;
export const LAKE_NOMINAL_RZ = 0.095 * WORLD.depth;

/**
 * Shoreline radius multiplier for Lake Mercy at a given bearing.
 *
 * Lake Mercy was a perfect ellipse at every layer that described it — the
 * terrain carve here, the water surface (a CircleGeometry), the mud band (a
 * RingGeometry) and the beaches (flat circles) — so it read as a stamped disc
 * dropped on the plain rather than a body of water.
 *
 * This is the single shoreline all of them now share: a sum of harmonics in
 * the bearing, which gives bays and headlands at several scales. Every term is
 * an integer multiple of the angle, so the curve closes seamlessly at 0/2pi,
 * and it is a pure function of angle, so terrain, water mesh and beaches agree
 * on where the water's edge is without passing state around.
 *
 * Amplitudes stay under ~0.2 combined: enough to break the ellipse, not enough
 * to pinch the lake shut or push it over the shore road.
 */
export function lakeShoreRadius(angle) {
  return 1
    + Math.sin(angle * 2 + 0.6) * 0.075
    + Math.sin(angle * 3 - 1.9) * 0.055
    + Math.sin(angle * 5 + 2.4) * 0.036
    + Math.sin(angle * 8 + 0.3) * 0.022
    + Math.sin(angle * 13 - 2.7) * 0.012;
}

/**
 * Normalised ellipse coordinates for Lake Mercy. d = 1 is the nominal rim;
 * the bearing is taken in this normalised space so the shoreline noise rides
 * the ellipse rather than fighting its aspect ratio.
 */
export function lakeCoords(x, z) {
  const { u, v } = worldToMap(x, z);
  const dx = (u - 0.52) / 0.125;
  const dz = (v - 0.66) / 0.095;
  return { dx, dz, d: Math.sqrt(dx * dx + dz * dz), angle: Math.atan2(dz, dx) };
}

export function lakeFactor(x, z) {
  const { d, angle } = lakeCoords(x, z);
  const rim = lakeShoreRadius(angle);
  return 1 - smoothstep(0.72 * rim, 1.12 * rim, d);
}

export function roadFactor(x, z) {
  let w = 0;
  for (const road of ROADS) {
    const falloff = (road.width || 6) * 1.15;
    const c = polylineCache(road.pts);
    const pad = falloff * 3;
    if (x < c.minX - pad || x > c.maxX + pad || z < c.minZ - pad || z > c.maxZ + pad) {
      continue;
    }
    const d = distToPolyline(x, z, road.pts);
    w = Math.max(w, Math.exp(-((d * d) / (falloff * falloff))));
  }
  return w;
}

export function creekFactor(x, z) {
  let w = 0;
  for (const creek of CREEKS) {
    const c = polylineCache(creek.pts);
    const pad = creek.width * 3;
    if (x < c.minX - pad || x > c.maxX + pad || z < c.minZ - pad || z > c.maxZ + pad) {
      continue;
    }
    const d = distToPolyline(x, z, creek.pts);
    w = Math.max(w, Math.exp(-((d * d) / (creek.width * creek.width))));
  }
  return w;
}

export function biomeAt(x, z) {
  const { u, v } = worldToMap(x, z);
  const lake = lakeFactor(x, z);
  if (lake > 0.55) {
    return "lake";
  }
  const ranch = Math.hypot(x - POS.ranch.x, z - POS.ranch.z);
  if (ranch < 150) {
    return "ranch";
  }
  const town = Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z);
  if (town < 95) {
    return "town";
  }
  const burn = Math.hypot(x - POS.burn.x, z - POS.burn.z);
  if (burn < 160) {
    return "burn";
  }
  if (v > 0.74 && u < 0.58) {
    return "pines";
  }
  if (v < 0.2) {
    return "badlands";
  }
  if (u > 0.74 && v > 0.32 && v < 0.82) {
    return "iron";
  }
  if (u > 0.54 && v < 0.34 && v > 0.14) {
    return "tribal";
  }
  if (u > 0.58 && u < 0.78 && v > 0.28 && v < 0.5) {
    return "foothills";
  }
  if (u < 0.26) {
    return "range";
  }
  return "valley";
}

/**
 * The POS place containing (x, z), nearest border first — or null out in
 * open country. placeLabel builds its label from this, and the R5
 * first-arrival acknowledgement keys its "have I stood here before" state
 * off the same call, so the HUD text and the fanfare can never disagree
 * about where the player is.
 */
export function placeAt(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const place of Object.values(POS)) {
    const d = Math.hypot(x - place.x, z - place.z);
    if (d < place.radius && d < bestD) {
      bestD = d;
      best = place;
    }
  }
  return best;
}

export function placeLabel(x, z) {
  const place = placeAt(x, z);
  if (place) {
    return place.name;
  }
  const biome = biomeAt(x, z);
  const names = {
    lake: "Lake Mercy",
    ranch: "High Country Ranch",
    town: "Silver Creek",
    burn: "Ashes on the Divide",
    pines: "Northern Pines",
    badlands: "Southern Badlands",
    iron: "Iron Valley",
    tribal: "Tribal Lands",
    foothills: "Foothills",
    range: "Western Range",
    valley: "High Country"
  };
  return names[biome] || "High Country";
}

export function measureRoadNetwork(heightFn, spacing = 7) {
  let length2d = 0;
  let length3d = 0;
  let maxGap = 0;
  let samples = 0;
  for (const road of ROADS) {
    length2d += polylineLength(road.pts);
    const pts = samplePolyline(road.pts, spacing);
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const y = heightFn(p.x, p.z) + ROAD_LIFT + bridgeLift(p.x, p.z);
      samples += 1;
      if (i === 0) {
        continue;
      }
      const q = pts[i - 1];
      const y0 = heightFn(q.x, q.z) + ROAD_LIFT + bridgeLift(q.x, q.z);
      length3d += Math.hypot(p.x - q.x, y - y0, p.z - q.z);
      const mx = (p.x + q.x) / 2;
      const mz = (p.z + q.z) / 2;
      const yMid = heightFn(mx, mz) + ROAD_LIFT + bridgeLift(mx, mz);
      maxGap = Math.max(maxGap, Math.abs((y + y0) / 2 - yMid));
    }
  }
  return { length2d, length3d, maxGap, samples, count: ROADS.length };
}

export function inClearing(x, z) {
  if (lakeFactor(x, z) > 0.35) {
    return true;
  }
  if (roadFactor(x, z) > 0.45) {
    return true;
  }
  if (Math.hypot(x - POS.ranch.x, z - POS.ranch.z) < 95) {
    return true;
  }
  if (Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z) < 80) {
    return true;
  }
  return false;
}
