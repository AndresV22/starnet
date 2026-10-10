/* sidecar/remote/voice.js — talking to the station from a paired device that has a microphone and a speaker
   (the AIPI-Lite desk companion). Three gateway verbs, each one small sealed frame, so a device on a phone
   hotspot streams its voice up and the station's voice down through the same relay as everything else:

     hear   { utt, part, frames:[b64 opus], frameMs, last }   collect one utterance in order; on `last`,
                                                               transcribe it with the station's STT chain -> { text }
     speak  { text }                                           synthesize in the station's spoken voice
                                                               -> { id, mime, bytes, provider }
     speech { id, offset, length }                             that audio, in chunks -> { data, offset, bytes, done }

   Audio up is raw Opus frames exactly as the device's encoder made them (mono, one frame per element). The
   station wraps them in an Ogg container here — pure JS, no codec — and hands that to the SAME decoder and STT
   chain Telegram voice notes use. Audio down is whatever the voice engine produced (WAV from the local engine,
   MP3 from the Edge floor); the device decodes both, so the station never transcodes.

   Laws:
     · One utterance and one reply per device at a time. A new utterance replaces an unfinished one; a new reply
       replaces the old one. Nothing is written to disk and nothing outlives VOICE_TTL_MS.
     · Parts must arrive in order (0, 1, 2 …). A gap or a repeat is refused, never silently stitched.
     · Every size is capped: frames per utterance, bytes per frame, text per reply, bytes per chunk.
     · An utterance too short to be speech returns an empty transcript instead of reaching a paid STT leg. */
'use strict';

const MAX_FRAMES = 1000;            // 60 s of 60 ms frames
const MAX_FRAME_BYTES = 1500;       // one Opus packet; the device's 16 kHz mono frames are ~100–200 bytes
const MAX_FRAMES_PER_PART = 64;
const MIN_SPEECH_MS = 300;
const MAX_SPEAK_TEXT = 1200;
const MAX_SPEECH_CHUNK = 64 * 1024;
const VOICE_TTL_MS = 5 * 60 * 1000;
const FRAME_MS = [10, 20, 40, 60];
const UTT_RE = /^[A-Za-z0-9_-]{1,40}$/;

/* ---------- Ogg/Opus muxing (RFC 7845) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  return t;
})();
function oggCrc(buf) {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

function oggPage({ packets, granule, serial, seq, bos, eos }) {
  const lacing = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { lacing.push(255); n -= 255; }
    lacing.push(n);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;
  header[5] = (bos ? 0x02 : 0) | (eos ? 0x04 : 0);
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial >>> 0, 14);
  header.writeUInt32LE(seq >>> 0, 18);
  header.writeUInt32LE(0, 22);
  header[26] = lacing.length;
  for (let i = 0; i < lacing.length; i++) header[27 + i] = lacing[i];
  const page = Buffer.concat([header].concat(packets));
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

/* frames: Buffer[] of raw Opus packets, all `frameMs` long, mono. inputRate is informational (OpusHead). */
function opusFramesToOgg(frames, o) {
  const frameMs = (o && o.frameMs) || 60;
  const inputRate = (o && o.inputRate) || 16000;
  const serial = (o && o.serial) || 0x53544e54;   // "STNT"
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;                       // version
  head[9] = 1;                       // channels
  head.writeUInt16LE(0, 10);         // pre-skip: the device stream starts at its first frame
  head.writeUInt32LE(inputRate, 12);
  head.writeInt16LE(0, 16);          // output gain
  head[18] = 0;                      // mapping family 0: mono/stereo
  const vendor = Buffer.from('starnet', 'latin1');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length);

  const pages = [oggPage({ packets: [head], granule: 0, serial, seq: 0, bos: true })];
  pages.push(oggPage({ packets: [tags], granule: 0, serial, seq: 1 }));
  const samplesPerFrame = frameMs * 48;   // Ogg/Opus granule is always 48 kHz
  let seq = 2, granule = 0, i = 0;
  if (!frames.length) pages.push(oggPage({ packets: [], granule: 0, serial, seq, eos: true }));
  while (i < frames.length) {
    const batch = [];
    let segs = 0;
    // stay well under the 255-lacing-value page limit
    while (i < frames.length && segs + Math.floor(frames[i].length / 255) + 1 <= 250 && batch.length < 50) {
      segs += Math.floor(frames[i].length / 255) + 1;
      batch.push(frames[i]);
      i++;
    }
    granule += batch.length * samplesPerFrame;
    pages.push(oggPage({ packets: batch, granule, serial, seq: seq++, eos: i >= frames.length }));
  }
  return Buffer.concat(pages);
}

