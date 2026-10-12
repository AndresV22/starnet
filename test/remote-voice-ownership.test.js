/* Controlled completion-order checks for the remote voice lifecycle; no provider, codec or device. */
'use strict';
const A = require('./_assert.js');
const { makeRemoteVoice, VOICE_TTL_MS } = require('../sidecar/remote/voice.js');
(async () => {
  // Delayed synthesis belongs to its admitted request, not whichever request finishes last.
  {
    const audio = text => ({ ok: true, buf: Buffer.from(text), mime: 'audio/mpeg', provider: 'fixture' });
    const settle = () => new Promise(resolve => setImmediate(resolve));
    const harness = () => {
      let clock = 1000, id = 0;
      const calls = [];
      const voice = makeRemoteVoice({ now: () => clock, newId: () => 'owned' + (++id),
        synthesize: text => new Promise((resolve, reject) => calls.push({ text, resolve, reject })) });
      return { voice, calls, advance: ms => { clock += ms; } };
    };
    for (const rejectOld of [false, true]) {
      const h = harness(), old = h.voice.speak('devA', { text: 'old' }), current = h.voice.speak('devA', { text: 'new' });
      h.calls[1].resolve(audio('new')); const newer = await current;
      if (rejectOld) h.calls[0].reject(new Error('late failure')); else h.calls[0].resolve(audio('old'));
      const prior = await old;
      A.ok(!prior.ok, 'an older first chunk ' + (rejectOld ? 'rejection' : 'completion') + ' cannot claim a current reply');
      A.ok(h.voice.speech('devA', { id: newer.data.id }).ok, 'late old settlement cannot replace or delete the newer reply');
    }
    for (const rejectOld of [false, true]) {
      const h = harness(), old = h.voice.speak('devA', { text: ('forgotten '.repeat(24).trim() + '. ').repeat(2) });
      h.voice.forget('devA');
      if (rejectOld) h.calls[0].reject(new Error('late failure')); else h.calls[0].resolve(audio('forgotten'));
      A.ok(!(await old).ok, 'forget during first chunk refuses delayed ' + (rejectOld ? 'rejection' : 'completion'));
      A.eq(h.voice._sizes().replies, 0, 'forget during first chunk leaves no resurrected audio');
      A.eq(h.calls.length, 1, 'forget during first chunk starts no further synthesis');
    }
    {
      const h = harness(), old = h.voice.speak('devA', { text: 'expires' });
      h.advance(VOICE_TTL_MS + 1); h.calls[0].resolve(audio('expires'));
      A.ok(!(await old).ok, 'a first chunk that finishes after the voice TTL is never published');
      A.eq(h.voice._sizes().replies, 0, 'an expired synthesis leaves no reply');
    }
    for (const forget of [false, true]) for (const rejectChunk of [false, true]) {
      const h = harness(), long = ('word '.repeat(36).trim() + '. ').repeat(3);
      const first = h.voice.speak('devA', { text: long }); h.calls[0].resolve(audio('first'));
      const old = await first; A.eq(h.calls.length, 2, 'the second chunk is now waiting in synthesis');
      let replacement = null;
      if (forget) h.voice.forget('devA');
      else {
        const next = h.voice.speak('devA', { text: 'replacement' });
        A.ok(!h.voice.speech('devA', { id: old.data.id }).ok, 'a newly admitted reply immediately invalidates the old audio');
        h.calls[2].resolve(audio('replacement')); replacement = await next;
      }
      if (rejectChunk) h.calls[1].reject(new Error('late second failed')); else h.calls[1].resolve(audio('late second'));
      await settle();
      A.eq(h.calls.length, forget ? 2 : 3, 'replaced or forgotten synthesis starts no further paid chunks');
      A.ok(!h.voice.speech('devA', { id: old.data.id }).ok, 'the old reply stays unavailable after a later chunk settles');
      if (replacement) A.ok(h.voice.speech('devA', { id: replacement.data.id }).ok, 'a late second chunk leaves the newer reply intact');
    }
  }

  A.report('remote-voice-ownership');
})().catch(e => { console.error(e); process.exitCode = 1; });
