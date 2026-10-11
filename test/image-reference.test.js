/* node test/image-reference.test.js — image_generate's REFERENCE image (the design anchor, 2026-10-11: "say I approve one,
   the next comes out with a complete off-the-wall style and concept"). Offline + deterministic (fetch injected, real temp
   workspace), in the image.test.js mold. Proves, per route: OpenRouter sends the reference as an image_url part beside the
   text; the ChatGPT plan as an input_image part; the OpenAI Images API through /images/edits (multipart, the reference as
   the `image` file). Where a connection cannot carry it (DALL-E, a base URL with no edits endpoint, a GIF on the Images API)
   the image is rendered from the prompt alone and the result SAYS so; a refusal still fails like any render. A missing /
   URL / escaping / non-image reference fails BEFORE anything is spent. Without a reference every wire is byte-identical. */
'use strict';
const A = require('./_assert.js');
const fsp = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { makeImageTools } = require('../sidecar/tools/builtin/image.js');
const TasteRef = require('../sidecar/tasteref.js');

const ROOT = path.join(os.tmpdir(), 'starnet-image-ref-test-' + process.pid);
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DATA_URL = 'data:image/png;base64,' + PNG_B64;
function stubFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    let body = null; try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
    calls.push({ url: String(url), body, init });
    return handler(String(url), body, init);
  };
  fn.calls = calls;
  return fn;
}
const jsonResp = (obj, status) => ({ status: status || 200, json: async () => obj, text: async () => JSON.stringify(obj), arrayBuffer: async () => Buffer.alloc(0), headers: { get: () => 'application/json' } });
const orImage = () => jsonResp({ choices: [{ message: { images: [{ image_url: { url: DATA_URL } }] } }] });
const oaImage = () => jsonResp({ data: [{ b64_json: PNG_B64 }] });
const rejects = async (p, re, msg) => { let m = ''; try { await p; } catch (e) { m = String(e && e.message || e); } A.ok(re.test(m), msg + ' (got: ' + m + ')'); };