/* ---------- WAV for a small decoder ----------
   The local voice engine writes 32-bit float WAV; a device decoder wants 16-bit PCM. Returns a mono 16-bit WAV
   (the input itself when it already is one), or null when the bytes are not a WAV this can read. */
function wavToPcm16(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('latin1', o, o + 4), size = buf.readUInt32LE(o + 4);
    const body = buf.subarray(o + 8, Math.min(buf.length, o + 8 + size));
    if (id === 'fmt ' && body.length >= 16) {
      let format = body.readUInt16LE(0);
      if (format === 0xfffe && body.length >= 26) format = body.readUInt16LE(24);   // WAVE_FORMAT_EXTENSIBLE: the sub-format
      fmt = { format, channels: body.readUInt16LE(2), rate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    } else if (id === 'data') data = body;
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate) return null;
  if (fmt.format === 1 && fmt.bits === 16 && fmt.channels === 1) return buf;
  const frames = Math.floor(data.length / (fmt.channels * (fmt.bits / 8)));
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let ch = 0; ch < fmt.channels; ch++) {
      const at = (i * fmt.channels + ch) * (fmt.bits / 8);
      if (fmt.format === 3 && fmt.bits === 32) sum += data.readFloatLE(at);
      else if (fmt.format === 1 && fmt.bits === 16) sum += data.readInt16LE(at) / 32768;
      else return null;
    }
    const v = Math.max(-1, Math.min(1, sum / fmt.channels));
    out.writeInt16LE(v < 0 ? Math.round(v * 32768) : Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(36 + out.length, 4); h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1'); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(fmt.rate, 24); h.writeUInt32LE(fmt.rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36, 'latin1'); h.writeUInt32LE(out.length, 40);
  return Buffer.concat([h, out]);
}

/* ---------- the verbs ---------- */

