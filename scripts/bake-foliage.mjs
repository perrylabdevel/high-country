/**
 * Bake foliage atlases to PNG: albedo (with alpha) + tangent-space normal.
 *
 * Foliage was the only surface class in the game still painted flat at runtime
 * — terrain, dirt, rock and bark all get albedo + normal + ORM through the KTX2
 * pipeline, while grass and needles had colour and nothing else. With no normal
 * map every blade shades as a flat sheet no matter how it is lit, which is the
 * ceiling on how solid the ground cover can look.
 *
 * A blade is a half-cylinder in cross-section, so its surface normal rotates
 * across its width. That is computed here per segment and written into a real
 * normal map, which is what an authored or scanned atlas would supply.
 *
 *   node scripts/bake-foliage.mjs
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "public/textures/foliage";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id=a></canvas>");

const images = await page.evaluate(() => {
  // ---- shared blade maths -------------------------------------------------
  const CROSS_BEND = 1.05; // half-angle of the blade's cross-section curl

  function spine(x0, y0, len, lean) {
    const tipX = x0 + lean;
    const tipY = y0 - len;
    const cx = x0 + lean * 0.16;
    const cy = y0 - len * 0.62;
    return (t) => {
      const mt = 1 - t;
      return {
        x: mt * mt * x0 + 2 * mt * t * cx + t * t * tipX,
        y: mt * mt * y0 + 2 * mt * t * cy + t * t * tipY
      };
    };
  }

  /** Encode a tangent-space normal. Canvas y is down, texture v is up. */
  function enc(nx, ny, nz) {
    const l = Math.hypot(nx, ny, nz) || 1;
    return `rgb(${Math.round((nx / l * 0.5 + 0.5) * 255)},${Math.round((-ny / l * 0.5 + 0.5) * 255)},${Math.round((nz / l * 0.5 + 0.5) * 255)})`;
  }

  /**
   * Draw one blade into both targets. The albedo gets a length gradient; the
   * normal gets a per-segment gradient across the width, which is what makes a
   * blade catch light along one edge instead of reading as a flat cut-out.
   */
  function blade(ca, cn, x0, y0, len, lean, wBase, cols, segs) {
    const at = spine(x0, y0, len, lean);
    for (let i = 0; i < segs; i += 1) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const p0 = at(t0);
      const p1 = at(t1);
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dl = Math.hypot(dx, dy) || 1;
      const px = -dy / dl;
      const py = dx / dl;
      const w0 = wBase * Math.pow(1 - t0, 0.7);
      const w1 = wBase * Math.pow(1 - t1, 0.7);
      const quad = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(p0.x + px * w0, p0.y + py * w0);
        ctx.lineTo(p1.x + px * w1, p1.y + py * w1);
        ctx.lineTo(p1.x - px * w1, p1.y - py * w1);
        ctx.lineTo(p0.x - px * w0, p0.y - py * w0);
        ctx.closePath();
      };

      // albedo: root -> mid -> tip along the blade
      const mid = (t0 + t1) * 0.5;
      const c = mid < 0.55
        ? mixRGB(cols.root, cols.mid, mid / 0.55)
        : mixRGB(cols.mid, cols.tip, (mid - 0.55) / 0.45);
      ca.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      quad(ca);
      ca.fill();

      // normal: rotate across the width to model the half-cylinder
      const mx = (p0.x + p1.x) * 0.5;
      const my = (p0.y + p1.y) * 0.5;
      const w = (w0 + w1) * 0.5 || 0.5;
      const g = cn.createLinearGradient(mx - px * w, my - py * w, mx + px * w, my + py * w);
      const s = Math.sin(CROSS_BEND);
      const z = Math.cos(CROSS_BEND);
      g.addColorStop(0, enc(-px * s, -py * s, z));
      g.addColorStop(0.5, enc(0, 0, 1));
      g.addColorStop(1, enc(px * s, py * s, z));
      cn.fillStyle = g;
      quad(cn);
      cn.fill();
    }
  }

  function mixRGB(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function pair(size) {
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      return c;
    };
    const a = mk();
    const n = mk();
    const ca = a.getContext("2d");
    const cn = n.getContext("2d");
    // Normal maps must not have transparent gaps: flat where there is no blade.
    cn.fillStyle = enc(0, 0, 1);
    cn.fillRect(0, 0, size, size);
    return { a, n, ca, cn };
  }

  // ---- grass atlas --------------------------------------------------------
  const GRASS = 2048;
  const gp = pair(GRASS);
  const panel = GRASS / 2;
  const MEADOW = { root: [30, 44, 21], mid: [86, 108, 46], tip: [128, 140, 72] };
  const DRY = { root: [46, 50, 26], mid: [116, 116, 58], tip: [176, 164, 98] };
  const specs = [
    { ox: 0, oy: panel, blades: 150, clumps: 7, clumpW: 0.115, tall: 0.4, wide: 0.0092, lean: 0.1, cols: MEADOW },
    { ox: panel, oy: panel, blades: 120, clumps: 4, clumpW: 0.085, tall: 0.72, wide: 0.0115, lean: 0.16, cols: MEADOW },
    { ox: 0, oy: 0, blades: 96, clumps: 4, clumpW: 0.08, tall: 0.93, wide: 0.0105, lean: 0.3, cols: MEADOW },
    { ox: panel, oy: 0, blades: 110, clumps: 5, clumpW: 0.105, tall: 0.5, wide: 0.0098, lean: 0.28, cols: DRY }
  ];
  for (const sp of specs) {
    const root = sp.oy + panel * 0.98;
    for (let c = 0; c < sp.clumps; c += 1) {
      const cxp = sp.ox + panel * (0.12 + (c + 0.5) / sp.clumps * 0.76 + (Math.random() - 0.5) * 0.06);
      const per = Math.round(sp.blades / sp.clumps);
      for (let i = 0; i < per; i += 1) {
        const spreadX = (Math.random() - 0.5) * panel * sp.clumpW;
        const x = cxp + spreadX;
        const len = panel * sp.tall * (0.5 + Math.random() * 0.5);
        const lean = (spreadX * 2.2 + (Math.random() - 0.5) * panel * sp.lean) * (0.4 + Math.random() * 0.9);
        const w = panel * sp.wide * (0.65 + Math.random() * 0.7);
        const dry = Math.random();
        const cols = {
          root: sp.cols.root,
          mid: sp.cols.mid.map((v) => v * (0.82 + Math.random() * 0.36)),
          tip: dry > 0.72 ? [166, 152, 92] : sp.cols.tip.map((v) => v * (0.85 + Math.random() * 0.3))
        };
        blade(gp.ca, gp.cn, x, root, len, lean, w, cols, 9);
      }
    }
  }

  // ---- conifer sprig ------------------------------------------------------
  const CONE = 1024;
  const cp = pair(CONE);
  const stemY = CONE * 0.5;
  const tipX = CONE * 0.94;
  cp.ca.lineCap = "round";
  for (let i = 0; i < 5; i += 1) {
    cp.ca.strokeStyle = `rgb(${50 + i * 4},${37 + i * 3},${23 + i * 2})`;
    cp.ca.lineWidth = 13 - i * 2.2;
    cp.ca.beginPath();
    cp.ca.moveTo(0, stemY);
    cp.ca.quadraticCurveTo(CONE * 0.5, stemY - CONE * 0.02, tipX, stemY + CONE * 0.008);
    cp.ca.stroke();
  }
  const NEEDLE = { root: [26, 50, 32], mid: [44, 84, 50], tip: [70, 108, 66] };
  const clusters = 22;
  for (let c = 0; c < clusters; c += 1) {
    const t = (c + 0.4) / clusters;
    const cx = t * tipX;
    const cy = stemY + Math.sin(c * 1.7) * CONE * 0.012;
    const taper = Math.pow(1 - t, 0.62);
    const spread = CONE * 0.26 * taper;
    const per = 20 + ((c * 5) % 8);
    for (let k = 0; k < per; k += 1) {
      const up = k % 2 === 0 ? -1 : 1;
      const ang = up * (Math.PI * 0.42) + (Math.random() - 0.5) * 0.7 - 0.16;
      const len = spread * (0.5 + Math.random() * 0.7);
      const sx = cx + (Math.random() - 0.5) * CONE * 0.02;
      const shade = 0.8 + Math.random() * 0.4;
      blade(
        cp.ca, cp.cn, sx, cy, len,
        Math.cos(ang) * len * 1.1,
        1.9 + Math.random() * 1.5,
        {
          root: NEEDLE.root,
          mid: NEEDLE.mid.map((v) => v * shade),
          tip: NEEDLE.tip.map((v) => v * shade)
        },
        4
      );
    }
  }

  // ---- sage: small oval leaves on woody branchlets --------------------------
  const SAGE = 1024;
  const sp2 = pair(SAGE);
  sp2.ca.lineCap = "round";
  const branchTips = [];
  for (let i = 0; i < 7; i += 1) {
    const x0 = SAGE * (0.38 + (i / 7 - 0.5) * 0.3);
    const tx = SAGE * (0.16 + (i + 0.5) / 7 * 0.68) + (Math.random() - 0.5) * SAGE * 0.05;
    const ty = SAGE * (0.2 + Math.random() * 0.3);
    sp2.ca.strokeStyle = `rgb(${76 + Math.random() * 16 | 0},${62 + Math.random() * 14 | 0},${44 + Math.random() * 12 | 0})`;
    sp2.ca.lineWidth = 9 - i * 0.7;
    sp2.ca.beginPath();
    sp2.ca.moveTo(x0, SAGE * 0.99);
    sp2.ca.quadraticCurveTo(x0 + (tx - x0) * 0.3, SAGE * 0.62, tx, ty);
    sp2.ca.stroke();
    branchTips.push({ x: tx, y: ty, x0 });
  }
  // A leaf is a short wide blade: same half-cylinder curl across its width, so
  // it catches light along one edge instead of reading as a flat sticker.
  const sageLeaf = (cx, cy, r, ang, shade) => {
    const dx = Math.cos(ang) * r;
    const dy = Math.sin(ang) * r;
    blade(sp2.ca, sp2.cn, cx - dx * 0.5, cy - dy * 0.5, r, dx * 0.9 + dy * 0.1, r * 0.42,
      { root: shade.map((v) => v * 0.72), mid: shade, tip: shade.map((v) => v * 1.12) }, 4);
  };
  for (const t of branchTips) {
    for (let i = 0; i < 18; i += 1) {
      const f = 0.18 + (i / 18) * 0.82;
      const bx = t.x0 + (t.x - t.x0) * f + (Math.random() - 0.5) * SAGE * 0.05;
      const by = SAGE * 0.99 + (t.y - SAGE * 0.99) * f + (Math.random() - 0.5) * SAGE * 0.04;
      for (let k = 0; k < 3 + ((i * 3) % 3); k += 1) {
        const g = 104 + Math.random() * 34;
        sageLeaf(
          bx + (Math.random() - 0.5) * SAGE * 0.055,
          by + (Math.random() - 0.5) * SAGE * 0.055,
          SAGE * (0.026 + Math.random() * 0.03),
          Math.random() * Math.PI * 2,
          [g - 18 + Math.random() * 20, g, g - 34 + Math.random() * 18]
        );
      }
    }
  }

  // ---- broadleaf: cottonwood / aspen foliage --------------------------------
  const BROAD = 1024;
  const bp = pair(BROAD);
  for (let i = 0; i < 150; i += 1) {
    const cx = BROAD * (0.1 + Math.random() * 0.8);
    const cy = BROAD * (0.1 + Math.random() * 0.8);
    const r = BROAD * (0.05 + Math.random() * 0.075);
    const ang = Math.random() * Math.PI * 2;
    const g = 92 + Math.random() * 60;
    const shade = [46 + Math.random() * 30, g, 34 + Math.random() * 24];
    const dx = Math.cos(ang) * r;
    const dy = Math.sin(ang) * r;
    blade(bp.ca, bp.cn, cx - dx * 0.5, cy - dy * 0.5, r, dx * 0.9 + dy * 0.1, r * 0.46,
      { root: shade.map((v) => v * 0.7), mid: shade, tip: shade.map((v) => v * 1.14) }, 4);
  }

  return {
    "sage_albedo": sp2.a.toDataURL("image/png"),
    "sage_normal": sp2.n.toDataURL("image/png"),
    "broad_albedo": bp.a.toDataURL("image/png"),
    "broad_normal": bp.n.toDataURL("image/png"),
    "grass_albedo": gp.a.toDataURL("image/png"),
    "grass_normal": gp.n.toDataURL("image/png"),
    "needle_albedo": cp.a.toDataURL("image/png"),
    "needle_normal": cp.n.toDataURL("image/png")
  };
});

for (const [name, data] of Object.entries(images)) {
  const buf = Buffer.from(data.split(",")[1], "base64");
  writeFileSync(`${OUT}/${name}.png`, buf);
  console.log(`${OUT}/${name}.png  ${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
