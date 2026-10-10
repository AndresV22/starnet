/* node test/remote-voice.test.js — StarNet Remote voice: a paired device (the AIPI-Lite companion) speaks to the
   station and hears it answer, through the gateway's hear / speak / speech verbs.
   The Ogg container the station builds from the device's raw Opus frames is decoded by the REAL decoder the
   STT chain uses (media-service oggOpusToMono16kFloat32), so a malformed page, CRC or granule fails here. */
'use strict';
const A = require('./_assert.js');
const nodeCrypto = require('crypto');
const { makeRemoteVoice, opusFramesToOgg, oggCrc, wavToPcm16, MAX_FRAMES, MAX_SPEECH_CHUNK, VOICE_TTL_MS } = require('../sidecar/remote/voice.js');
const { makeGateway } = require('../sidecar/remote/gateway.js');
const { oggOpusToMono16kFloat32 } = require('../sidecar/media-service.js');

// A one-byte Opus packet: TOC config 11 (SILK wideband, 60 ms), code 0, empty frame -> the decoder conceals it
// as 60 ms of silence. Real enough to exercise the container end to end without an encoder.
const SILK_WB_60MS = Buffer.from([0x58]);
const b64u = (b) => Buffer.from(b).toString('base64url');
function wavHeader(format, channels, rate, bits, dataLen) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + dataLen, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(format, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * bits / 8, 28); h.writeUInt16LE(channels * bits / 8, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(dataLen, 40);
  return h;
}
function wav16(rate, frames, fn) {
  const d = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) d.writeInt16LE(Math.round(fn(i) * 32767), i * 2);
  return Buffer.concat([wavHeader(1, 1, rate, 16, d.length), d]);
}

function parsePages(buf) {
  const pages = [];
  let o = 0;
  while (o < buf.length) {
    A.eq(buf.toString('latin1', o, o + 4), 'OggS', 'page ' + pages.length + ' starts with OggS');
    const nseg = buf[o + 26];
    let body = 0;
    for (let i = 0; i < nseg; i++) body += buf[o + 27 + i];
    const len = 27 + nseg + body;
    const page = Buffer.from(buf.subarray(o, o + len));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    pages.push({ flags: buf[o + 5], granule: Number(buf.readBigInt64LE(o + 6)), seq: buf.readUInt32LE(o + 18), crc, crcOk: oggCrc(page) === crc, len });
    o += len;
  }
  return pages;
}

