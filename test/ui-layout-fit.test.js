/* Layout and type-scale locks from the 0.13.5 world walk (walk 10-14). Each block names the seam it closes and reads the
   shipped stylesheet's real rules (comments stripped), so a rule that regresses fails here before Andrew sees it. */
'use strict';
const A = require('./_assert.js');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const rulesOf = file => {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sels: m[1].split(/,(?![^()]*\))/).map(s => s.trim().replace(/\s+/g, ' ')), body: m[2] }));
};
const decl = (rules, sel, prop) => {
  let v = null;
  for (const r of rules) if (r.sels.includes(sel)) { const m = r.body.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)')); if (m) v = m[1].trim(); }
  return v;
};
const px = v => { const m = String(v || '').match(/(\d+(?:\.\d+)?)px/); return m ? +m[1] : 0; };

/* #7 AGENT DOSSIER › CONFIG › MODEL: the model select was 418px in a 242px column (an inline-flex wrap sized to the widest
   catalog entry) and the EFFORT select sat fully outside the window, unreachable. */
{
  const dossier = rulesOf('frontend/css/agent-dossier.css');
  A.eq(decl(dossier, '.agent-dossier .mp-wrap', 'display'), 'flex', 'the dossier picker is a block flex row (inline-flex took the catalog\'s width)');
  A.eq(decl(dossier, '.agent-dossier .mp-wrap', 'width'), '100%', 'the picker is exactly its card\'s width');
  A.eq(decl(dossier, '.agent-dossier .mp-wrap .mp-model', 'min-width'), '0', 'the model select can shrink below its longest model name');
  A.eq(decl(dossier, '.agent-dossier .mp-wrap .mp-model', 'width'), '0', 'its width comes from the row, never its options');
  A.ok(/^1 1 /.test(decl(dossier, '.agent-dossier .mp-wrap .mp-model', 'flex') || ''), 'the model select fills the line and gives way to the effort select');
  A.eq(decl(dossier, '.agent-dossier .mp-wrap .mp-effort', 'max-width'), '100%', 'the effort select never runs past the card');
  A.eq(decl(rulesOf('frontend/css/app.css'), '.mp-wrap', 'flex-wrap'), 'wrap', 'when both do not fit one line the effort select drops under the model select');
}

A.report('ui-layout-fit.test');
