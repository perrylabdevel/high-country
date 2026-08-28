/**
 * Capture a screenshot of every point of interest for the vision audit loop.
 *
 *   npm run build
 *   npm run preview &                    # serves dist on 127.0.0.1:8765
 *   npm run capture -- http://127.0.0.1:8765 audit/current
 *
 * 16 POIs x 2 sun angles = 32 images, named <poi>-<light>.png so the auditing
 * agent can diff one pass against the next by opening the same path.
 *
 * Canonical captures use WebGPU. Set CAPTURE_BACKEND=webgl only for a disposable
 * diagnostic directory; do not grade it as a normal audit pass.
 *
 * Requires playwright. Set PLAYWRIGHT_CHROMIUM to override the browser binary.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const OUT = process.argv[3] || "audit/current";
const BACKEND = process.env.CAPTURE_BACKEND || "webgpu";
const MODE = process.env.CAPTURE_MODE || "audit";

if (!["webgpu", "webgl"].includes(BACKEND)) {
  throw new Error(`CAPTURE_BACKEND must be "webgpu" or "webgl", got ${BACKEND}`);
}
if (process.env.CAPTURE_POI && OUT === "audit/current") {
  throw new Error("CAPTURE_POI is diagnostic-only; write it outside audit/current");
}
if (!["audit", "close", "eye"].includes(MODE)) {
  throw new Error(`CAPTURE_MODE must be "audit", "close" or "eye", got ${MODE}`);
}
if (MODE !== "audit" && OUT === "audit/current") {
  throw new Error("close and eye vantages are diagnostic-only; write them outside audit/current");
}
if (BACKEND !== "webgpu" && OUT === "audit/current") {
  throw new Error("WebGL capture is diagnostic-only; write it outside audit/current");
}

// dist: how far back to stand. height: camera height above local ground.
// heading: degrees, direction the camera looks from (0 = looking north).
// aim: height above ground of the point looked at.
const AUDIT_POIS = [
  { id: "ranch", dist: 46, height: 13, heading: 150, aim: 5 },
  // Frame the sheriff–doctor storefront run at eye level from its street-facing
  // side. The town-center aerial view hid these false fronts behind the nearer
  // residential row and exposed their rear-draining roofs instead.
  { id: "silverCreek", dist: 34, height: 5.5, heading: 180, aim: 5, targetOffset: { x: -43, z: 4 } },
  { id: "lakeMercy", dist: 70, height: 16, heading: 20, aim: 2 },
  { id: "northernPines", dist: 40, height: 9, heading: 120, aim: 6 },
  { id: "timberCamp", dist: 42, height: 11, heading: 145, aim: 3 },
  { id: "burn", dist: 55, height: 14, heading: 130, aim: 4 },
  { id: "westernRange", dist: 60, height: 12, heading: 90, aim: 3 },
  { id: "ironValley", dist: 62, height: 18, heading: 160, aim: 6 },
  { id: "tribal", dist: 38, height: 10, heading: 140, aim: 3 },
  { id: "badlands", dist: 66, height: 16, heading: 110, aim: 4 },
  { id: "mission", dist: 40, height: 12, heading: 170, aim: 5 },
  { id: "fortGrant", dist: 58, height: 20, heading: 155, aim: 3 },
  { id: "cemetery", dist: 24, height: 6, heading: 150, aim: 1.5 },
  { id: "huntingCabin", dist: 26, height: 8, heading: 145, aim: 3 },
  { id: "overlook", dist: 30, height: 8, heading: 45, aim: 4 },
  { id: "elPaso", dist: 28, height: 8, heading: 165, aim: 3 }
];

/**
 * Close-vantage cameras (CAPTURE_MODE=close) — the eye-height diagnostic set.
 *
 * Diagnostic only: write the output somewhere other than audit/current (the
 * guard above enforces this) and never compile it into audit/reports. The
 * audit-range cameras above stay the graded path. At 8-20 m and 1.7-2.5 m
 * eye height the universal criteria (U2 scale, G1 wheel-tracks) resolve that
 * the 30-70 m cameras smear, and the per-POI criteria are aimed at the
 * subject the rubric names: the fort gate, the ranch house exterior, the
 * lake dock, the western-range herd, the mission facade.
 */
