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
import { heightAt } from "./heightfield.js";

const W = 400;
const H = 500;
const DISPLAY = 400;
const ZOOM = 3.25;
// Wheel-adjustable chart magnification. The floor is the whole-sheet view:
// at 1.0 the window exactly covers the chart's full width, the survey on a
// plate; the ceiling keeps the visible slice larger than a town lot.
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
let zoomLevel = ZOOM;
const INK = "#3d2918";
const GOLD = "#a67c42";
// The terrain underlay is painted once at twice chart resolution — hillshade,
// contours, biome wash — and crop-scaled every frame. Everything drawn ON the
// terrain (roads, creeks, glyphs, lettering) is stroked per frame in display
// space, so line work and type stay razor sharp at any zoom instead of
// scaling up out of a fixed bitmap.
const BASE_SCALE = 2;
const BW = W * BASE_SCALE;
const BH = H * BASE_SCALE;

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
  // The window follows the player, but never slides off the sheet: clamp to
  // the chart bounds so the view shows paper, not the void beyond the survey.
  // When the window is taller/wider than the sheet itself (zoomed fully out)
  // it centres instead, leaving an even margin.
  const sx = side >= W ? (W - side) / 2 : Math.min(W - side, Math.max(0, p.x - side / 2));
  const sy = side >= H ? (H - side) / 2 : Math.min(H - side, Math.max(0, p.y - side / 2));
  return {
    sx,
    sy,
    vw: side,
    vh: side,
    px: (p.x - sx) / side * DISPLAY,
    py: (p.y - sy) / side * DISPLAY
  };
}

/* ------------------------------------------------------------------ */
/* The printed sheet: terrain painted once into a base canvas          */
/* ------------------------------------------------------------------ */

/**
 * Parchment stock with fibrous mottling. The old chart darkened its edges in
 * chart space, so the shading scrolled with the crop; the vignette now lives
 * on the display canvas per frame instead.
 */
function paintParchment(ctx) {
  ctx.fillStyle = "#e2d0a4";
  ctx.fillRect(0, 0, BW, BH);
  for (let i = 0; i < 110; i += 1) {
    const x = rng(i + 2) * BW;
    const y = rng(i + 9) * BH;
    const r = 30 + rng(i + 4) * 130;
    ctx.fillStyle = `rgba(90, 58, 28, ${0.03 + rng(i + 7) * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng(i + 11) * 0.5), rng(i) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Biome colour as a watercolour wash: blocks filled on a scratch canvas and
 * blurred when composited, so regions bleed into one another like a hand-
 * tinted map instead of meeting in hard pixel steps.
 */
function paintWash(ctx) {
  const scratch = document.createElement("canvas");
  scratch.width = BW;
  scratch.height = BH;
  const s = scratch.getContext("2d");
  const cols = 160;
  const rows = 200;
  const cw = BW / cols;
  const ch = BH / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = (col + 0.5) / cols;
      const v = 1 - (row + 0.5) / rows;
      const p = mapToWorld(u, v);
      const lake = lakeFactor(p.x, p.z);
      const biome = biomeAt(p.x, p.z);
      const c = BIOME_FILL[biome] || BIOME_FILL.valley;
      const n = rng(col * 17 + row * 31);
      s.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.78 + (n - 0.5) * 0.22})`;
      s.fillRect(col * cw, row * ch, cw + 0.6, ch + 0.6);
      if (lake > 0.25 && biome !== "lake") {
        s.fillStyle = `rgba(92, 128, 138, ${lake * 0.55})`;
        s.fillRect(col * cw, row * ch, cw + 0.6, ch + 0.6);
      }
    }
  }
  ctx.save();
  ctx.filter = "blur(4px)";
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();

  // Crisp texture after the wash: pines read as tiny stippled crowns, the
  // burn as char flecks.
  const step = 3;
  for (let y = 0; y < BH; y += step) {
    for (let x = 0; x < BW; x += step) {
      const u = x / BW;
      const v = 1 - y / BH;
      const p = mapToWorld(u, v);
      const biome = biomeAt(p.x, p.z);
      const n = rng(x * 13 + y * 7);
      if (biome === "pines" && n > 0.86) {
        ctx.strokeStyle = "rgba(30, 46, 28, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 1.7, y + 3.4);
        ctx.lineTo(x + 1.7, y + 3.4);
        ctx.closePath();
        ctx.stroke();
      } else if (biome === "burn" && n > 0.88) {
        ctx.fillStyle = "rgba(20, 14, 10, 0.3)";
        ctx.fillRect(x, y, 1.5, 3);
      }
    }
  }
}

