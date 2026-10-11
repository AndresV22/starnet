// Live proof for Settings › ROOM LIGHT (0–100 slider). Needs a dev sidecar on :9197 (`npm start` with SKYNET_PORT=9197).
// Drags the REAL slider, reads back every renderer knob it drives, screenshots, and checks the level survives a reload.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, connectCDP, evalJS, sleep, capture } from '../scripts/lib/cdp.mjs';
const out = '.worldshots/room-lighting-settings';
mkdirSync(out, { recursive: true });
let proc, cdp;
const results = [];
try {
  ({ proc } = launchChrome({ cdpPort: 9381, profileDir: out + '/profile' }));
  cdp = await connectCDP(9381);
  await cdp.send('Page.enable');
  const load = async () => {
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:9197/' });
    for (let i = 0; i < 100; i++) {
      if (await evalJS(cdp, "typeof StationUI !== 'undefined' && typeof World !== 'undefined' && !!World.stationDoc()")) return;
      await sleep(150);
    }
    throw Error('Station did not load');
  };
  const open = async () => {
    await evalJS(cdp, "StationUI.openTerm('settings', 'appearance'); true");
    for (let i = 0; i < 60; i++) {
      if (await evalJS(cdp, "!!document.querySelector('#set-room-light')")) { await sleep(600); return; }
      await sleep(100);
    }
    throw Error('ROOM LIGHT slider did not open');
  };
  const drag = v => evalJS(cdp, `(() => { const i = document.querySelector('#set-room-light');
    for (let x = Number(i.value); x !== ${v}; x += Math.sign(${v} - x)) { i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }
    i.value = ${v}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const read = () => evalJS(cdp, `({ value: Number(document.querySelector('#set-room-light').value),
    label: document.querySelector('#set-room-light-val').textContent, ambient: StationBake.LIGHT.ambient,
    cut: IndustrialTextures.lighting.cut, key: IndustrialTextures.lighting.key, film: World.crt.film,
    bg: getComputedStyle(document.querySelector('#set-room-light')).backgroundColor })`);
  await load();
  await open();
  for (const level of [0, 50, 100]) {
    await drag(level);
    await sleep(400);
    const state = await read();
    assert.equal(state.value, level);
    assert.equal(state.label, level + '%');
    assert.ok(!['rgb(255, 255, 255)', 'rgb(239, 239, 239)'].includes(state.bg), 'no OS-painted control');
    if (results.length) {
      const p = results.at(-1);
      assert.ok(state.ambient < p.ambient && state.cut > p.cut && state.key > p.key && state.film < p.film, 'every stage brightens');
    }
    results.push({ level, ...state });
    await capture(cdp, out, 'room-light-' + level);
    await load();
    await open();
    assert.equal((await read()).value, level, 'the level survives a reload');
  }
  await drag(0);
  const receipt = { results, reloadPersistence: true, restoredZero: (await read()).ambient === results[0].ambient };
  writeFileSync(out + '/proof.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
} finally { cdp?.ws.close(); proc?.kill(); }
