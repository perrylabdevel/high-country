/**
 * Weather state machine — see the implementation plan (weather system).
 *
 * Self-contained on purpose: the only imports are the typed math types, the
 * art-direction record it multiplies, and the road lookup the mud factor
 * leans on. Everything scene-shaped (the sky rig, the vegetation wind
 * uniforms, the terrain wetness write) arrives injected, so this module runs
 * headless in scripts/check-weather.mjs.
 *
 * Ownership rules this file lives by:
 *  - `materialSettings` is the authored art-direction record. Weather NEVER
 *    writes cover/fog/sun values into it; it multiplies the live scene-level
 *    values every frame, after updateSunOffset() and followLight() have done
 *    their thing (weather.update runs between followLight() and render —
 *    see the frame loop in main.js).
 *  - groundWetness is the one exception: it IS a materialSettings key (so the
 *    GUI slider and syncTerrainUniforms tell the truth), written through the
 *    injected applyGroundWetness callback only when the value moves.
 */
import {
  Color, DoubleSide, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3
} from "three/webgpu";
import { materialSettings } from "../materials/settings.ts";
import { roadFactor } from "../map.js";

/** Seeded so a given build plays back the same weather history. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WEATHER_STATES = ["clear", "buildup", "overcast", "rain", "storm", "clearing"];

/**
 * The transition table. coverMul/fogMul/sunMul/hemiMul/envMul are
 * multiplicative over the panel's authored values; rain and lightning are
 * absolute 0..1 intensities. wetTarget caps the mud accumulator while it is
 * raining (null = hold the previous cap). windSwing is the per-spell wind
 * direction offset (radians) drawn from the RNG on state entry.
 *
 * Numbers vs the existing sky: the cumulus threshold is mix(0.82, 0.44,
 * cover) (environment.js), so the panel's 0.45 cover needs ~2.2x to become a
 * true overcast deck; storm fog 0.00026 x 3.6 halves visibility at ~740 m
 * against the 7500 m far plane; hemi 1.6 / env 1.4 with sun 0.18 keeps the
 * ACES 1.12 exposure from crushing the shadow side to black.
 */
const STATES = {
  clear: {
    dur: [240, 480], coverMul: 1.0, fogMul: 1.0, sunMul: 1.0, hemiMul: 1.0, envMul: 1.0,
    windMul: 1.0, gustMul: 1.0, rain: 0, lightning: 0, wetTarget: 0, windSwing: 0,
    next: [["buildup", 0.6], ["clear", 0.4]]
  },
  buildup: {
    dur: [90, 180], coverMul: 1.55, fogMul: 1.1, sunMul: 0.92, hemiMul: 1.05, envMul: 1.05,
    windMul: 1.25, gustMul: 1.3, rain: 0, lightning: 0, wetTarget: 0, windSwing: 0.15,
    next: [["overcast", 0.7], ["clear", 0.3]]
  },
  overcast: {
    dur: [60, 120], coverMul: 2.05, fogMul: 1.6, sunMul: 0.55, hemiMul: 1.25, envMul: 1.25,
    windMul: 1.5, gustMul: 1.6, rain: 0, lightning: 0, wetTarget: 0.15, windSwing: 0.3,
    next: [["rain", 0.7], ["clearing", 0.3]]
  },
  rain: {
    dur: [120, 240], coverMul: 2.15, fogMul: 2.6, sunMul: 0.32, hemiMul: 1.45, envMul: 1.35,
    windMul: 1.8, gustMul: 2.0, rain: 0.7, lightning: 0.05, wetTarget: 0.75, windSwing: 0.4,
    next: [["storm", 0.6], ["clearing", 0.4]]
  },
  storm: {
    dur: [60, 120], coverMul: 2.2, fogMul: 3.6, sunMul: 0.18, hemiMul: 1.6, envMul: 1.4,
    windMul: 2.6, gustMul: 3.0, rain: 1.0, lightning: 1.0, wetTarget: 1.0, windSwing: 0.7,
    next: [["clearing", 1]]
  },
  clearing: {
    dur: [90, 180], coverMul: 1.25, fogMul: 1.3, sunMul: 0.85, hemiMul: 1.1, envMul: 1.1,
    windMul: 1.4, gustMul: 1.5, rain: 0.15, lightning: 0, wetTarget: null, windSwing: 0.3,
    next: [["clear", 1]]
  }
};