/**
 * Hillshade: the relief that turns a flat tint into country. Sampled from the
 * baked heightfield on a coarse grid, lit from the north-west like a survey
 * plate — slopes facing the light pick up a cream lift, lee slopes an ink
 * shadow.
 */
function paintHillshade(ctx) {
  const step = 4;
  const metresPerBasePx = WORLD.width / W / BASE_SCALE;
  for (let y = 0; y < BH; y += step) {
    for (let x = 0; x < BW; x += step) {
      const u = (x + step / 2) / BW;
      const v = 1 - (y + step / 2) / BH;
      const p = mapToWorld(u, v);
      const d = metresPerBasePx * step;
      const gx = (heightAt(p.x + d, p.z) - heightAt(p.x - d, p.z)) / (2 * d);
      const gz = (heightAt(p.x, p.z + d) - heightAt(p.x, p.z - d)) / (2 * d);
      // Light from north-west: north is -z (up the chart), west is -x (left).
      const b = Math.max(0.1, Math.min(0.9, 0.5 + (gx + gz) * 1.6));
      if (b < 0.5) {
        ctx.fillStyle = `rgba(60, 32, 12, ${(0.5 - b) * 0.6})`;
      } else {
        ctx.fillStyle = `rgba(255, 244, 214, ${(b - 0.5) * 0.5})`;
      }
      ctx.fillRect(x, y, step, step);
    }
  }
}

/**
 * Contour lines by marching squares over the same height samples — the single
 * strongest "this is a survey, not a screenshot" cue. 10 m intervals with a
 * heavier index contour every 50 m; lines drop out under the water line so
 * Lake Mercy stays quiet.
 */
function paintContours(ctx) {
  const step = 3;
  const cols = Math.floor(BW / step);
  const rows = Math.floor(BH / step);
  const h = new Float32Array((cols + 1) * (rows + 1));
  let hmin = 1e9;
  let hmax = -1e9;
  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const p = mapToWorld((col * step) / BW, 1 - (row * step) / BH);
      const y = heightAt(p.x, p.z);
      h[row * (cols + 1) + col] = y;
      if (y < hmin) hmin = y;
      if (y > hmax) hmax = y;
    }
  }
  const interp = (level, a, b) => (level - a) / (b - a);
  for (let level = Math.ceil(hmin / 10) * 10; level < hmax; level += 10) {
    const index = level % 50 === 0;
    ctx.strokeStyle = index ? "rgba(90, 58, 28, 0.42)" : "rgba(90, 58, 28, 0.26)";
    ctx.lineWidth = index ? 1 : 0.7;
    ctx.beginPath();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x0 = col * step;
        const y0 = row * step;
        const a = h[row * (cols + 1) + col];
        const b = h[row * (cols + 1) + col + 1];
        const c = h[(row + 1) * (cols + 1) + col + 1];
        const d = h[(row + 1) * (cols + 1) + col];
        // water mask: any corner under the lake plane and the contour would
        // wriggle across the water — drop the whole cell
        if (Math.min(a, b, c, d) < 13.5) {
          continue;
        }
        let code = 0;
        if (a > level) code |= 8;
        if (b > level) code |= 4;
        if (c > level) code |= 2;
        if (d > level) code |= 1;
        if (code === 0 || code === 15) {
          continue;
        }
        const top = [x0 + interp(level, a, b) * step, y0];
        const right = [x0 + step, y0 + interp(level, b, c) * step];
        const bottom = [x0 + interp(level, d, c) * step, y0 + step];
        const left = [x0, y0 + interp(level, a, d) * step];
        const seg = (p, q) => {
          ctx.moveTo(p[0] + 0.5, p[1] + 0.5);
          ctx.lineTo(q[0] + 0.5, q[1] + 0.5);
        };
        switch (code) {
          case 1: case 14: seg(left, bottom); break;
          case 2: case 13: seg(bottom, right); break;
          case 3: case 12: seg(left, right); break;
          case 4: case 11: seg(top, right); break;
          case 6: case 9: seg(top, bottom); break;
          case 7: case 8: seg(left, top); break;
          case 5: seg(left, top); seg(bottom, right); break;
          case 10: seg(left, bottom); seg(top, right); break;
          default: break;
        }
      }
    }
    ctx.stroke();
  }
}