const CLOSE_POIS = [
  // Front-door side: the door is in the main block's south wall (R5). Camera
  // 22 m south of that wall, looking north at the L-plan (ell to the east).
  { id: "ranch", dist: 22, height: 2.2, heading: 180, aim: 2.0, targetOffset: { x: 1, z: -1 } },
  // Storefront run: camera south of the street looking north at the facades.
  // Wider than the first pass so S1/S2 alignment and the boardwalk read.
  { id: "silverCreek", dist: 18, height: 2.2, heading: 180, aim: 2.0, targetOffset: { x: -43, z: 4 } },
  // On the dock deck looking along it: dock plane, water depth, surface motion.
  { id: "lakeMercy", dist: 10, height: 1.8, heading: 180, aim: 1.8, targetOffset: { x: -20, z: -84 } },
  // Forest interior: canopy, bark, density and the floating-foliage read.
  { id: "northernPines", dist: 10, height: 1.7, heading: 120, aim: 2.0 },
  { id: "timberCamp", dist: 12, height: 1.8, heading: 145, aim: 1.8 },
  { id: "burn", dist: 14, height: 1.8, heading: 130, aim: 2.0 },
  // Herd sits 20-48 m east of the POI; stand east of the bunch, look west.
  { id: "westernRange", dist: 14, height: 2.0, heading: 100, aim: 1.5, targetOffset: { x: 34, z: -28 } },
  // Wide enough for headframe + stamp mill + tailings in one frame (I1).
  { id: "ironValley", dist: 22, height: 2.4, heading: 160, aim: 2.5 },
  { id: "tribal", dist: 12, height: 1.8, heading: 140, aim: 2.0 },
  { id: "badlands", dist: 14, height: 1.8, heading: 110, aim: 2.0 },
  // Facade + bell tower in frame (M2); far enough that the tower does not
  // dominate the facade (first pass read "tower obscures the building").
  { id: "mission", dist: 26, height: 3.2, heading: 170, aim: 2.5 },
  // North gate is the near wall; stand north of it high enough to see over
  // the 3.2 m wall into the courtyard (F1/F2) without going full aerial.
  { id: "fortGrant", dist: 24, height: 4.5, heading: 180, aim: 1.5, targetOffset: { x: 0, z: -12 } },
  { id: "cemetery", dist: 8, height: 1.7, heading: 150, aim: 1.5 },
  { id: "huntingCabin", dist: 10, height: 1.7, heading: 145, aim: 1.8 },
  // The vista is the subject (O2): wider, slightly higher than the first pass.
  { id: "overlook", dist: 12, height: 2.0, heading: 45, aim: 1.5 },
  // Widen so the adobe cluster reads as a settlement, not one wall (E1).
  { id: "elPaso", dist: 20, height: 2.6, heading: 165, aim: 2.2 }
];

/**
 * Eye-level vantages: stand where the close pass stands, at a walking adult's
 * eye height, and look dead level at the horizon.
 *
 * Every capture mode before this one pitched the camera down at the ground —
 * even the close pass, which aims 1.5-2.5 m up from 10-22 m away and so still
 * looks down at the grass from above. Looking down is the one angle where the
 * blade/ground junction is hidden behind the blades themselves. In first
 * person you look OUT: the junction is edge-on, at the bottom of the frame,
 * across the whole width of it, which is exactly where a tuft that does not
 * meet the ground gives itself away. Nothing in this repo has ever captured
 * that view.
 */
const EYE_POIS = CLOSE_POIS.map((p) => ({ ...p, height: 1.65, level: true }));

const POIS = MODE === "close" ? CLOSE_POIS : MODE === "eye" ? EYE_POIS : AUDIT_POIS;

const LIGHTS = [
  { name: "midday", hdri: "midday", elevation: 62, azimuth: -120 },
  { name: "golden", hdri: "golden", elevation: 9, azimuth: -78 }
];

const expectedFiles = POIS.flatMap((poi) => LIGHTS.map((light) => `${poi.id}-${light.name}.png`));

/**
 * Playwright's bundled Chromium is a separate 170 MB download. On distros it
 * does not officially support (CachyOS here), `npx playwright install` often
 * hangs after the zip finishes. Prefer an already-installed Chrome.
 */
function launchOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM };
  }
  // macOS: headless Chromium has no Metal GPU process, so requestAdapter()
  // returns null and three.js silently falls back to WebGL2 -- which the
  // __captureInfo backend assertion cannot catch, because it sniffs
  // renderer.backend.constructor.name and a production build mangles that
  // to a 2-char identifier that never matches /webgl/i. Headed gets the real
  // apple/metal-3 adapter. Same reasoning as the Linux branch below.
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) {
      return process.platform === "darwin" ? { headless: false } : {};
    }
  } catch {
    // no bundled browser
  }
  const system = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].find((p) => existsSync(p));
  if (system) {
    process.stderr.write(`playwright chromium missing; using ${system}\n`);
    // Playwright's default launch uses Chromium's legacy --headless mode,
    // which never exposes navigator.gpu on this box. --enable-unsafe-webgpu
    // gets a WebGPU adapter under that mode, but it's Dawn's constrained
    // software fallback: it hard-fails on createBuffer once the real scene
    // allocates its buffers ("size too large for the implementation"),
    // independent of available VRAM. headless: false gets the real GPU
    // adapter instead (this box has a live Wayland session to render into),
    // which only needs enough free VRAM, not a smaller implementation limit.
    return { executablePath: system, headless: false };
  }
  throw new Error(
    "no Chromium for capture. Install Google Chrome, or set PLAYWRIGHT_CHROMIUM. " +
      "Do not leave `npx playwright install` running — it is optional and often hangs on this OS."
  );
}

