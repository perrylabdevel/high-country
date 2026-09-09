/** Exercise the real minimap controller with drawing helpers stubbed: verify
 * work avoided and all invalidation paths, without needing WebGPU or a DOM. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function fixture(source) {
  let paints = 0;
  let wheel;
  const gradient = { addColorStop() {} };
  const ctx = { fillRect() {}, drawImage() { paints++; }, createRadialGradient() { return gradient; } };
  const root = { classList: { contains() { return false; }, remove() {}, toggle() {} } };
  const canvas = { getContext() { return ctx; } };
  const env = {
    DISPLAY: 400, BASE_SCALE: 1, zoomLevel: 1, Element: class {},
    document: { getElementById(id) { return id === 'minimap' ? root : canvas; } },
    window: { addEventListener(type, fn) { if (type === 'wheel') wheel = fn; } },
    paintBase() { return {}; }, viewWindow() { return { sx: 0, sy: 0, vw: 1, vh: 1, px: 0, py: 0 }; },
    setChartZoom(value) { env.zoomLevel = value; return true; },
  };
  for (const name of ['Creeks', 'Roads', 'Glyphs', 'Labels', 'Objective', 'You', 'Scale', 'Rose', 'Cartouche', 'Frame']) env[`paint${name}`] = () => {};
  vm.createContext(env);
  vm.runInContext(source.slice(source.indexOf('export function createMinimap()')).replace('export function', 'function') + '\nresult = createMinimap();', env);
  return { map: env.result, paints: () => paints, zoom: () => wheel({ target: null, preventDefault() {}, deltaY: -1 }) };
}
const source = readFileSync(new URL('../src/minimap.js', import.meta.url), 'utf8');
const f = fixture(source);
f.map.update(10, 20, 0);
for (let i = 0; i < 600; i++) f.map.update(10, 20, 0);
assert.equal(f.paints(), 1, 'stationary frames redraw');
f.map.update(10.0001, 20, 0);
f.map.update(10.0001, 20, 0.0001);
assert.equal(f.paints(), 3, 'small movements and turns must redraw');
f.zoom();
assert.equal(f.paints(), 4, 'stationary zoom must redraw immediately');
for (const objective of [{ name: 'A', x: 1, z: 2 }, { name: 'B', x: 1, z: 2 }, { name: 'B', x: 2, z: 2 }, null]) {
  const before = f.paints();
  f.map.setObjective(objective);
  f.map.update(10.0001, 20, 0.0001);
  assert.equal(f.paints(), before + 1, 'changed objective must redraw');
  f.map.setObjective(objective && { ...objective });
  f.map.update(10.0001, 20, 0.0001);
  assert.equal(f.paints(), before + 1, 'equal objective must not redraw');
}
if (process.argv.includes('--baseline')) {
  const base = fixture(execFileSync('git', ['show', 'HEAD:src/minimap.js'], { encoding: 'utf8' }));
  for (let i = 0; i < 601; i++) base.map.update(10, 20, 0);
  console.log(`Stationary minimap paint passes, 601 updates: baseline ${base.paints()}, optimized 1`);
}
console.log('PASS minimap cache: stationary work eliminated; movement, turning, zoom and objective invalidation preserved');