/**
 * The survey graticule: hairlines every 500 m of world, barely there, just
 * enough to make the sheet feel measured.
 */
function paintGraticule(ctx) {
  ctx.strokeStyle = "rgba(61, 41, 24, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let u = 0; u <= 1.0001; u += 0.125) {
    ctx.moveTo(u * BW, 0);
    ctx.lineTo(u * BW, BH);
  }
  for (let v = 0; v <= 1.0001; v += 0.1) {
    ctx.moveTo(0, (1 - v) * BH);
    ctx.lineTo(BW, (1 - v) * BH);
  }
  ctx.stroke();
}

function paintBase() {
  const base = document.createElement("canvas");
  base.width = BW;
  base.height = BH;
  const b = base.getContext("2d");
  paintParchment(b);
  paintWash(b);
  paintHillshade(b);
  paintContours(b);
  paintGraticule(b);
  return base;
}

/* ------------------------------------------------------------------ */
/* Per-frame line work: roads, creeks, glyphs, lettering               */
/* ------------------------------------------------------------------ */

/**
 * Densify a coarse chart polyline into a hand-drawn line: subdivide and
 * wobble with deterministic per-vertex noise so the stroke meanders like it
 * was inked, identically on every frame (no shimmer).
 */
function densify(pts, seed) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [u0, v0] = pts[i];
    const [u1, v1] = pts[i + 1];
    const len = Math.hypot(u1 - u0, v1 - v0);
    const n = Math.max(1, Math.ceil(len / 0.01));
    for (let j = 0; j < n; j += 1) {
      const f = j / n;
      const w = j === 0 ? 0 : (rng(seed + i * 131 + j * 17) - 0.5) * 0.003;
      const w2 = j === 0 ? 0 : (rng(seed + i * 57 + j * 91) - 0.5) * 0.003;
      out.push([u0 + (u1 - u0) * f + w, v0 + (v1 - v0) * f + w2]);
    }
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}

const roadLines = new Map();
function roadLine(road, i) {
  if (!roadLines.has(i)) {
    roadLines.set(i, densify(road.pts, i * 977 + 13));
  }
  return roadLines.get(i);
}

const creekLines = new Map();
function creekLine(creek, i) {
  if (!creekLines.has(i)) {
    creekLines.set(i, densify(creek.pts, i * 613 + 5));
  }
  return creekLines.get(i);
}

function lineToDisplay(line, playerX, playerZ) {
  return line.map(([u, v]) => {
    const w = mapToWorld(u, v);
    return displayPoint(w.x, w.z, playerX, playerZ);
  });
}

