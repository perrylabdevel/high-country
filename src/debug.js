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
    if (flying) {
      chip.textContent = "Fly";
      chip.classList.add("hot");
    } else {
      chip.textContent = tune.speed === 1 ? "Dev" : fmt(tune.speed);
      chip.classList.toggle("hot", tune.speed !== 1);
    }
  }

  render();
  return { tune, update, cycleSpeed, isOpen, setOpen, get open() { return open; } };
}
