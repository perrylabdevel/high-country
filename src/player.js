import * as THREE from "three/webgpu";
import { heightAt, normalAt } from "./world.js";
import { moveAndSlide, cameraClearance, deckHeightAt } from "./collision.js";
import { POS, clampWorld, headingVector } from "./map.js";
import { tune } from "./debug.js";
import { interiorCeilingAt } from "./buildings/kit.js";

const PLAYER_RADIUS = 0.42;
const EYE = 1.62;
const MOUNT_EYE = 1.35;
const LOOK_SENS = 0.0024;
const AIM_DIST = 14;
const STEP_DOWN = 1.4;

/**
 * The surface the player stands on: terrain, or a raised deck when one is
 * within stepping range overhead.
 *
 * Grounding was straight heightAt(), so bridges and boardwalks were scenery you
 * walked through at terrain level. STEP_DOWN doubles as the climb limit, so you
 * can step up onto a deck you could step down off, and walking the creek bed
 * under a bridge keeps you on the creek bed.
 */
function walkSurface(x, z, fromY) {
  return Math.max(heightAt(x, z), deckHeightAt(x, z, fromY, STEP_DOWN));
}
const CAM_Y_FOOT = 5.2;
const CAM_Y_MOUNT = 3.6;
const CAM_XZ = 11;
const WALK_PITCH_MIN = -1.15;
const WALK_PITCH_MAX = 0.72;
const FLY_PITCH_MIN = -1.54;
const FLY_PITCH_MAX = 1.54;
const FLY_CRUISE = 70;
const FLY_FAST = 260;
const FLY_CEILING = 4200;
const CAM_NEAR = 0.12;
const CAM_FAR = 7500;
const FLY_FAR = 14000;

