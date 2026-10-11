'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../frontend/app/stationui.js'), 'utf8');
const start = src.indexOf('  // Raise overall room exposure.');
const end = src.indexOf('  // TEXT SIZE steps', start);
assert.ok(start >= 0 && end > start);
const bake = require('../frontend/app/stationbake.js');
const original = { ...bake.LIGHT };
// The live renderer's knobs: IndustrialTextures.lighting (pool cut + KEY light) and World.crt.film.
const tex = { cut: 1, key: 0, keyReach: .5, shadeCool: 0 };
const texOriginal = { ...tex };
let rebakes = 0;
const world = { crt: { film: .38, scan: .1 }, rebake() { rebakes++; } };
const build = (w, t) => new Function('StationBake', 'World', 'IndustrialTextures', src.slice(start, end) +
  '\nreturn { steps: ROOM_LIGHTING_STEPS, resolve: resolveRoomLighting, apply: applyRoomLighting };')(bake, w, t);
const api = build(world, { lighting: tex });
assert.equal(api.steps.length, 3);
for (const value of [undefined, null, '', 'future-mode', {}, 9]) {
  assert.equal(api.resolve(value), 'low');
  api.apply(value);
  assert.deepEqual(bake.LIGHT, original, 'old or invalid settings retain the approved look');
  assert.deepEqual(tex, texOriginal);
  assert.equal(world.crt.film, .38);
}
assert.equal(rebakes, 0, 'unrelated settings do not trigger unnecessary rebakes');
// 10-10 player report: HIGH changed only LIGHT.ambient and measured +3% on screen. Every stage that
// sets on-screen room brightness must move with each step: a thinner deck film, a wider pool cut,
// more KEY light, and a lighter CRT density film.
let prev = { ambient: original.ambient, cut: tex.cut, key: tex.key, film: world.crt.film };
for (const level of ['medium', 'high']) {
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
  assert.equal(rebakes, count, 'reselecting the same level does not rebake');
}
assert.equal(rebakes, 2, 'both brightness changes reach the renderer');
api.apply('low');
assert.deepEqual(bake.LIGHT, original, 'LOW restores the exact approved light controls');
assert.deepEqual(tex, texOriginal, 'LOW restores the approved pool cut and key');
assert.equal(world.crt.film, .38, 'LOW restores the approved film');
// The classic world has no film and no IndustrialTextures: HIGH must not invent either.
const classic = { crt: { film: 0 }, rebake() {} };
const capi = build(classic, undefined);
capi.apply('high');
assert.equal(classic.crt.film, 0);
capi.apply('low');
assert.equal(bake.LIGHT.ambient, original.ambient);
assert.match(src, /roomLighting: 'low'/);
assert.match(src, /applyRoomLighting\(s\.roomLighting\)/);
assert.match(src, /roomLighting: resolveRoomLighting\(store\.settings\.roomLighting\)/, 'backup includes lighting');
assert.match(src, /applyRoomLighting\(s\.roomLighting\); save\(\)/, 'selection is applied and persisted');
assert.match(src, /x\.setAttribute\('aria-pressed', String\(on\)\)/);
assert.equal(src, fs.readFileSync(path.join(__dirname, '../website/app/app/stationui.js'), 'utf8'));
console.log('room-lighting-settings: three levels drive film/cut/key/CRT film, default/fallback, classic and mirror passed');
