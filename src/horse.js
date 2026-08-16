import * as THREE from "three/webgpu";
import { heightAt, normalAt } from "./world.js";
import { moveAndSlide, addCylinderCollider } from "./collision.js";
import { POS, clampWorld, headingVector } from "./map.js";
import { tune } from "./debug.js";

const HORSE_RADIUS = 0.78;

export function createHorse() {
  const object = new THREE.Group();
  const hide = new THREE.MeshStandardNodeMaterial({ color: 0x4a3020, roughness: 0.75 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x1c120c, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.15, 4, 8), hide);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.15;
  body.castShadow = true;
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.55, 4, 6), hide);
  neck.position.set(0.7, 1.55, 0.05);
  neck.rotation.z = -0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.22), hide);
  head.position.set(1.05, 1.85, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), dark);
  tail.position.set(-0.85, 1.2, 0);
  const legs = [];
  for (const [lx, lz] of [[0.45, 0.18], [0.45, -0.18], [-0.45, 0.18], [-0.45, -0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 6), dark);
    leg.position.set(lx, 0.48, lz);
    leg.castShadow = true;
    object.add(leg);
    legs.push(leg);
  }
  object.add(body, neck, head, tail);
  object.position.set(POS.ranch.x + 10.4, heightAt(POS.ranch.x + 10.4, POS.ranch.z + 13.2), POS.ranch.z + 13.2);
  const collider = addCylinderCollider(POS.ranch.x + 10.4, POS.ranch.z + 13.2, HORSE_RADIUS);

  // The horse's head is local +X, so a heading of `yaw` needs π/2 - yaw here rather
  // than the π - yaw used for meshes whose long axis is local +Z.
  function applyFacing(yaw) {
    object.rotation.y = Math.PI / 2 - yaw;
  }
  applyFacing(0);

  const horse = {
    object,
    yaw: 0,
    speed: 0,
    mounted: false,
    radius: HORSE_RADIUS,
    collider,
    legs,
    update(dt, input, playerYaw) {
      this.yaw = playerYaw;
      applyFacing(this.yaw);
      const wish = (input.held("forward") ? 1 : 0) + (input.held("back") ? -0.4 : 0);
      const gait = (input.held("sprint") ? 14.5 : 7.6) * tune.speed;
      const target = wish * gait;
      this.speed += (target - this.speed) * Math.min(1, 3.4 * tune.speed * dt);
      if (Math.abs(this.speed) < 0.08 && wish === 0) {
        this.speed = 0;
      }
      const { x: fx, z: fz } = headingVector(this.yaw);
      const travel = this.speed * dt;
      const slices = Math.max(1, Math.ceil(Math.abs(travel) / 0.7));
      const slice = 1 / slices;
      let held = { x: object.position.x, z: object.position.z };
      for (let i = 0; i < slices; i += 1) {
        const next = moveAndSlide(
          held.x,
          held.z,
          fx * travel * slice,
          fz * travel * slice,
          HORSE_RADIUS,
          collider
        );
        held = clampWorld(next.x, next.z);
      }
      const slope = normalAt(held.x, held.z);
      if (slope.y >= 0.5) {
        object.position.x = held.x;
        object.position.z = held.z;
      }
      object.position.y += (heightAt(object.position.x, object.position.z) - object.position.y) * Math.min(1, 14 * dt);
      collider.x = object.position.x;
      collider.z = object.position.z;
      collider.radius = this.mounted ? 0.05 : HORSE_RADIUS;
      const swing = Math.sin(performance.now() * 0.012 * (1 + Math.abs(this.speed) * 0.12)) * Math.min(0.35, Math.abs(this.speed) * 0.04);
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
      legs[3].rotation.x = swing;
    }
  };
  return horse;
}
