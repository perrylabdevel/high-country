/** Targets three@0.185.1. Canvas textures stay on MeshStandardNodeMaterial maps. */
import * as THREE from "three/webgpu";
import { normalAt as sampleNormal } from "./heightfield.js";

export { WORLD, heightAt, bakeHeightfield } from "./heightfield.js";

function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function normalAt(x, z) {
  const n = sampleNormal(x, z);
  return new THREE.Vector3(n.x, n.y, n.z);
}

export function makeTexture(draw, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function grassTexture() {
  return makeTexture((ctx, size) => {
    ctx.fillStyle = "#4a6a32";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = `rgb(${48 + Math.random() * 50},${90 + Math.random() * 70},${30 + Math.random() * 30})`;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 3 + Math.random() * 6);
    }
  });
}

export function dirtTexture() {
  return makeTexture((ctx, size) => {
    ctx.fillStyle = "#5c3e24";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 8000; i += 1) {
      ctx.fillStyle = `rgb(${88 + Math.random() * 52},${54 + Math.random() * 32},${28 + Math.random() * 18})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 900; i += 1) {
      ctx.fillStyle = `rgba(${36 + Math.random() * 24},${22 + Math.random() * 14},${12 + Math.random() * 10},${0.28 + Math.random() * 0.42})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 4 + Math.random() * 18, 1 + Math.random() * 3);
    }
    const stones = [
      [138, 130, 116],
      [108, 102, 90],
      [164, 154, 136]
    ];
    for (let i = 0; i < 2200; i += 1) {
      const s = stones[(Math.random() * stones.length) | 0];
      const shade = 0.72 + Math.random() * 0.38;
      ctx.fillStyle = `rgb(${(s[0] * shade) | 0},${(s[1] * shade) | 0},${(s[2] * shade) | 0})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, 0.5 + Math.random() * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function woodTexture() {
  return makeTexture((ctx, size) => {
    for (let y = 0; y < size; y += 1) {
      const shade = 70 + Math.sin(y * 0.08) * 18 + noise(y, 2) * 20;
      ctx.fillStyle = `rgb(${shade + 40},${shade},${shade - 20})`;
      ctx.fillRect(0, y, size, 1);
    }
    ctx.strokeStyle = "rgba(40,20,8,0.35)";
    for (let x = 0; x < size; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 4, size);
      ctx.stroke();
    }
  }, 256);
}

export function barkTexture() {
  return makeTexture((ctx, size) => {
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 400; i += 1) {
      ctx.strokeStyle = `rgba(${20 + Math.random() * 30},${12},${8},${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, 0);
      ctx.lineTo(Math.random() * size, size);
      ctx.stroke();
    }
  }, 256);
}

export function rockTexture() {
  return makeTexture((ctx, size) => {
    ctx.fillStyle = "#6d6a64";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2000; i += 1) {
      ctx.fillStyle = `rgb(${90 + Math.random() * 50},${88 + Math.random() * 40},${80 + Math.random() * 30})`;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, Math.random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export function shingleTexture() {
  return makeTexture((ctx, size) => {
    ctx.fillStyle = "#3d2918";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 10) {
      for (let x = (y / 10) % 2 === 0 ? 0 : 8; x < size; x += 16) {
        ctx.fillStyle = `rgb(${50 + Math.random() * 30},${32 + Math.random() * 16},${18})`;
        ctx.fillRect(x, y, 15, 9);
      }
    }
  }, 256);
}
