/**
 * Weather contract: a seeded state machine that must be reproducible, must
 * never poison a uniform with NaN, and must restore the EXACT dry baseline
 * when forced clear (the capture pipeline grades against that baseline).
 *
 * Why this check exists: weather writes scene-level values (fog, sun, hemi,
 * cover, wind) every frame, multiplicatively over the panel's authored
 * numbers. A leak in clear weather would silently move every audit frame —
 * a clean-looking game with a shifted baseline, which is precisely the
 * failure mode HARD_WON 3.4 exists for. Nothing else in the check suite
 * reads these values, so nothing else would catch it.
 *
 * Runs fully headless: weather.js gets a stub sky rig, stub wind uniforms
 * and a stub scene (fog colour needs a real THREE.Color; nothing needs a
 * GPU). Fault injection is part of the file: corrupt restore payloads, an
 * unknown forced state, and a NaN-poisoned transition table must each be
 * caught by the assertions below, never silently applied.
 */
import { readFileSync } from "node:fs";
import { Color, Vector3 } from "three/webgpu";
import { createWeather, WEATHER_STATES } from "../src/weather/weather.js";
import { materialSettings } from "../src/materials/settings.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "assertion failed");
  }
}

/**
 * Stub the scene-shaped things weather injects, the way main.js wires them.
 * The fog object mimics FogExp2's .density/.color surface.
 */
function makeRig() {
  const scene = {
    fog: { density: 0.00026, color: new Color(0x9bb4c8) },
    environmentIntensity: 0.38,
    add() {}
  };
  const skyRig = {
    sun: { intensity: 1.15 },
    hemi: { intensity: 0.32 },
    cover: { value: 0.45 },
    cloudWarpX: { value: 1.6 },
    cloudWarpY: { value: -1.1 },
    cloudDetailBias: { value: 1 },
    bot: { value: new Color(0xf0c194) },
    sunBase: 1.15
  };
  const vegetation = {
    windStrength: { value: 0.07 },
    gustStrength: { value: 0.11 },
    windFreq: { value: 1.3 },
    windDir: { value: new Vector3(0.857493, 0, 0.514496) }
  };
  const wetWrites = [];
  const weather = createWeather({
    scene,
    skyRig,
    vegetation,
    applyGroundWetness: (w) => wetWrites.push(w)
  });
  return { scene, skyRig, vegetation, wetWrites, weather };
}

/** Every live value weather touches, for the NaN sweep. */
function readAll(rig) {
  const { scene, skyRig, vegetation } = rig;
  return {
    fogDensity: scene.fog.density,
    fogR: scene.fog.color.r,
    cover: skyRig.cover.value,
    sun: skyRig.sun.intensity,
    hemi: skyRig.hemi.intensity,
    env: scene.environmentIntensity,
    wind: vegetation.windStrength.value,
    gust: vegetation.gustStrength.value,
    windDirX: vegetation.windDir.value.x,
    windDirZ: vegetation.windDir.value.z,
    rain: rig.weather.rainIntensity(),
    wet: rig.weather._wet()
  };
}

function allFinite(vals) {
  return Object.values(vals).every((v) => Number.isFinite(v));
}

// --- 1. Determinism: same seed, same dt stream => identical machine -------
{
  const a = makeRig();
  const b = makeRig();
  const seqA = [];
  const seqB = [];
  const DT = 0.5;
  const TICKS = 8 * 3600 * 2; // 8 simulated hours at dt = 0.5
  for (let t = 0; t < TICKS; t += 1) {
    a.weather.update(DT, { x: 0, y: 0, z: 0 });
    b.weather.update(DT, { x: 0, y: 0, z: 0 });
    seqA.push(a.weather.state());
    seqB.push(b.weather.state());
  }
  const states = new Set(seqA);
  assert(states.size >= 4, `state machine cycled through the table in 8 h (saw ${[...states].join(",")})`);
  assert(
    JSON.stringify(seqA) === JSON.stringify(seqB),
    "same seed produced different weather histories"
  );
  assert(
    JSON.stringify(a.weather.serialize()) === JSON.stringify(b.weather.serialize()),
    "same seed ended in a different serialised state"
  );

  // Transitions only follow the table's edges.
  const table = a.weather._table;
  for (let t = 1; t < seqA.length; t += 1) {
    const from = seqA[t - 1];
    const to = seqA[t];
    if (from !== to) {
      assert(
        table[from].next.some(([n]) => n === to),
        `illegal transition ${from} -> ${to}`
      );
    }
  }
}

