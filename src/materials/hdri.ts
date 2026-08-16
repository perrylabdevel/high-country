/**
 * Targets three@0.185.1.
 * HDRI → scene.environment. WebGPURenderer builds the PMREM from an equirect map.
 */
import type { Scene, Texture, WebGPURenderer } from "three/webgpu";
import { HDRI_PATHS } from "./textureManifest.ts";
import { materialSettings } from "./settings.ts";
import { tryLoadTexture } from "./loadTexture.ts";

const cache: Partial<Record<keyof typeof HDRI_PATHS, Texture | null>> = {};

export function syncEnvironmentIntensity(scene: Scene): void {
  const key = materialSettings.hdri as keyof typeof HDRI_PATHS;
  // Golden-hour direct light is intentionally warm and low, so its HDRI needs
  // enough ambient fill to preserve foreground detail instead of crushing the
  // entire shadow side to black.
  const hdriScale = key === "golden" ? 1.85 : 1;
  scene.environmentIntensity = materialSettings.environmentIntensity * hdriScale;
}

export async function applyHdri(scene: Scene, _renderer: WebGPURenderer): Promise<void> {
  const key = materialSettings.hdri as keyof typeof HDRI_PATHS;
  if (cache[key] === undefined) {
    cache[key] = await tryLoadTexture(HDRI_PATHS[key], "hdr");
  }
  const env = cache[key] ?? null;
  scene.environment = env;
  syncEnvironmentIntensity(scene);
}
