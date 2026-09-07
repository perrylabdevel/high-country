import { POS } from "./map.js";

export const SPEED_STEPS = [0.5, 1, 2, 4, 8, 16];
export const LOOK_STEPS = [0.5, 1, 2];
const STORAGE = "hc-debug";

export const tune = {
  speed: 1,
  look: 1
};

export function stepValue(steps, current, dir) {
  const fallback = steps.indexOf(1);
  const i = steps.indexOf(current);
  const idx = Math.max(0, Math.min(steps.length - 1, (i < 0 ? fallback : i) + dir));
  return steps[idx];
}

export function debugBlocksGame(open) {
  return Boolean(open);
}

// The tester rows' quick actions, registered from main.js as plain closures
// (`setTester`). Registered in the order systems boot: weather and the grass
// diagnostics arrive unconditionally, the ?dev-only diagnostics (nav overlay,
// ground lines, x-ray, dev mount, pin clock, terrain view) later. Any action
// still missing renders its button disabled — never dead-silent.
const tester = {};
// Toggle state the panel itself owns (no registered getter reads it back).
const toggleState = {
  navOverlay: false,
  groundLines: false,
  grassPins: false,
  pinClock: false,
  hideGrass: false,
  speciesColour: 0,
  windOff: false
};
const WEATHER_STATES = ["clear", "buildup", "overcast", "rain", "storm", "clearing"];
const VIEW_STATES = [["final", 0], ["weights", 1], ["road", 2], ["normal", 3], ["slope", 4]];

function loadTune() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!data) {
      return;
    }
    if (SPEED_STEPS.includes(data.speed)) {
      tune.speed = data.speed;
    }
    if (LOOK_STEPS.includes(data.look)) {
      tune.look = data.look;
    }
  } catch (err) {
    return;
  }
}

function saveTune() {
  localStorage.setItem(STORAGE, JSON.stringify({ speed: tune.speed, look: tune.look }));
}

function fmt(n) {
  return `${n}×`;
}

/** DOM writes dirty layout even when the text is identical — skip no-ops. */
function setText(el, text) {
  if (el && el.textContent !== text) {
    el.textContent = text;
  }
}

const WARPS = [
  "ranch",
  "silverCreek",
  "lakeMercy",
  "northernPines",
  "timberCamp",
  "burn",
  "westernRange",
  "ironValley",
  "tribal",
  "badlands",
  "mission",
  "fortGrant",
  "cemetery",
  "huntingCabin",
  "overlook",
  "elPaso"
];