function makeRemoteVoice(deps) {
  const now = deps && deps.now;
  if (typeof now !== 'function') throw new Error('makeRemoteVoice needs an injected clock (deps.now)');
  const transcribeOgg = deps.transcribeOgg;     // async (oggBuf) -> { ok, text } | { ok:false, reason }
  const synthesize = deps.synthesize;           // async (text) -> { ok, buf, mime, provider } | { ok:false, reason }
  const newId = deps.newId;
  if (typeof newId !== 'function') throw new Error('makeRemoteVoice needs deps.newId');

  const utterances = new Map();   // deviceId -> { utt, next, frames, bytes, frameMs, at }
  const replies = new Map();      // deviceId -> { id, buf, mime, provider, at }

  function sweep() {
    const t = now();
    for (const [k, u] of utterances) if (t - u.at > VOICE_TTL_MS) utterances.delete(k);
    for (const [k, r] of replies) if (t - r.at > VOICE_TTL_MS) replies.delete(k);
  }

  async function hear(deviceId, a) {
    sweep();
    const utt = String(a.utt || '');
    if (!UTT_RE.test(utt)) return { ok: false, error: 'unknown utterance' };
    const part = Number(a.part);
    if (!Number.isSafeInteger(part) || part < 0) return { ok: false, error: 'bad part number' };
    const frameMs = FRAME_MS.includes(Number(a.frameMs)) ? Number(a.frameMs) : 60;
    const raw = Array.isArray(a.frames) ? a.frames : [];
    if (raw.length > MAX_FRAMES_PER_PART) return { ok: false, error: 'too many frames in one part' };

    let u = utterances.get(deviceId);
    if (part === 0) {
      u = { utt, next: 0, frames: [], bytes: 0, frameMs, at: now() };
      utterances.set(deviceId, u);
    }
    if (!u || u.utt !== utt) return { ok: false, error: 'that utterance is not open (start again from part 0)' };
    if (part !== u.next) return { ok: false, error: 'part ' + part + ' arrived out of order (expected ' + u.next + ')' };
    if (u.frames.length + raw.length > MAX_FRAMES) { utterances.delete(deviceId); return { ok: false, error: 'that was too long to hear in one go' }; }
    for (const f of raw) {
      if (typeof f !== 'string' || !/^[A-Za-z0-9_-]+$/.test(f)) { utterances.delete(deviceId); return { ok: false, error: 'bad audio frame' }; }
      const buf = Buffer.from(f, 'base64url');
      if (!buf.length || buf.length > MAX_FRAME_BYTES) { utterances.delete(deviceId); return { ok: false, error: 'bad audio frame' }; }
      u.frames.push(buf);
      u.bytes += buf.length;
    }
    u.next = part + 1;
    u.at = now();
    if (a.last !== true) return { ok: true, data: { utt, received: u.frames.length } };

    utterances.delete(deviceId);
    const ms = u.frames.length * u.frameMs;
    if (ms < MIN_SPEECH_MS) return { ok: true, data: { utt, text: '', ms, short: true } };
    if (typeof transcribeOgg !== 'function') return { ok: false, error: 'this station cannot transcribe speech' };
    const ogg = opusFramesToOgg(u.frames, { frameMs: u.frameMs });
    let r;
    try { r = await transcribeOgg(ogg); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
    if (!r || !r.ok) return { ok: false, error: 'the station could not transcribe that (' + String((r && r.reason) || 'no transcription').slice(0, 160) + ')' };
    return { ok: true, data: { utt, text: String(r.text || '').trim(), ms } };
  }

  async function speak(deviceId, a) {
    sweep();
    const text = String(a.text == null ? '' : a.text).replace(/\s+/g, ' ').trim();
    if (!text) return { ok: false, error: 'nothing to say' };
    if (text.length > MAX_SPEAK_TEXT) return { ok: false, error: 'that is too long to say in one reply (' + MAX_SPEAK_TEXT + ' characters max)' };
    if (typeof synthesize !== 'function') return { ok: false, error: 'this station has no voice' };
    let r;
    try { r = await synthesize(text); } catch (e) { r = { ok: false, reason: (e && e.message) || String(e) }; }
    if (!r || !r.ok || !Buffer.isBuffer(r.buf) || !r.buf.length) {
      return { ok: false, error: 'the station could not speak that (' + String((r && r.reason) || 'no audio').slice(0, 160) + ')' };
    }
    let buf = r.buf, mime = String(r.mime || '');
    if (/wav/.test(mime)) {
      const pcm16 = wavToPcm16(buf);
      if (!pcm16) return { ok: false, error: 'the station\'s voice produced audio this device cannot play' };
      buf = pcm16;
      mime = 'audio/wav';
    }
    const id = String(newId()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    replies.set(deviceId, { id, buf, mime, provider: String(r.provider || ''), at: now() });
    return { ok: true, data: { id, mime, bytes: buf.length, provider: String(r.provider || '') } };
  }

  function speech(deviceId, a) {
    sweep();
    const r = replies.get(deviceId);
    if (!r || r.id !== String(a.id || '')) return { ok: false, error: 'that reply is gone (ask again)' };
    const offset = Math.max(0, Math.floor(Number(a.offset) || 0));
    const length = Math.max(1, Math.min(MAX_SPEECH_CHUNK, Math.floor(Number(a.length) || MAX_SPEECH_CHUNK)));
    if (offset > r.buf.length) return { ok: false, error: 'past the end of that reply' };
    const chunk = r.buf.subarray(offset, offset + length);
    const done = offset + chunk.length >= r.buf.length;
    // kept after the last chunk: a frame lost on the relay can be asked for again until the TTL or the next reply
    r.at = now();
    return { ok: true, data: { id: r.id, offset, bytes: r.buf.length, data: chunk.toString('base64url'), done } };
  }

  function forget(deviceId) { utterances.delete(deviceId); replies.delete(deviceId); }

  return { hear, speak, speech, forget, _sizes: () => ({ utterances: utterances.size, replies: replies.size }) };
}

module.exports = { makeRemoteVoice, opusFramesToOgg, oggCrc, wavToPcm16, MAX_FRAMES, MAX_SPEECH_CHUNK, MAX_SPEAK_TEXT, VOICE_TTL_MS };
