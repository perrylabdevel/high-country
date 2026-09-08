/**
 * Capture the creek-vs-lake tone comparison at Lake Mercy, for the creek
 * refractBase blend work.
 *   npm run preview &   # then
 *   node scripts/capture-creek-tone.mjs before
 *   node scripts/capture-creek-tone.mjs after
 *
 * Two vantages:
 *   mouth    — high oblique over the highCountry creek mouth (the tester
 *              report's vantage: creek ribbon, mud banks, lake edge).
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
 * Same reasoning as capture-poi.mjs launchOptions(): on macOS, headless
 * Chromium has no Metal GPU process, so requestAdapter() returns null and
 * three.js silently falls back to WebGL2/SwiftShader — captures crawl at
 * seconds per call and the tone numbers are software-rendered garbage.
 * Headed gets the real apple/metal-3 adapter, so launch headed on darwin.
 */
function launchOptions() {
  if (process.platform !== "darwin") {
    return {};
  }
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
      name: "grazing",
      // Low over the creek bank, looking down the creek's length.
      view: { px: 30, py: 22, pz: -430, tx: 110, ty: 13, tz: -560 }
    }
  ];

  for (const v of vantages) {
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
    await page.screenshot({ path: `${OUT}-${v.name}.png`, timeout: 180000 });
    console.log("captured", v.name);
  }
  console.log("DONE", OUT);
}