/**
 * Fail fast, and loudly, when BASE is not serving the build we just made.
 *
 * Two capture runs have now been lost to this: `npm run capture` defaults to
 * port 8765, but `npm run preview` silently moves to 8766/8767 when that port
 * is occupied, and the failure surfaced 60s later as an opaque page.goto
 * timeout. A stale server on the right port is worse still — it answers, the
 * backend assertion passes, and the pass grades an old build.
 */
async function preflight() {
  let res;
  try {
    res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
  } catch {
    const alive = [];
    for (const port of [8765, 8766, 8767, 8768, 5173, 4173]) {
      try {
        await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
        alive.push(port);
      } catch {
        /* nothing listening */
      }
    }
    throw new Error(
      `nothing serving ${BASE}. Start it with \`npm run preview\` and pass the port it prints:\n` +
        `  npm run capture -- http://127.0.0.1:<port> ${OUT}\n` +
        (alive.length
          ? `Ports answering right now: ${alive.join(", ")}.`
          : "No local dev server is answering on 8765-8768, 5173 or 4173.")
    );
  }
  if (!res.ok) {
    throw new Error(`${BASE}/ returned HTTP ${res.status}; expected the built index.html`);
  }
  const served = await res.text();

  // dist/index.html is what `npm run build` just wrote. If the server is
  // handing out a different entry bundle it is a stale process from an
  // earlier build, and the capture would grade the wrong code.
  if (existsSync("dist/index.html")) {
    const built = await readFile("dist/index.html", "utf8");
    const entry = built.match(/src="([^"]*assets\/[^"]+\.js)"/)?.[1];
    if (entry && !served.includes(entry)) {
      throw new Error(
        `${BASE} is serving a different build than dist/ (expected entry ${entry}). ` +
          "Kill the old preview server and restart it after `npm run build`."
      );
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await preflight();
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => {
    process.stdout.write(`[console:${m.type()}] ${m.text()}\n`);
  });
  page.on("requestfailed", (r) => {
    process.stdout.write(`[requestfailed] ${r.url()} ${r.failure()?.errorText || ""}\n`);
  });
  page.on("pageerror", (e) => {
    // Synthetic click on #btn-enter requests pointer lock without a real OS
    // focus/user-gesture context under automated headed Chrome; the browser
    // rejects it. Capture never relies on pointer lock — it drives the
    // camera directly via window.__captureView — so this is not a capture
    // failure.
    if (/pointer lock/i.test(e.message)) {
      return;
    }
    errors.push(e.message);
  });

  const query = BACKEND === "webgl" ? "?dev&webgl" : "?dev";
  await page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  // The title overlay swallows synthetic clicks; dispatch it directly.
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));

  const captureInfo = await page.evaluate(() => window.__captureInfo?.());
  if (!captureInfo?.backend) {
    throw new Error("capture page did not report its renderer backend");
  }
  if (BACKEND === "webgl" ? captureInfo.backend !== "webgl" : captureInfo.backend !== "webgpu") {
    throw new Error(`requested ${BACKEND}, page reported ${captureInfo.backend}`);
  }

  const writtenFiles = [];
  for (const light of LIGHTS) {
    await page.evaluate((l) => {
      Object.assign(window.__materialSettings, {
        hdri: l.hdri,
        sunElevation: l.elevation,
        sunAzimuth: l.azimuth
      });
      window.__syncMaterialSettings();
    }, light);
    await page.waitForTimeout(800);

    for (const poi of POIS) {
      if (process.env.CAPTURE_POI && poi.id !== process.env.CAPTURE_POI) {
        continue;
      }
      const ok = await page.evaluate((p) => {
        const place = window.__POS[p.id];
        if (!place) {
          return false;
        }
        const targetX = place.x + (p.targetOffset?.x || 0);
        const targetZ = place.z + (p.targetOffset?.z || 0);
        const rad = (p.heading * Math.PI) / 180;
        const px = targetX + Math.sin(rad) * p.dist;
        const pz = targetZ + Math.cos(rad) * p.dist;
        const py = window.__heightAt(px, pz) + p.height;
        if (p.level) {
          // Look level: the target sits at the camera's own height, so pitch is
          // exactly zero however the ground rises or falls ahead.
          const len = Math.hypot(targetX - px, targetZ - pz) || 1;
          window.__captureView = {
            px,
            py,
            pz,
            tx: px + ((targetX - px) / len) * 80,
            ty: py,
            tz: pz + ((targetZ - pz) / len) * 80
          };
          return true;
        }
        window.__captureView = {
          px,
          py,
          pz,
          tx: targetX,
          ty: window.__heightAt(targetX, targetZ) + p.aim,
          tz: targetZ
        };
        return true;
      }, poi);
      if (!ok) {
        throw new Error(`missing capture POI ${poi.id}`);
      }
      // CAPTURE_SOLO_GRASS=<species> plants that ground cover alone, so an
      // artefact can be pinned to one grass instead of argued about across a
      // mix of four. Set before the settle wait: it forces a rescatter.
      if (process.env.CAPTURE_SOLO_GRASS) {
        await page.evaluate((n) => window.__soloGrass(n), process.env.CAPTURE_SOLO_GRASS);
      }
      // The ground-cover scatter is amortised over ~72 frames, and consecutive
      // POIs are kilometres apart, so a fixed wait screenshots the PREVIOUS
      // location's grass and sage — which reads as an empty biome rather than
      // as a half-finished rebuild. Wait on the game's own settled predicate.
      let settled = false;
      for (let i = 0; i < 150 && !settled; i += 1) {
        await page.waitForTimeout(2000);
        settled = await page.evaluate(() => !!window.__vegSettled && window.__vegSettled());
      }
      if (!settled) {
        throw new Error(`ground cover never settled at ${poi.id}; screenshot would be stale`);
      }
      // CAPTURE_GROUND_LINES=1 overlays the terrain surface in magenta (a grid
      // on the rendered triangulation plus 12 cm pins) so a frame shows where
      // the ground actually is under the cover, instead of leaving it to the
      // eye. Built after the settle wait, because it is centred on the camera's
      // CURRENT position and the view only takes effect on the next frame.
      // Diagnostic only.
      if (process.env.CAPTURE_GROUND_LINES) {
        await page.evaluate(() => window.__groundLines?.(true));
        await page.waitForTimeout(300);
      }
      // CAPTURE_GRASS_PINS=1 plants a 12 cm magenta pin at each nearby tuft's
      // own footing, with a cross-bar at the ground line and another at the
      // card's bottom edge. Unlike the grid, this shares the tuft's depth, so
      // a gap between the pin's foot and the blade base is a real gap.
      if (process.env.CAPTURE_GRASS_PINS) {
        await page.evaluate(() => window.__grassPins?.(true));
        await page.waitForTimeout(300);
      }
      // Shadows and the wind pass still need a beat after the scatter lands.
      await page.waitForTimeout(1500);
      const file = `${poi.id}-${light.name}.png`;
      // Playwright's default screenshot timeout is 30 s, which is not enough
      // for this scene on a real GPU: the readback of a WebGPU frame carrying
      // ~50k grass instances and a 4096 shadow map regularly runs past it, and
      // the run dies after the hard part (navigation, backend assertion and the
      // scatter settle) has already succeeded.
      await page.screenshot({ path: `${OUT}/${file}`, timeout: 180000 });
      writtenFiles.push(file);
      process.stdout.write(`captured ${file}\n`);
    }
  }

  if (errors.length) {
    throw new Error("page errors:\n  " + errors.slice(0, 10).join("\n  "));
  }
  if (!process.env.CAPTURE_POI && writtenFiles.length !== expectedFiles.length) {
    throw new Error(`expected ${expectedFiles.length} captures, wrote ${writtenFiles.length}`);
  }

  const manifest = {
    version: 1,
    mode: MODE,
    backend: captureInfo.backend,
    adapter: captureInfo.adapter || "unknown",
    antialias: captureInfo.antialias,
    build: captureInfo.build || "unknown",
    viewport: { width: 1280, height: 720 },
    poiCount: process.env.CAPTURE_POI ? 1 : POIS.length,
    lightCount: LIGHTS.length,
    expectedFiles: process.env.CAPTURE_POI ? writtenFiles : expectedFiles,
    files: writtenFiles,
    vantages: POIS,
    generated: new Date().toISOString()
  };
  await writeFile(`${OUT}/capture-manifest.json`, JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`\n${writtenFiles.length} screenshots written to ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