export function createDebug(onWarp, options = {}) {
  loadTune();

  const onOpenChange = options.onOpenChange;
  const onFly = options.onFly;
  let open = false;

  const root = document.createElement("div");
  root.id = "debug-panel";
  root.className = "hidden";
  root.tabIndex = -1;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Dev panel");
  root.innerHTML = `
    <div class="debug-head">
      <span>Dev <span class="fine">\` toggle · F fly · [ ] speed</span></span>
      <button type="button" class="debug-close" aria-label="Close">×</button>
    </div>
    <div class="debug-row" data-field="speed">
      <span>Speed</span>
      <div class="debug-btns"></div>
    </div>
    <div class="debug-row" data-field="look">
      <span>Look</span>
      <div class="debug-btns"></div>
    </div>
    <div class="debug-row">
      <span>Fly</span>
      <div class="debug-btns">
        <button type="button" id="debug-fly">F</button>
      </div>
    </div>
    <label class="debug-row">Warp
      <select id="debug-warp"></select>
    </label>
    <div class="debug-section">Weather</div>
    <div class="debug-row"><div class="debug-btns" id="t-weather"></div></div>
    <div class="debug-section">Overlays</div>
    <div class="debug-row"><div class="debug-btns" id="t-overlays"></div></div>
    <div class="debug-row"><div class="debug-btns" id="t-overlays2"></div></div>
    <div class="debug-section">Terrain view</div>
    <div class="debug-row"><div class="debug-btns" id="t-view"></div></div>
    <div class="debug-row"><span>Pin clock</span><div class="debug-btns" id="t-time"></div></div>
    <div class="debug-section">Grass</div>
    <div class="debug-row"><div class="debug-btns" id="t-grass"></div></div>
    <label class="debug-row">Solo
      <select id="t-solo"></select>
    </label>
    <div class="debug-section">Movement</div>
    <div class="debug-row"><div class="debug-btns" id="t-move"></div></div>
    <pre id="debug-stats"></pre>
  `;
  document.getElementById("hud").appendChild(root);

  const chip = document.createElement("div");
  chip.id = "debug-chip";
  chip.title = "Dev panel (`)";
  document.getElementById("hud").appendChild(chip);

  const warpSel = root.querySelector("#debug-warp");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Warp…";
  warpSel.appendChild(blank);
  WARPS.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = POS[id].name;
    warpSel.appendChild(opt);
  });

  function paintButtons(field, steps, current) {
    const host = root.querySelector(`[data-field="${field}"] .debug-btns`);
    host.innerHTML = "";
    steps.forEach((value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = fmt(value);
      if (value === current) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", () => {
        tune[field] = value;
        saveTune();
        render();
      });
      host.appendChild(btn);
    });
  }

  function render() {
    paintButtons("speed", SPEED_STEPS, tune.speed);
    paintButtons("look", LOOK_STEPS, tune.look);
    chip.textContent = tune.speed === 1 ? "Dev" : fmt(tune.speed);
    chip.classList.toggle("hot", tune.speed !== 1);
  }

  // --- tester rows ---
  const testerButtons = { weather: {}, view: {} };

  function testerBtn(host, label, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = Boolean(opts.disabled);
    if (opts.key !== undefined) {
      btn.dataset.key = opts.key;
    }
    btn.addEventListener("click", () => {
      if (opts.onClick) {
        opts.onClick();
      }
      paintTester();
    });
    host.appendChild(btn);
    return btn;
  }

  /** Boolean quick-toggle: flips the panel-owned flag and calls its action. */
  function toggleBtn(host, label, { action, flag }) {
    const btn = testerBtn(host, label, {
      disabled: !tester[action],
      onClick: () => {
        if (!tester[action]) {
          return;
        }
        toggleState[flag] = !toggleState[flag];
        tester[action](toggleState[flag]);
      }
    });
    testerButtons[flag] = btn;
    return btn;
  }

  function setTester(actions) {
    Object.assign(tester, actions);
    buildTesterRows();
  }

  function buildTesterRows() {
    const weatherRow = root.querySelector("#t-weather");
    weatherRow.innerHTML = "";
    testerButtons.weather = {};
    WEATHER_STATES.forEach((name) => {
      testerButtons.weather[name] = testerBtn(weatherRow, name[0].toUpperCase() + name.slice(1), {
        disabled: !tester.weather,
        onClick: () => tester.weather && tester.weather(name)
      });
    });
    // Release the pin and hand the state machine its dice back.
    testerBtn(weatherRow, "Auto", {
      disabled: !tester.weather,
      onClick: () => tester.weather && tester.weather(null)
    });

    const overlays = root.querySelector("#t-overlays");
    overlays.innerHTML = "";
    toggleBtn(overlays, "Nav", { action: "navOverlay", flag: "navOverlay" });
    toggleBtn(overlays, "Ground lines", { action: "groundLines", flag: "groundLines" });
    toggleBtn(overlays, "Grass pins", { action: "grassPins", flag: "grassPins" });

    const overlays2 = root.querySelector("#t-overlays2");
    overlays2.innerHTML = "";
    testerButtons.xray = testerBtn(overlays2, "X-ray", {
      disabled: !tester.xrayCycle,
      onClick: () => tester.xrayCycle && tester.xrayCycle()
    });

    const viewRow = root.querySelector("#t-view");
    viewRow.innerHTML = "";
    testerButtons.view = {};
    VIEW_STATES.forEach(([name, value]) => {
      testerButtons.view[name] = testerBtn(viewRow, name[0].toUpperCase() + name.slice(1), {
        disabled: !tester.terrainView,
        key: name,
        onClick: () => tester.terrainView && tester.terrainView(value)
      });
    });

    const timeRow = root.querySelector("#t-time");
    timeRow.innerHTML = "";
    testerButtons.pinClock = toggleBtn(timeRow, "12:00", { action: "pinClock", flag: "pinClock" });

    const grassRow = root.querySelector("#t-grass");
    grassRow.innerHTML = "";
    testerButtons.hideGrass = toggleBtn(grassRow, "Hide grass", { action: "hideGrass", flag: "hideGrass" });
    testerButtons.speciesColour = testerBtn(grassRow, "Species colour", {
      disabled: !tester.speciesColour,
      onClick: () => {
        if (!tester.speciesColour) {
          return;
        }
        toggleState.speciesColour = (toggleState.speciesColour + 1) % 3;
        tester.speciesColour(toggleState.speciesColour);
      }
    });
    testerButtons.windOff = toggleBtn(grassRow, "Wind off", { action: "windOff", flag: "windOff" });

    const soloSel = root.querySelector("#t-solo");
    soloSel.innerHTML = "";
    const soloNone = document.createElement("option");
    soloNone.value = "";
    soloNone.textContent = "None";
    soloSel.appendChild(soloNone);
    for (const name of tester.speciesNames ? tester.speciesNames() : []) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      soloSel.appendChild(opt);
    }
    soloSel.disabled = !tester.soloGrass;

    const moveRow = root.querySelector("#t-move");
    moveRow.innerHTML = "";
    testerButtons.devMount = testerBtn(moveRow, "Mount", {
      disabled: !tester.devMount,
      onClick: () => tester.devMount && tester.devMount(!tester.mounted())
    });
    paintTester();
  }

  /** Paint every tester button from live state, not just the last click. */
  function paintTester() {
    if (!open) {
      return;
    }
    const weatherNow = tester.weatherState ? tester.weatherState() : null;
    for (const [name, btn] of Object.entries(testerButtons.weather)) {
      btn.classList.toggle("active", weatherNow === name);
    }
    const xrayNow = tester.xrayMode ? tester.xrayMode() : 0;
    setText(testerButtons.xray, xrayNow ? `X-ray ${xrayNow}` : "X-ray");
    testerButtons.xray.classList.toggle("active", xrayNow > 0);
    const viewNow = tester.terrainViewNow ? tester.terrainViewNow() : null;
    for (const [name, value] of VIEW_STATES) {
      testerButtons.view[name].classList.toggle("active", viewNow === value);
    }
    const colour = toggleState.speciesColour;
    setText(
      testerButtons.speciesColour,
      colour ? `Species colour ×${colour}` : "Species colour"
    );
    testerButtons.speciesColour.classList.toggle("active", colour > 0);
    testerButtons.hideGrass.classList.toggle("active", toggleState.hideGrass);
    testerButtons.pinClock.classList.toggle("active", toggleState.pinClock);
    testerButtons.windOff.classList.toggle(
      "active",
      tester.windOffNow ? tester.windOffNow() : toggleState.windOff
    );
    testerButtons.navOverlay.classList.toggle("active", toggleState.navOverlay);
    testerButtons.groundLines.classList.toggle("active", toggleState.groundLines);
    testerButtons.grassPins.classList.toggle("active", toggleState.grassPins);
    const mounted = tester.mounted ? tester.mounted() : false;
    setText(testerButtons.devMount, mounted ? "Dismount" : "Mount");
    testerButtons.devMount.classList.toggle("active", mounted);
  }

  function isOpen() {
    return open;
  }

  function setOpen(nextOpen) {
    const next = Boolean(nextOpen);
    if (next === open) {
      return;
    }
    open = next;
    root.classList.toggle("hidden", !open);
    chip.classList.toggle("hidden", open);
    if (open) {
      document.exitPointerLock();
      paintTester();
      root.focus();
    } else if (document.activeElement && root.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    if (onOpenChange) {
      onOpenChange(open);
    }
  }

  function cycleSpeed(dir) {
    tune.speed = stepValue(SPEED_STEPS, tune.speed, dir);
    saveTune();
    render();
  }

  root.querySelector("#debug-fly").addEventListener("click", () => {
    if (onFly) {
      onFly();
    }
  });

  warpSel.addEventListener("change", () => {
    const place = POS[warpSel.value];
    if (place && onWarp) {
      onWarp(place.x, place.z);
    }
    warpSel.value = "";
  });

  chip.addEventListener("click", () => {
    setOpen(true);
  });

  root.querySelector(".debug-close").addEventListener("click", () => {
    setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!open) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (root.contains(target) || chip.contains(target)) {
      return;
    }
    if (target instanceof Element && target.closest(".lil-gui")) {
      return;
    }
    if (target instanceof HTMLSelectElement || target instanceof HTMLOptionElement) {
      return;
    }
    if (target === document.documentElement || target === document.body) {
      return;
    }
    setOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }
    if (event.code === "Backquote") {
      event.preventDefault();
      setOpen(!open);
      return;
    }
    if (event.code === "BracketLeft") {
      event.preventDefault();
      cycleSpeed(-1);
      return;
    }
    if (event.code === "BracketRight") {
      event.preventDefault();
      cycleSpeed(1);
    }
  });

  let frames = 0;
  let fps = 0;
  let fpsAt = performance.now();

  function update(player) {
    frames += 1;
    const now = performance.now();
    if (now - fpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsAt));
      frames = 0;
      fpsAt = now;
    }
    const flying = player.state.mode === "fly";
    const p = player.object.position;
    const alt = flying ? player.state.flyAlt : p.y;
    root.querySelector("#debug-stats").textContent =
      `${fps} fps  ${fmt(tune.speed)}  look ${fmt(tune.look)}\n` +
      `x ${p.x.toFixed(1)}  y ${alt.toFixed(1)}  z ${p.z.toFixed(1)}` +
      (flying ? "  fly" : "");
    root.querySelector("#debug-fly").classList.toggle("active", flying);
    // The tester rows track reality, not clicks: the weather machine advances
    // on its own, and the player can mount through gameplay while the panel
    // is shut. paintTester no-ops while closed.
    paintTester();
    if (flying) {
      chip.textContent = "Fly";
      chip.classList.add("hot");
    } else {
      chip.textContent = tune.speed === 1 ? "Dev" : fmt(tune.speed);
      chip.classList.toggle("hot", tune.speed !== 1);
    }
  }

  buildTesterRows();
  render();
  return {
    tune,
    update,
    cycleSpeed,
    isOpen,
    setOpen,
    setTester,
    get open() { return open; }
  };
}
