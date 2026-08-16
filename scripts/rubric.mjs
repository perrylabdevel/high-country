/**
 * The executable copy of the rubric in docs/VISION_AUDIT.md §5.
 *
 * §5 is the prose version for humans; this is what scripts/grade.mjs actually
 * sends to the grader. They must be kept in step — when the second-tier pass
 * amends a criterion (§1), amend it in BOTH places in the same commit.
 *
 * Criterion ids are stable and are what the score series is keyed on. Never
 * renumber an existing id: retire it and add a new one, or every past report
 * silently changes meaning.
 */

/**
 * POIs where bare/charred/adobe/desert ground is correct, not a defect. U1's
 * "grass cover" wording is wrong for these — a burn site with grass would be
 * the bug. For arid POIs U1 is replaced by an arid-ground check so the grader
 * stops dinging correct bare ground as a failure.
 */
export const ARID_POIS = new Set(["badlands", "burn", "mission", "elPaso", "ironValley"]);

const U1_GRASS = {
  id: "U1",
  name: "Ground is not bare",
  detail:
    "Grass cover reads as continuous ground cover in the near field, thinning with distance. No wide expanses of untextured dirt where the biome should be grassed."
};

const U1_ARID = {
  id: "U1",
  name: "Ground reads as correct arid material",
  detail:
    "This is an arid/desert/burn POI, so bare ground is correct. The ground must still show believable arid material — weathering, rock, ash or adobe micro-variation — not a flat single-tone wash. Score the material richness, not vegetation coverage."
};

/** Applied to every screenshot. */
export const UNIVERSAL = [
  U1_GRASS,
  {
    id: "U2",
    name: "Texture scale is believable",
    detail:
      "Ground detail is human-scale against a 1.62 m eye height. No smeared low-frequency wash, and no visible repeating tiling grid."
  },
  {
    id: "U3",
    name: "No seams or straight material lines",
    detail:
      "Transitions between grass, dirt, rock and gravel are noise-broken and irregular. No clean straight boundary between two materials."
  },
  {
    id: "U4",
    name: "Nothing floats or sinks",
    detail:
      "Every object meets the ground. No gaps under walls or fences, no half-buried props, no roof detached from its walls."
  },
  {
    id: "U5",
    name: "Lighting reads correctly",
    detail:
      "Shadows are present and directional. No blown highlights, no crushed blacks. A golden-hour frame must be visibly warmer with longer shadows than the midday frame of the same POI."
  },
  {
    id: "U6",
    name: "Silhouettes read at distance",
    detail:
      "Distant objects are identifiable by shape rather than smeared, popping, or collapsing into flat cards."
  }
];

/**
 * Per-POI criteria. `id` is prefixed with the POI so ids stay globally unique.
 */
