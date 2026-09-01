/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Append ?webgl to the URL to force the WebGL2 backend.
 */
import * as THREE from "three/webgpu";
import { time } from "three/tsl";
import { createInput } from "./input.js";
import { heightAt } from "./world.js";
import { meshHeightAt } from "./heightfield.js";
import { createTerrain, createSky, rebuildTerrainMaterial } from "./environment.js";
import { createRanch } from "./buildings.js";
import { mergeStatic } from "./buildings/mergeStatic.js";
import { createLandmarks, createWater } from "./landmarks.js";
import { loadBuildingMaps } from "./materials/buildingSets.ts";
import { createInteriors } from "./interiors.js";
import { createShore } from "./shore.js";
import { createIndustry } from "./industry.js";
import { createFort } from "./fort.js";
import { createPines } from "./pines.js";
import { createHomestead } from "./homestead.js";
import { createRoads } from "./roads.js";
import { createVegetation, createSmoke, loadVegetationMaps } from "./vegetation.js";
import { createPlayer } from "./player.js";
import { createHorse } from "./horse.js";
import { addCylinderCollider, resolvePosition } from "./collision.js";
import { readSave, writeSave } from "./save.js";
import { POS, placeAt, placeLabel, headingVector } from "./map.js";
import { createMissions } from "./missions.js";
import { resetNavGraph, navGraph, linkApproaches } from "./nav/graph.js";
import { approachLinkRows, APPROACHES, primaryApproach } from "./nav/arrivals.js";
import { markEdgeBlocked, blockedEdges, routeTo } from "./nav/search.js";
import { createMinimap } from "./minimap.js";
import { createDebug, debugBlocksGame } from "./debug.js";
import { STRUCTURES, insideStructure } from "./buildings/kit.js";
import { enumerateApertures, apertureTraversable } from "./buildings/apertures.js";
import { lookingAtStructure } from "./buildings/lookingAt.js";
import { createStructureLabels } from "./dev/structureLabels.js";
import { createXray } from "./dev/xray.js";
import { createKtx2Loader } from "./materials/ktx2.js";
import { applyHdri, syncEnvironmentIntensity } from "./materials/hdri.ts";
import { materialSettings, setQualityTier } from "./materials/settings.ts";
import { resolveProfile, setActiveProfile, getProfile } from "./perfProfile.js";
import { syncTerrainUniforms } from "./materials/terrainMaterial.ts";
import { syncWallUniforms } from "./materials/texturedMat.ts";
import { syncWaterUniforms } from "./materials/waterMaterial.ts";
import { bootMaterialLab } from "./dev/MaterialLab.ts";
import { createMaterialPanel } from "./dev/panel.ts";
import Stats from "stats.js";

const placeEl = document.getElementById("hud-place");
const placeNoteEl = document.getElementById("hud-place-note");
const hintEl = document.getElementById("hud-hint");
const promptEl = document.getElementById("prompt");
const dialogueEl = document.getElementById("dialogue");
const speakerEl = document.getElementById("dialogue-speaker");
const bodyEl = document.getElementById("dialogue-body");
const objectiveEl = document.getElementById("objective");
const targetEl = document.getElementById("objective-target");
const toastEl = document.getElementById("toast");
const titleEl = document.getElementById("title");
const enterBtn = document.getElementById("btn-enter");
const params = new URLSearchParams(window.location.search);
const isLab = params.has("lab");
const isDev = params.has("dev") || isLab;

if (isLab) {
  titleEl.classList.add("hidden");
  bootMaterialLab().catch((err) => {
    console.error(err);
  });
} else {
  boot().catch((err) => {
    console.error(err);
  });
}

function showRendererError(err, alreadyWebGL) {
  const msg = document.createElement("div");
  msg.style.cssText = "position:absolute;inset:36% 10%;color:#f4ead2;text-align:center;z-index:20;text-shadow:0 1px 8px #000";
  const retry = alreadyWebGL
    ? ""
    : `<p><a href="?webgl" style="color:#f4ead2">Retry with the WebGL backend</a></p>`;
  msg.innerHTML = `<p>The renderer failed to start.</p>${retry}<p class="fine">${err.message}</p>`;
  document.body.appendChild(msg);
}

/**
 * Ask for a WebGPU adapter purely to identify the GPU.
 *
 * This runs BEFORE the renderer is constructed, because `antialias` is a
 * construction-time option and the pixel ratio wants setting before the first
 * frame — so the tier has to be known first. Requesting an adapter is cheap
 * and does not create a device; three requests its own moments later.
 *
 * Any failure returns null, which detectTier reads as "assume weak hardware".
 */