(async () => {
  try { await fsp.rm(ROOT, { recursive: true, force: true }); } catch (_) {}
  const ctx = { agentId: 'hero', emit: () => {} };
  const refBytes = Buffer.from(PNG_B64, 'base64');
  await fsp.mkdir(path.join(ROOT, 'hero', 'images'), { recursive: true });
  await fsp.writeFile(path.join(ROOT, 'hero', 'images', 'approved.png'), refBytes);
  await fsp.writeFile(path.join(ROOT, 'hero', 'images', 'anim.gif'), Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'));
  await fsp.writeFile(path.join(ROOT, 'hero', 'notes.txt'), 'not an image');
  const refUrl = 'data:image/png;base64,' + refBytes.toString('base64');

  // ---- schema: one optional string, named in the description ----
  {
    const T = makeImageTools({ openrouter: { apiKey: 'k' }, fsp, pathMod: path, root: ROOT, fetchImpl: async () => orImage() });
    A.eq(T.generateTool.schema.properties.reference, { type: 'string' }, 'reference is one optional string (schema bytes are budgeted)');
    A.ok(T.generateTool.schema.required.indexOf('reference') < 0, 'and never required');
    A.ok(/"reference": an image file \(e\.g\. an APPROVED one\) whose style, palette and concept to match/.test(T.generateTool.description), 'the description teaches it');
  }

  // ---- OpenRouter: an image_url part beside the text ----
  {
    const f = stubFetch(() => orImage());
    const T = makeImageTools({ openrouter: { apiKey: 'sk' }, fsp, pathMod: path, root: ROOT, fetchImpl: f });
    const out = await T.generateTool.run({ prompt: 'a candle shop banner', reference: 'images/approved.png', aspect_ratio: '16:9' }, ctx);
    const content = f.calls[0].body.messages[0].content;
    A.ok(Array.isArray(content) && content.length === 2, 'the user turn carries two parts');
    A.eq(content[0], { type: 'text', text: 'Match the attached reference image: the same art style, colour palette, lighting and overall concept. a candle shop banner' }, 'text first, with the match instruction');
    A.eq(content[1], { type: 'image_url', image_url: { url: refUrl } }, 'the reference file\'s own bytes as a data URL');
    A.eq(f.calls[0].body.image_config, { aspect_ratio: '16:9' }, 'the shape still rides image_config');
    A.ok(/\nReference: images\/approved\.png was sent to the model as the style to match\./.test(out.content), 'the result says it was SENT (not that it matched)');
    A.ok(/^image → images\/gen-[0-9a-f]+\.png$/.test(out.summary), 'the summary stays exactly "image → <rel>" (artifacts.js reads the path from it)');
    // the design anchor reads the call back: the reference arg is captured with the render
    const rows = [{ role: 'assistant', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'image_generate', arguments: JSON.stringify({ prompt: 'a candle shop banner', reference: 'images/approved.png', aspect_ratio: '16:9' }) } }] }, { role: 'tool', tool_call_id: 'c1', content: out.content }];
    A.eq(TasteRef.imageCalls(rows)[0].reference, 'images/approved.png', 'tasteref pairs the reference with the saved render');
    // a GIF is fine on this route
    const g = stubFetch(() => orImage());
    await makeImageTools({ openrouter: { apiKey: 'sk' }, fsp, pathMod: path, root: ROOT, fetchImpl: g }).generateTool.run({ prompt: 'x', reference: 'images/anim.gif' }, ctx);
    A.ok(/^data:image\/gif;base64,/.test(g.calls[0].body.messages[0].content[1].image_url.url), 'a GIF reference rides as image/gif');
    // without a reference the wire is unchanged
    const n = stubFetch(() => orImage());
    await makeImageTools({ openrouter: { apiKey: 'sk' }, fsp, pathMod: path, root: ROOT, fetchImpl: n }).generateTool.run({ prompt: 'plain' }, ctx);
    A.eq(n.calls[0].body.messages, [{ role: 'user', content: 'plain' }], 'no reference = the old plain-string user turn');
  }

  // ---- bad references fail BEFORE anything is spent ----
  for (const [reference, re, why] of [
    ['images/missing.png', /reference image not found: images\/missing\.png/, 'a missing file'],
    ['https://example.com/a.png', /not a URL/, 'a URL'],
    ['../other/x.png', /illegal path|escape/, 'an escaping path'],
    ['notes.txt', /must be a PNG, JPEG, WEBP or GIF image/, 'a non-image']
  ]) {
    const f = stubFetch(() => orImage());
    await rejects(makeImageTools({ openrouter: { apiKey: 'sk' }, fsp, pathMod: path, root: ROOT, fetchImpl: f }).generateTool.run({ prompt: 'x', reference }, ctx), re, why + ' is refused');
    A.eq(f.calls.length, 0, why + ': no provider call, nothing spent');
  }

  // ---- the ChatGPT plan: an input_image part on the Responses wire ----
  {
    const jwt = 'h.' + Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' } })).toString('base64url') + '.sig';
    const events = [{ type: 'response.output_item.done', item: { type: 'image_generation_call', result: PNG_B64 } }, { type: 'response.completed', response: { output: [] } }];
    const f = stubFetch(() => ({ status: 200, text: async () => events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }));
    const T = makeImageTools({ openrouter: { provider: 'codex', protocol: 'codex-responses', getToken: async () => jwt }, fsp, pathMod: path, root: ROOT, fetchImpl: f });
    const out = await T.generateTool.run({ prompt: 'a poster', reference: 'images/approved.png' }, ctx);
    const parts = f.calls[0].body.input[0].content;
    A.eq(parts[0], { type: 'input_text', text: 'Match the attached reference image: the same art style, colour palette, lighting and overall concept. a poster' }, 'the plan route gets the match instruction');
    A.eq(parts[1], { type: 'input_image', image_url: refUrl }, 'and the reference as an input_image part');
    A.ok(/Reference: images\/approved\.png was sent/.test(out.content), 'reported as sent');
    const plain = stubFetch(() => ({ status: 200, text: async () => events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }));
    await makeImageTools({ openrouter: { provider: 'codex', protocol: 'codex-responses', getToken: async () => jwt }, fsp, pathMod: path, root: ROOT, fetchImpl: plain }).generateTool.run({ prompt: 'a poster' }, ctx);
    A.eq(plain.calls[0].body.input[0].content, [{ type: 'input_text', text: 'a poster' }], 'no reference = the old single text part');
  }

  // ---- the OpenAI Images API: /images/edits, multipart ----
  {
    const f = stubFetch(url => url.endsWith('/images/edits') ? oaImage() : jsonResp({}, 500));
    const T = makeImageTools({ openrouter: { apiKey: 'oa-key', provider: 'openai', protocol: 'openai-images', baseUrl: 'https://api.openai.com/v1/' }, fsp, pathMod: path, root: ROOT, fetchImpl: f });
    const out = await T.generateTool.run({ prompt: 'a fox logo', reference: 'images/approved.png', transparent: true, aspect_ratio: 'portrait' }, ctx);
    A.eq(f.calls.length, 1, 'one call');
    A.eq(f.calls[0].url, 'https://api.openai.com/v1/images/edits', 'a referenced render goes to /images/edits');
    const form = f.calls[0].init.body;
    A.ok(form instanceof FormData, 'multipart form body');
    A.eq(f.calls[0].init.headers, { Authorization: 'Bearer oa-key' }, 'the key, and no JSON content-type (fetch sets the multipart boundary)');
    A.eq([form.get('model'), form.get('size'), form.get('background'), form.get('output_format')], ['gpt-image-2', '1024x1536', 'transparent', 'png'], 'model, size and transparency ride as fields');
    A.ok(/^Match the attached reference image: .* a fox logo/.test(form.get('prompt')), 'the prompt carries the match instruction');
    const img = form.get('image');
    A.ok(img && img.type === 'image/png' && img.size === refBytes.length && img.name === 'reference.png', 'the reference file is the image part');
    A.ok(/Reference: images\/approved\.png was sent/.test(out.content), 'reported as sent');
    // a base URL that does not serve /images/edits: rendered from the prompt alone, and said so
    const g = stubFetch(url => url.endsWith('/images/edits') ? jsonResp({ error: { message: 'Not found' } }, 404) : oaImage());
    const fb = await makeImageTools({ openrouter: { apiKey: 'oa-key', provider: 'openai', protocol: 'openai-images', baseUrl: 'http://127.0.0.1:9/v1' }, fsp, pathMod: path, root: ROOT, fetchImpl: g }).generateTool.run({ prompt: 'a fox logo', reference: 'images/approved.png' }, ctx);
    A.eq(g.calls.map(c => c.url.replace(/^.*\/images\//, '')), ['edits', 'generations'], 'edits 404 -> one plain generation');
    A.eq(g.calls[1].body, { model: 'gpt-image-2', prompt: 'a fox logo', size: '1024x1024' }, 'the fallback is the ordinary request (no reference text pretending)');
    A.ok(/\nReference NOT used: this connection has no image-edit endpoint \(http 404\), so this image was rendered from the prompt alone\. Do not describe it as matching images\/approved\.png\./.test(fb.content), 'the result says the reference was NOT used: ' + fb.content);
    // a refusal is not a missing endpoint: it fails like any render
    const h = stubFetch(url => url.endsWith('/images/edits') ? jsonResp({ error: { message: 'content policy' } }, 400) : oaImage());
    await rejects(makeImageTools({ openrouter: { apiKey: 'oa-key', provider: 'openai', protocol: 'openai-images' }, fsp, pathMod: path, root: ROOT, fetchImpl: h }).generateTool.run({ prompt: 'x', reference: 'images/approved.png' }, ctx), /OpenAI 400: content policy/, 'an edits refusal propagates');
    A.eq(h.calls.length, 1, 'and is not silently re-rendered without the reference');
    // DALL-E and a GIF cannot take a reference here: no edits call, an honest note
    for (const [args, re, why] of [
      [{ prompt: 'x', model: 'dall-e-3', reference: 'images/approved.png' }, /Reference NOT used: dall-e-3 cannot take a reference image/, 'DALL-E'],
      [{ prompt: 'x', reference: 'images/anim.gif' }, /Reference NOT used: the OpenAI Images API takes a PNG, JPEG or WEBP reference, not image\/gif/, 'a GIF']
    ]) {
      const k = stubFetch(() => oaImage());
      const o = await makeImageTools({ openrouter: { apiKey: 'oa-key', provider: 'openai', protocol: 'openai-images' }, fsp, pathMod: path, root: ROOT, fetchImpl: k }).generateTool.run(args, ctx);
      A.ok(k.calls.length === 1 && /\/images\/generations$/.test(k.calls[0].url) && re.test(o.content), why + ': rendered from the prompt, reported plainly');
    }
  }

  try { fssync.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  A.report('image-reference.test');
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
