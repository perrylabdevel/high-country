/**
 * Live probe: does the backtick tester HUD actually drive the game?
 * Opens the panel, clicks Storm / Auto / Hide grass, and asserts against the
 * window.__ hooks the buttons register over.
 *   npm run preview &   # then
 *   node scripts/probe-tester-panel.mjs
 *
 * The scenario runs as ONE in-page evaluate: headless falls back to WebGL2
 * software rendering ("No available adapters"), where the frame loop pins the
 * main thread and every Playwright round-trip (click, screenshot, evaluate)
 * can take seconds or time out. Inside the page, the same .click() handlers
 * run at full speed.
 */
import { chromium } from "playwright";

// The browser MUST be closed on every path: a throw with the browser left
// open strands a headless_shell rendering the game at full CPU, and every
// later run on the machine (including other sessions' checks) crawls.
const browser = await chromium.launch();
try {
  await run(browser);
} finally {
  await browser.close();
}

async function run(browser) {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("http://127.0.0.1:8765/?dev", { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for boot only — no enter click. The tester HUD does not need the
  // game entered: the panel and every registration it drives exist before
  // the title gate is clicked, and boot completes on its own.
  let booted = false;
  for (let i = 0; i < 240 && !booted; i += 1) {
    booted = await page.evaluate(() => typeof window.__weatherForce === "function");
    if (!booted) {
      await page.waitForTimeout(500);
    }
  }
  if (!booted) {
    throw new Error("window.__weatherForce never appeared within 120s — boot never reached the weather registration; check for a boot error above.");
  }

  const report = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const out = {};

    // Open the panel the way a tester does — backquote — via the same
    // window keydown handler the physical key feeds.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backquote" }));
    await sleep(300);
    const panel = document.getElementById("debug-panel");
    if (panel.classList.contains("hidden")) {
      throw new Error("backquote did not open the debug panel");
    }
    out.sections = [...panel.querySelectorAll(".debug-section")].map((el) => el.textContent);
    out.disabled = [...panel.querySelectorAll("button:disabled")].map((b) => b.textContent);

    const click = (row, text) => {
      const btn = [...document.querySelectorAll(`#${row} button`)].find((b) => b.textContent === text);
      if (!btn) {
        throw new Error(`no ${row} button "${text}"`);
      }
      if (btn.disabled) {
        throw new Error(`${row} button "${text}" is disabled`);
      }
      btn.click();
    };

    // Weather row: Storm must force the state machine, Auto must release the
    // pin without changing the current state.
    click("t-weather", "Storm");
    await sleep(1500);
    out.storm = window.__weatherState();
    out.stormPinned = window.__weatherPinned();
    click("t-weather", "Auto");
    await sleep(300);
    out.afterAuto = window.__weatherState();
    out.afterAutoPinned = window.__weatherPinned();

    // Grass row: Hide grass must empty the live scatter count, and the
    // toggle-off must restore it.
    click("t-grass", "Hide grass");
    await sleep(300);
    out.grassHidden = window.__hideGrass();
    click("t-grass", "Hide grass");
    await sleep(200);
    out.grassRestored = window.__hideGrass();

    return out;
  });

  console.log("report:", JSON.stringify(report, null, 2));

  const expectedSections = ["Weather", "Overlays", "Terrain view", "Grass", "Movement"];
  for (const section of expectedSections) {
    if (!report.sections.includes(section)) {
      throw new Error(`missing tester section "${section}"`);
    }
  }
  if (report.disabled.length > 0) {
    throw new Error(`buttons left disabled under ?dev: ${JSON.stringify(report.disabled)}`);
  }
  if (report.storm !== "storm" || report.stormPinned !== true) {
    throw new Error(`storm force did not take: state ${report.storm}, pinned ${report.stormPinned}`);
  }
  if (report.afterAuto !== "storm" || report.afterAutoPinned !== false) {
    throw new Error(`auto release did not take: state ${report.afterAuto}, pinned ${report.afterAutoPinned}`);
  }
  if (report.grassHidden !== 0 || !(report.grassRestored > 0)) {
    throw new Error(`hide grass did not take: hidden ${report.grassHidden}, restored ${report.grassRestored}`);
  }

  console.log("PROBE PASSED");
}