/**
 * Device performance profile: one tier, chosen before the scene is built.
 *
 * The renderer had no idea what it was running on. Everything was sized for a
 * desktop discrete GPU — a 4096x4096 shadow map, a 330 m grass disc, and
 * setPixelRatio(min(devicePixelRatio, 2)) — and the last of those is the one
 * that hurts most on a laptop, because it is multiplicative with every
 * fill-rate cost in the scene.
 *
 * Worked example, an M2 MacBook Air 13": the CSS window is about 1470x956 at
 * devicePixelRatio 2, so the renderer was drawing 5.62 Mpx per frame. That is
 * MORE pixels than 1440p on a desktop 4070 Ti (3.69 Mpx), on an integrated GPU
 * with a small fraction of the fill rate. Ground cover is alpha-tested and
 * double-sided — no early-z, both faces shaded wherever cards overlap — so it
 * is precisely the workload that scales with pixels, and measurement put it at
 * 16.5 ms/frame on its own at the densest vantage.
 *
 * Hence three tiers, and hence the pixel ratio being the first thing each one
 * sets. The dials below are ordered by how much they buy:
 *
 *   pixelRatio   multiplies EVERY per-pixel cost in the frame
 *   grassRadius  the disc's area, and so the instance count, goes as r^2
 *   shadowMap    a full extra scene pass at that resolution
 *   antialias    MSAA resolves cost bandwidth the iGPUs do not have
 *
 * Selection is automatic (see detectTier) with a ?tier= override, because a
 * player on an integrated GPU should not have to find a settings menu to get
 * a playable frame rate.
 */

/**
 * @typedef {object} PerfProfile
 * @property {string} name          Tier id.
 * @property {number} pixelRatio    Hard cap on renderer.setPixelRatio.
 * @property {boolean} antialias    MSAA on the main target.
 * @property {number} shadowMapSize Directional shadow map, per side.
 * @property {boolean} shadows      Shadow pass at all.
 * @property {number} grassRadius   Ground-cover draw distance, metres.
 * @property {number} grassCellScale Multiplier on every ring's cell size;
 *                                   >1 means fewer, larger tufts.
 * @property {number} sageRadius    Shrub draw distance, metres.
 * @property {number} treeDrawDist  Beyond this a tree is not submitted.
 * @property {string} terrainTier   Feeds setQualityTier in materials/settings.
 */

/** @type {Record<string, PerfProfile>} */
export const PERF_TIERS = {
  /**
   * Integrated graphics: Intel UHD/Iris Xe, Radeon 780M, and Apple silicon in
   * the fanless machines. The pixel ratio cap is the whole ball game here —
   * on a Retina panel it alone cuts the per-frame pixel count by 4x.
   */
  low: {
    name: "low",
    pixelRatio: 1,
    antialias: false,
    shadowMapSize: 1024,
    shadows: true,
    grassRadius: 170,
    grassCellScale: 1.5,
    sageRadius: 150,
    treeDrawDist: 1400,
    terrainTier: "low"
  },
  /**
   * Apple silicon with a fan, mobile discrete, and older desktop cards. Retina
   * panels still get a 1.5 cap rather than 2: the difference between 1.5x and
   * 2x is 78% more pixels for detail most players cannot see on a 13" screen.
   */
  medium: {
    name: "medium",
    pixelRatio: 1.5,
    antialias: true,
    shadowMapSize: 2048,
    shadows: true,
    grassRadius: 260,
    grassCellScale: 1.15,
    sageRadius: 220,
    treeDrawDist: 2000,
    terrainTier: "medium"
  },
  /** Desktop discrete. The values the game shipped with. */
  high: {
    name: "high",
    pixelRatio: 2,
    antialias: true,
    shadowMapSize: 4096,
    shadows: true,
    grassRadius: 330,
    grassCellScale: 1,
    sageRadius: 280,
    treeDrawDist: 2600,
    terrainTier: "high"
  }
};

/**
 * Pick a tier from what the browser will tell us about the adapter.
 *
 * There is no reliable "how fast is this GPU" API, so this reads the WebGPU
 * adapter info where it exists and falls back to coarse platform signals.
 * Every branch is deliberately conservative: guessing `high` on a weak
 * machine produces an unplayable frame rate, while guessing `medium` on a
 * strong one costs some resolution the player can raise back with ?tier=high.
 *
 * @param {GPUAdapter|null} adapter A WebGPU adapter, or null under WebGL.
 * @returns {string} A key of PERF_TIERS.
 */
export function detectTier(adapter) {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const ua = nav?.userAgent ?? "";
  const info = adapter?.info ?? null;
  const desc = `${info?.vendor ?? ""} ${info?.architecture ?? ""} ${info?.description ?? ""}`.toLowerCase();

  // Apple silicon reports its architecture as "apple-<n>". The fanless Air
  // throttles hard under sustained load where the Pro/Max do not, but the
  // adapter does not distinguish them, so all Apple GPUs take `medium` —
  // which is the right answer for an Air and only slightly cautious for a Max.
  if (desc.includes("apple") || (/mac/i.test(ua) && nav?.maxTouchPoints === 0 && desc === "  ")) {
    return "medium";
  }

  // Named integrated parts. Intel's discrete Arc cards also match "intel", so
  // check for those first and let them fall through to the desktop default.
  const isArc = /\barc\b|\ba7\d\d\b/.test(desc);
  if (!isArc && /intel|uhd|iris|vega \d|radeon graphics|adreno|mali|integrated/.test(desc)) {
    return "low";
  }

  // Discrete desktop parts, by the vendor strings that actually appear.
  if (/nvidia|geforce|rtx|gtx|radeon rx|\bnavi\b/.test(desc) || isArc) {
    return "high";
  }

  // No WebGPU adapter at all means the WebGL2 fallback, which is slower here
  // for the same scene.
  if (!adapter) {
    return "low";
  }

  // Phones and tablets, by the only signal that is broadly reliable.
  if (/android|iphone|ipad|mobile/i.test(ua)) {
    return "low";
  }

  // Unknown desktop GPU. Medium is the safe middle: it holds a usable frame
  // rate on weak hardware and gives up little on strong hardware.
  return "medium";
}

/**
 * Resolve the active profile.
 *
 * `?tier=low|medium|high` forces one, which is also how the capture and
 * benchmark tooling pins a tier so its numbers stay comparable across runs.
 *
 * @param {GPUAdapter|null} adapter
 * @param {string|null} override
 * @returns {PerfProfile & { auto: boolean }}
 */
export function resolveProfile(adapter, override = null) {
  const forced = override && PERF_TIERS[override] ? override : null;
  const tier = forced ?? detectTier(adapter);
  return { ...PERF_TIERS[tier] ?? PERF_TIERS.medium, auto: !forced };
}

/**
 * The live profile, so modules built after boot can read it without threading
 * it through every constructor. Defaults to `high` so any headless check that
 * imports a module without booting the renderer sees the shipped values.
 */
let active = { ...PERF_TIERS.high, auto: false };

export function setActiveProfile(profile) {
  active = profile;
  return active;
}

export function getProfile() {
  return active;
}
