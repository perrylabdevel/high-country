/**
 * The Basis transcoder is loaded at runtime by KTX2Loader, not bundled.
 * Copy it from three's examples into the Vite public dir on install.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/three/examples/jsm/libs/basis");
const destDir = join(root, "public/basis");

mkdirSync(destDir, { recursive: true });
for (const file of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log("Copied Basis transcoder to public/basis/");