function strokeDensified(ctx, line, playerX, playerZ) {
  ctx.beginPath();
  let started = false;
  for (const p of lineToDisplay(line, playerX, playerZ)) {
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

function paintCreeks(ctx, playerX, playerZ) {
  ctx.lineCap = "round";
  CREEKS.forEach((creek, i) => {
    const toxic = creek.name === "toxic";
    const line = creekLine(creek, i);
    // taper: the creek widens as it runs, drawn segment by segment
    const pts = lineToDisplay(line, playerX, playerZ);
    for (let k = 1; k < pts.length; k += 1) {
      const f = k / pts.length;
      ctx.lineWidth = 0.8 + f * 1.7;
      ctx.strokeStyle = toxic
        ? `rgba(90, 110, 70, ${0.55 + f * 0.3})`
        : `rgba(58, 96, 110, ${0.55 + f * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(pts[k - 1].x, pts[k - 1].y);
      ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
    }
    if (creek.dry) {
      // overdraw the wet stroke with parchment dashes: a dry wash reads as a
      // broken thread, not a river
      ctx.strokeStyle = "rgba(226, 208, 164, 0.75)";
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 3]);
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.setLineDash([]);
    }
  });
}

/**
 * Roads in proper cartographic symbology, screen-space widths so they hold
 * their weight at any zoom: the stage road as a cased highway with a dashed
 * centreline, plain roads cased, trails dotted, and the railroad as the
 * classic line-and-ticks.
 */
function paintRoads(ctx, playerX, playerZ) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ROADS.forEach((road, i) => {
    const line = roadLine(road, i);
    if (road.kind === "stage") {
      ctx.strokeStyle = "rgba(74, 48, 24, 0.85)";
      ctx.lineWidth = 3.6;
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.strokeStyle = "rgba(226, 208, 164, 0.9)";
      ctx.lineWidth = 1.7;
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.strokeStyle = "rgba(74, 48, 24, 0.9)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.setLineDash([]);
    } else if (road.kind === "rail") {
      ctx.strokeStyle = "rgba(70, 68, 64, 0.8)";
      ctx.lineWidth = 1.7;
      strokeDensified(ctx, line, playerX, playerZ);
      // cross ticks: walk the line, tick perpendicular every few pixels
      ctx.strokeStyle = "rgba(70, 68, 64, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      let acc = 0;
      const pts = lineToDisplay(line, playerX, playerZ);
      for (let k = 1; k < pts.length; k += 1) {
        const a = pts[k - 1];
        const b = pts[k];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        acc += len;
        if (acc >= 5) {
          acc = 0;
          const nx = -dy / (len || 1);
          const ny = dx / (len || 1);
          ctx.moveTo(b.x - nx * 2.6, b.y - ny * 2.6);
          ctx.lineTo(b.x + nx * 2.6, b.y + ny * 2.6);
        }
      }
      ctx.stroke();
    } else if (road.kind === "trail") {
      ctx.strokeStyle = "rgba(110, 78, 42, 0.75)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([1.5, 3]);
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(74, 48, 24, 0.7)";
      ctx.lineWidth = 2.6;
      strokeDensified(ctx, line, playerX, playerZ);
      ctx.strokeStyle = "rgba(226, 208, 164, 0.85)";
      ctx.lineWidth = 1.2;
      strokeDensified(ctx, line, playerX, playerZ);
    }
  });
}

/* Glyphs: fixed display-space size, the way map symbols never scale with the
   sheet. Only drawn when their anchor is inside the view. */

function drawHouse(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.fillStyle = "rgba(226, 208, 164, 0.7)";
  ctx.beginPath();
  ctx.moveTo(-6, 1);
  ctx.lineTo(-6, 7);
  ctx.lineTo(6, 7);
  ctx.lineTo(6, 1);
  ctx.lineTo(0, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTown(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  [[-7, 2, 5, 6], [1, -1, 5, 7], [7, 3, 4, 4.5]].forEach(([dx, dy, w, h]) => {
    ctx.strokeRect(dx - w / 2, dy - h / 2, w, h);
  });
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(0, -4);
  ctx.stroke();
  ctx.restore();
}

function drawTeepees(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  [-7, 0, 7].forEach((dx) => {
    ctx.beginPath();
    ctx.moveTo(dx, 5);
    ctx.lineTo(dx - 4, 5);
    ctx.lineTo(dx, -4);
    ctx.lineTo(dx + 4, 5);
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();
}

function drawCross(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x - 4, y - 2);
  ctx.lineTo(x + 4, y - 2);
  ctx.stroke();
  ctx.restore();
}

function drawTower(ctx, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.strokeRect(x - 2.5, y - 2.5, 5, 8);
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y - 2.5);
  ctx.stroke();
  ctx.restore();
}

function drawMill(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-4.5, -1, 9, 6);
  ctx.beginPath();
  ctx.moveTo(-2, -1);
  ctx.lineTo(-2, -6);
  ctx.lineTo(2.5, -3.5);
  ctx.lineTo(-2, -1);
  ctx.moveTo(2, -1);
  ctx.lineTo(2, -6);
  ctx.lineTo(6.5, -3.5);
  ctx.lineTo(2, -1);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Lettering                                                           */
/* ------------------------------------------------------------------ */

/**
 * Tracked caps, centred on x: the workhorse of survey lettering. Every glyph
 * gets a parchment halo stroke first so type holds over line work.
 */
function trackedText(ctx, text, x, y, tracking) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  let tw = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cx = x - tw / 2;
  ctx.textAlign = "center";
  chars.forEach((ch, i) => {
    const w = widths[i];
    ctx.strokeText(ch, cx + w / 2, y);
    ctx.fillText(ch, cx + w / 2, y);
    cx += w + tracking;
  });
  return tw;
}

/**
 * Curved lettering: the classic arched region name, bowed upward around a
 * circle whose sagitta is `rise` pixels. Each glyph rides the arc and rotates
 * with it — this is what makes the sheet feel lettered by hand.
 */
function arcText(ctx, text, x, y, rise) {
  const chars = [...text];
  const tracking = 2.2;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const tw = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  const R = Math.max(40, (tw * tw) / (8 * rise));
  ctx.save();
  ctx.textAlign = "center";
  let a = -tw / 2;
  chars.forEach((ch, i) => {
    const w = widths[i];
    const mid = a + w / 2;
    ctx.save();
    ctx.translate(x + mid, y + (mid * mid) / (2 * R));
    ctx.rotate(Math.atan(mid / R));
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    a += w + tracking;
  });
  ctx.restore();
  return { w: tw, h: rise + 12 };
}

const SETTLEMENT = { font: "700 9.5px Palatino, 'Palatino Linotype', Georgia, serif", fill: INK, tracking: 1.6 };
const REGION = { font: "8.5px Palatino, 'Palatino Linotype', Georgia, serif", fill: "#6b5232", tracking: 2.4 };
const WATER = { font: "italic 9.5px Palatino, 'Palatino Linotype', Georgia, serif", fill: "#3a606e", tracking: 1.2 };
const MINOR = { font: "7px Palatino, 'Palatino Linotype', Georgia, serif", fill: "#4a3626", tracking: 1.4 };

const LABELS = [
  { text: "HIGH COUNTRY RANCH", poi: "ranch", style: SETTLEMENT, dy: 22, rule: true },
  { text: "SILVER CREEK", poi: "silverCreek", style: SETTLEMENT, dy: -20, rule: true },
  { text: "LAKE MERCY", poi: "lakeMercy", style: WATER, rise: 7, dy: -4 },
  { text: "NORTHERN PINES", poi: "northernPines", style: REGION, rise: 6, dy: -6 },
  { text: "ASHES ON THE DIVIDE", poi: "burn", style: REGION, rise: 8, dx: 8, dy: 4 },
  { text: "WESTERN RANGE", poi: "westernRange", style: REGION, rise: 6, dy: -8 },
  { text: "IRON VALLEY", poi: "ironValley", style: REGION, rise: 6, dy: 2 },
  { text: "SOUTHERN BADLANDS", poi: "badlands", style: REGION, rise: 8, dy: 0 },
  { text: "TRIBAL LANDS", poi: "tribal", style: REGION, rise: 5, dy: 18 },
  { text: "FORT GRANT", poi: "fortGrant", style: MINOR, dy: -14 },
  { text: "MISSION", poi: "mission", style: MINOR, dy: -14 },
  { text: "STAMP MILL", poi: "stampMill", style: MINOR, dy: -13 }
];

/**
 * Paint the chart lettering with book-order priority: settlements first, then
 * water, regions, minor places — a label that would collide with one already
 * placed is skipped, exactly how a cartographer resolves a crowded sheet.
 */
function paintLabels(ctx, playerX, playerZ) {
  const placed = [];
  const fits = (x, y, w, h) => {
    for (const b of placed) {
      if (Math.abs(x - b.x) < (w + b.w) / 2 + 6 && Math.abs(y - b.y) < (h + b.h) / 2 + 3) {
        return false;
      }
    }
    return true;
  };
  // The ground under your own arrow is spoken for: the needle, the objective
  // ring and its name all live there, so a label that would land in that zone
  // waits until you ride clear.
  const CENTRE = { x0: DISPLAY / 2 - 42, x1: DISPLAY / 2 + 42, y0: DISPLAY / 2 - 24, y1: DISPLAY / 2 + 34 };
  const inCentre = (x, y, w, h) =>
    x + w / 2 > CENTRE.x0 && x - w / 2 < CENTRE.x1 && y + h / 2 > CENTRE.y0 && y - h / 2 < CENTRE.y1;
  for (const L of LABELS) {
    const poi = POS[L.poi];
    if (!poi) {
      continue;
    }
    ctx.save();
    ctx.font = L.style.font;
    const textW = [...L.text].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + L.style.tracking * (L.text.length - 1);
    const h = L.rise ? L.rise + 14 : 14;
    const anchor = displayPoint(poi.x, poi.z, playerX, playerZ);
    const x = anchor.x + (L.dx || 0);
    const y = anchor.y + (L.dy || 0);
    // width-aware margins: a wide label must clear the frame by half itself
    if (x < textW / 2 + 16 || x > DISPLAY - textW / 2 - 16 || y < 26 + h / 2 || y > DISPLAY - 42 - h / 2 || inCentre(x, y, textW, h)) {
      ctx.restore();
      continue;
    }
    if (!fits(x, y, textW, h)) {
      ctx.restore();
      continue;
    }
    ctx.fillStyle = L.style.fill;
    ctx.strokeStyle = "rgba(226, 208, 164, 0.88)";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    if (L.rise) {
      arcText(ctx, L.text, x, y, L.rise);
    } else {
      trackedText(ctx, L.text, x, y, L.style.tracking);
      if (L.rule) {
        ctx.strokeStyle = "rgba(61, 41, 24, 0.55)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - textW * 0.38, y + 5);
        ctx.lineTo(x + textW * 0.38, y + 5);
        ctx.stroke();
      }
    }
    placed.push({ x, y, w: textW, h });
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* Instruments: rose, scale bar, cartouche, frame                      */
/* ------------------------------------------------------------------ */

function paintRose(ctx) {
  const cx = DISPLAY - 44;
  const cy = 50;
  const r = 27;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, r - 3.5, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = i * Math.PI / 4 - Math.PI / 2;
    const long = i % 2 === 0;
    const tip = long ? r - 6 : (r - 6) * 0.52;
    const half = long ? 4.2 : 2.8;
    const px = Math.cos(a);
    const py = Math.sin(a);
    const qx = Math.cos(a + Math.PI / 2);
    const qy = Math.sin(a + Math.PI / 2);
    // each point is a kite: tip, one base shoulder, the hub — lit half gold,
    // shadowed half ink
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(px * tip, py * tip);
    ctx.lineTo(qx * half, qy * half);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(px * tip, py * tip);
    ctx.lineTo(-qx * half, -qy * half);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#efe2c6";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "700 10px Palatino, Georgia, serif";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -r - 4);
  ctx.restore();
}

/**
 * The scale bar: alternating ink-and-cream segments with end ticks, labelled
 * in the surveyor's units. The bar picks the fraction of a mile whose length
 * lands nearest ~90 display pixels at the current zoom.
 */
function paintScale(ctx) {
  const mPerPx = 10 / zoomLevel; // 1 chart px = 10 m of world
  const opts = [
    [804.7, "HALF MILE"],
    [402.3, "QUARTER MILE"],
    [201.2, "EIGHTH MILE"]
  ];
  let best = opts[0];
  for (const o of opts) {
    if (Math.abs(o[0] / mPerPx - 90) < Math.abs(best[0] / mPerPx - 90)) {
      best = o;
    }
  }
  const px = best[0] / mPerPx;
  const x0 = 30;
  const y = DISPLAY - 36;
  const seg = px / 4;
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? INK : "#efe2c6";
    ctx.fillRect(x0 + i * seg, y, seg, 4);
  }
  ctx.strokeStyle = INK;
  ctx.strokeRect(x0, y, px, 4);
  ctx.beginPath();
  [x0, x0 + px].forEach((x) => {
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 7);
  });
  ctx.stroke();
  ctx.font = "700 6.5px Palatino, Georgia, serif";
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  trackedText(ctx, best[1], x0 + px / 2, y - 5, 1.2);
  ctx.restore();
}

function paintCartouche(ctx) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 10.5px Palatino, 'Palatino Linotype', Georgia, serif";
  ctx.fillStyle = INK;
  ctx.strokeStyle = "rgba(226, 208, 164, 0.88)";
  ctx.lineWidth = 3;
  const title = "THE HIGH COUNTRY";
  const tw = trackedText(ctx, title, DISPLAY / 2, 27, 2.6);
  // flourish rules with diamond terminals flanking the title
  const y = 23.5;
  const gap = tw / 2 + 12;
  [-1, 1].forEach((s) => {
    ctx.strokeStyle = "rgba(61, 41, 24, 0.6)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(DISPLAY / 2 + s * gap, y);
    ctx.lineTo(DISPLAY / 2 + s * (gap + 34), y);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.save();
    ctx.translate(DISPLAY / 2 + s * gap, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-1.7, -1.7, 3.4, 3.4);
    ctx.restore();
  });
  ctx.font = "italic 7.5px Palatino, Georgia, serif";
  ctx.fillStyle = "#6a4e32";
  ctx.strokeStyle = "rgba(226, 208, 164, 0.88)";
  ctx.lineWidth = 2.5;
  ctx.strokeText("surveyed from the ranch · anno 1887", DISPLAY / 2, 38);
  ctx.fillText("surveyed from the ranch · anno 1887", DISPLAY / 2, 38);
  ctx.restore();
}

function paintFrame(ctx) {
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, DISPLAY - 16, DISPLAY - 16);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(12, 12, DISPLAY - 24, DISPLAY - 24);
  // corner rosettes: a small gold diamond pinning each corner
  [[12, 12], [DISPLAY - 12, 12], [12, DISPLAY - 12], [DISPLAY - 12, DISPLAY - 12]].forEach(([x, y]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = GOLD;
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
  });
}

function paintYou(ctx, px, py, yaw) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(lookCanvasAngle(yaw));
  ctx.fillStyle = "#c43c1a";
  ctx.strokeStyle = "#f4ead2";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(-13, 11);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-13, -11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The objective: route, approach, marker (unchanged affordances)      */
/* ------------------------------------------------------------------ */

const MARK = "#b8902f";

function metresToPx(playerX, playerZ) {
  const view = viewWindow(playerX, playerZ);
  return (DISPLAY / view.vw) * (W / WORLD.width);
}

const APPROACH_COLOR = {
  yard: "#8a5a2b",
  gate: "#5d3a14",
  street: "#9a6a30",
  door: "#6b4423",
  porch: "#6b4423",
  hitch: "#55524a",
  dock: "#3a606e",
  camp: "#7c6a3a",
  trailhead: "#5d6e3a",
  overlook: "#a8542a"
};

function paintRoute(ctx, target, playerX, playerZ) {
  const route = target.route;
  if (!route || route.status !== "routed" || !route.waypoints.length) {
    return;
  }
  const px = metresToPx(playerX, playerZ);
  const pts = route.waypoints;
  const step = Math.max(1, Math.ceil(pts.length / 40));
  ctx.save();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "rgba(122, 82, 40, 0.8)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i += step) {
    const w = pts[i];
    // Skip vertices far outside the visible slice: without this a whole-map
    // route keeps a live stroke spanning coordinates the canvas clamps, which
    // painted phantom chords across the chart.
    const c = displayPoint(w.x, w.z, playerX, playerZ);
    if (c.x < -DISPLAY || c.x > DISPLAY * 2 || c.y < -DISPLAY || c.y > DISPLAY * 2) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(c.x, c.y);
      started = true;
    } else {
      ctx.lineTo(c.x, c.y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const b of route.blockedPts ?? []) {
    const a = displayPoint(b.ax, b.az, playerX, playerZ);
    const c = displayPoint(b.bx, b.bz, playerX, playerZ);
    ctx.strokeStyle = "rgba(158, 42, 28, 0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  ctx.restore();
}

function paintApproach(ctx, approach, playerX, playerZ) {
  const p = displayPoint(approach.x, approach.z, playerX, playerZ);
  const rPx = approach.r * metresToPx(playerX, playerZ);
  const color = APPROACH_COLOR[approach.type] || MARK;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, rPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 4.2);
  ctx.lineTo(p.x + 4.2, p.y);
  ctx.lineTo(p.x, p.y + 4.2);
  ctx.lineTo(p.x - 4.2, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (typeof approach.face === "number") {
    const hx = Math.sin(approach.face);
    const hz = -Math.cos(approach.face);
    ctx.beginPath();
    ctx.moveTo(p.x + hx * 5, p.y + hz * 5);
    ctx.lineTo(p.x + hx * 9, p.y + hz * 9);
    ctx.stroke();
  }
  ctx.restore();
}

function paintObjective(ctx, target, playerX, playerZ) {
  paintRoute(ctx, target, playerX, playerZ);
  if (target.approach) {
    paintApproach(ctx, target.approach, playerX, playerZ);
  }
  const p = displayPoint(target.x, target.z, playerX, playerZ);
  const m = 30;
  const cx = Math.min(DISPLAY - m, Math.max(m, p.x));
  const cy = Math.min(DISPLAY - m, Math.max(m, p.y));
  ctx.save();
  ctx.textAlign = "center";
  if (cx !== p.x || cy !== p.y) {
    // Off the visible slice: a chevron pinned to the frame edge, aimed at
    // the destination, so the marker is findable at any zoom level.
    const ang = Math.atan2(p.y - cy, p.x - cx);
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = MARK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-5, 7);
    ctx.lineTo(-5, -7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#f4ead2";
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = MARK;
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // Name under the marker, with the same parchment halo the map labels use.
    ctx.font = "8px Palatino, Georgia, serif";
    ctx.fillStyle = MARK;
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(226, 208, 164, 0.9)";
    ctx.shadowBlur = 3;
    ctx.fillText(target.name, 0, 17);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

function paintGlyphs(ctx, playerX, playerZ) {
  const at = (key) => {
    const poi = POS[key];
    if (!poi) {
      return null;
    }
    return displayPoint(poi.x, poi.z, playerX, playerZ);
  };
  const inView = (p) => p && p.x > -20 && p.x < DISPLAY + 20 && p.y > -20 && p.y < DISPLAY + 20;
  const spots = {
    ranch: at("ranch"),
    town: at("silverCreek"),
    tribal: at("tribal"),
    mission: at("mission"),
    tower: at("fireWatch"),
    fort: at("fortGrant"),
    mines: at("mines"),
    mill: at("stampMill")
  };
  if (inView(spots.ranch)) drawHouse(ctx, spots.ranch.x, spots.ranch.y);
  if (inView(spots.town)) drawTown(ctx, spots.town.x, spots.town.y);
  if (inView(spots.tribal)) drawTeepees(ctx, spots.tribal.x, spots.tribal.y);
  if (inView(spots.mission)) drawCross(ctx, spots.mission.x, spots.mission.y);
  if (inView(spots.tower)) drawTower(ctx, spots.tower.x, spots.tower.y);
  if (inView(spots.mill)) drawMill(ctx, spots.mill.x, spots.mill.y);
  if (inView(spots.fort)) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.strokeRect(spots.fort.x - 5.5, spots.fort.y - 5.5, 11, 11);
  }
  if (inView(spots.mines)) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(spots.mines.x - 4.5, spots.mines.y + 4.5);
    ctx.lineTo(spots.mines.x + 4.5, spots.mines.y - 4.5);
    ctx.moveTo(spots.mines.x - 4.5, spots.mines.y - 4.5);
    ctx.lineTo(spots.mines.x + 4.5, spots.mines.y + 4.5);
    ctx.stroke();
  }
}

export function createMinimap() {
  const root = document.getElementById("minimap");
  const canvas = document.getElementById("minimap-chart");
  canvas.width = DISPLAY;
  canvas.height = DISPLAY;
  const base = paintBase();
  // dev probe: lets a harness read the terrain sheet back for verification
  if (typeof window !== "undefined") {
    window.__minimapBase = base;
  }
  const ctx = canvas.getContext("2d");
  // Last known player state so a wheel zoom can repaint immediately instead
  // of waiting for the next frame's update().
  const last = { x: 0, z: 0, yaw: 0 };
  // The active objective's destination ({ name, x, z }) or null. Set by the
  // frame loop from missions.objectivePlace() — nothing here reads mission
  // state directly, so the chart stays decoupled from the loop.
  let target = null;

  function setObjective(next) {
    target = next;
  }

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
    ctx.drawImage(
      base,
      view.sx * BASE_SCALE, view.sy * BASE_SCALE,
      view.vw * BASE_SCALE, view.vh * BASE_SCALE,
      0, 0, DISPLAY, DISPLAY
    );
    // display-space vignette: the sheet darkens toward its own edges no
    // matter where the crop sits
    const vig = ctx.createRadialGradient(
      DISPLAY / 2, DISPLAY / 2, DISPLAY * 0.42,
      DISPLAY / 2, DISPLAY / 2, DISPLAY * 0.74
    );
    vig.addColorStop(0, "rgba(60, 32, 12, 0)");
    vig.addColorStop(1, "rgba(60, 32, 12, 0.22)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, DISPLAY, DISPLAY);

    paintCreeks(ctx, x, z);
    paintRoads(ctx, x, z);
    paintGlyphs(ctx, x, z);
    paintLabels(ctx, x, z);
    if (target) {
      paintObjective(ctx, target, x, z);
    }
    paintYou(ctx, view.px, view.py, yaw);
    paintScale(ctx);
    paintRose(ctx);
    paintCartouche(ctx);
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

  return { show, toggleSize, update, setObjective };
}