/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Append ?webgl to the URL to force the WebGL2 backend.
 */
import * as THREE from "three/webgpu";
import { createInput } from "./input.js";
import { heightAt } from "./world.js";
import { createTerrain, createSky, rebuildTerrainMaterial } from "./environment.js";
import { createRanch } from "./buildings.js";
import { mergeStatic } from "./buildings/mergeStatic.js";
import { createLandmarks, createWater } from "./landmarks.js";
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
    window.__captureInfo = () => {
      const backendName = renderer.backend?.constructor?.name || "";
      return {
        backend: forceWebGL || /webgl/i.test(backendName) ? "webgl" : "webgpu",
        adapter: renderer.backend?.adapter?.info?.description || backendName || "unknown",
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
  scene.add(await createTerrain());
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
  // Every structure builder takes a parent and calls .add() on it, so collect
  // them under one group and collapse that to one mesh per material. The town,
  // ranch and outposts are ~670 meshes sharing 16 materials, and 659 of them
  // cast shadows, so they were drawn twice: roughly 1330 of the frame's ~1490
  // draw calls, for about 0.01M triangles. See buildings/mergeStatic.js — the
  // authored meshes are kept and hidden, not discarded, because colliders,
  // anchors, interiors and the look-at overlay all read them.
  const statics = new THREE.Group();
  statics.name = "statics";
  const ranch = createRanch();
  statics.add(ranch);
  createLandmarks(statics);
  createInteriors(statics);
  createShore(statics);
  createIndustry(statics);
  createFort(statics);
  createPines(statics);
  createHomestead(statics);
  scene.add(statics);
  scene.add(mergeStatic(statics, "statics-merged"));
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
    skyRig.sun.intensity = materialSettings.sunIntensity * (0.55 + 0.45 * Math.min(1, materialSettings.sunElevation / 32));
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
    const burn = POS.burn;
    const burnY = heightAt(burn.x, burn.z);
    smoke.children.forEach((puff, i) => {
      puff.position.y = burnY + 12 + i * 7 + Math.sin(elapsed * 0.4 + i) * 1.5;
      puff.position.x = burn.x + Math.sin(elapsed * 0.2 + i) * 2;
      puff.position.z = burn.z + i * 2;
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