async function probeAdapter(forceWebGL) {
  if (forceWebGL || typeof navigator === "undefined" || !navigator.gpu) {
    return null;
  }
  try {
    return await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {
    return null;
  }
}

async function boot() {
  const bootParams = new URLSearchParams(window.location.search);
  const forceWebGL = bootParams.has("webgl");
  const profile = setActiveProfile(
    resolveProfile(await probeAdapter(forceWebGL), bootParams.get("tier"))
  );
  const renderer = new THREE.WebGPURenderer({
    antialias: profile.antialias,
    powerPreference: "high-performance",
    forceWebGL
  });
  // The pixel ratio is the highest-leverage dial in the whole renderer: it
  // multiplies every per-pixel cost, and the ground cover is alpha-tested and
  // double-sided, so it is pure fill. An M2 Air's Retina panel reports
  // devicePixelRatio 2, which had it drawing 5.62 Mpx per frame — more than
  // 1440p on a desktop 4070 Ti.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = profile.shadowMapSize >= 4096
    ? THREE.PCFSoftShadowMap
    // PCFSoft takes many taps per fragment. At 1024/2048 the softness it buys
    // is lost in the lower resolution anyway, so plain PCF is the better trade.
    : THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Terrain detail rides the same tier, so one decision drives the whole frame.
  setQualityTier(profile.terrainTier);

  try {
    await renderer.init();
  } catch (err) {
    showRendererError(err, forceWebGL);
    throw err;
  }

  createKtx2Loader(renderer);
  document.body.prepend(renderer.domElement);

  const minimap = createMinimap();
  let started = false;
  let talking = null;
  let player;
  let horse;
  let input;

  let materialGui;
  const debug = createDebug((x, z) => {
    const held = { x, z };
    if (player.state.mounted) {
      horse.object.position.x = held.x;
      horse.object.position.z = held.z;
      horse.object.position.y = heightAt(held.x, held.z);
      horse.collider.x = held.x;
      horse.collider.z = held.z;
    }
    player.object.position.x = held.x;
    player.object.position.z = held.z;
    player.groundPlayer();
    if (player.state.mode === "fly") {
      camera.position.x = held.x;
      camera.position.z = held.z;
      camera.position.y = Math.max(camera.position.y, heightAt(held.x, held.z) + 24);
    } else {
      player.state.snapCam = true;
    }
  }, {
    onOpenChange(open) {
      if (materialGui) {
        materialGui.show(open);
      }
      if (open) {
        input.clear();
        return;
      }
      if (started) {
        renderer.domElement.requestPointerLock();
      }
    },
    onFly() {
      if (!player) {
        return;
      }
      player.toggleFly(horse);
      debug.setOpen(false);
    }
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.12, 7500);
  // Scratch vector for the camera look direction. Declared with the camera:
  // the dev hooks below (__vegSettled) read it and can be called from capture
  // tooling long before the frame loop, so it must be initialised by then.
  const cameraDirection = new THREE.Vector3();
  // Sun-direction scratch vector for updateSunOffset (panel elevation/azimuth
  // so the world can be reviewed at midday and at golden hour, not just the
  // one baked angle). Declared with the camera like cameraDirection above:
  // the dev hooks that call it (__syncMaterialSettings) can be invoked from
  // capture tooling during the long texture-load awaits further down, which
  // previously put the call inside sunOffset's temporal dead zone.
  const SUN_DIST = 290;
  const sunOffset = new THREE.Vector3();
  // This frame's interact probe, shared by missions.update and the HUD
  // prompt. Reset to null each frame on the non-playing branch so a stale
  // target can never be read.
  let liveInteract = null;
  input = createInput(renderer.domElement, {
    isBlocked: () => debugBlocksGame(debug.isOpen())
  });
  const skyRig = createSky(scene);
  await applyHdri(scene, renderer);
  materialGui = createMaterialPanel({
    onSun() {
      updateSunOffset();
    },
    onEnv() {
      syncEnvironmentIntensity(scene);
    },
    onHdri() {
      applyHdri(scene, renderer);
    },
    onFog() {
      if (scene.fog) {
        scene.fog.density = materialSettings.fogDensity;
      }
    },
    onTerrain() {
      syncTerrainUniforms();
    },
    onWalls() {
      syncWallUniforms();
    },
    onWater() {
      syncWaterUniforms();
    },
    onQuality() {
      syncTerrainUniforms();
      rebuildTerrainMaterial();
    }
  });
  materialGui.hide();
  if (isDev) {
    // Handles for scripted capture (scripts/capture-poi.mjs) and the vision
    // audit loop: mutate the settings object, then re-apply.
    // The clock every capture is taken at. Changing it changes every graded
    // frame, so it is a constant, not a knob.
    const CAPTURE_CLOCK = 12.0;
    window.__materialSettings = materialSettings;
    window.__POS = POS;
    window.__heightAt = heightAt;
    /**
     * The canonical aperture inventory (src/buildings/apertures.js), re-derived
     * after a reset — the same records the deterministic aperture check reads.
     * `__apertureView(id, dist, height)` hands back a capture pose facing the
     * opening from `dist` metres out along its exterior normal, camera at
     * mid-aperture height, so scripts/capture-apertures.mjs frames every door
     * and window by id with no geometry knowledge of its own.
     */
    window.__apertures = () => {
      // No reset here: the world build itself registered the declared gates
      // and facade doors (marking the cache stale), and resetting after that
      // build would wipe DECLARED — the exact geometry-open/physics-shut
      // blindness the check harness hit first. Enumerate is cached; a rebuilt
      // world re-enumerates through resetApertureEnumeration() in tests.
      return enumerateApertures().map((a) => ({
        id: a.id,
        poi: a.poi,
        structure: a.structure,
        side: a.side,
        kind: a.kind,
        state: a.state,
        interior: Boolean(a.structureRef?.userData.habitable),
        note: a.note,
        width: a.width,
        height: a.height,
        fromFloor: a.fromFloor,
        traversable: apertureTraversable(a),
        leaf: a.leaf ? { width: a.leaf.width, height: a.leaf.height, swing: a.leaf.swing } : null,
        glass: a.glass ? { width: a.glass.width, height: a.glass.height } : null,
        center: { x: a.center.x, y: a.center.y, z: a.center.z },
        normal: { x: a.normal.x, y: a.normal.y, z: a.normal.z }
      }));
    };
    /**
     * Read-only footprint test (kit.js `insideStructure`) so probes can ask
     * "physically inside a built structure's yard-excluded footprint?" from
     * the game's own geometry instead of re-deriving walls, for outside
     * invariants after a doorway walk.
     */
    window.__insideStructure = (x, z, pad = 0.5) => insideStructure(x, z, pad);
    window.__apertureView = (id, dist = 5.5, height = null) => {
      const a = enumerateApertures().find((x) => x.id === id);
      if (!a) {
        return null;
      }
      const camY = height ?? a.center.y;
      const px = a.center.x + a.normal.x * dist;
      const pz = a.center.z + a.normal.z * dist;
      const py = Math.max(camY, heightAt(px, pz) + 1.4);
      return {
        px, py, pz,
        tx: a.center.x, ty: a.center.y, tz: a.center.z
      };
    };
    /**
     * Play-probe instrument (scripts/probe-play.mjs). The mission FSM's state
     * and objective as the frame loop last wrote them, plus the player pose —
     * everything a scripted run needs to assert transitions without reading
     * gameplay state out of pixels. Read-only: advancing is only ever done
     * through the real input paths.
     */
    window.__missions = () => ({
      state: missions.serialize(),
      objective: missions.objective(),
      objectivePlace: missions.objectivePlace(
        { x: player.object.position.x, z: player.object.position.z },
        { mode: player.state.mounted ? "horse" : "walk" }
      ),
      player: {
        x: player.object.position.x,
        y: player.object.position.y,
        z: player.object.position.z,
        yaw: player.state.yaw,
        mounted: player.state.mounted
      },
      horse: { x: horse.object.position.x, z: horse.object.position.z },
      place: placeEl.textContent
    });
    /**
     * Magenta ground reference, for the floating-grass question.
     *
     * Six passes argued about whether a blade meets the ground from screenshots
     * alone, which cannot settle it: the ground line is exactly the thing the
     * grass hides. This draws the terrain surface itself - a grid lying on
     * meshHeightAt (the triangulated height the ground mesh actually renders
     * at, not the bilinear approximation) plus a 12 cm vertical pin at every
     * intersection. Depth-tested, so a blade in front of a line hides it. Read
     * it like this: a tuft is seated if its blades cross the magenta line and
     * the pin's foot sits at the blade's base. A gap of bare pin under a blade
     * is the artefact, measurable against the 12 cm pin.
     */
    let groundLines = null;
    window.__groundLines = (on, span = 14, step = 0.5) => {
      if (groundLines) {
        scene.remove(groundLines);
        groundLines.geometry.dispose();
        groundLines.material.dispose();
        groundLines = null;
      }
      if (!on) {
        return;
      }
      const cx = Math.round(camera.position.x / step) * step;
      const cz = Math.round(camera.position.z / step) * step;
      const pts = [];
      const fine = step / 4;
      for (let a = -span; a <= span; a += step) {
        for (let b = -span; b < span; b += fine) {
          // One segment along X at this Z, and one along Z at this X.
          pts.push(cx + b, meshHeightAt(cx + b, cz + a), cz + a);
          pts.push(cx + b + fine, meshHeightAt(cx + b + fine, cz + a), cz + a);
          pts.push(cx + a, meshHeightAt(cx + a, cz + b), cz + b);
          pts.push(cx + a, meshHeightAt(cx + a, cz + b + fine), cz + b + fine);
        }
        for (let b = -span; b <= span; b += step) {
          const y = meshHeightAt(cx + a, cz + b);
          pts.push(cx + a, y, cz + b);
          pts.push(cx + a, y + 0.12, cz + b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      groundLines = new THREE.LineSegments(
        geo,
        new THREE.LineBasicNodeMaterial({ color: 0xff00ff, fog: false })
      );
      groundLines.frustumCulled = false;
      scene.add(groundLines);
    };
    /**
     * The navigation system, drawn on the ground. __groundLines for roads of
     * the mind: dim graph edges everywhere in range, red segments where the
     * failure memory has blacklisted a crossing, an ink disc at every arrival
     * approach, and the current objective's approach in gold with its facing
     * tick — the same answer the HUD line and the minimap diamond give, where
     * a driver can verify it against the terrain. Call again to rebuild after
     * the world or the blacklist changes; `__navOverlay(false)` clears.
     */
    let navOverlay = null;
    window.__navOverlay = (on, { radius = 260 } = {}) => {
      if (navOverlay) {
        scene.remove(navOverlay);
        navOverlay.geometry.dispose();
        navOverlay.material.dispose();
        navOverlay = null;
      }
      if (!on) {
        return;
      }
      const c = camera.position;
      const g = navGraph();
      const y = (x, z) => heightAt(x, z) + 0.25;
      const segs = { edge: [], blocked: [], approach: [], face: [], gold: [] };
      const push = (arr, ax, ay, az, bx, by, bz) => arr.push(ax, ay, az, bx, by, bz);
      for (const e of g.edges) {
        const a = g.nodes[e.a];
        const b = g.nodes[e.b];
        if (Math.hypot((a.x + b.x) / 2 - c.x, (a.z + b.z) / 2 - c.z) > radius) {
          continue;
        }
        push(segs.edge, a.x, y(a.x, a.z), a.z, b.x, y(b.x, b.z), b.z);
      }
      const objective = missions.objectivePlace({ x: c.x, z: c.z }, { mode: "horse" });
      const requiredId = objective && objective.approach ? objective.approach.id : null;
      for (const ap of APPROACHES) {
        if (Math.hypot(ap.x - c.x, ap.z - c.z) > radius) {
          continue;
        }
        const ay = y(ap.x, ap.z);
        for (let i = 0; i < 24; i += 1) {
          const t0 = (i / 24) * Math.PI * 2;
          const t1 = ((i + 1) / 24) * Math.PI * 2;
          const arr = ap.id === requiredId ? segs.gold : segs.approach;
          push(arr, ap.x + Math.cos(t0) * ap.r, ay, ap.z + Math.sin(t0) * ap.r,
            ap.x + Math.cos(t1) * ap.r, ay, ap.z + Math.sin(t1) * ap.r);
        }
        if (typeof ap.face === "number") {
          const hY = headingVector(ap.face);
          push(segs.face, ap.x, ay, ap.z, ap.x + hY.x * 3, ay, ap.z + hY.z * 3);
        }
      }
      for (const rec of blockedEdges()) {
        if (rec.ax === undefined || Math.hypot(rec.ax - c.x, rec.az - c.z) > radius) {
          continue;
        }
        push(segs.blocked, rec.ax, y(rec.ax, rec.az), rec.az, rec.bx, y(rec.bx, rec.bz), rec.bz);
      }
      const pts = [];
      const colors = [];
      const tint = { edge: [0.35, 0.3, 0.24], blocked: [0.75, 0.16, 0.1], approach: [0.2, 0.2, 0.2], face: [0.2, 0.2, 0.2], gold: [0.85, 0.66, 0.2] };
      for (const [name, arr] of Object.entries(segs)) {
        for (const v of arr) {
          pts.push(v);
        }
        for (let i = 0; i < arr.length / 3; i += 1) {
          colors.push(...tint[name]);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      navOverlay = new THREE.LineSegments(
        geo,
        new THREE.LineBasicNodeMaterial({ vertexColors: true, fog: false })
      );
      navOverlay.frustumCulled = false;
      scene.add(navOverlay);
    };
    /**
     * Read-only navigation diagnostics for probes: the build summary, the live
     * edge blacklist, and the route the HUD currently advertises. Nothing here
     * mutates state — the blacklist is only written by the movement paths that
     * prove an edge dead.
     */
    window.__nav = () => ({
      graph: navGraph().diagnostics,
      blocked: blockedEdges().map((rec) => ({ key: rec.key, a: rec.a, b: rec.b, reason: rec.reason, fails: rec.fails })),
      approaches: APPROACHES.length,
      route: (() => {
        const op = missions.objectivePlace({ x: player.object.position.x, z: player.object.position.z },
          { mode: player.state.mounted ? "horse" : "walk" });
        return op && op.route ? { status: op.route.status, length: op.route.length, replans: op.route.replans, waypoints: op.route.waypoints.length } : null;
      })()
    });
    /**
     * The failure memory's only writer: the move that proved an edge dead. The
     * game has no autopilot to walk into walls on the player's behalf, so in
     * shipped play no edge is ever blacklisted by the frame loop — this hook
     * (node ids from __nav's graph diagnostics) is how a scripted run feeds a
     * genuinely impassable crossing back into the search. Next __nav().route
     * reflects the detour or the unreachable verdict.
     */
    window.__navBlockEdge = (a, b, reason = "probe") => markEdgeBlocked(a, b, reason);
    /**
     * The route the HUD would advertise for ANY place (not just the active
     * objective): POI centre, arrival approach, and the planned polyline with
     * the player's live pose as its origin. A probe following these waypoints
     * is verifying the same affordance a player reads off the minimap — the
     * game itself never moves the player.
     */
    window.__navTo = (poiId, mode) => {
      const ap = primaryApproach(poiId);
      if (!ap) {
        return { poiId, status: "no-approach" };
      }
      const m = mode || (player.state.mounted ? "horse" : "walk");
      const route = routeTo(player.object.position.x, player.object.position.z, ap, m);
      return {
        poiId,
        name: POS[poiId] ? POS[poiId].name : poiId,
        x: ap.x,
        z: ap.z,
        r: ap.r,
        type: ap.type,
        route: {
          status: route.status,
          length: route.length,
          waypoints: route.waypoints,
          blocked: route.blocked,
          replans: route.replans
        }
      };
    };
    window.__syncMaterialSettings = () => {
      updateSunOffset();
      syncEnvironmentIntensity(scene);
      applyHdri(scene, renderer);
      if (scene.fog) {
        scene.fog.density = materialSettings.fogDensity;
      }
      syncTerrainUniforms();
      syncWallUniforms();
      syncWaterUniforms();
    };
    // Park the camera at an explicit pose and hide the HUD and player body, so
    // captures frame the subject instead of the back of the player's head.
    window.__captureView = null;
    /**
     * Pin the TSL clock to a fixed value, or hand it back to the renderer.
     *
     * `time` is a uniform whose update callback returns the frame's elapsed
     * time; onUpdate replaces that callback outright, so pinning and restoring
     * are symmetric. Everything animated reads this one node - grass and tree
     * wind, water scroll - so pinning it freezes all of them together.
     */
    window.__pinClock = (t) => {
      if (t === null || t === undefined) {
        time.onRenderUpdate((frame) => frame.time);
        return null;
      }
      time.onRenderUpdate(() => t);
      time.value = t;
      return t;
    };
    window.__captureMode = (on) => {
      const hud = document.getElementById("hud");
      if (hud) {
        hud.style.display = on ? "none" : "";
      }
      if (player && player.object) {
        player.object.visible = !on;
      }
      if (horse && horse.object) {
        horse.object.visible = !on;
      }
      if (!on) {
        window.__captureView = null;
      }
      // Freeze the shader clock while capturing.
      //
      // The audit frames stopped being reproducible on the wind build: a
      // tree-identical re-capture differed by a mean 2.51/255 whole-frame
      // (0.017 on the old renderer), worst in the vegetation-heavy frames and
      // over water. Nothing was non-deterministic in the world - the painters
      // are seeded and the scatter is a pure function of the camera. The
      // shutter was. windBend's sway and gust read `time` (gustFreq 3.2 rad/s,
      // ~0.18 m amplitude) and the water normals scroll on it, so every
      // screenshot caught a different gust phase and a different swell.
      //
      // That noise lands in the grader: pass-96 and pass-97 are the same tree
      // and read 80 and 74. Part of that +-6 is wind-phase pixels rather than
      // grader variance, and the noise floor is what every future change has
      // to clear. Pin the clock and the frames are a function of the scene
      // again.
      //
      // 12.0 rather than 0: at t=0 the sway and gust terms are in phase
      // everywhere, which is a degenerate sample of a field meant to be
      // travelling. Any fixed value works as long as it never changes - it is
      // the pinning that matters, not the number.
      window.__pinClock(on ? CAPTURE_CLOCK : null);
    };
    // True once the amortised ground-cover scatter has caught up with the
    // camera. Capture tooling waits on this: the scatter spans ~73 frames on
    // the high tier, so a screenshot straight after a jump shows the previous
    // location's cover.
    /**
     * The active device profile, and how it was chosen. Capture and benchmark
     * tooling reads this so a number can be attributed to a tier — comparing
     * a `low` frame against a `high` one is otherwise silent nonsense.
     */
    window.__perfProfile = () => ({ ...getProfile(), pixelRatioActual: renderer.getPixelRatio() });
    /**
     * The scene graph and the renderer themselves, for frame-cost attribution:
     * a probe can hide a subtree, drop the shadow pass, or change the pixel
     * ratio and re-time the frame without a rebuild. Dev-only, like everything
     * in this block — a production build never defines them.
     */
    window.__scene = scene;
    window.__renderer = renderer;
    // Report the backend from something minification cannot rewrite.
    //
    // This used to read /webgl/i.test(renderer.backend.constructor.name). A
    // production build mangles class names to two-character identifiers, so
    // that test was false for every build the capture tooling ever looked at
    // and the function answered "webgpu" unconditionally — including in
    // headless Chrome, where requestAdapter() returns null and the renderer is
    // physically running WebGL2. The assertion meant to stop WebGL frames from
    // being graded as a WebGPU pass was instead vouching for them. The
    // WebGPUBackend owns a GPUDevice; the WebGL one does not, and no amount of
    // renaming changes that.
    window.__captureInfo = () => {
      const backend = renderer.backend || {};
      // WebGLBackend holds a WebGL2RenderingContext, WebGPUBackend a GPUDevice.
      // Neither means the renderer has not finished init; say so rather than
      // guessing, so the caller's assertion fails instead of passing blind.
      const isWebGL = backend.gl != null;
      const isWebGPU = !isWebGL && backend.device != null;
      return {
        backend: isWebGL ? "webgl" : isWebGPU ? "webgpu" : "uninitialised",
        adapter: backend.adapter?.info?.description
          || [backend.adapter?.info?.vendor, backend.adapter?.info?.architecture].filter(Boolean).join(" ")
          || (isWebGPU ? "webgpu-no-adapter-info" : "unknown"),
        antialias: true,
        build: import.meta.env.MODE
      };
    };
  }
  let stats = null;
  let infoEl = null;
  let structureLabels = null;
  let planCamera = null;
  if (isDev) {
    stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    infoEl = document.createElement("div");
    infoEl.style.cssText = "position:fixed;left:80px;top:0;color:#7ef;font:11px/1.4 monospace;text-shadow:0 1px 2px #000;pointer-events:none;z-index:10";
    document.body.appendChild(infoEl);
    structureLabels = createStructureLabels();
  }
  const terrainMesh = await createTerrain();
  scene.add(terrainMesh);
  // depthSource: "buffer" (viewportDepthTexture) fails WebGPU bind-group
  // validation under antialias: true — the renderer's MSAA depth attachment
  // doesn't match the single-sample texture three.js allocates for it, so
  // the lake reads no usable depth and renders flat black. "lake" reuses the
  // basin's authored aDepth falloff instead, sidestepping the buffer read.
  createWater(scene, {
    lakeDepthSource: "lake",
    screenRefraction: !forceWebGL,
    fallback: forceWebGL
  });
  await createRoads(scene);
  // Building-surface maps (adobe / wood / roof) must be ready before the
  // statics are built; the builders fall back to flat colours without them.
  const buildingMaps = await loadBuildingMaps();
  // Every structure builder takes a parent and calls .add() on it, so collect
  // them under one group and collapse that to one mesh per material. The town,
  // ranch and outposts are ~670 meshes sharing 16 materials, and 659 of them
  // cast shadows, so they were drawn twice: roughly 1330 of the frame's ~1490
  // draw calls, for about 0.01M triangles. See buildings/mergeStatic.js — the
  // authored meshes are kept and hidden, not discarded, because colliders,
  // anchors, interiors and the look-at overlay all read them.
  const statics = new THREE.Group();
  statics.name = "statics";
  const ranch = createRanch(buildingMaps);
  statics.add(ranch);
  // The spinning windmill fans, collected once.
  //
  // The frame loop used to traverse the WHOLE ranch subtree every frame
  // looking for userData.blades, to animate what turns out to be a single
  // windmill (buildings.js sets it on one mill). The set cannot change after
  // construction, so walking it per frame was pure overhead.
  const spinners = [];
  ranch.traverse((child) => {
    if (child.userData.blades) {
      spinners.push(child.userData.blades);
    }
  });
  createLandmarks(statics, buildingMaps);
  createInteriors(statics);
  createShore(statics, buildingMaps);
  createIndustry(statics, buildingMaps);
  createFort(statics, buildingMaps);
  createPines(statics);
  createHomestead(statics, buildingMaps);
  scene.add(statics);
  if (!window.__skipStaticMerge) {
    scene.add(mergeStatic(statics, "statics-merged"));
  }
  const vegMaps = await loadVegetationMaps();
  const vegetation = createVegetation(scene, vegMaps);
  const smoke = createSmoke(scene);
  player = createPlayer(camera);
  scene.add(player.object);
  horse = createHorse();
  scene.add(horse.object);

  // The nav graph prices every edge against the real world, so it builds
  // once the colliders exist (check-approaches dry-builds in this same
  // order; a graph built before createIndustry would price all its collider
  // passes vacuous and route riders through mill sheds). Sub-50 ms measured,
  // done once here so the first target line already has a route.
  resetNavGraph();
  navGraph();
  linkApproaches(approachLinkRows());

  if (isDev) {
    // Built after the world so it can see every mesh. Also driveable from a
    // capture script: window.__xray(2) for the see-through pass.
    // Vegetation debug hooks live here rather than in the first dev block above
    // because they close over `vegetation`, which does not exist until the
    // texture-load awaits finish. Assigned early they were callable (the capture
    // pipeline polls __vegSettled) while `vegetation` was still in its temporal
    // dead zone, throwing ReferenceError on cold loads.

    /**
     * A magenta pin at each tuft's own footing.
     *
     * The grid version of this cannot settle the question it was built for.
     * At eye level, a ground line ten metres out sits HIGHER in the frame
     * than one two metres out, so comparing a blade's base against whichever
     * line happens to be near it in screen space measures perspective, not a
     * gap - which is exactly the mistake that produced a confident "blades
     * hang 5 cm" reading off the grid frame. A pin planted at the tuft's own
     * (x, z) shares its depth, so the comparison is real: the pin's foot is
     * the ground under that tuft, its head is 12 cm above it, and the card's
     * own bottom edge is marked so burial is visible too.
     */
    let grassPins = null;
    window.__grassPins = (on, radius = 12) => {
      if (grassPins) {
        scene.remove(grassPins);
        grassPins.geometry.dispose();
        grassPins.material.dispose();
        grassPins = null;
      }
      if (!on) {
        return;
      }
      const pts = [];
      for (const [x, cardBottomY, z] of vegetation.grassPositions(camera.position, radius)) {
        const g = meshHeightAt(x, z);
        // Ground to 12 cm: the ruler.
        pts.push(x, g, z, x, g + 0.12, z);
        // A 4 cm cross-bar at the ground line, so the foot is findable when
        // blades cover the pin.
        pts.push(x - 0.02, g, z, x + 0.02, g, z);
        // And a bar at the card's own bottom edge: below the ground line means
        // the card is buried, above it means it is not.
        pts.push(x - 0.02, cardBottomY, z, x + 0.02, cardBottomY, z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      grassPins = new THREE.LineSegments(
        geo,
        new THREE.LineBasicNodeMaterial({ color: 0xff00ff, fog: false })
      );
      grassPins.frustumCulled = false;
      scene.add(grassPins);
    };

    window.__vegSettled = () => vegetation.scatterSettled(camera.position);
    // Where the ground cover is centred, plus the live camera position it is
    // being compared against. The pair is the whole diagnosis when a scatter
    // looks stuck: if they differ by more than REBUILD_STEP and nothing is
    // rebuilding, the frame loop is not running.
    window.__vegCenter = () => ({
      ...vegetation.scatterCenter(),
      camera: { x: camera.position.x, z: camera.position.z }
    });
    window.__grassStats = (radius) => vegetation.grassStats(camera.position, radius);
    window.__grassSpecies = () => vegetation.grassSpecies;
    // __soloGrass("bluestem") plants that species alone; __soloGrass(null)
    // restores the mix. The scatter is amortised, so give it a few seconds
    // (or poll __vegSettled) before judging a frame.
    window.__soloGrass = (name) => vegetation.soloGrass(name, camera.position);
    // __speciesColour(1) floods each blade silhouette with its species colour;
    // (2) draws the card quads solid; (0) restores. Takes effect immediately -
    // it is a uniform, not a rescatter.
    window.__speciesColour = (mode) => vegetation.debugSpeciesColour(mode);
    // Two live toggles for the mid-blade transparent band. __windProfile(1)
    // makes the wind bend linear, which removes the kink at the card's middle
    // vertex row; __grassMips(false) drops the atlas mip chain. Whichever one
    // makes the band go away names the cause.
    window.__windProfile = (exp) => vegetation.debugWindProfile(exp);
    window.__grassShadow = (on) => vegetation.debugGrassShadow(on);
    // __setWind(0, 0) stops the ground cover dead. Amplitude and profile are
    // separate questions: with the amplitude at zero the profile cannot matter,
    // so this isolates "the wind displacement is doing it" from "the shape of
    // the bend is doing it" without the two frames differing in wind phase.
    window.__setWind = (sway, gust) => {
      vegetation.windStrength.value = Number(sway);
      vegetation.gustStrength.value = Number(gust);
      return { sway: vegetation.windStrength.value, gust: vegetation.gustStrength.value };
    };
    window.__grassMips = (on) => vegetation.debugGrassMips(on);
    /**
     * Dump the blade atlas as a PNG data URL - optionally its alpha channel as
     * greyscale, and optionally after N box-filter halvings, which is what the
     * mip chain does. An alpha-tested material draws whatever survives
     * `alpha >= alphaTest` at the mip level the GPU picks, so a band that
     * looks solid in the source art can still be discarded a few levels down.
     */
    window.__dumpGrassAtlas = (opts = {}) => {
      const { alpha = false, mip = 0 } = opts;
      const src = vegetation.grassAtlas;
      if (!src) {
        return null;
      }
      let w = src.width;
      let h = src.height;
      let c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(src, 0, 0);
      for (let i = 0; i < mip; i += 1) {
        const next = document.createElement("canvas");
        next.width = Math.max(1, w >> 1);
        next.height = Math.max(1, h >> 1);
        const nctx = next.getContext("2d");
        nctx.imageSmoothingEnabled = true;
        nctx.drawImage(c, 0, 0, next.width, next.height);
        c = next;
        w = next.width;
        h = next.height;
      }
      if (alpha) {
        const ctx = c.getContext("2d", { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = d[i + 1] = d[i + 2] = d[i + 3];
          d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      }
      return c.toDataURL("image/png");
    };
    /**
     * Where does a blade actually start, inside its atlas panel?
     *
     * The card is seated so its bottom edge is buried, and the painter puts
     * the blade roots 2% up from the panel's bottom - on paper the blades
     * reach the soil. What the card DRAWS is the alpha-tested texture, and
     * alphaTest 0.32 discards every pixel below the threshold, so a blade's
     * tapered root can be cut off well above where it was painted. This scans
     * the atlas the material samples and reports, per panel, the lowest row
     * that survives the alpha test, as a fraction of panel height. Multiply
     * by the card height to get the gap in metres.
     */
    window.__grassAtlasBase = (alphaTest = 0.32) => {
      const src = vegetation.grassAtlas;
      if (!src) {
        return null;
      }
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      const half = src.width / 2;
      const cut = Math.round(alphaTest * 255);
      // Panel names in atlas order: uv [0,0] is the LOWER-left panel because
      // canvas y runs down and v runs up.
      const panels = [
        { name: "blueGrama", ox: 0, oy: half },
        { name: "bunchgrass", ox: half, oy: half },
        { name: "bluestem", ox: 0, oy: 0 },
        { name: "cheatgrass", ox: half, oy: 0 }
      ];
      return panels.map((p) => {
        const d = ctx.getImageData(p.ox, p.oy, half, half).data;
        let lowest = -1;
        let painted = -1;
        for (let row = half - 1; row >= 0 && lowest < 0; row -= 1) {
          for (let col = 0; col < half; col += 1) {
            const a = d[(row * half + col) * 4 + 3];
            if (painted < 0 && a > 0) {
              painted = row;
            }
            if (a >= cut) {
              lowest = row;
              break;
            }
          }
        }
        // Rows from the panel's bottom edge, as a fraction of panel height.
        return {
          panel: p.name,
          paintedBaseFrac: Number(((half - 1 - painted) / half).toFixed(4)),
          alphaTestedBaseFrac: Number(((half - 1 - lowest) / half).toFixed(4))
        };
      });
    };

    const xray = createXray(scene);
    window.__xray = (n) => xray.setMode(n);

    /**
     * Compare each tuft against the terrain AS RENDERED, at its own (x, z).
     *
     * Every grounding check in this repo measures grass against a CPU height
     * function - heightAt, then meshHeightAt - and every one of them has come
     * back clean while the artefact stayed on screen. Both are models of the
     * ground; the renderer draws a mesh. If the drawn mesh dips below the
     * model anywhere (finer subdivision, a different grid, a later edit), the
     * cards are seated on a surface that is not the one you can see, and no
     * amount of checking them against the model will ever say so.
     *
     * This raycasts straight down onto the terrain object itself. `modelError`
     * is meshHeightAt minus the ray hit: positive means the model sits ABOVE
     * the drawn ground, which floats every tuft seated on it. `cardGap` is the
     * card's own bottom edge minus the ray hit: positive is a card hanging in
     * the air, negative is the burial working as intended.
     */
    window.__terrainProbe = (radius = 12) => {
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const modelError = [];
      const cardGap = [];
      let missed = 0;
      for (const [x, cardBottomY, z] of vegetation.grassPositions(camera.position, radius)) {
        ray.set(new THREE.Vector3(x, cardBottomY + 60, z), down);
        const hit = ray.intersectObject(terrainMesh, true)[0];
        if (!hit) {
          missed += 1;
          continue;
        }
        modelError.push(meshHeightAt(x, z) - hit.point.y);
        cardGap.push(cardBottomY - hit.point.y);
      }
      const cm = (arr, q) => {
        if (!arr.length) {
          return null;
        }
        const a = arr.slice().sort((p, q2) => p - q2);
        return Number((a[Math.min(a.length - 1, Math.floor(q * a.length))] * 100).toFixed(2));
      };
      const stats = (arr) => ({
        p05: cm(arr, 0.05), p50: cm(arr, 0.5), p95: cm(arr, 0.95), max: cm(arr, 1)
      });
      return {
        sampled: modelError.length,
        missed,
        modelErrorCm: stats(modelError),
        cardGapCm: stats(cardGap)
      };
    };

    // Orthographic plan view. A perspective overhead shot foreshortens: roofs
    // that merely sit behind one another look interpenetrated, and a facade
    // line that steps in and out looks straight. In an ortho plan a metre is
    // a metre anywhere in frame, so alignment, gaps and overlap can be read
    // off the image instead of guessed at.
    //   window.__planView(120)                centre on the player, 120 m wide
    //   window.__planView(160, x, z)          centre on a point
    //   window.__planView(null)               back to the game camera
    window.__planView = (size, cx, cz) => {
      if (!size) {
        planCamera = null;
        return null;
      }
      const centreX = cx ?? player.object.position.x;
      const centreZ = cz ?? player.object.position.z;
      const aspect = window.innerWidth / window.innerHeight;
      const half = size / 2;
      planCamera = new THREE.OrthographicCamera(
        -half * aspect, half * aspect, half, -half, 0.1, 4000
      );
      planCamera.position.set(centreX, heightAt(centreX, centreZ) + 600, centreZ);
      planCamera.up.set(0, 0, -1);
      planCamera.lookAt(centreX, heightAt(centreX, centreZ), centreZ);
      planCamera.updateProjectionMatrix();
      return { size, centreX, centreZ };
    };
  }

  const npcs = [
    {
      name: "Harlan Calder", x: POS.ranch.x + 4.2, z: POS.ranch.z + 1.2, color: 0x5b3a24,
      line: [
        "Smoke on the north wind. Too early, and too steady.",
        "If you ride, take the trail past the corral and keep the lake on your right."
      ]
    },
    {
      name: "Nell Calder", x: POS.ranch.x + 12.4, z: POS.ranch.z + 16.8, color: 0x7a3b1e,
      line: [
        "Juniper is ready. That smoke is not a trash burn.",
        "We should be on the ridge before Silver Creek writes the story for us."
      ]
    },
    { name: "Wade Calder", x: POS.ranch.x - 28, z: POS.ranch.z + 27.5, color: 0x6a4e32, line: "The Kovacs cousins worked our hay last year. If town starts pointing at charcoal burners, I want a Calder standing in the way of that pointing." }
  ];

  function makeNpc(npc) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.85, 4, 8),
      new THREE.MeshStandardNodeMaterial({ color: npc.color, roughness: 0.8 })
    );
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), new THREE.MeshStandardNodeMaterial({ color: 0xe6d2b0 }));
    head.position.y = 1.68;
    g.add(body, head);
    g.position.set(npc.x, heightAt(npc.x, npc.z), npc.z);
    scene.add(g);
    npc.object = g;
    npc.collider = addCylinderCollider(npc.x, npc.z, 0.45);
  }

  npcs.forEach(makeNpc);

  // Episode 1's smallest loop. The family's dialogue flows through it, so it
  // is created next to them and consulted whenever anyone speaks.
  const missions = createMissions();

  // R2 persistence: the loop reads one save at boot (stage/flags through
  // missions.hydrate, pose restored directly) and autosaves on every stage
  // transition plus on unload. readSave returns null on anything unusable,
  // so a corrupt or foreign-versioned save just boots fresh — the player is
  // never asked to recover anything (pillar P8).
  const saved = readSave();
  const restored = saved && saved.missions ? missions.hydrate(saved.missions) : false;
  // R5: places the player has already stood in. Persisted with the save so
  // "first arrival" means first across the whole run, not first this
  // session — a fanfare replayed for a place the save proves you've been
  // would break acceptance 2. The place you boot into is marked here too
  // (below), so reloading never announces where you already are.
  const visitedPlaces = new Set(
    saved && Array.isArray(saved.visited) ? saved.visited : []
  );
  if (saved && saved.missions && !restored) {
    // Schema-valid but unhydrgatable (a stage this build's mission data no
    // longer contains): say so, then fall through to a fresh story — the
    // player is never asked to recover anything silently.
    console.warn("[save] save carried unusable mission state; starting fresh");
  }
  if (restored) {
    const p = saved.player;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      // resolvePosition keeps a restored pose out of the yard's colliders —
      // the pose was legal when it was saved, geometry may differ now.
      const placed = resolvePosition(p.x, p.z, player.radius);
      player.object.position.set(placed.x, player.object.position.y, placed.z);
      player.groundPlayer();
      if (Number.isFinite(p.yaw)) {
        player.state.yaw = p.yaw;
      }
      player.state.snapCam = true;
    }
    const h = saved.horse;
    if (h && Number.isFinite(h.x) && Number.isFinite(h.z)) {
      const placed = resolvePosition(h.x, h.z, horse.radius);
      horse.object.position.set(placed.x, heightAt(placed.x, placed.z), placed.z);
      horse.collider.x = placed.x;
      horse.collider.z = placed.z;
      horse.mounted = false;
      horse.collider.radius = horse.radius;
    }
  }

  // Whichever place the player boots into — the fresh-game ranch or a
  // restored pose anywhere on the map — is where they already are, not a
  // place they just arrived at. Seed it as visited so the first frame
  // doesn't announce it; the next genuinely new place still gets its
  // arrival.
  const bootPlace = placeAt(player.object.position.x, player.object.position.z);
  if (bootPlace) {
    visitedPlaces.add(bootPlace.id);
  }

  /**
   * R5: "Arrival at a place is an event." A small, non-blocking flourish on
   * the place label the first time the player stands in each POS region:
   * the label pulses gold and a "· first visit" note fades in beside it,
   * then both quiet down. Deliberately NOT the toast lane — missions own
   * that, and an arrival should never cover up a line of dialogue.
   */
  let arrivalTimer = null;
  function announceArrival(place) {
    placeEl.classList.remove("first");
    void placeEl.offsetWidth; // retrigger the pulse on back-to-back firsts
    placeEl.classList.add("first");
    placeNoteEl.classList.remove("hidden");
    clearTimeout(arrivalTimer);
    arrivalTimer = setTimeout(() => {
      placeEl.classList.remove("first");
      placeNoteEl.classList.add("hidden");
    }, 4200);
  }

  function snapshot() {
    return {
      missions: missions.serialize(),
      visited: [...visitedPlaces],
      // `mounted` is deliberately absent: a reload always returns you to
      // standing beside your saved spot, on foot, horse parked where it was —
      // remounting is one E press, and a mounted restore would have to solve
      // the dismount-placement problem from inside boot.
      player: {
        x: player.object.position.x,
        y: player.object.position.y,
        z: player.object.position.z,
        yaw: player.state.yaw
      },
      horse: {
        x: horse.object.position.x,
        z: horse.object.position.z
      }
    };
  }
  function autosave() {
    writeSave(snapshot());
  }
  window.addEventListener("beforeunload", autosave);

  let toastTimer = null;
  function showToast(text) {
    if (!text) {
      return;
    }
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4600);
  }

  function setObjective(text) {
    if (objectiveEl.textContent === text) {
      return;
    }
    objectiveEl.textContent = text;
    objectiveEl.classList.remove("updated");
    // Restart the pulse animation for the new wording.
    void objectiveEl.offsetWidth;
    objectiveEl.classList.add("updated");
  }

  // Compass words for the target line, clockwise from north (-Z).
  const BEARING_WORDS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  function bearingWord(dx, dz) {
    const a = Math.atan2(dx, -dz);
    const i = Math.round(a / (Math.PI / 4));
    return BEARING_WORDS[((i % 8) + 8) % 8];
  }

  /**
   * The destination line under the objective plus the chart marker: the two
   * findability surfaces for the active objective. Computed live from the
   * mission's resolved place so the numbers always describe where the loop
   * currently wants you, not a cached position.
   *
   * The range and the bearing read to the APPROACH, not the centre — the
   * line's number must agree with what a player can close (five metres from
   * a lakebed centre is not five metres from the lake). `via the <type>` is
   * the two-stage navigation sentence: it says where the arrival happens, so
   * "Ranch overlook · via the vantage" tells you the ride ends at the
   * facing-ground, not on some mathematical point on the ridge.
   */
  const VIA_WORDS = {
    yard: "the yard",
    gate: "the gate",
    street: "the main street",
    dock: "the shore",
    door: "the door",
    porch: "the porch",
    hitch: "the hitching rail",
    camp: "the camp",
    trailhead: "the trailhead",
    overlook: "the vantage"
  };
  function updateTargetLine(px, pz) {
    const pose = { x: px, z: pz, mode: player.state.mounted ? "horse" : "walk" };
    const op = started ? missions.objectivePlace(pose, { mode: pose.mode }) : null;
    minimap.setObjective(op);
    const dest = op && op.approach ? op.approach : op;
    let text = "";
    if (op) {
      const range = Math.round(Math.hypot(dest.x - px, dest.z - pz) / 10) * 10;
      text = `${op.name} · ${range} m ${bearingWord(dest.x - px, dest.z - pz)}`;
      if (op.approach && VIA_WORDS[op.approach.type]) {
        text += ` · via ${VIA_WORDS[op.approach.type]}`;
      }
    }
    if (targetEl.textContent !== text) {
      targetEl.textContent = text;
    }
  }

  function setTitleCamera() {
    const r = POS.ranch;
    camera.position.set(r.x - 72, heightAt(r.x - 72, r.z + 95) + 18, r.z + 95);
    camera.lookAt(r.x + 2, heightAt(r.x + 2, r.z - 6) + 5, r.z - 6);
  }

  setTitleCamera();
  const timer = new THREE.Timer();
  timer.connect(document);

  function nearestInteract() {
    const p = player.object.position;
    if (player.state.mounted) {
      return { kind: "dismount", label: "E — Dismount" };
    }
    // People outrank parked horses: Juniper stands ~4 m from Nell in the
    // yard, so a horse-first check made her unaddressable from the house
    // side — "Mount Juniper" instead of "Talk to Nell" at her range.
    let best = null;
    let bestD = 3.4;
    for (const npc of npcs) {
      const d = p.distanceTo(npc.object.position);
      if (d < bestD) {
        bestD = d;
        best = { kind: "talk", npc, label: `E — Talk to ${npc.name}` };
      }
    }
    if (best) {
      return best;
    }
    const examine = missions.examineAt(p.x, p.z);
    if (examine) {
      return { kind: "examine", examine, label: examine.label };
    }
    if (p.distanceTo(horse.object.position) < 3.2) {
      return { kind: "horse", label: "E — Mount Juniper" };
    }
    return null;
  }

  function setPrompt(text) {
    // Clear the text when hiding: a hidden element with stale text read as a
    // live interaction affordance to scripted players (probe-travel), and a
    // stale visible prompt can outlive its target by one frame at low fps.
    if (!text) {
      promptEl.textContent = "";
      promptEl.classList.add("hidden");
      return;
    }
    promptEl.textContent = text;
    promptEl.classList.remove("hidden");
  }

  /**
   * Open a conversation or a reading. `talking` is {name, lines, index, npc?}
   * either way: dialogue and examine readings advance the same way, and
   * reaching the end of the lines is what completes a mission stage.
   */
  function openTalk(npc) {
    input.clear();
    talking = { npc, lines: missions.dialogueFor(npc), index: 0, kind: "talk" };
    speakerEl.textContent = npc.name;
    bodyEl.textContent = talking.lines[0];
    dialogueEl.classList.remove("hidden");
  }

  function openReading(examine) {
    input.clear();
    talking = { lines: examine.lines, index: 0, kind: "examine", examine };
    speakerEl.textContent = examine.speaker;
    bodyEl.textContent = talking.lines[0];
    dialogueEl.classList.remove("hidden");
  }

  /**
   * Advance the open dialogue by one line; completing it is what tells the
   * mission the conversation happened. Returns true while more lines remain.
   */
  function advanceTalk() {
    if (!talking) {
      return false;
    }
    talking.index += 1;
    if (talking.index < talking.lines.length) {
      bodyEl.textContent = talking.lines[talking.index];
      return true;
    }
    const { kind, npc, examine } = talking;
    talking = null;
    dialogueEl.classList.add("hidden");
    const ev = examine ? missions.onExamined(examine) : missions.onTalk(npc.name);
    if (ev && ev.toast) {
      showToast(ev.toast);
    }
    // Stage transitions that arrive through dialogue do not all produce an
    // event worth a toast, so the autosave beat cannot key off one. A
    // completed conversation is the moment progress can have moved; save here.
    autosave();
    if (started && !debug.isOpen()) {
      // Best-effort: Chromium rejects re-locking when no fresh gesture backs
      // the request (WrongDocumentError in scripted runs, a silent refusal
      // after some real inputs) — the canvas click listener re-locks, so a
      // failed re-settle just means one extra click, never a broken input.
      try {
        const lock = renderer.domElement.requestPointerLock();
        if (lock && typeof lock.catch === "function") {
          lock.catch(() => {});
        }
      } catch {
        // the canvas click path recovers
      }
    }
    return false;
  }

  function use() {
    const target = nearestInteract();
    if (!target) {
      return;
    }
    if (target.kind === "horse") {
      player.state.mounted = true;
      horse.mounted = true;
      horse.collider.radius = 0.05;
      player.state.snapCam = true;
      return;
    }
    if (target.kind === "dismount") {
      player.state.mounted = false;
      horse.mounted = false;
      horse.collider.radius = horse.radius;
      horse.collider.x = horse.object.position.x;
      horse.collider.z = horse.object.position.z;
      const yaw = player.state.yaw;
      const side = { x: Math.cos(yaw), z: Math.sin(yaw) };
      let placed = resolvePosition(
        horse.object.position.x + side.x * 1.7,
        horse.object.position.z + side.z * 1.7,
        player.radius
      );
      const tooClose = Math.hypot(placed.x - horse.object.position.x, placed.z - horse.object.position.z) < 1.2;
      if (tooClose) {
        placed = resolvePosition(
          horse.object.position.x - side.x * 1.7,
          horse.object.position.z - side.z * 1.7,
          player.radius
        );
      }
      player.object.position.x = placed.x;
      player.object.position.z = placed.z;
      player.groundPlayer();
      player.state.snapCam = true;
      return;
    }
    if (target.kind === "examine") {
      openReading(target.examine);
      return;
    }
    if (target.kind === "talk") {
      openTalk(target.npc);
    }
  }

  enterBtn.addEventListener("click", () => {
    titleEl.classList.add("hidden");
    started = true;
    player.state.snapCam = true;
    minimap.show();
    // Synthetic/dispatched clicks cannot back a pointer-lock request; a real
    // click on the canvas re-locks, so swallowing the refusal is correct.
    try {
      const lock = renderer.domElement.requestPointerLock();
      if (lock && typeof lock.catch === "function") {
        lock.catch(() => {});
      }
    } catch {
      // click-to-lock on the canvas recovers
    }
  });

  renderer.domElement.addEventListener("click", () => {
    if (!started) {
      return;
    }
    if (debug.isOpen()) {
      return;
    }
    if (talking) {
      advanceTalk();
      return;
    }
    try {
      const lock = renderer.domElement.requestPointerLock();
      if (lock && typeof lock.catch === "function") {
        lock.catch(() => {});
      }
    } catch {
      // Chromium refuses to lock in some scripted/browser states; the next
      // real click or the right-drag look path still work.
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Sun direction comes from the panel's elevation/azimuth so the world can be
  // reviewed at midday and at golden hour, not just the one baked angle.
  function updateSunOffset() {
    const elev = materialSettings.sunElevation * (Math.PI / 180);
    const azim = materialSettings.sunAzimuth * (Math.PI / 180);
    sunOffset.set(
      Math.cos(elev) * Math.sin(azim) * SUN_DIST,
      Math.sin(elev) * SUN_DIST,
      Math.cos(elev) * Math.cos(azim) * SUN_DIST
    );
    // Warmer and dimmer as the sun drops toward the horizon.
    const low = Math.max(0, 1 - materialSettings.sunElevation / 30);
    skyRig.sun.color.setRGB(1, 0.88 - low * 0.16, 0.69 - low * 0.28);
    // Golden-hour sun is dimmed as it drops (warm, low), but the golden HDRI
    // fill is 1.85x — the HARD_WON 1.4 fix — and together they washed the
    // directional shadows out (audit U5 at golden). Keep the warm dimming but
    // give the low sun more direct weight so shadows read against the fill.
    skyRig.sun.intensity = materialSettings.sunIntensity * (0.85 + 0.15 * Math.min(1, materialSettings.sunElevation / 32));
    // The dome reads the same elevation: gradient stops, cloud/halo warmth,
    // and the fog colour the distant terrain fades into.
    skyRig.updateSun(materialSettings.sunElevation, sunOffset);
    skyRig.cover.value = materialSettings.cloudCover;
    skyRig.cloudScale.value = materialSettings.cloudScale;
    skyRig.cloudWarpX.value = materialSettings.cloudWarpX;
    skyRig.cloudWarpY.value = materialSettings.cloudWarpY;
    skyRig.cloudDetailBias.value = materialSettings.cloudDetailBias;
    skyRig.cloudBoundK.value = materialSettings.cloudBoundK;
  }
  updateSunOffset();

  const shadowAnchor = new THREE.Vector3();
  function followLight() {
    const captureView = isDev ? window.__captureView : null;
    if (captureView) {
      shadowAnchor.set(captureView.tx, captureView.ty, captureView.tz);
    } else {
      camera.getWorldDirection(cameraDirection);
      shadowAnchor.copy(camera.position).addScaledVector(cameraDirection, 30);
      shadowAnchor.y = heightAt(shadowAnchor.x, shadowAnchor.z);
    }
    skyRig.sun.position.set(
      shadowAnchor.x + sunOffset.x,
      shadowAnchor.y + sunOffset.y,
      shadowAnchor.z + sunOffset.z
    );
    skyRig.sun.target.position.copy(shadowAnchor);
    skyRig.sun.target.updateMatrixWorld();
    skyRig.sky.position.copy(camera.position);
    skyRig.sunMesh.position.set(
      shadowAnchor.x + sunOffset.x * 3.2,
      shadowAnchor.y + sunOffset.y * 3.2,
      shadowAnchor.z + sunOffset.z * 3.2
    );
  }

  function frame(timestamp) {
    timer.update(timestamp);
    const dt = Math.min(0.05, timer.getDelta());
    const elapsed = timer.getElapsed();
    for (let i = 0; i < spinners.length; i += 1) {
      spinners[i].rotation.z += dt * 0.6;
    }
    // Drift each puff around where createSmoke placed it. This used to derive
    // the position from the child index instead — y = burnY + 12 + i * 7,
    // z = burn.z + i * 2 — which threw the layout away every frame and strung
    // the puffs into a diagonal line climbing to 425 m and 106 m downrange.
    // That is the "puffs float detached in the sky" the burn audit kept
    // reporting: createSmoke had been rebuilt twice to fix it, and this
    // silently overrode it both times.
    smoke.children.forEach((puff) => {
      const home = puff.userData.home;
      if (!home) {
        return;
      }
      const phase = puff.userData.phase || 0;
      const rise = puff.userData.rise || 0;
      // Higher puffs have lost the column's momentum, so they wander more.
      const wander = 0.35 + rise * 2.2;
      puff.position.set(
        home.x + Math.sin(elapsed * 0.33 + phase) * wander,
        home.y + Math.sin(elapsed * 0.5 + phase * 0.7) * (0.25 + rise * 0.9),
        home.z + Math.cos(elapsed * 0.27 + phase * 1.3) * wander
      );
    });

    liveInteract = null;
    if (started && !talking && !debug.isOpen()) {
      player.update(dt, input, horse);
      // Arrival stages complete by proximity the instant you stand in them.
      // The autosave keys off the stage delta, not off the event: an arrival
      // whose next stage carries no entrance event legitimately returns null.
      const stageAtFrameStart = missions.state.stage;
      // One interact probe per frame, shared with the HUD prompt below.
      // nearestInteract walks every NPC with a distanceTo (a sqrt each) and
      // then queries missions.examineAt; it used to run twice a frame for the
      // two consumers. Computed here, AFTER player.update has moved the
      // player, so it reflects this frame's position.
      liveInteract = nearestInteract();
      const missionEv = missions.update(
        player.object.position.x,
        player.object.position.z,
        { mode: player.state.mounted ? "horse" : "walk", interact: liveInteract ? liveInteract.kind : null }
      );
      if (missionEv && missionEv.toast) {
        showToast(missionEv.toast);
      }
      if (missions.state.stage !== stageAtFrameStart) {
        autosave();
      }
      if (!player.state.mounted) {
        horse.object.position.y = heightAt(horse.object.position.x, horse.object.position.z);
        horse.collider.x = horse.object.position.x;
        horse.collider.z = horse.object.position.z;
        horse.collider.radius = horse.radius;
      }
      if (player.state.mode !== "fly" && input.consume("useTap")) {
        use();
      }
      if (input.consume("mapTap")) {
        minimap.toggleSize();
      }
    } else if (talking && !debug.isOpen() && input.consume("useTap")) {
      advanceTalk();
    }

    // Place label plus the R5 first-arrival flourish. placeAt and
    // placeLabel read the same table, so the fanfare and the name never
    // disagree about which place the player is in.
    const curPlace = placeAt(player.object.position.x, player.object.position.z);
    placeEl.textContent = curPlace
      ? curPlace.name
      : placeLabel(player.object.position.x, player.object.position.z);
    if (curPlace && !visitedPlaces.has(curPlace.id)) {
      visitedPlaces.add(curPlace.id);
      announceArrival(curPlace);
    }
    if (started) {
      setObjective(missions.objective());
    }
    updateTargetLine(player.object.position.x, player.object.position.z);
    minimap.update(player.object.position.x, player.object.position.z, player.state.yaw);
    debug.update(player);
    if (structureLabels) {
      camera.getWorldDirection(cameraDirection);
      structureLabels.update(
        camera,
        STRUCTURES,
        lookingAtStructure(STRUCTURES, camera.position, cameraDirection)
      );
    }
    hintEl.textContent = player.state.mode === "fly"
      ? "Fly · WASD · Space up · Ctrl/Q down · Shift fast · F land · [ ] speed · M map · wheel map zoom"
      : player.state.mounted
        ? "Horseback · WASD ride · Shift gallop · C camera · E dismount · M map · wheel map zoom"
        : player.state.mode === "first"
          ? "First person · WASD · Shift sprint · C third person · E interact · M map · F fly · wheel map zoom"
          : "Third person · WASD · Shift sprint · C first person · E interact · M map · F fly · wheel map zoom";

    // The probe above only runs on the playing branch. When the game is
    // paused, in dialogue, or the debug panel is open, the prompt is blank
    // anyway — so there is nothing to recompute, and a stale probe is never
    // read. Clearing it keeps that guarantee explicit rather than incidental.
    const target = liveInteract;
    setPrompt(talking || player.state.mode === "fly" ? "" : (target ? target.label : ""));

    const view = isDev ? window.__captureView : null;
    if (view) {
      camera.position.set(view.px, view.py, view.pz);
      camera.lookAt(view.tx, view.ty, view.tz);
    }
    followLight();
    vegetation.update(camera.position);
    renderer.render(scene, planCamera || camera);
    if (stats) {
      stats.update();
      const r = renderer.info.render;
      const m = renderer.info.memory;
      infoEl.textContent =
        `draws ${r.drawCalls} · tris ${(r.triangles / 1e6).toFixed(2)}M · ` +
        `tex ${m.textures} · mem ${(m.texturesSize / 1024 / 1024).toFixed(0)}MB · ` +
        `${profile.name}${profile.auto ? "" : "*"} @${renderer.getPixelRatio()}x`;
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