// Eased-channel rates (per second): how fast each envelope chases its target.
// Exp easing toward a constant target cannot overshoot — the property
// check-weather.mjs asserts.
const RATES = {
  coverMul: 0.35, fogMul: 0.5, sunMul: 0.8, hemiMul: 0.8, envMul: 0.8,
  windMul: 0.6, gustMul: 0.6, rain: 1.2, windAngle: 0.6
};
// force() ramps at this rate instead, so a forced capture is settled well
// inside capture-poi.mjs's 1.5 s shadow/scatter wait.
const FORCE_RATE = 6;

// Storm fog tint, lerped in as the rain envelope rises. MUST be a Color, not
// a Vector3: Color.multiply reads .r/.g/.b, which a Vector3 does not have —
// the first frame poisoned the fog with NaN before check-weather caught it
// (HARD_WON 1.1).
const TINT_STORM = new Color(0.55, 0.58, 0.62);
const WHITE = new Color(1, 1, 1);
export const BASE_WIND_ANGLE = Math.atan2(0.514496, 0.857493); // the shipped axis

export function createWeather({ scene, skyRig, vegetation, applyGroundWetness }) {
  let seed = 0x9e3779b9;
  let rand = mulberry32(seed);

  let stateName = "clear";
  let stateT = 0;
  let duration = drawDuration("clear");
  let windTarget = BASE_WIND_ANGLE;
  let pinned = false; // force() holds the state until force(null)

  // Envelope currents. windAngle is radians from +X, eased separately.
  const env = {
    coverMul: 1, fogMul: 1, sunMul: 1, hemiMul: 1, envMul: 1,
    windMul: 1, gustMul: 1, rain: 0, windAngle: BASE_WIND_ANGLE
  };
  let wet = 0;
  let wetCap = 0;
  let flash = 0;
  let flashT = 1; // >= strike length: no flash in flight
  let strikeTimer = 4;

  // Bases. hemi is written nowhere else (environment.js), so capture once.
  // The sun base is re-derived by updateSunOffset() itself (main.js), which
  // also runs on every panel drag and settings push.
  const hemiBase = skyRig.hemi.intensity;

  // Scratch, allocated once.
  const fogTint = new Color();
  const windVec = new Vector3();

  function drawDuration(name) {
    const [lo, hi] = STATES[name].dur;
    return lo + rand() * (hi - lo);
  }

  function enter(name) {
    stateName = name;
    stateT = 0;
    duration = drawDuration(name);
    // Draw this spell's wind direction: the storm swings off the base axis,
    // then easing carries the field back as it clears.
    windTarget = BASE_WIND_ANGLE + (rand() * 2 - 1) * STATES[name].windSwing;
  }

  function pickNext(name) {
    const roll = rand();
    let acc = 0;
    for (const [next, p] of STATES[name].next) {
      acc += p;
      if (roll < acc) {
        return next;
      }
    }
    return STATES[name].next[STATES[name].next.length - 1][0];
  }

  /**
   * Force a state for the dev panel / capture pipeline / mission scripts.
   * Envelopes ramp to the table values over ~0.5 s (FORCE_RATE) and the RNG
   * stops advancing the machine until force(null) releases it.
   */
  function force(name) {
    if (name === null || name === undefined) {
      pinned = false;
      duration = drawDuration(stateName);
      return;
    }
    if (!WEATHER_STATES.includes(name)) {
      throw new Error(`createWeather.force: unknown weather state "${name}" — expected one of ${WEATHER_STATES.join(", ")}`);
    }
    pinned = true;
    if (name !== stateName) {
      enter(name);
    }
    // Settle the ground with the envelopes: a forced clear must be dry NOW
    // (the capture baseline is graded at groundWetness 0), and a forced storm
    // should not spend its first 45 s soaking.
    const target = STATES[stateName].wetTarget;
    if (target !== null && target !== undefined) {
      wet = target;
      wetCap = target;
      if (applyGroundWetness) {
        applyGroundWetness(wet);
      }
    }
    duration = Infinity;
  }

  // --- lightning bolt: one quad, shown only while a flash is in flight.
  // A visible-toggle plus the occasional reposition — no per-frame buffer
  // writes (HARD_WON 1.9). ---
  const boltMat = new MeshBasicNodeMaterial({ side: DoubleSide, fog: false });
  boltMat.color = new Color(2.2, 2.2, 2.4); // over-unity: reads as white-hot
  const bolt = new Mesh(new PlaneGeometry(3, 260), boltMat);
  bolt.visible = false;
  bolt.frustumCulled = false;
  scene.add(bolt);

  function placeBolt(cameraPos) {
    const angle = rand() * Math.PI * 2;
    const dist = 120 + rand() * 260;
    bolt.position.set(
      cameraPos.x + Math.cos(angle) * dist,
      cameraPos.y + 220,
      cameraPos.z + Math.sin(angle) * dist
    );
    bolt.rotation.y = -angle;
    bolt.visible = true;
  }

  function update(dt, cameraPos) {
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }

    // --- state machine ---
    stateT += dt;
    if (!pinned && stateT >= duration) {
      enter(pickNext(stateName));
    }
    const s = STATES[stateName];
    if (s.wetTarget !== null && s.wetTarget !== undefined) {
      wetCap = s.wetTarget;
    }

    // --- lightning scheduling (before easing, so flash feeds this frame) ---
    if (s.lightning > 0 && !pinned) {
      strikeTimer -= dt;
      if (strikeTimer <= 0) {
        flashT = 0;
        strikeTimer = (2 + rand() * 8) / s.lightning;
        if (cameraPos) {
          placeBolt(cameraPos);
        }
      }
    }
    if (flashT < 0.2) {
      flashT += dt;
      const t = flashT;
      // Two sub-peaks over ~180 ms — the double-flicker of a real strike.
      flash = Math.exp(-((t - 0.04) ** 2) / 0.0008) + 0.6 * Math.exp(-((t - 0.11) ** 2) / 0.0015);
      if (flashT >= 0.2) {
        flash = 0;
      }
    } else {
      flash = 0;
    }

    // --- eased envelopes ---
    for (const key of Object.keys(RATES)) {
      const target = key === "windAngle" ? windTarget : s[key];
      const r = RATES[key] * (pinned ? 12 : 1) * dt;
      env[key] += (target - env[key]) * Math.min(1, r);
      // Snap a converged envelope to its target. An asymptotic ease never
      // arrives, so without this the ~20 scene uniforms written below change
      // by last-ULP amounts every frame forever — and each changed uniform is
      // a per-frame writeBuffer. Measured (probe-uploads, northernPines):
      // 51 calls/frame in clear (values exactly constant, three uploads
      // nothing) vs 228 in overcast/storm. Snapping makes a settled spell
      // upload-free, same as clear.
      if (Math.abs(target - env[key]) < 1e-4) {
        env[key] = target;
      }
    }

    // --- apply: clouds ---
    skyRig.cover.value = Math.min(1, Math.max(0, materialSettings.cloudCover * env.coverMul));
    // Storm shear: warp up with the rain envelope; the deck goes blander.
    skyRig.cloudWarpX.value = materialSettings.cloudWarpX * (1 + 0.2 * env.rain);
    skyRig.cloudWarpY.value = materialSettings.cloudWarpY * (1 + 0.2 * env.rain);
    skyRig.cloudDetailBias.value = materialSettings.cloudDetailBias * (1 - 0.15 * env.rain);

    // --- apply: fog. Colour copies the LIVE bot stop so golden/midday palette
    // switches stay correct (updateSun derives the clear-sky fog colour from
    // the same stop every call — we multiply the same source). ---
    scene.fog.density = materialSettings.fogDensity * env.fogMul;
    fogTint.copy(WHITE).lerp(TINT_STORM, env.rain);
    scene.fog.color.copy(skyRig.bot.value).multiply(fogTint);

    // --- apply: lights ---
    skyRig.sun.intensity = skyRig.sunBase * env.sunMul;
    skyRig.hemi.intensity = hemiBase * env.hemiMul * (1 + 5 * flash);
    // Mirrors syncEnvironmentIntensity (src/materials/hdri.ts:19) with the
    // weather multiplier folded in — the 1.85 golden fill factor is the same
    // constant, deliberately duplicated so weather does not import the HDRI
    // loader.
    const hdriScale = materialSettings.hdri === "golden" ? 1.85 : 1;
    scene.environmentIntensity = materialSettings.environmentIntensity * hdriScale * env.envMul;

    // --- apply: wind ---
    vegetation.windStrength.value = 0.07 * env.windMul;
    vegetation.gustStrength.value = 0.11 * env.gustMul;
    vegetation.windFreq.value = 1.3 * (0.8 + 0.2 * env.windMul);
    windVec.set(Math.cos(env.windAngle), 0, Math.sin(env.windAngle));
    vegetation.windDir.value.copy(windVec);

    // --- wetness / mud ---
    if (env.rain > 0.2) {
      wet = Math.min(wetCap, wet + dt / 45);
    } else {
      wet = Math.max(0, wet - dt / 240);
    }
    if (applyGroundWetness) {
      applyGroundWetness(wet);
    }

    if (bolt.visible && flashT >= 0.2) {
      bolt.visible = false;
    }
  }

  // --- mud multiplier. roadFactor is the most expensive lookup in the grass
  // scatter (map.js: 1268 ns, paid by every candidate), so results are cached
  // per caller and recomputed only when the caller has moved, time has
  // passed, or the wetness moved. ---
  const roadCache = new Map();
  function movementMulAt(x, z, caller = "main") {
    if (wet <= 0) {
      return 1; // exact: the dry baseline must be untouched
    }
    let c = roadCache.get(caller);
    const now = performance.now();
    if (!c || Math.hypot(x - c.x, z - c.z) > 2 || now - c.t > 250 || Math.abs(wet - c.wet) > 0.02) {
      c = { x, z, t: now, wet, road: roadFactor(x, z) };
      roadCache.set(caller, c);
    }
    return Math.max(0.5, Math.min(1, 1 - wet * (0.35 + 0.25 * c.road)));
  }

  function rainIntensity() {
    return env.rain;
  }

  function smokeMul() {
    return Math.max(0.15, 1 - 0.85 * env.rain);
  }

  function serialize() {
    return { seed, state: stateName, stateT, wet, windAngle: env.windAngle, pinned };
  }

  function restore(data) {
    if (!data || typeof data !== "object") {
      return;
    }
    if (Number.isFinite(data.seed)) {
      seed = data.seed >>> 0;
      // Rebuild the generator so the FUTURE matches the seed (history is not
      // replayed); a few draws detach it from whatever the boot seed produced.
      rand = mulberry32(seed);
      for (let i = 0; i < 8; i += 1) {
        rand();
      }
    }
    if (WEATHER_STATES.includes(data.state)) {
      stateName = data.state;
      duration = drawDuration(stateName);
      stateT = 0;
    }
    if (Number.isFinite(data.stateT) && data.stateT >= 0) {
      stateT = data.stateT;
    }
    if (Number.isFinite(data.wet) && data.wet >= 0 && data.wet <= 1) {
      wet = data.wet;
    }
    if (Number.isFinite(data.windAngle)) {
      env.windAngle = data.windAngle;
      windTarget = data.windAngle;
    }
    pinned = data.pinned === true;
    if (pinned) {
      duration = Infinity;
    }
  }

  function state() {
    return stateName;
  }

  function refresh() {
    // Bases are re-derived multiplicatively every frame, so a settings push
    // needs no work here; sunBase is refreshed inside updateSunOffset()
    // (main.js) on the same push. Kept as a hook so __syncMaterialSettings
    // has somewhere to call.
  }

  return {
    update,
    force,
    state,
    serialize,
    restore,
    movementMulAt,
    rainIntensity,
    smokeMul,
    refresh,
    // Diagnostics for scripts/check-weather.mjs — not part of the game API.
    _env: env,
    _wet: () => wet,
    _flash: () => flash,
    _bolt: () => bolt,
    _table: STATES
  };
}