/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Append ?webgl to the URL to force the WebGL2 backend.
 */
import * as THREE from "three/webgpu";
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
import { POS, placeLabel } from "./map.js";
import { createMinimap } from "./minimap.js";
import { createDebug, debugBlocksGame } from "./debug.js";
import { STRUCTURES } from "./buildings/kit.js";
import { lookingAtStructure } from "./buildings/lookingAt.js";
import { createStructureLabels } from "./dev/structureLabels.js";
import { createXray } from "./dev/xray.js";
import { createKtx2Loader } from "./materials/ktx2.js";
import { applyHdri, syncEnvironmentIntensity } from "./materials/hdri.ts";
import { materialSettings } from "./materials/settings.ts";
import { syncTerrainUniforms } from "./materials/terrainMaterial.ts";
import { syncWaterUniforms } from "./materials/waterMaterial.ts";
import { bootMaterialLab } from "./dev/MaterialLab.ts";
import { createMaterialPanel } from "./dev/panel.ts";
import Stats from "stats.js";

const placeEl = document.getElementById("hud-place");
const hintEl = document.getElementById("hud-hint");
const promptEl = document.getElementById("prompt");
const dialogueEl = document.getElementById("dialogue");
const speakerEl = document.getElementById("dialogue-speaker");
const bodyEl = document.getElementById("dialogue-body");
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

async function boot() {
  const forceWebGL = new URLSearchParams(window.location.search).has("webgl");
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: "high-performance",
    forceWebGL
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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
    window.__materialSettings = materialSettings;
    window.__POS = POS;
    window.__heightAt = heightAt;
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
    window.__syncMaterialSettings = () => {
      updateSunOffset();
      syncEnvironmentIntensity(scene);
      applyHdri(scene, renderer);
      if (scene.fog) {
        scene.fog.density = materialSettings.fogDensity;
      }
      syncTerrainUniforms();
      syncWaterUniforms();
    };
    // Park the camera at an explicit pose and hide the HUD and player body, so
    // captures frame the subject instead of the back of the player's head.
    window.__captureView = null;
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
    };
    // True once the amortised ground-cover scatter has caught up with the
    // camera. Capture tooling waits on this: the scatter takes ~55 frames, so
    // a screenshot straight after a jump shows the previous location's cover.
    window.__vegSettled = () => vegetation.scatterSettled(camera.position);
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

  if (isDev) {
    // Built after the world so it can see every mesh. Also driveable from a
    // capture script: window.__xray(2) for the see-through pass.
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
    { name: "Harlan Calder", x: POS.ranch.x + 4.2, z: POS.ranch.z + 1.2, color: 0x5b3a24, line: "Smoke on the north wind. Too early, and too steady. If you ride, take the trail past the corral and keep the lake on your right." },
    { name: "Nell Calder", x: POS.ranch.x + 12.4, z: POS.ranch.z + 16.8, color: 0x7a3b1e, line: "Juniper is ready. That smoke is not a trash burn. We should be on the ridge before Silver Creek writes the story for us." },
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
    const horseDist = p.distanceTo(horse.object.position);
    if (!player.state.mounted && horseDist < 3.2) {
      return { kind: "horse", label: "E — Mount Juniper" };
    }
    if (player.state.mounted) {
      return { kind: "dismount", label: "E — Dismount" };
    }
    let best = null;
    let bestD = 3.4;
    for (const npc of npcs) {
      const d = p.distanceTo(npc.object.position);
      if (d < bestD) {
        bestD = d;
        best = { kind: "talk", npc, label: `E — Talk to ${npc.name}` };
      }
    }
    return best;
  }

  function setPrompt(text) {
    if (!text) {
      promptEl.classList.add("hidden");
      return;
    }
    promptEl.textContent = text;
    promptEl.classList.remove("hidden");
  }

  function openTalk(npc) {
    talking = npc;
    input.clear();
    speakerEl.textContent = npc.name;
    bodyEl.textContent = npc.line;
    dialogueEl.classList.remove("hidden");
  }

  function closeTalk() {
    talking = null;
    dialogueEl.classList.add("hidden");
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
    if (target.kind === "talk") {
      openTalk(target.npc);
    }
  }

  enterBtn.addEventListener("click", () => {
    titleEl.classList.add("hidden");
    started = true;
    player.state.snapCam = true;
    minimap.show();
    renderer.domElement.requestPointerLock();
  });

  renderer.domElement.addEventListener("click", () => {
    if (!started) {
      return;
    }
    if (debug.isOpen()) {
      return;
    }
    if (talking) {
      closeTalk();
      return;
    }
    renderer.domElement.requestPointerLock();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Sun direction comes from the panel's elevation/azimuth so the world can be
  // reviewed at midday and at golden hour, not just the one baked angle.
  const SUN_DIST = 290;
  const sunOffset = new THREE.Vector3();
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
  }
  updateSunOffset();

  const shadowAnchor = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
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
    ranch.traverse((child) => {
      if (child.userData.blades) {
        child.userData.blades.rotation.z += dt * 0.6;
      }
    });
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

    if (started && !talking && !debug.isOpen()) {
      player.update(dt, input, horse);
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
      closeTalk();
    }

    placeEl.textContent = placeLabel(player.object.position.x, player.object.position.z);
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

    const target = nearestInteract();
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
        `tex ${m.textures} · mem ${(m.texturesSize / 1024 / 1024).toFixed(0)}MB`;
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
