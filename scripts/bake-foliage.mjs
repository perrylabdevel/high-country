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
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = "public/textures/foliage";
mkdirSync(OUT, { recursive: true });

/**
 * Find a Chromium to draw with.
 *
 * Playwright's own download is the right answer wherever it exists, so try
 * that first and fall back to a system browser only if it does not. Pinning
 * executablePath to a hard-coded /Applications path did the reverse: the
 * baker then ran on exactly one machine and failed everywhere else, which is
 * how the atlases came to be baked piecemeal across two checkouts and the
 * asset bundle ended up describing only some of them.
 */
async function launchChromium() {
  const override = process.env.PLAYWRIGHT_CHROMIUM;
  if (override) {
    return chromium.launch({ executablePath: override });
  }
  try {
    return await chromium.launch();
  } catch (err) {
    const fallbacks = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/opt/pw-browsers/chromium",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome"
    ];
    for (const path of fallbacks) {
      if (existsSync(path)) {
        return chromium.launch({ executablePath: path });
      }
    }
    throw new Error(
      `no Chromium found. Run "npx playwright install chromium", or set ` +
        `PLAYWRIGHT_CHROMIUM to a browser binary.\n  ${err.message}`
    );
  }
}

const browser = await launchChromium();
const page = await browser.newPage();
await page.setContent("<canvas id=a></canvas>");

