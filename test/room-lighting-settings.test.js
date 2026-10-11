'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/stationui.js'), 'utf8');
const start = src.indexOf('  // ROOM LIGHT is a 0–100 slider');
const end = src.indexOf('  // TEXT SIZE steps', start);
assert.ok(start >= 0 && end > start);
const bake = require('../frontend/app/stationbake.js');
const original = { ...bake.LIGHT };
// The live renderer's knobs: IndustrialTextures.lighting (pool cut + KEY light) and World.crt.film.
const tex = { cut: 1, key: 0, keyReach: .5, shadeCool: 0 };
const texOriginal = { ...tex };
let rebakes = 0;
const timers = [];
const fakeTimeout = (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; };
const fakeClear = t => { if (t) t.live = false; };
const flush = () => { for (const t of timers.splice(0)) if (t.live) t.fn(); };
const world = { crt: { film: .38, scan: .1 }, rebake() { rebakes++; } };
const build = (w, t) => new Function('StationBake', 'World', 'IndustrialTextures', 'setTimeout', 'clearTimeout', src.slice(start, end) +
  '\nreturn { resolve: resolveRoomLighting, knobs: roomLightingKnobs, apply: applyRoomLighting };')(bake, w, t, fakeTimeout, fakeClear);
const api = build(world, { lighting: tex });

// 0 (and anything unreadable) is the approved station, byte for byte.
for (const value of [undefined, null, '', 'future-mode', {}, NaN, 0, '0', 'low', -40]) {
  assert.equal(api.resolve(value), 0, String(value));
  api.apply(value);
  assert.deepEqual(bake.LIGHT, original, 'old, invalid or zero settings retain the approved look');
  assert.deepEqual(tex, texOriginal);
  assert.equal(world.crt.film, .38);
}
assert.equal(rebakes, 0, 'unrelated settings do not trigger unnecessary rebakes');
// Old chip saves keep a sensible place on the slider; numbers clamp and round.
assert.equal(api.resolve('medium'), 15);
assert.equal(api.resolve('high'), 30);
assert.equal(api.resolve(250), 100);
assert.equal(api.resolve('42.6'), 43);

// 10-10 player report: the old HIGH changed only LIGHT.ambient and measured +3% on screen. Every stage
// that sets on-screen room brightness must move as the slider rises: a thinner deck film, a wider
// pool cut, more KEY light, and a lighter CRT density film.
let prev = { ambient: original.ambient, cut: tex.cut, key: tex.key, film: world.crt.film };
for (const level of [25, 50, 75, 100]) {
  api.apply(level);
  assert.ok(bake.LIGHT.ambient < prev.ambient, level + ': thinner deck film');
  assert.ok(tex.cut > prev.cut, level + ': pools open further');
  assert.ok(tex.key > prev.key, level + ': key light puts light on surfaces');
  assert.ok(world.crt.film < prev.film, level + ': lighter density film');
  prev = { ambient: bake.LIGHT.ambient, cut: tex.cut, key: tex.key, film: world.crt.film };
  assert.deepEqual({ ...bake.LIGHT, ambient: original.ambient }, original,
    'fixture layout, falloff, warmth and glow remain unchanged');
  assert.deepEqual({ ...tex, cut: 1, key: 0 }, texOriginal, 'only cut and key move');
  assert.equal(world.crt.scan, .1, 'only the film moves on the CRT');
  const count = rebakes;
  api.apply(level);
  assert.equal(rebakes, count, 'the same value does not rebake again');
}
assert.equal(rebakes, 4, 'every committed change reaches the renderer');
assert.deepEqual(api.knobs(100), { ambient: 0.3, cut: 2.4, key: 2, film: 0.26 }, '100 is the brightest tuned look');

// A DRAG never rebakes per tick: film and ambient move at once, the bake waits for the pause/release.
rebakes = 0;
for (let v = 99; v >= 60; v--) api.apply(v, true);
assert.equal(rebakes, 0, 'no rebake during the drag');
assert.equal(bake.LIGHT.ambient, api.knobs(60).ambient, 'ambient follows the drag live');
assert.equal(world.crt.film, +(0.38 * api.knobs(60).film).toFixed(4), 'film follows the drag live');
flush();
assert.equal(rebakes, 1, 'one rebake once the drag pauses');
api.apply(55, true);
api.apply(55);   // release lands the pending rebake now
assert.equal(rebakes, 2);
flush();
assert.equal(rebakes, 2, 'the cancelled timer does not rebake twice');

api.apply(0);
assert.deepEqual(bake.LIGHT, original, '0 restores the exact approved light controls');
assert.deepEqual(tex, texOriginal, '0 restores the approved pool cut and key');
assert.equal(world.crt.film, .38, '0 restores the approved film');
// The classic world has no film and no IndustrialTextures: brightening must not invent either.
const classic = { crt: { film: 0 }, rebake() {} };
const capi = build(classic, undefined);
capi.apply(100);
assert.equal(classic.crt.film, 0);
capi.apply(0);
assert.equal(bake.LIGHT.ambient, original.ambient);

assert.match(src, /roomLighting: 0, textScale/, 'default is the approved station');
assert.match(src, /applyRoomLighting\(s\.roomLighting\);\n/, 'applySettings applies the saved level');
assert.match(src, /roomLighting: resolveRoomLighting\(store\.settings\.roomLighting\)/, 'backup includes lighting');
assert.match(src, /id="set-room-light"[^>]*min="0" max="100"/, 'Settings shows the 0–100 slider');
assert.match(src, /applyRoomLighting\(s\.roomLighting, true\)/, 'dragging applies live');
assert.match(src, /applyRoomLighting\(s\.roomLighting\); save\(\)/, 'release applies and persists');
assert.match(src, /else if \(k === 'roomLighting'\) num\(k, 0, 100\)/, 'chat control takes the same 0–100 range');
assert.equal(src, fs.readFileSync(path.join(__dirname, '../website/app/app/stationui.js'), 'utf8'));
console.log('room-lighting-settings: 0–100 slider drives film/cut/key/CRT film, drag debounce, legacy saves, classic and mirror passed');