export const PER_POI = {
  ranch: [
    ["R1", "L-plan massing", "A two-story main block with a lower kitchen ell, not a single box."],
    ["R2", "Roofs", "Hip roofs with even overhang on all four sides; the roof plan is never narrower than the walls."],
    ["R3", "Porch", "Porch posts carry a roof. Posts supporting nothing is a fail."],
    ["R4", "Chimneys", "Continuous from the wall to above the ridge, not floating or detached."],
    ["R5", "Door scale", "The front door reads as roughly 0.9 x 2.0 m against a 1.62 m eye height."],
    ["R6", "Outbuildings", "Barn gable runs along its long axis; fences have three rails; the windmill is a multi-vane fan, not a four-blade Dutch mill."]
  ],
  silverCreek: [
    ["S1", "Street alignment", "Every building faces the street at the same angle, forming a legible street corridor rather than a scattered cluster."],
    ["S2", "False fronts", "False fronts sit at the facade plane, span the full building width, and hide the roof behind them."],
    ["S3", "Church", "The steeple is over the entry at the gable end, not centered on the ridge."],
    ["S4", "Boardwalk", "A raised boardwalk runs along the storefronts."],
    ["S5", "Variety", "Buildings vary in height, width and material; no run of identical boxes."]
  ],
  northernPines: [
    ["P1", "Conifer silhouette", "Canopies are conical, wider at the base than the top, with tiered branches."],
    ["P2", "Foliage density", "Foliage occludes what is behind it. Seeing the horizon through a canopy is a fail."],
    ["P3", "Bark", "Trunks show bark relief, not flat untextured poles."],
    ["P4", "Stand density", "Reads as forest, not scattered saplings."],
    ["P5", "Tree height", "Believable against the player and the buildings."]
  ],
  timberCamp: [
    ["T1", "Working site", "Cut stumps and felled logs present; reads as a worked site, not a box cluster."],
    ["T2", "Structures", "Buildings have pitched roofs and doors."]
  ],
  burn: [
    ["B1", "Burn read", "Charred standing trunks with no canopy; ground visibly darkened."],
    ["B2", "Smoke", "A smoke plume is visible and anchored to a source on the ground."]
  ],
  lakeMercy: [
    ["L1", "Depth gradient", "Water colour shifts from pale at the shore to saturated at depth."],
    ["L2", "Surface motion", "Two distinct scales of surface normal detail, not one uniform drift."],
    ["L3", "Shoreline foam", "Foam where the water meets the bank."],
    ["L4", "Dock", "The dock sits at the water plane, neither floating above nor drowned."],
    ["L5", "Reflectivity", "The water surface shows a visible sky reflection or sun-direction specular highlight distinct from the base water colour — not a flat diffuse plane."]
  ],
  westernRange: [
    ["W1", "Grassland", "Reads as grass to the horizon."],
    ["W2", "Cattle", "Cattle vary in orientation; not all facing the same way."],
    ["W3", "Fences", "Fence lines follow the terrain without floating or sinking."]
  ],
  ironValley: [
    ["I1", "Industrial silhouette", "Headframes, stamp mill and tailings are identifiable."],
    ["I2", "Materials", "Rust and iron read distinctly from timber."]
  ],
  tribal: [
    ["N1", "Variation", "Tipis vary in rotation and scale."],
    ["N2", "Arrangement", "The camp reads as arranged, not on a grid."]
  ],
  badlands: [
    ["D1", "Rock strata", "Layered or striated rock, not a flat single colour."],
    ["D2", "Slope-driven material", "Rock dominates by slope rather than being painted on uniformly."],
    ["D3", "Sparse vegetation", "Vegetation is sparse and consistent with arid ground."]
  ],
  mission: [
    ["M1", "Adobe", "Adobe material reads distinctly from timber."],
    ["M2", "Bell tower", "On the facade, not centered on the roof."]
  ],
  fortGrant: [
    ["F1", "Enclosure", "Four walls enclose a courtyard, with a centered gate."],
    ["F2", "Interior", "Structures inside the walls, not an empty box."]
  ],
  cemetery: [
    ["C1", "Variation", "Headstones vary in size, spacing and rotation; not a straight evenly-spaced line."]
  ],
  huntingCabin: [
    ["H1", "Cabin", "One story, pitched roof, a door, and a chimney."]
  ],
  overlook: [
    ["O1", "Vista", "The view is the subject: foreground framing, readable middle distance."],
    ["O2", "Aerial perspective", "Haze increases toward the horizon."]
  ],
  elPaso: [
    ["E1", "Settlement read", "Adobe cluster with varied heights; reads as a settlement, not repeated boxes."]
  ]
};

/** Added to any frame that contains a road. */
export const ROAD = [
  {
    id: "G1",
    name: "Gravel road edges",
    detail:
      "Road edges are ragged and noise-broken, never a clean straight boundary against grass, and the wheel-track center is visibly smoother and darker than the loose margins. Score 'n/a' if no road is visible in this frame."
  }
];

/** Every criterion that applies to one screenshot, given its POI. */
export function criteriaFor(poi) {
  const perPoi = (PER_POI[poi] || []).map(([id, name, detail]) => ({ id, name, detail }));
  const universal = ARID_POIS.has(poi)
    ? UNIVERSAL.map((c) => (c.id === "U1" ? U1_ARID : c))
    : UNIVERSAL;
  return [...universal, ...perPoi, ...ROAD];
}

export const POI_IDS = Object.keys(PER_POI);