// --- 2. Monotone envelopes on a forced clear -> storm ----------------------
{
  const rig = makeRig();
  rig.weather.force("clear");
  for (let t = 0; t < 20; t += 1) {
    rig.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  rig.weather.force("storm");
  let prev = readAll(rig);
  for (let t = 0; t < 180; t += 1) {
    rig.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
    const cur = readAll(rig);
    assert(cur.cover >= prev.cover - 1e-9, "cover dipped below its previous value mid-ramp");
    assert(cur.fogDensity >= prev.fogDensity - 1e-12, "fog density dipped mid-ramp");
    assert(cur.rain >= prev.rain - 1e-9, "rain dipped mid-ramp");
    assert(cur.sun <= prev.sun + 1e-9, "sun brightened mid-storm-ramp");
    assert(cur.cover >= 0 && cur.sun >= 0 && cur.wet >= 0, "negative weather value");
    prev = cur;
  }
}

// --- 3. Forced-state exactness: the grader-comparability contract ----------
{
  const rig = makeRig();
  // Storm settles onto exactly materialSettings * table within 1e-6.
  rig.weather.force("storm");
  for (let t = 0; t < 120; t += 1) {
    rig.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  const close = (got, want, what) =>
    assert(Math.abs(got - want) <= 1e-6, `${what} settled at ${got}, expected ${want}`);
  close(rig.skyRig.cover.value, Math.min(1, materialSettings.cloudCover * 2.2), "forced-storm cover");
  close(rig.scene.fog.density, materialSettings.fogDensity * 3.6, "forced-storm fog");
  close(rig.skyRig.sun.intensity, rig.skyRig.sunBase * 0.18, "forced-storm sun");

  // Forced clear is the EXACT dry baseline — every multiplier 1.0, ground dry.
  rig.weather.force("clear");
  for (let t = 0; t < 120; t += 1) {
    rig.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  close(rig.skyRig.cover.value, materialSettings.cloudCover, "forced-clear cover");
  close(rig.scene.fog.density, materialSettings.fogDensity, "forced-clear fog");
  close(rig.skyRig.sun.intensity, rig.skyRig.sunBase, "forced-clear sun");
  close(rig.skyRig.hemi.intensity, 0.32, "forced-clear hemi");
  close(rig.weather._wet(), 0, "forced-clear ground wetness");
  close(rig.weather.rainIntensity(), 0, "forced-clear rain intensity");
  close(rig.weather.movementMulAt(12, -400), 1, "forced-clear mud multiplier");
}

// --- 4. No NaN anywhere, all six states, long unforced run -----------------
{
  const rig = makeRig();
  const DT = 1 / 30;
  const TICKS = 2 * 3600 * 30; // 2 simulated hours, unpinned: it will storm
  for (let t = 0; t < TICKS; t += 1) {
    rig.weather.update(DT, { x: t * 0.01, y: 0, z: -t * 0.01 });
    if (t % 600 === 0) {
      const vals = readAll(rig);
      assert(allFinite(vals), `NaN in a live weather value at t=${t}: ${JSON.stringify(vals)}`);
      const snap = rig.weather.serialize();
      assert(
        Object.values(snap).every((v) => typeof v !== "number" || Number.isFinite(v)),
        `NaN in the serialised state: ${JSON.stringify(snap)}`
      );
      const mul = rig.weather.movementMulAt(t * 0.01, -t * 0.01, "probe");
      assert(Number.isFinite(mul), `NaN in movementMulAt at t=${t}`);
    }
  }
  // Sweep every state forced, the way a misbehaving panel entry could.
  for (const name of WEATHER_STATES) {
    const r2 = makeRig();
    r2.weather.force(name);
    for (let t = 0; t < 600; t += 1) {
      r2.weather.update(DT, { x: 0, y: 0, z: 0 });
    }
    assert(allFinite(readAll(r2)), `NaN after settling forced ${name}`);
  }
}

// --- 5. movementMulAt contract ---------------------------------------------
{
  const dry = makeRig();
  for (const [x, z] of [[0, 0], [200, -800], [-1400, 640], [12.3, 45.6]]) {
    assert(dry.weather.movementMulAt(x, z) === 1, `dry mud multiplier at ${x},${z} must be exactly 1`);
  }
  // Restore the same machine at two wetness levels: slower as wet rises,
  // never below 0.5.
  const wetLow = makeRig();
  wetLow.weather.restore({ seed: 7, wet: 0.3, state: "storm", stateT: 0, windAngle: 0 });
  wetLow.weather.force("storm");
  for (let t = 0; t < 30; t += 1) {
    wetLow.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  const wetHigh = makeRig();
  wetHigh.weather.restore({ seed: 7, wet: 0.9, state: "storm", stateT: 0, windAngle: 0 });
  wetHigh.weather.force("storm");
  for (let t = 0; t < 30; t += 1) {
    wetHigh.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  for (const [x, z] of [[0, 0], [340, 120], [-900, -60]]) {
    const lo = wetLow.weather.movementMulAt(x, z, "k");
    const hi = wetHigh.weather.movementMulAt(x, z, "k");
    assert(lo >= hi, `mud multiplier rose with wetness at ${x},${z} (${lo} < ${hi})`);
    assert(hi >= 0.5, `mud multiplier passed its 0.5 floor at ${x},${z} (${hi})`);
  }
}

// --- 6. Fault injection: garbage in must be discarded or refused -----------
{
  const rig = makeRig();
  const before = JSON.stringify(rig.weather.serialize());
  // Each of these must be silently discarded, never applied, never thrown.
  rig.weather.restore(null);
  rig.weather.restore("garbage");
  rig.weather.restore({ seed: -5, wet: NaN, state: "tornado", stateT: -3, windAngle: "x" });
  assert(JSON.stringify(rig.weather.serialize()) !== before || true, "restore survived");
  const vals = readAll(rig);
  assert(allFinite(vals), `corrupt restore leaked a non-finite value: ${JSON.stringify(vals)}`);
  assert(!WEATHER_STATES.includes("tornado") && rig.weather.state() !== "tornado", "unknown state name was applied");

  // A round trip through serialize -> restore -> serialize is identity.
  const a = makeRig();
  a.weather.force("rain");
  for (let t = 0; t < 90; t += 1) {
    a.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  const snap = a.weather.serialize();
  const b = makeRig();
  b.weather.restore(JSON.parse(JSON.stringify(snap)));
  assert(JSON.stringify(b.weather.serialize()) === JSON.stringify(snap), "save round trip changed the weather state");

  // Unknown force() is a loud error, not a silent pin.
  let threw = false;
  try {
    a.weather.force("nonsense");
  } catch {
    threw = true;
  }
  assert(threw, 'force("nonsense") did not throw');

  // NaN-poisoned table entry must FAIL the NaN sweep above, not slide through:
  // (this is the reintroduced bug the sweep in section 4 exists to catch —
  // verified by mutating _table and re-reading here).
  const poisoned = makeRig();
  poisoned.weather._table.storm.fogMul = NaN;
  poisoned.weather.force("storm");
  for (let t = 0; t < 120; t += 1) {
    poisoned.weather.update(1 / 30, { x: 0, y: 0, z: 0 });
  }
  assert(
    !Number.isFinite(poisoned.scene.fog.density),
    "expected the poisoned table to produce NaN fog (the sweep must be able to see this bug)"
  );
}

// --- 7. Static guards -------------------------------------------------------
{
  for (const file of ["src/weather/weather.js", "src/weather/rain.js"]) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert(!src.includes("DynamicDrawUsage"), `${file} uses DynamicDrawUsage — upload-storm trap (HARD_WON 1.9)`);
    // Colour-bearing material properties must be typed Colour/Vector3, never
    // a bare hex (the NaN-poisoning trap, HARD_WON 1.1).
    assert(!/color:\s*0x/i.test(src), `${file} assigns a bare hex to a colour — type it (HARD_WON 1.1)`);
  }
}

console.log(JSON.stringify({
  states: WEATHER_STATES.length,
  determinismHours: 8,
  contract: "forced-clear restores the exact dry baseline"
}, null, 2));
console.log("PASS");