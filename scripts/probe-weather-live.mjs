/**
 * Live probe: does forcing weather actually move the rendered scene?
 *   npm run preview &   # then
 *   node scripts/probe-weather-live.mjs
 */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto("http://127.0.0.1:8765/?dev", { waitUntil: "domcontentloaded", timeout: 60000 });

// Enter the game if a title gate is present.
await page.waitForTimeout(12000);
const entered = await page.evaluate(() => {
  const btn = document.getElementById("btn-enter");
  if (btn && !btn.closest(".hidden")) btn.click();
  return true;
});
console.log("entered:", entered);
await page.waitForTimeout(4000);

const before = await page.evaluate(() => ({
  hasForce: typeof window.__weatherForce,
  state: window.__weatherState?.(),
}));
console.log("before:", JSON.stringify(before));

await page.evaluate(() => window.__weatherForce?.("storm"));
await page.waitForTimeout(3000);

const after = await page.evaluate(() => {
  const s = window.__weatherState?.();
  // Read back whatever the scene exposes for verification.
  const scene = window.__scene;
  return {
    state: s,
    fogDensity: scene?.fog?.density,
    fogColor: scene?.fog?.color ? { ...scene.fog.color } : null,
    envIntensity: scene?.environmentIntensity,
  };
});
console.log("after storm:", JSON.stringify(after, null, 2));
await page.screenshot({ path: "audit/probe-weather-storm.png" });

await page.evaluate(() => window.__weatherForce?.("clear"));
await page.waitForTimeout(2000);
await page.screenshot({ path: "audit/probe-weather-clear.png" });

await browser.close();