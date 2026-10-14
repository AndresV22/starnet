'use strict';
// provider-connections-ui.test.js - source guard for additive provider credentials in Settings.
// ChatGPT/Codex OAuth and OpenRouter BYOK must coexist: signing into Codex must not erase,
// hide, or leak the OpenRouter key path.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'app.js'), 'utf8');
const harness = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'harness.js'), 'utf8');
const station = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app', 'stationui.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');
const tauri = ['main.rs', 'credentials.rs']
  .map(file => fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', file), 'utf8'))
  .join('\n');

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const hostedProviders = ['xai', 'groq', 'mistral', 'deepseek', 'together', 'fireworks', 'perplexity', 'cerebras'];

ok(!/Harness\.setKey\(\s*['"]{2}\s*\)/.test(app), 'Codex wake does not clear the OpenRouter BYOK slot');
ok(/provider\s*!==\s*'codex'[\s\S]{0,80}reqBody\.key\s*=\s*key/.test(harness), 'browser BYOK key is sent only for key-backed provider runs');

ok(/fetch\('\/api\/auth\/codex\/status'/.test(station), 'Settings checks real Codex OAuth status');
ok(/let\s+codexStatusKnown\s*=\s*null/.test(station), 'Codex OAuth status is independent from active provider selection');
ok(/if\s*\(active\s*!==\s*'openrouter'\)\s*addProvider\('openrouter'\)/.test(station), 'Settings can list OpenRouter independently from the active provider');
ok(/const\s+addProvider\s*=\s*active\s*===\s*'codex'\s*\?\s*'openrouter'\s*:\s*active/.test(station), 'Codex-active add-key row targets OpenRouter');
ok(/id="key-in-new"/.test(station) && /data-act="add"/.test(station) && /data-provider=/.test(station), 'add-key controls carry their target provider');
ok(/const\s+provider\s*=\s*b\.dataset\.provider\s*\|\|\s*activeProv\(\)/.test(station), 'add-key save writes to the row provider, not necessarily the active provider');

for (const id of hostedProviders) {
  ok(index.includes('data-prov="' + id + '"'), id + ' appears in the connect provider picker');
  ok(station.includes("id: '" + id + "'"), id + ' appears in Settings provider cards');
  ok(tauri.includes('"' + id + '"'), id + ' appears in desktop keychain provider status');
}
ok(/PROVIDERS\.forEach\(p\s*=>\s*addProvider\(p\.id\)\)/.test(station), 'Settings lists any configured provider, not only the active provider');

// Provider cards contain their own ADD KEY / SIGN IN / SAVE controls. The selectable card surface must therefore
// be a separate native button, not a role=button ancestor that creates nested interactive controls in the a11y tree.
ok(!/class="prov-card[^\n]+role="button"/.test(station), 'provider card container is not an interactive ancestor');
ok(/role="group" aria-label="[^\n]+ provider"/.test(station), 'provider card is exposed as a named group');
ok(/<button class="prov-select" data-act="prov-select" aria-label="Select /.test(station), 'provider selection has a dedicated native button');
ok(/providerSelect\.addEventListener\('click', activate\)/.test(station), 'dedicated provider button owns activation');

// settings-truth: the credential list must reflect ACTUALLY-stored keys, never DEVMODE-fabricated ones.
// The honest getter (hasStoredCredential) is exported and used by the Settings list; configured() (which
// reports true in DEVMODE for auto-resume) must NOT be the credential-list gate.
ok(/function\s+hasStoredCredential\s*\(/.test(harness), 'harness exposes an honest hasStoredCredential getter');
ok(/return\s*\{[\s\S]*hasStoredCredential[\s\S]*\}/.test(harness), 'hasStoredCredential is on the harness public API');
ok(/DEVMODE\s*&&\s*DEV\s*&&\s*DEV\.hasKey\s*===\s*true\s*&&\s*normalizeProviderId\(DEV\.prov\)\s*===\s*p/.test(harness), 'DEV seed only backs the seeded provider (DEV.prov), not all providers');
// …and only when the host SAYS it holds one. A seeded station with no key still boots in DEV mode, and
// assuming the key existed rendered "● KEY SAVED" over nothing — the badge an agent reads as proof it can run.
ok(/hasKey:\s*!!runtimeKey/.test(fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'index.js'), 'utf8')),
  'the DEV boot payload carries the honest hasKey (no secret, just the boolean)');
ok(/const\s+set\s*=\s*h\.hasStoredCredential\s*\?\s*h\.hasStoredCredential\(provider\)/.test(station), 'Settings credential list gates rows on hasStoredCredential, not the DEVMODE-fabricated configured()');
ok(/stored:\s*!!set/.test(station), 'credential rows preserve the stored-key fact when desktop keychain values are intentionally unreadable');
ok(/k\.baseUrl\s*\|\|\s*\(k\.stored\s*\?\s*'stored securely'\s*:\s*'keyless endpoint'\)/.test(station),
  'a stored desktop credential is labeled stored securely, never as a keyless endpoint');
// armed REMOVE must be unmistakable: filled --bad button + row hairline + inline confirm hint.
ok(/b\.classList\.add\('armed'\)/.test(station) && /rowEl\.classList\.add\('rm-armed'\)/.test(station), 'REMOVE arm marks both the button and its row');
ok(/click again to confirm removal/.test(station), 'armed REMOVE shows an inline confirm hint');

// PU-07: keyless endpoints are configuration, not credentials, and ACTIVE requires a live catalog probe.
ok(/if\s*\(p\s*===\s*'ollama'\)\s*return\s*false/.test(harness), 'Ollama never manufactures a stored credential');
ok(/async\s+function\s+probeProvider\s*\(/.test(harness), 'Harness exposes a live provider endpoint probe');
ok(/credentialSaved[\s\S]*endpointConfigured[\s\S]*reachable[\s\S]*catalogAvailable[\s\S]*selected/.test(harness), 'provider probe separates credential, endpoint, reachability, catalog, and selection facts');
ok(/h\.probeProvider\(provider\)/.test(station), 'Settings provider cards refresh from the live Harness probe');
ok(/LOCAL ENDPOINT CONFIGURED/.test(station) && /OFFLINE/.test(station), 'keyless provider copy distinguishes configured endpoints from offline endpoints');
ok(/const\s+runnable\s*=\s*!!\(health\s*&&\s*health\.reachable/.test(station), 'ACTIVE is gated on proven endpoint reachability');
ok(/const\s+health\s*=\s*providerHealth\[k\.provider\]/.test(station) &&
   !/const\s+runnable\s*=\s*k\.provider\s*===\s*active\s*&&\s*!!k\.model/.test(station),
  'the API-key rows also reserve ACTIVE for probe-proven runnability instead of selection alone');
ok(!/connected\s*\?\s*connLabel[\s\S]{0,160}p\.id\s*===\s*'ollama'\s*\?\s*'[^']*LOCAL'/.test(station), 'Ollama does not fall through the generic credential status copy');

// GitHub #113 (confirmed live 2026-10-13): a CUSTOM endpoint is added with its URL, the key is optional, and the add copy no
// longer claims a ChatGPT sign-in on stations that have none. org P04: ONE key box per provider — the CUSTOM card's ＋ ADD KEY
// is the only CUSTOM add form (the API KEYS twin is gone), and the list-side add row only renders for a provider whose card
// offers no ＋ ADD KEY / ⏼ SIGN IN of its own.
ok(/customEndpointInputHtml\('prov-base-in-custom'\)/.test(station) && !/customEndpointInputHtml\('base-in-new'\)/.test(station), 'the CUSTOM card is the one CUSTOM add form, and it takes the endpoint URL');
ok(/if \(provider === 'custom'\) return saveCustomEndpoint\(/.test(station), 'the CUSTOM save stores the endpoint before any key');
ok(/if \(provider === 'custom'\) return '<div class="key-empty"><p>' \+ ADD_ON_CARD/.test(station), 'API KEYS never renders a second CUSTOM add form');
ok(/!hasAddProvider && !cardOffersAdd\(addProvider\)\) rows\.push\(addKeyHtml/.test(station), 'the API KEYS add row is dropped when the provider card offers ＋ ADD KEY / ⏼ SIGN IN');
ok(/const ADD_ON_CARD = 'Add a key on a provider card above\.'/.test(station) && /if \(!keys\.length\) return \(cardOffersAdd\(addProvider\)/.test(station), 'the empty API KEYS state is one line pointing at the cards');
ok(/>✎ ENDPOINT URL<\/button>/.test(station) && !/✎ STATION LINK/.test(station), 'the saved CUSTOM row edits its address under ✎ ENDPOINT URL');
ok(/↻ SPARE KEYS/.test(station) && !/↻ BACKUPS/.test(station), 'the key pool reads ↻ SPARE KEYS, not BACKUPS (STATION BACKUP is a different thing)');
ok(/retry ✎ ENDPOINT URL before running/.test(harness), 'the desktop endpoint error names the ✎ ENDPOINT URL key');
ok(/data-act="baseurl-edit" data-i="' \+ i \+ '" data-tip="[^"]+">✎ ENDPOINT URL</.test(station), 'the ✎ ENDPOINT URL key carries a station data-tip, never a native title= bubble');
ok(/a spare key was rejected/.test(harness) && /your previous spare keys are unchanged/.test(harness) && !/backup key|backup pool is/.test(harness), 'a rejected ↻ SPARE KEYS save names spare keys, never a backup pool');
ok(/set your fallback models to/.test(fs.readFileSync(path.join(__dirname, '..', 'sidecar', 'tools', 'builtin', 'station-control.js'), 'utf8')), 'the fallback.set approval card names FALLBACK MODELS, the heading AI & MODELS shows');
ok(!/while keeping your ChatGPT sign-in connected/.test(station), 'the add-key copy never claims a ChatGPT sign-in');
// org P04 (g4 final round): "Add it on its card above" pointed at whatever card sat above it — the no-key line is a real door
// that lands ON the selected provider's card (focusProvider: the error doors' scroll + mark), in reading-size words
ok(/rows\.push\('<div class="key-empty key-goto"><p>The selected provider, ' \+ esc\(provName\(addProvider\)\) \+ ', has no key yet\.<\/p>'\s*\+ '<div class="mc-acts"><button type="button" class="bb sm" data-act="to-prov-card" data-provider="' \+ esc\(addProvider\) \+ '">▸ ADD IT ON THE ' \+ esc\(provName\(addProvider\)\) \+ ' CARD<\/button><\/div><\/div>'\);/.test(station)
  && !/Add it on its card above/.test(station), 'the selected provider\'s no-key line names its card as a door, never "its card above"');
ok(/body\.querySelectorAll\('\[data-act="to-prov-card"\]\[data-provider\]'\)\.forEach\(b => b\.addEventListener\('click', \(\) => \{ sfx\('click'\); focusProvider\(b\.dataset\.provider\); \}\)\);/.test(station), 'that door lands on the provider\'s card through focusProvider');
ok(/\.settings-console \.key-empty\.key-goto p \{ font-size: 16px;[^}]*opacity: 1; \}/.test(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', 'settings.css'), 'utf8')), 'the no-key line reads at the paragraphs\' size, not the dim 12px empty-state voice');
{
  const src = station.slice(station.indexOf('  function normEndpoint(raw) {'), station.indexOf('  function addKeyHtml('));
  const norm = new Function(src.slice(0, src.indexOf('\n  }\n') + 4) + '\nreturn normEndpoint;')();
  ok(norm('localhost:1234/v1') === 'http://localhost:1234/v1', 'a bare local host gets http:// (LM Studio)');
  ok(norm('192.168.1.20:8000/v1') === 'http://192.168.1.20:8000/v1', 'a bare LAN host gets http://');
  ok(norm('api.freellmapi.com/v1') === 'https://api.freellmapi.com/v1', 'a bare public host gets https://');
  ok(norm('https://x.example/v1') === 'https://x.example/v1' && norm('') === '' && norm('http://') === null, 'a full URL is kept, empty is empty, junk is refused');
}

// LOOKING IS NOT SWITCHING (live walkthrough 2026-10-13): one click on the unconfigured CUSTOM card made it the station's
// brain and every later run failed. A card says whether it is set up; a click on one that is not opens its setup instead.
ok(/data-configured="' \+ \(configured \? '1' : '0'\) \+ '"/.test(station), 'each provider card says whether it is set up');
ok(/if \(card\.dataset\.configured === '0' && p !== activeProv\(\)\) \{[\s\S]{0,400}return;\s*\}\s*h\.setProv\(p\);/.test(station), 'a click on a provider that is not set up never switches the brain to it');

console.log('provider-connections-ui.test.js OK -', n, 'assertions');