export function createPlayer(camera) {
  const object = new THREE.Group();
  object.position.set(POS.ranch.x + 6, heightAt(POS.ranch.x + 6, POS.ranch.z + 18), POS.ranch.z + 18);

  const body = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.9, 4, 8),
    new THREE.MeshStandardNodeMaterial({ color: 0x6b4226, roughness: 0.8 })
  );
  torso.position.y = 0.95;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 10),
    new THREE.MeshStandardNodeMaterial({ color: 0xe6d2b0 })
  );
  head.position.y = 1.72;
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.12, 12),
    new THREE.MeshStandardNodeMaterial({ color: 0x3d2918 })
  );
  hat.position.y = 1.9;
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12),
    new THREE.MeshStandardNodeMaterial({ color: 0x3d2918 })
  );
  brim.position.y = 1.84;
  body.add(torso, head, hat, brim);
  object.add(body);

  const state = {
    // Spawn looking at the ranch porch, which sits toward -Z from the spawn point.
    yaw: 0,
    pitch: 0.06,
    vy: 0,
    grounded: true,
    mode: "third",
    returnMode: "third",
    mounted: false,
    speed: 0,
    snapCam: true,
    flyAlt: 0
  };

  const camTarget = new THREE.Vector3();
  const desiredCam = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const flyLook = new THREE.Vector3();

  function groundPlayer() {
    object.position.y = walkSurface(object.position.x, object.position.z, object.position.y);
  }

  function setFacing(yaw) {
    const f = headingVector(yaw);
    forward.set(f.x, 0, f.z);
    // Camera-right for lookAt: forward × up. Matches Three.js local +X.
    right.set(Math.cos(yaw), 0, Math.sin(yaw));
  }

  function aimPoint(originX, eyeY, originZ) {
    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const f = headingVector(state.yaw);
    return camTarget.set(
      originX + f.x * cp * AIM_DIST,
      eyeY + sp * AIM_DIST,
      originZ + f.z * cp * AIM_DIST
    );
  }

  function restoreClip() {
    camera.near = CAM_NEAR;
    camera.far = CAM_FAR;
    camera.updateProjectionMatrix();
  }

  function enterFly(horse) {
    if (state.mode !== "fly") {
      state.returnMode = state.mode;
    }
    if (horse) {
      horse.mounted = false;
    }
    state.mounted = false;
    state.mode = "fly";
    state.vy = 0;
    state.grounded = true;
    state.speed = 0;
    body.visible = false;
    camera.position.y += 14;
    camera.far = FLY_FAR;
    camera.updateProjectionMatrix();
  }

  function exitFly() {
    const held = clampWorld(camera.position.x, camera.position.z);
    object.position.x = held.x;
    object.position.z = held.z;
    groundPlayer();
    state.mode = state.returnMode === "first" ? "first" : "third";
    state.pitch = Math.max(WALK_PITCH_MIN, Math.min(WALK_PITCH_MAX, state.pitch));
    state.snapCam = true;
    state.flyAlt = 0;
    restoreClip();
  }

  function toggleFly(horse) {
    if (state.mode === "fly") {
      exitFly();
    } else {
      enterFly(horse);
    }
  }

  function updateFly(dt, input) {
    const look = input.readLook();
    const lookScale = LOOK_SENS * tune.look;
    state.yaw += look.x * lookScale;
    state.pitch -= look.y * lookScale;
    state.pitch = Math.max(FLY_PITCH_MIN, Math.min(FLY_PITCH_MAX, state.pitch));
    setFacing(state.yaw);

    const cp = Math.cos(state.pitch);
    const sp = Math.sin(state.pitch);
    const f = headingVector(state.yaw);
    flyLook.set(f.x * cp, sp, f.z * cp);

    wish.set(0, 0, 0);
    if (input.held("forward")) wish.add(flyLook);
    if (input.held("back")) wish.sub(flyLook);
    if (input.held("left")) wish.sub(right);
    if (input.held("right")) wish.add(right);
    if (input.held("jump")) wish.y += 1;
    if (input.held("down")) wish.y -= 1;
    input.consume("jumpTap");
    if (wish.lengthSq() > 0) {
      wish.normalize();
    }

    const max = (input.held("sprint") ? FLY_FAST : FLY_CRUISE) * tune.speed;
    camera.position.addScaledVector(wish, max * dt);
    const held = clampWorld(camera.position.x, camera.position.z);
    camera.position.x = held.x;
    camera.position.z = held.z;
    const floor = heightAt(camera.position.x, camera.position.z) + 1.2;
    camera.position.y = Math.max(floor, Math.min(FLY_CEILING, camera.position.y));

    object.position.x = held.x;
    object.position.z = held.z;
    object.position.y = heightAt(held.x, held.z);
    object.rotation.y = state.yaw;
    body.visible = false;
    state.flyAlt = camera.position.y;

    camera.near = Math.max(0.4, camera.position.y * 0.0015);
    camera.far = FLY_FAR;
    camera.updateProjectionMatrix();
    camera.lookAt(
      camera.position.x + flyLook.x,
      camera.position.y + flyLook.y,
      camera.position.z + flyLook.z
    );
  }

  function update(dt, input, horse) {
    if (input.consume("flyTap")) {
      toggleFly(horse);
    }

    if (state.mode === "fly") {
      updateFly(dt, input);
      return;
    }

    if (input.consume("cameraTap")) {
      state.mode = state.mode === "first" ? "third" : "first";
      state.snapCam = true;
    }

    const look = input.readLook();
    const lookScale = LOOK_SENS * tune.look;
    // Yaw grows north -> east, which is a turn to the right, so mouse-right adds.
    state.yaw += look.x * lookScale;
    state.pitch -= look.y * lookScale;
    state.pitch = Math.max(WALK_PITCH_MIN, Math.min(WALK_PITCH_MAX, state.pitch));
    setFacing(state.yaw);

    if (state.mounted && horse) {
      horse.update(dt, input, state.yaw);
      object.position.copy(horse.object.position);
      object.rotation.y = state.yaw;
      body.visible = state.mode === "third";
    } else {
      wish.set(0, 0, 0);
      if (input.held("forward")) wish.add(forward);
      if (input.held("back")) wish.sub(forward);
      if (input.held("left")) wish.sub(right);
      if (input.held("right")) wish.add(right);
      const moving = wish.lengthSq() > 0;
      if (moving) {
        wish.normalize();
      }
      const max = (input.held("sprint") ? 6.2 : 3.4) * tune.speed;
      const accel = (moving ? 14 : 16) * tune.speed;
      const target = moving ? max : 0;
      state.speed += (target - state.speed) * Math.min(1, accel * dt);
      if (state.speed < 0.05 && !moving) {
        state.speed = 0;
      }

      const step = state.speed * dt;
      const slices = Math.max(1, Math.ceil(Math.abs(step) / 0.55));
      const slice = 1 / slices;
      let held = { x: object.position.x, z: object.position.z };
      for (let i = 0; i < slices; i += 1) {
        const next = moveAndSlide(
          held.x,
          held.z,
          wish.x * step * slice,
          wish.z * step * slice,
          PLAYER_RADIUS,
          null,
          object.position.y
        );
        held = clampWorld(next.x, next.z);
      }

      const ground = walkSurface(held.x, held.z, object.position.y);
      const slope = normalAt(held.x, held.z);
      const tooSteep = slope.y < 0.52 && ground > object.position.y + 0.45;
      if (!tooSteep) {
        object.position.x = held.x;
        object.position.z = held.z;
      }

      if (input.consume("jumpTap") && state.grounded) {
        state.vy = 5.4;
        state.grounded = false;
      }
      const floor = walkSurface(object.position.x, object.position.z, object.position.y);
      if (state.grounded) {
        if (object.position.y - floor <= STEP_DOWN) {
          object.position.y = floor;
          state.vy = 0;
        } else {
          state.grounded = false;
          state.vy -= 18 * dt;
          object.position.y += state.vy * dt;
        }
      } else {
        state.vy -= 18 * dt;
        let y = object.position.y + state.vy * dt;
        if (y <= floor) {
          y = floor;
          state.vy = 0;
          state.grounded = true;
        }
        object.position.y = y;
      }
      object.rotation.y = state.yaw;
      body.visible = state.mode === "third";
    }

    const feetY = object.position.y;
    const eyeY = feetY + (state.mounted ? MOUNT_EYE + 1.05 : EYE);
    const originX = object.position.x;
    const originZ = object.position.z;
    const ignore = horse ? horse.collider : null;
    const yK = state.mounted ? CAM_Y_MOUNT : CAM_Y_FOOT;

    if (state.mode === "first") {
      if (state.snapCam) {
        camera.position.set(originX, eyeY, originZ);
        state.snapCam = false;
      } else {
        camera.position.x = originX;
        camera.position.z = originZ;
        camera.position.y += (eyeY - camera.position.y) * (1 - Math.exp(-yK * dt));
      }
      camera.lookAt(aimPoint(originX, camera.position.y, originZ));
    } else {
      const dist = state.mounted ? 6.2 : 4.4;
      const height = state.mounted ? 2.05 : 1.42;
      const orbit = Math.max(0.28, Math.cos(state.pitch));
      const shoulder = state.mounted ? 0.4 : 0.62;
      desiredCam.set(
        originX - forward.x * dist * orbit + right.x * shoulder,
        eyeY + height - Math.sin(state.pitch) * dist * 0.9,
        originZ - forward.z * dist * orbit + right.z * shoulder
      );
      const cleared = cameraClearance(
        originX,
        eyeY,
        originZ,
        desiredCam.x,
        desiredCam.y,
        desiredCam.z,
        0.35,
        ignore
      );
      // Clear the deck, not just the terrain, or the third-person boom drops
      // through a bridge you are standing on and frames it from under the creek.
      const minY = walkSurface(cleared.x, cleared.z, feetY) + 0.55;
      // cameraClearance only resolves x/z, so nothing stopped the boom rising
      // through a room's ceiling. Duck under it when the camera is indoors.
      const ceiling = interiorCeilingAt(cleared.x, cleared.z);
      let camY = Math.max(cleared.y, minY);
      if (Number.isFinite(ceiling)) {
        camY = Math.min(camY, ceiling - 0.28);
      }
      desiredCam.set(cleared.x, camY, cleared.z);
      if (state.snapCam) {
        camera.position.copy(desiredCam);
        state.snapCam = false;
      } else {
        const aXZ = 1 - Math.exp(-CAM_XZ * dt);
        const aY = 1 - Math.exp(-yK * dt);
        camera.position.x += (desiredCam.x - camera.position.x) * aXZ;
        camera.position.z += (desiredCam.z - camera.position.z) * aXZ;
        camera.position.y += (desiredCam.y - camera.position.y) * aY;
        // The smoothing lerps toward a clamped target but can still sit above
        // the ceiling on the way there, which is exactly when it pops through.
        const settledCeiling = interiorCeilingAt(camera.position.x, camera.position.z);
        if (Number.isFinite(settledCeiling)) {
          camera.position.y = Math.min(camera.position.y, settledCeiling - 0.28);
        }
      }
      camera.lookAt(aimPoint(originX, eyeY, originZ));
    }
  }

  return { object, body, state, update, groundPlayer, radius: PLAYER_RADIUS, setFacing, toggleFly };
}
