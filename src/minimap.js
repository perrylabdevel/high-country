import {
  WORLD,
  POS,
  ROADS,
  CREEKS,
  mapToWorld,
  worldToMap,
  biomeAt,
  lakeFactor
} from "./map.js";

const W = 400;
const H = 500;
const DISPLAY = 400;
const ZOOM = 3.25;
// Wheel-adjustable chart magnification. Bounds keep the view sane in both
// directions: below ~1.6 the whole-world view turns landmarks into specks,
// above ~6 the visible slice is smaller than a town lot.
const MIN_ZOOM = 1.6;
const MAX_ZOOM = 6;
let zoomLevel = ZOOM;
const INK = "#3d2918";
const GOLD = "#a67c42";

const BIOME_FILL = {
  lake: [92, 128, 138],
  ranch: [210, 196, 142],
  town: [186, 154, 108],
  pines: [62, 86, 58],
  burn: [78, 64, 52],
  range: [196, 176, 108],
  iron: [132, 118, 108],
  badlands: [176, 102, 64],
  tribal: [154, 138, 88],
  foothills: [138, 148, 92],
  valley: [186, 168, 112]
};

function rng(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function uvToCanvas(u, v) {
  return { x: u * W, y: (1 - v) * H };
}

function worldToCanvas(x, z) {
  // Always go through worldToMap so the chart can never drift from the world axes.
  const { u, v } = worldToMap(x, z);
  return uvToCanvas(u, v);
}

export function lookCanvasAngle(yaw) {
  // World yaw: 0 = north (-Z), π/2 = east (+X). Chevron tip is local +X, and canvas
  // ctx.rotate(θ) maps +X to (cos θ, sin θ) with y pointing DOWN the screen. North-up
  // chart wants the tip at (sin yaw, -cos yaw), which solves to θ = yaw - π/2.
  // Negating this (π/2 - yaw) still looks right facing east/west but mirrors north
  // and south, which is the long-standing "needle points away from the house" bug.
  return yaw - Math.PI / 2;
}

export function screenNeedleAngle(yaw) {
  return lookCanvasAngle(yaw);
}

export function chartScale() {
  return DISPLAY * zoomLevel / W;
}

/**
 * Set the chart magnification. Returns true when the level actually changed,
 * so callers can skip repaints that would draw identical frames.
 */
export function setChartZoom(level) {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
  const changed = Math.abs(clamped - zoomLevel) > 1e-9;
  zoomLevel = clamped;
  return changed;
}

export function displayPoint(worldX, worldZ, playerX, playerZ) {
  const view = viewWindow(playerX, playerZ);
  const chart = worldToCanvas(worldX, worldZ);
  return {
    x: (chart.x - view.sx) / view.vw * DISPLAY,
    y: (chart.y - view.sy) / view.vh * DISPLAY
  };
}

export function viewWindow(x, z) {
  const p = worldToCanvas(x, z);
  const side = W / zoomLevel;
  return {
    sx: p.x - side / 2,
    sy: p.y - side / 2,
    vw: side,
    vh: side,
    px: DISPLAY / 2,
    py: DISPLAY / 2
  };
}

function paintParchment(ctx) {
  ctx.fillStyle = "#e2d0a4";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i += 1) {
    const x = rng(i + 2) * W;
    const y = rng(i + 9) * H;
    const r = 18 + rng(i + 4) * 70;
    ctx.fillStyle = `rgba(90, 58, 28, ${0.03 + rng(i + 7) * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng(i + 11) * 0.5), rng(i) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const edge = ctx.createRadialGradient(W * 0.5, H * 0.5, 140, W * 0.5, H * 0.5, 310);
  edge.addColorStop(0, "rgba(60, 32, 12, 0)");
  edge.addColorStop(1, "rgba(60, 32, 12, 0.22)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}

function paintBiomes(ctx) {
  const cols = 88;
  const rows = 110;
  const cw = W / cols;
  const ch = H / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = (col + 0.5) / cols;
      const v = 1 - (row + 0.5) / rows;
      const p = mapToWorld(u, v);
      const lake = lakeFactor(p.x, p.z);
      const biome = biomeAt(p.x, p.z);
      const c = BIOME_FILL[biome] || BIOME_FILL.valley;
      const n = rng(col * 17 + row * 31);
      ctx.fillStyle = `rgb(${c[0] + (n - 0.5) * 18},${c[1] + (n - 0.5) * 16},${c[2] + (n - 0.5) * 12})`;
      ctx.fillRect(col * cw, row * ch, cw + 0.6, ch + 0.6);
      if (lake > 0.25 && biome !== "lake") {
        ctx.fillStyle = `rgba(92, 128, 138, ${lake * 0.55})`;
        ctx.fillRect(col * cw, row * ch, cw + 0.6, ch + 0.6);
      }
      if (biome === "pines" && n > 0.55) {
        ctx.strokeStyle = "rgba(30, 46, 28, 0.45)";
        ctx.lineWidth = 0.8;
        const x = col * cw + cw * 0.5;
        const y = row * ch + ch * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.6, y + 3.2);
        ctx.lineTo(x + 1.6, y + 3.2);
        ctx.closePath();
        ctx.stroke();
      }
      if (biome === "burn" && n > 0.62) {
        ctx.fillStyle = "rgba(20, 14, 10, 0.28)";
        ctx.fillRect(col * cw + 1, row * ch + 1, 1.4, 2.8);
      }
    }
  }
}

function strokeTrail(ctx, pts, color, width, dashed) {
  if (pts.length < 2) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (dashed) {
    ctx.setLineDash(dashed);
  }
  ctx.beginPath();
  const start = uvToCanvas(pts[0][0], pts[0][1]);
  ctx.moveTo(start.x, start.y);
  for (let i = 1; i < pts.length; i += 1) {
    const a = uvToCanvas(pts[i - 1][0], pts[i - 1][1]);
    const b = uvToCanvas(pts[i][0], pts[i][1]);
    const mx = (a.x + b.x) / 2 + (rng(i + 3) - 0.5) * 3;
    const my = (a.y + b.y) / 2 + (rng(i + 8) - 0.5) * 3;
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawHouse(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-5, 1);
  ctx.lineTo(-5, 6);
  ctx.lineTo(5, 6);
  ctx.lineTo(5, 1);
  ctx.lineTo(0, -4);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTown(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  [[-6, 2, 4, 5], [0, 0, 5, 7], [6, 3, 3.5, 4]].forEach(([dx, dy, w, h]) => {
    ctx.strokeRect(dx - w / 2, dy - h / 2, w, h);
  });
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, -3);
  ctx.stroke();
  ctx.restore();
}

function drawTeepees(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  [-6, 0, 6].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(dx, 5);
    ctx.lineTo(dx - 4, 5);
    ctx.lineTo(dx, -3);
    ctx.lineTo(dx + 4, 5);
    ctx.stroke();
  });
  ctx.restore();
}

function drawCross(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 5);
  ctx.moveTo(x - 3.5, y - 2);
  ctx.lineTo(x + 3.5, y - 2);
  ctx.stroke();
  ctx.restore();
}

function drawTower(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x - 2, y - 2, 4, 7);
  ctx.beginPath();
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y - 2);
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, size) {
  ctx.save();
  ctx.font = `${size}px Palatino, "Palatino Linotype", Georgia, serif`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(226, 208, 164, 0.85)";
  ctx.shadowBlur = 3;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * (size + 2));
  });
  ctx.restore();
}

function paintCompass(ctx) {
  const ring = DISPLAY / 2 - 28;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font = "10px Palatino, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 0, -ring);
  ctx.fillText("S", 0, ring);
  ctx.fillText("W", -ring, 0);
  ctx.fillText("E", ring, 0);
  ctx.restore();
}

function paintYou(ctx, px, py, yaw) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(lookCanvasAngle(yaw));
  ctx.fillStyle = "#c43c1a";
  ctx.strokeStyle = "#f4ead2";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(-16, 14);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-16, -14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function paintFrame(ctx) {
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, DISPLAY - 16, DISPLAY - 16);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, DISPLAY - 24, DISPLAY - 24);
  ctx.font = "11px Palatino, Georgia, serif";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText("THE HIGH COUNTRY", DISPLAY / 2, 24);
  ctx.font = "8px Palatino, Georgia, serif";
  ctx.fillStyle = "#6a4e32";
  ctx.fillText("surveyed from the ranch", DISPLAY / 2, DISPLAY - 16);
}

function paintChart(canvas) {
  const ctx = canvas.getContext("2d");
  paintParchment(ctx);
  paintBiomes(ctx);
  CREEKS.forEach((creek) => {
    if (creek.dry) {
      strokeTrail(ctx, creek.pts, "rgba(168, 132, 84, 0.85)", 2.4, [5, 3]);
      return;
    }
    const toxic = creek.name === "toxic";
    strokeTrail(ctx, creek.pts, toxic ? "rgba(90, 110, 70, 0.8)" : "rgba(58, 96, 110, 0.85)", 2.2);
  });
  ROADS.forEach((road) => {
    if (road.kind === "stage") {
      strokeTrail(ctx, road.pts, "rgba(90, 58, 28, 0.88)", 2.6, [8, 4]);
    } else if (road.kind === "rail") {
      strokeTrail(ctx, road.pts, "rgba(70, 68, 64, 0.85)", 2.1, [5, 3]);
    } else if (road.kind === "trail") {
      strokeTrail(ctx, road.pts, "rgba(110, 78, 42, 0.7)", 1.1, [2, 3]);
    } else {
      strokeTrail(ctx, road.pts, "rgba(90, 58, 28, 0.8)", 1.7);
    }
  });

  const ranch = worldToCanvas(POS.ranch.x, POS.ranch.z);
  const town = worldToCanvas(POS.silverCreek.x, POS.silverCreek.z);
  const lake = worldToCanvas(POS.lakeMercy.x, POS.lakeMercy.z);
  const pines = worldToCanvas(POS.northernPines.x, POS.northernPines.z);
  const burn = worldToCanvas(POS.burn.x, POS.burn.z);
  const range = worldToCanvas(POS.westernRange.x, POS.westernRange.z);
  const iron = worldToCanvas(POS.ironValley.x, POS.ironValley.z);
  const badlands = worldToCanvas(POS.badlands.x, POS.badlands.z);
  const tribal = worldToCanvas(POS.tribal.x, POS.tribal.z);
  const mission = worldToCanvas(POS.mission.x, POS.mission.z);
  const fort = worldToCanvas(POS.fortGrant.x, POS.fortGrant.z);
  const tower = worldToCanvas(POS.fireWatch.x, POS.fireWatch.z);
  const mines = worldToCanvas(POS.mines.x, POS.mines.z);

  drawHouse(ctx, ranch.x, ranch.y);
  drawTown(ctx, town.x, town.y);
  drawTeepees(ctx, tribal.x, tribal.y);
  drawCross(ctx, mission.x, mission.y);
  drawTower(ctx, tower.x, tower.y);
  ctx.strokeStyle = INK;
  ctx.strokeRect(fort.x - 5, fort.y - 5, 10, 10);
  ctx.beginPath();
  ctx.moveTo(mines.x - 4, mines.y + 4);
  ctx.lineTo(mines.x + 4, mines.y - 4);
  ctx.moveTo(mines.x - 4, mines.y - 4);
  ctx.lineTo(mines.x + 4, mines.y + 4);
  ctx.stroke();

  label(ctx, "High Country\nRanch", ranch.x, ranch.y + 16, 10);
  label(ctx, "Silver Creek", town.x, town.y - 16, 10);
  label(ctx, "Lake Mercy", lake.x, lake.y, 11);
  label(ctx, "Northern Pines", pines.x, pines.y - 10, 10);
  label(ctx, "Ashes on\nthe Divide", burn.x + 18, burn.y + 8, 9);
  label(ctx, "Western Range", range.x, range.y - 12, 9);
  label(ctx, "Iron Valley", iron.x, iron.y + 14, 9);
  label(ctx, "Southern\nBadlands", badlands.x, badlands.y, 9);
  label(ctx, "Tribal Lands", tribal.x, tribal.y + 16, 8);
}

export function createMinimap() {
  const root = document.getElementById("minimap");
  const canvas = document.getElementById("minimap-chart");
  canvas.width = DISPLAY;
  canvas.height = DISPLAY;
  const chart = document.createElement("canvas");
  chart.width = W;
  chart.height = H;
  paintChart(chart);
  const ctx = canvas.getContext("2d");
  // Last known player state so a wheel zoom can repaint immediately instead
  // of waiting for the next frame's update().
  const last = { x: 0, z: 0, yaw: 0 };

  function show() {
    root.classList.remove("hidden");
  }

  function toggleSize() {
    root.classList.toggle("large");
  }

  function update(x, z, yaw) {
    last.x = x;
    last.z = z;
    last.yaw = yaw;
    const view = viewWindow(x, z);
    ctx.fillStyle = "#e2d0a4";
    ctx.fillRect(0, 0, DISPLAY, DISPLAY);
    ctx.drawImage(chart, view.sx, view.sy, view.vw, view.vh, 0, 0, DISPLAY, DISPLAY);
    ctx.save();
    ctx.translate(view.px, view.py);
    paintCompass(ctx);
    paintYou(ctx, 0, 0, yaw);
    ctx.restore();
    paintFrame(ctx);
  }

  // Scroll anywhere zooms the chart inside its fixed frame. Listening on
  // window (not the canvas) keeps this working while the pointer is locked to
  // the game canvas, since locked wheel events retarget there and bubble. The
  // UI element itself never changes size — only the drawn chart does.
  window.addEventListener("wheel", (e) => {
    if (root.classList.contains("hidden")) {
      return;
    }
    if (e.target instanceof Element && e.target.closest(".lil-gui")) {
      return;
    }
    e.preventDefault();
    // Wheel up = zoom in (tighter view), wheel down = zoom out (wider view).
    if (setChartZoom(zoomLevel * Math.pow(1.15, e.deltaY > 0 ? -1 : 1))) {
      update(last.x, last.z, last.yaw);
    }
  }, { passive: false });

  return { show, toggleSize, update };
}
