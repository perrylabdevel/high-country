import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: false,
    warmup: {
      clientFiles: ["./src/main.js", "./src/environment.js", "./src/materials/ktx2.js"]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 8765
  },
  resolve: {
    alias: [
      { find: /^three$/, replacement: "three/webgpu" }
    ],
    dedupe: ["three"]
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022"
  },
  assetsInclude: ["**/*.hdr"],
  optimizeDeps: {
    include: [
      "three",
      "three/webgpu",
      "three/tsl",
      "three/addons/loaders/KTX2Loader.js",
      "three/addons/loaders/HDRLoader.js"
    ]
  }
});
