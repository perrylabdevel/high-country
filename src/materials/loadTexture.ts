/**
 * Targets three@0.185.1. TSL ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Central texture loader. Color space is chosen by kind so it cannot be
 * forgotten per-call:
 *   albedo → SRGBColorSpace
 *   linear (normal, roughness, AO, height, ORM, masks) → NoColorSpace
 *   hdr    → HDRLoader, NoColorSpace, equirectangular mapping
 */
import * as THREE from "three/webgpu";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { getKtx2Loader } from "./ktx2.js";

export type TextureKind = "albedo" | "linear" | "hdr";

const textureLoader = new THREE.TextureLoader();
const hdrLoader = new HDRLoader();

function extOf(url: string): string {
  const clean = url.split("?")[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

export async function loadTexture(url: string, kind: TextureKind): Promise<THREE.Texture> {
  const ext = extOf(url);
  if (kind === "hdr" || ext === "hdr") {
    const tex = await hdrLoader.loadAsync(url);
    tex.colorSpace = THREE.NoColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }
  let tex: THREE.Texture;
  if (ext === "ktx2") {
    const ktx2 = getKtx2Loader();
    if (!ktx2) {
      throw new Error("KTX2 loader is not initialized. Call createKtx2Loader(renderer) first.");
    }
    tex = await ktx2.loadAsync(url);
  } else {
    tex = await textureLoader.loadAsync(url);
  }
  tex.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export async function tryLoadTexture(url: string, kind: TextureKind): Promise<THREE.Texture | null> {
  try {
    return await loadTexture(url, kind);
  } catch (err) {
    console.warn(`Texture missing or failed: ${url}`, err);
    return null;
  }
}
