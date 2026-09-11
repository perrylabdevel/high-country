/**
 * Capture the creek-vs-lake tone comparison at Lake Mercy, for the creek
 * refractBase blend work.
 *   npm run preview &   # then
 *   node scripts/capture-creek-tone.mjs before
 *   node scripts/capture-creek-tone.mjs after
 *
 * Dedicated mouth vantages frame each actual shoreline crossing; the older
 * `mouth` view remains for continuity with existing evidence.
 *   grazing  — low, looking down the creek length (the case refractBase
 *              exists for: at grazing angles the screen sample behind a
 *              creek pixel is the far bank, and a too-low floor renders
 *              the surface as washed-out milk).
 * Weather is pinned overcast to match the report screenshot.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";

const TAG = process.argv[2] || "before";
const OUT = `audit/creek-tone-${TAG}`;

/**
 * WebGPU is the shipping backend, and the water shader's screen refraction is
 * disabled entirely under the WebGL fallback (main.js passes
 * screenRefraction: !forceWebGL) -- so a WebGL frame cannot answer any
 * question about creek-vs-lake refraction tone.
 *
 * Playwright's headless Chromium returns null from requestAdapter() on this
 * box even with --enable-unsafe-webgpu alone, and headed Chromium cannot
 * spawn here. Measured on win32: only the ANGLE/Vulkan combination below
 * yields a real hardware adapter (amd / gcn-2) rather than null or Dawn's
 * constrained software fallback.
 */
function launchOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM };
  }
  if (process.platform === "darwin") {
    try {
      const bundled = chromium.executablePath();
      if (bundled && existsSync(bundled)) {
        return { headless: false };
      }
    } catch {
      // no bundled browser
    }
    return { headless: false };
  }
  // Playwright's *bundled* Chromium finds the adapter but cannot create a
  // device: requestDevice() throws "DynamicLib.Open: dxil.dll Windows Error
  // 87" because that build ships no dxil.dll. three.js catches the failure
  // and silently falls back to WebGL. An installed Chrome ships the DLL, so
  // request the "chrome" channel and get a real device (measured: adapter
  // amd, device true).
  return {
    channel: "chrome",
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=d3d11"]
  };
}

const browser = await chromium.launch(launchOptions());
try {
  await run(browser);
} finally {
  await browser.close();
}