(async () => {
  /* ---------- 1. the Ogg/Opus container ---------- */
  {
    const frames = Array.from({ length: 120 }, () => SILK_WB_60MS);   // 7.2 s -> spans three audio pages
    const ogg = opusFramesToOgg(frames, { frameMs: 60 });
    const pages = parsePages(ogg);
    A.ok(pages.length >= 4, 'head + tags + audio pages (' + pages.length + ')');
    A.ok(pages.every(p => p.crcOk), 'every page CRC is correct');
    A.eq(pages[0].flags, 0x02, 'first page is beginning-of-stream');
    A.eq(pages[pages.length - 1].flags & 0x04, 0x04, 'last page is end-of-stream');
    A.ok(pages.every((p, i) => p.seq === i), 'page sequence numbers run 0..n');
    A.eq(pages[pages.length - 1].granule, 120 * 60 * 48, 'final granule = total samples at 48 kHz');
    const pcm = await oggOpusToMono16kFloat32(ogg);
    A.eq(pcm.length, 120 * 60 * 16, 'the STT decoder reads back exactly 7.2 s at 16 kHz');

    const big = Buffer.alloc(600, 0x11); big[0] = 0x58;   // a packet longer than one 255-byte lacing value
    const pagesBig = parsePages(opusFramesToOgg([big, SILK_WB_60MS], { frameMs: 60 }));
    A.ok(pagesBig.every(p => p.crcOk), 'multi-segment packets keep valid pages');

    const tamper = Buffer.from(ogg); tamper[tamper.length - 1] ^= 0xff;
    A.ok(!parsePages(tamper).every(p => p.crcOk), 'a flipped byte breaks that page CRC');
  }

  /* ---------- 2. hear: ordered parts, caps, the short-utterance gate ---------- */
  {
    let t = 1000;
    const heard = [];
    const voice = makeRemoteVoice({
      now: () => t, newId: () => nodeCrypto.randomUUID(),
      transcribeOgg: async (ogg) => { heard.push(ogg); const pcm = await oggOpusToMono16kFloat32(ogg); return { ok: true, text: ' turn on the lights (' + pcm.length + ') ' }; },
      synthesize: async () => ({ ok: false, reason: 'unused' })
    });
    const part = (n, count, last, utt) => voice.hear('devA', { utt: utt || 'u1', part: n, frames: Array.from({ length: count }, () => b64u(SILK_WB_60MS)), frameMs: 60, last });

    A.ok((await part(0, 10)).ok, 'part 0 opens the utterance');
    A.ok((await part(1, 10)).ok, 'part 1 continues it');
    const skip = await part(3, 10);
    A.ok(!skip.ok && /out of order/.test(skip.error), 'a skipped part is refused: ' + skip.error);
    const again = await part(1, 10);
    A.ok(!again.ok, 'a repeated part is refused');
    const other = await voice.hear('devA', { utt: 'zz', part: 2, frames: [], last: true });
    A.ok(!other.ok, 'a part for a different utterance is refused');
    const done = await part(2, 5, true);
    A.ok(done.ok, 'the last part closes it');
    A.eq(done.data.text, 'turn on the lights (' + 25 * 960 + ')', 'transcript of exactly the 25 frames sent, trimmed');
    A.eq(done.data.ms, 25 * 60, 'its length is reported');
    A.eq(heard.length, 1, 'transcribed once');
    A.eq(heard[0].toString('latin1', 0, 4), 'OggS', 'the STT chain was handed an Ogg stream');
    A.ok(!(await part(3, 1, true)).ok, 'a closed utterance takes no more parts');

    const short = await voice.hear('devA', { utt: 'u2', part: 0, frames: [b64u(SILK_WB_60MS), b64u(SILK_WB_60MS)], frameMs: 60, last: true });
    A.ok(short.ok && short.data.text === '' && short.data.short === true, 'a 120 ms blip is not speech and never reaches STT');
    A.eq(heard.length, 1, 'still transcribed once');

    A.ok(!(await voice.hear('devA', { utt: 'u3', part: 0, frames: ['not+base64url'] })).ok, 'a malformed frame is refused');
    A.ok(!(await voice.hear('devA', { utt: 'u3', part: 0, frames: [b64u(Buffer.alloc(2000, 1))] })).ok, 'an oversized frame is refused');
    A.ok(!(await voice.hear('devA', { utt: 'bad id!', part: 0, frames: [] })).ok, 'a bad utterance id is refused');
    A.ok(!(await voice.hear('devA', { utt: 'u4', part: 0, frames: Array.from({ length: 65 }, () => b64u(SILK_WB_60MS)) })).ok, 'too many frames in one part is refused');

    let ok = true;
    for (let p = 0; p * 64 < MAX_FRAMES && ok; p++) ok = (await voice.hear('devA', { utt: 'long', part: p, frames: Array.from({ length: 64 }, () => b64u(SILK_WB_60MS)) })).ok;
    A.ok(!ok, 'an utterance past ' + MAX_FRAMES + ' frames is cut off');
    A.ok(!(await voice.hear('devA', { utt: 'long', part: 99, frames: [], last: true })).ok, 'and forgotten');

    await voice.hear('devB', { utt: 'b1', part: 0, frames: [b64u(SILK_WB_60MS)] });
    t += VOICE_TTL_MS + 1;
    A.ok(!(await voice.hear('devB', { utt: 'b1', part: 1, frames: [], last: true })).ok, 'an abandoned utterance expires');
  }

  /* ---------- 3. speak / speech: chunked, per device, re-askable, expiring ---------- */
  {
    let t = 5000;
    // a real mono 16-bit WAV (what a device plays as-is), 150 KB in total
    const audio = wav16(24000, (150 * 1024 - 44) / 2, (i) => Math.sin(i / 7) * 0.5);
    let calls = 0;
    const voice = makeRemoteVoice({
      now: () => t, newId: () => 'r' + (++calls),
      synthesize: async (text) => (text === 'fail' ? { ok: false, reason: 'no engine' } : { ok: true, buf: audio, mime: 'audio/wav', provider: 'local-kokoro' })
    });
    A.ok(!(await voice.speak('devA', { text: '   ' })).ok, 'nothing to say is refused');
    A.ok(!(await voice.speak('devA', { text: 'x'.repeat(1201) })).ok, 'an over-long reply is refused');
    const failed = await voice.speak('devA', { text: 'fail' });
    A.ok(!failed.ok && /no engine/.test(failed.error), 'an engine failure is reported, not faked: ' + failed.error);

    const s = await voice.speak('devA', { text: 'The build finished.' });
    A.ok(s.ok && s.data.bytes === audio.length && s.data.mime === 'audio/wav', 'speak returns the audio size and type');
    const parts = [];
    let off = 0, last = null;
    while (true) {
      const c = voice.speech('devA', { id: s.data.id, offset: off, length: 64 * 1024 });
      A.ok(c.ok, 'chunk at ' + off);
      parts.push(Buffer.from(c.data.data, 'base64url'));
      off += parts[parts.length - 1].length;
      last = c;
      if (c.data.done) break;
    }
    A.ok(Buffer.concat(parts).equals(audio), 'the chunks reassemble byte for byte');
    A.eq(parts.length, 3, '150 KB arrives in three 64 KB chunks');
    A.ok(voice.speech('devA', { id: s.data.id, offset: last.data.offset }).ok, 'the last chunk can be asked for again (lost frame)');
    A.ok(voice.speech('devA', { id: s.data.id, offset: 0, length: 10 * MAX_SPEECH_CHUNK }).data.data.length <= Math.ceil(MAX_SPEECH_CHUNK * 4 / 3), 'chunk size is capped');
    A.ok(!voice.speech('devB', { id: s.data.id, offset: 0 }).ok, 'another device cannot read this reply');
    A.ok(!voice.speech('devA', { id: 'nope', offset: 0 }).ok, 'a wrong id is refused');
    A.ok(!voice.speech('devA', { id: s.data.id, offset: audio.length + 1 }).ok, 'past the end is refused');

    const s2 = await voice.speak('devA', { text: 'Second reply.' });
    A.ok(!voice.speech('devA', { id: s.data.id, offset: 0 }).ok, 'a new reply replaces the old one');
    A.ok(voice.speech('devA', { id: s2.data.id, offset: 0 }).ok, 'and is readable');
    voice.forget('devA');
    A.ok(!voice.speech('devA', { id: s2.data.id, offset: 0 }).ok, 'forget (revoke) drops it');
    const s3 = await voice.speak('devA', { text: 'Third.' });
    t += VOICE_TTL_MS + 1;
    A.ok(!voice.speech('devA', { id: s3.data.id, offset: 0 }).ok, 'an unread reply expires');
  }

  /* ---------- 3b. WAV normalisation: what the local voice engine writes -> what a device decoder plays ---------- */
  {
    const mono16 = wav16(24000, 100, (i) => i / 200);
    A.ok(wavToPcm16(mono16) === mono16, 'mono 16-bit WAV passes through untouched');
    const frames = 480;
    const fd = Buffer.alloc(frames * 2 * 4);
    for (let i = 0; i < frames; i++) { fd.writeFloatLE(0.5, i * 8); fd.writeFloatLE(-0.25, i * 8 + 4); }
    const stereoFloat = Buffer.concat([wavHeader(3, 2, 24000, 32, fd.length), fd]);
    const out = wavToPcm16(stereoFloat);
    A.ok(out && out.readUInt16LE(20) === 1 && out.readUInt16LE(22) === 1 && out.readUInt16LE(34) === 16, 'float32 stereo becomes PCM16 mono');
    A.eq(out.readUInt32LE(24), 24000, 'the sample rate is kept');
    A.eq(out.readUInt32LE(40), frames * 2, 'one 16-bit sample per frame');
    A.eq(out.readInt16LE(44), Math.round(0.125 * 32767), 'channels are averaged ((0.5 - 0.25) / 2)');
    A.ok(wavToPcm16(Buffer.from('not a wav at all, definitely not')) === null, 'non-WAV bytes are refused');
    const clip = Buffer.alloc(8); clip.writeFloatLE(3.0, 0); clip.writeFloatLE(-3.0, 4);
    const clipped = wavToPcm16(Buffer.concat([wavHeader(3, 1, 16000, 32, 8), clip]));
    A.ok(clipped.readInt16LE(44) === 32767 && clipped.readInt16LE(46) === -32768, 'out-of-range floats clip instead of wrapping');

    const v = makeRemoteVoice({ now: () => 1, newId: () => 'w1', synthesize: async () => ({ ok: true, buf: stereoFloat, mime: 'audio/wav', provider: 'local-kokoro' }) });
    const sp = await v.speak('devA', { text: 'hi' });
    A.ok(sp.ok && sp.data.bytes === out.length, 'speak serves the normalised WAV');
    const bad = makeRemoteVoice({ now: () => 1, newId: () => 'w2', synthesize: async () => ({ ok: true, buf: Buffer.from('garbage bytes here....'), mime: 'audio/wav' }) });
    A.ok(!(await bad.speak('devA', { text: 'hi' })).ok, 'an unreadable WAV is reported, not sent');
    const mp3 = makeRemoteVoice({ now: () => 1, newId: () => 'm1', synthesize: async () => ({ ok: true, buf: Buffer.from([0xff, 0xfb, 0x90, 0x00]), mime: 'audio/mpeg', provider: 'edge' }) });
    const m = await mp3.speak('devA', { text: 'hi' });
    A.ok(m.ok && m.data.mime === 'audio/mpeg' && m.data.bytes === 4, 'MP3 is passed through as-is');
  }

  /* ---------- 4. the gateway: device identity comes from the session, never from args ---------- */
  {
    const seen = [];
    const voice = {
      hear: async (deviceId, a) => { seen.push(['hear', deviceId, a.deviceId]); return { ok: true, data: { text: 'hi' } }; },
      speak: async (deviceId) => { seen.push(['speak', deviceId]); return { ok: false, error: 'no voice here' }; },
      speech: (deviceId) => { seen.push(['speech', deviceId]); return { ok: true, data: { done: true } }; }
    };
    const gw = makeGateway({ host: {}, approvals: { size: () => 0 }, voice, now: () => 1 });
    A.ok(gw.verbs.includes('hear') && gw.verbs.includes('speak') && gw.verbs.includes('speech'), 'the three voice verbs are on the menu');
    const r = await gw.call({ verb: 'hear', args: { utt: 'u', part: 0, deviceId: 'spoofed' } }, { deviceId: 'devA', sessionId: 's' });
    A.ok(r.ok && r.data.text === 'hi', 'hear answers through the gateway');
    A.eq(seen[0][1], 'devA', 'the session device id is used');
    const sp = await gw.call({ verb: 'speak', args: { text: 'x' } }, { deviceId: 'devA' });
    A.ok(!sp.ok && sp.error === 'no voice here', 'a voice error reaches the device as a sentence');
    const noCtx = await gw.call({ verb: 'speech', args: {} }, {});
    A.ok(!noCtx.ok, 'no session device, no voice');
    const bare = makeGateway({ host: {}, approvals: { size: () => 0 }, now: () => 1 });
    const none = await bare.call({ verb: 'hear', args: {} }, { deviceId: 'devA' });
    A.ok(!none.ok && /cannot do voice/.test(none.error), 'a station without voice says so');
  }

  A.report('remote-voice');
})().catch((e) => { console.log('FAIL: threw ' + (e && e.stack || e)); process.exit(1); });
