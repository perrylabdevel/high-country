/**
 * Targets three@0.185.1. KTX2Loader: three/addons/loaders/KTX2Loader.js
 * Transcoder is served from /basis/ (copied from three on postinstall).
 */
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

let loader = null;

export function createKtx2Loader(renderer) {
  loader = new KTX2Loader();
  loader.setTranscoderPath("/basis/");
  loader.detectSupport(renderer);
  return loader;
}

export function getKtx2Loader() {
  return loader;
}