async function run(browser) {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("http://127.0.0.1:8765/?dev", { waitUntil: "domcontentloaded", timeout: 60000 });

  let booted = false;
  for (let i = 0; i < 240 && !booted; i += 1) {
    booted = await page.evaluate(() => typeof window.__weatherForce === "function");
    if (!booted) {
      await page.waitForTimeout(500);
    }
  }
  if (!booted) {
    throw new Error("boot never reached the weather registration");
  }
  const info = await page.evaluate(() => window.__captureInfo?.());
  console.log("backend:", JSON.stringify(info));
  // Refuse to shoot on the wrong backend. The WebGL fallback renders this
  // water with screenRefraction off, so its tone numbers describe a shader
  // that never ships -- a silent WebGL capture is worse than no capture.
  if (info?.backend !== "webgpu") {
    throw new Error(
      `refusing to capture on backend "${info?.backend}" -- creek/lake tone is a `
      + "WebGPU-only measurement (screen refraction is disabled under WebGL)"
    );
  }

  // Pin the weather before any settle wait (the ~0.5 s force ramp finishes
  // inside the settle), hide the HUD/player, park the camera per vantage.
  await page.evaluate(() => {
    window.__weatherForce("overcast");
    window.__captureMode(true);
  });
  await page.waitForTimeout(1500);

  const vantages = [
    {
      name: "mouth",
      // High oblique over the creek mouth, lake edge in frame.
      view: { px: 80, py: 150, pz: -300, tx: 80, ty: 13, tz: -580 }
    },
    {
      name: "highCountry-mouth",
      // Oblique across highCountry's actual Lake Mercy crossing at (0, -485):
      // exposed creek, waterline contact, and lake in one frame.
      resolvePy: { px: 70, pz: -420, eye: 32 },
      view: { px: 70, py: 0, pz: -420, tx: 0, ty: 13, tz: -485 }
    },
    {
      name: "highCountry-mouth-overhead",
      // Near-nadir inspection of the actual highCountry crossing, matching the
      // aerial player view that makes the subtle shoreline difference visible.
      view: { px: 0, py: 115, pz: -485, tx: 0, ty: 0, tz: -485.5 }
    },
    {
      name: "silver-mouth",
      // Oblique across silver's actual Lake Mercy crossing at (240, -480).
      resolvePy: { px: 330, pz: -430, eye: 32 },
      view: { px: 330, py: 0, pz: -430, tx: 240, ty: 13, tz: -480 }
    },
    {
      name: "nadir",
      // Direct overhead over the creek bend (the user's "direct overview"
      // vantage): bend at (0,-400)->(80,-560), lake to the SW.
      view: { px: 40, py: 130, pz: -480, tx: 40, ty: 0, tz: -481 }
    },
    {
      name: "close",
      // Low nadir over the actual rim crossing: the channel (x=0, carved bed
      // 10.2-12.8) crosses the shoreline at z≈-470 — land west of the channel,
      // the 12.8 basin floor east of it (heights sampled x=-100..200,
      // z=-340..-600). ~20 m over the water surface, creek and lake both in
      // frame — the tester's close-in framing.
      resolvePy: { px: 0, pz: -470, eye: 21 },
      view: { px: 0, py: 0, pz: -470, tx: 0, ty: 0, tz: -470.5 }
    },
    {
      name: "grazing",
      // Bank-level on the straight reach (the channel runs x=0, z 0..-400),
      // looking north along the channel — the case refractBase exists for:
      // at grazing angles the screen sample behind a creek pixel is the far
      // bank, and a too-low floor renders the surface as washed-out milk.
      // py is resolved against the terrain below.
      resolvePy: { px: 26, pz: -290, eye: 2.4 },
      view: { px: 26, py: 0, pz: -290, tx: 4, ty: 13, tz: -440 }
    }
  ];

  // Optional third arg: capture only the named vantage (e.g. `node
  // scripts/capture-creek-tone.mjs after close`). Unset runs every vantage.
  const only = process.argv[3];

  for (const v of vantages) {
    if (only && v.name !== only) {
      continue;
    }
    if (v.resolvePy) {
      v.view.py = await page.evaluate(
        (p) => window.__heightAt(p.px, p.pz) + p.eye,
        v.resolvePy
      );
    }
    // Park the camera. (An earlier edit of this loop dropped this evaluate —
    // the "camera never parked" failure was the view never being set, not a
    // boot re-run; the diag readback below now guards it.)
    await page.evaluate((view) => {
      window.__captureView = view;
    }, v.view);
    // Let the scatter settle at the new position and the weather ramp land.
    for (let i = 0; i < 120; i += 1) {
      const settled = await page.evaluate(() => window.__vegSettled?.());
      if (settled) {
        break;
      }
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    // Diagnose the "camera never parked" failure mode: read back what the
    // frame loop is actually seeing before trusting the shutter.
    const diag = await page.evaluate(() => ({
      view: window.__captureView,
      pinned: window.__weatherPinned?.(),
      state: window.__weatherState?.(),
      booted: Boolean(window.__weatherForce)
    }));
    console.log(v.name, "diag:", JSON.stringify(diag));
    if (!diag.view) {
      throw new Error("captureView was cleared before the shutter — boot re-ran after registration");
    }
    await page.screenshot({ path: `${OUT}-${v.name}.png`, timeout: 180000 });
    console.log("captured", v.name);
  }
  console.log("DONE", OUT);
}