const images = await page.evaluate(() => {
  /**
   * Seeded RNG, replacing Math.random throughout.
   *
   * These atlases are hash-verified members of the asset bundle, so an
   * unseeded baker made them unreproducible: once a file was lost off the one
   * machine that had baked it, no re-run could recreate the bytes the manifest
   * demanded, and the only copies in existence were whatever happened to be on
   * someone's disk. That is not a theoretical risk — six atlases had to be
   * copied between machines by hand for exactly this reason. Seeded, a lost
   * atlas is one `npm run bake:foliage` away.
   *
   * mulberry32: small, fast, and good enough for scattering leaves.
   */
  let seed = 0x9e3779b9;
  function rnd() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

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
      const cxp = sp.ox + panel * (0.12 + (c + 0.5) / sp.clumps * 0.76 + (rnd() - 0.5) * 0.06);
      const per = Math.round(sp.blades / sp.clumps);
      for (let i = 0; i < per; i += 1) {
        const spreadX = (rnd() - 0.5) * panel * sp.clumpW;
        const x = cxp + spreadX;
        const len = panel * sp.tall * (0.5 + rnd() * 0.5);
        const lean = (spreadX * 2.2 + (rnd() - 0.5) * panel * sp.lean) * (0.4 + rnd() * 0.9);
        const w = panel * sp.wide * (0.65 + rnd() * 0.7);
        const dry = rnd();
        const cols = {
          root: sp.cols.root,
          mid: sp.cols.mid.map((v) => v * (0.82 + rnd() * 0.36)),
          tip: dry > 0.72 ? [166, 152, 92] : sp.cols.tip.map((v) => v * (0.85 + rnd() * 0.3))
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
  // Denser sprig: the first bake left broad gaps between needles that read as
  // sparse canopies from the audit cameras (P2). More clusters, more needles
  // per cluster, and slightly wider needles fill the card without making it a
  // solid block.
  const clusters = 30;
  for (let c = 0; c < clusters; c += 1) {
    const t = (c + 0.4) / clusters;
    const cx = t * tipX;
    const cy = stemY + Math.sin(c * 1.7) * CONE * 0.012;
    const taper = Math.pow(1 - t, 0.62);
    const spread = CONE * 0.26 * taper;
    const per = 28 + ((c * 5) % 10);
    for (let k = 0; k < per; k += 1) {
      const up = k % 2 === 0 ? -1 : 1;
      const ang = up * (Math.PI * 0.42) + (rnd() - 0.5) * 0.7 - 0.16;
      const len = spread * (0.5 + rnd() * 0.7);
      const sx = cx + (rnd() - 0.5) * CONE * 0.02;
      const shade = 0.8 + rnd() * 0.4;
      blade(
        cp.ca, cp.cn, sx, cy, len,
        Math.cos(ang) * len * 1.1,
        2.3 + rnd() * 1.7,
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
  // Two things to get right. The bush has to fill its panel: the instance scale
  // sets the CARD, so content that occupies two thirds of it renders a bush two
  // thirds the size asked for. And sage leaves are small rounded ovals — reusing
  // the blade shape gave angular wedges, because a blade tapers to a point.
  const SAGE = 1024;
  const sp2 = pair(SAGE);
  sp2.ca.lineCap = "round";
  const oval = (cx, cy, r, ang, shade) => {
    const px = -Math.sin(ang);
    const py = Math.cos(ang);
    sp2.ca.save();
    sp2.ca.translate(cx, cy);
    sp2.ca.rotate(ang);
    sp2.ca.fillStyle = `rgb(${shade[0] | 0},${shade[1] | 0},${shade[2] | 0})`;
    sp2.ca.beginPath();
    sp2.ca.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
    sp2.ca.fill();
    sp2.ca.restore();
    // Same half-cylinder curl across the leaf's short axis.
    const g = sp2.cn.createLinearGradient(cx - px * r * 0.5, cy - py * r * 0.5, cx + px * r * 0.5, cy + py * r * 0.5);
    const sN = Math.sin(0.9);
    const zN = Math.cos(0.9);
    g.addColorStop(0, enc(-px * sN, -py * sN, zN));
    g.addColorStop(0.5, enc(0, 0, 1));
    g.addColorStop(1, enc(px * sN, py * sN, zN));
    sp2.cn.save();
    sp2.cn.translate(cx, cy);
    sp2.cn.rotate(ang);
    sp2.cn.translate(-cx, -cy);
    sp2.cn.fillStyle = g;
    sp2.cn.beginPath();
    sp2.cn.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
    sp2.cn.fill();
    sp2.cn.restore();
  };
  const branchTips = [];
  for (let i = 0; i < 9; i += 1) {
    const x0 = SAGE * (0.5 + (i / 9 - 0.5) * 0.22);
    const tx = SAGE * (0.08 + (i + 0.5) / 9 * 0.84) + (rnd() - 0.5) * SAGE * 0.04;
    const ty = SAGE * (0.06 + rnd() * 0.16);
    sp2.ca.strokeStyle = `rgb(${76 + rnd() * 16 | 0},${62 + rnd() * 14 | 0},${44 + rnd() * 12 | 0})`;
    sp2.ca.lineWidth = 10 - i * 0.6;
    sp2.ca.beginPath();
    sp2.ca.moveTo(x0, SAGE * 0.99);
    sp2.ca.quadraticCurveTo(x0 + (tx - x0) * 0.3, SAGE * 0.58, tx, ty);
    sp2.ca.stroke();
    branchTips.push({ x: tx, y: ty, x0 });
  }
  for (const t of branchTips) {
    for (let i = 0; i < 26; i += 1) {
      const f = 0.1 + (i / 26) * 0.9;
      const bx = t.x0 + (t.x - t.x0) * f + (rnd() - 0.5) * SAGE * 0.05;
      const by = SAGE * 0.99 + (t.y - SAGE * 0.99) * f + (rnd() - 0.5) * SAGE * 0.04;
      for (let k = 0; k < 4; k += 1) {
        const g = 108 + rnd() * 36;
        oval(
          bx + (rnd() - 0.5) * SAGE * 0.06,
          by + (rnd() - 0.5) * SAGE * 0.06,
          SAGE * (0.02 + rnd() * 0.022),
          rnd() * Math.PI * 2,
          [g - 14 + rnd() * 18, g, g - 30 + rnd() * 16]
        );
      }
    }
  }

  // ---- broadleaf: cottonwood / aspen foliage --------------------------------
  const BROAD = 1024;
  const bp = pair(BROAD);
  for (let i = 0; i < 150; i += 1) {
    const cx = BROAD * (0.1 + rnd() * 0.8);
    const cy = BROAD * (0.1 + rnd() * 0.8);
    const r = BROAD * (0.05 + rnd() * 0.075);
    const ang = rnd() * Math.PI * 2;
    const g = 92 + rnd() * 60;
    const shade = [46 + rnd() * 30, g, 34 + rnd() * 24];
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

// ---- compress to KTX2 -------------------------------------------------------
// Foliage was the only texture class shipping as raw PNG. Uncompressed, the
// four atlases cost ~64 MB of VRAM (the HUD's texture memory went 134 -> 198 MB
// when they landed); UASTC keeps them compressed on the GPU for roughly a
// quarter of that, and matches how every other texture in the project ships.
const { encodeToKTX2 } = await import("ktx2-encoder");
const sharp = (await import("sharp")).default;
const { readFileSync } = await import("node:fs");

const imageDecoder = async (buffer) => {
  const { data, info } = await sharp(Buffer.from(buffer)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

// Normal maps only. Block compression quantises the alpha channel, and a grass
// blade's value is almost entirely in its thin tapering tip — compressing the
// albedo turned fine blades into chunky blocks. Normals are low-frequency and
// carry no cutout, so they take UASTC without a visible cost, and they are the
// larger half of the set.
for (const name of Object.keys(images).filter((n) => n.endsWith("_normal"))) {
  const src = `${OUT}/${name}.png`;
  const out = await encodeToKTX2(new Uint8Array(readFileSync(src)), {
    isUASTC: true, generateMipmap: true, imageDecoder
  });
  writeFileSync(`${OUT}/${name}.ktx2`, out);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(src);
  console.log(`  -> ${name}.ktx2  ${(out.length / 1024 / 1024).toFixed(1)} MB (png removed)`);
}
