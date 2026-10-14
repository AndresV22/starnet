'use strict';

const path = require('node:path');
const A = require('./_assert.js');
const F = require('../sidecar/file-response.js');

A.eq(F.mimeForPath('report.HTML'), 'text/html', 'known MIME is case-insensitive and strips charset for multipart uploads');
A.eq(F.mimeForPath('unknown.bin'), 'application/octet-stream', 'unknown extension fails to safe binary MIME');
A.eq(F.safeDownloadName(path.join('drop', 'a bad;name.html')), 'a_bad_name.html', 'download filename removes header-active punctuation');
A.ok(F.isActiveDeliverable('demo.svg') && F.isActiveDeliverable('code.mjs'), 'active browser formats are download-only');
A.ok(!F.isActiveDeliverable('photo.png'), 'passive media may render inline');
A.eq(F.parseRange('', 100), null, 'missing range requests the full file');
A.eq(F.parseRange('bytes=10-19', 100), { start: 10, end: 19 }, 'explicit range is inclusive');
A.eq(F.parseRange('bytes=90-', 100), { start: 90, end: 99 }, 'open range ends at the file boundary');
A.eq(F.parseRange('bytes=-10', 100), { start: 90, end: 99 }, 'suffix range returns the requested tail');
A.eq(F.parseRange('bytes=90-999', 100), { start: 90, end: 99 }, 'end is clamped to the file boundary');
A.eq(F.parseRange('bytes=100-101', 100), { unsatisfiable: true }, 'range beginning at EOF is rejected');
A.eq(F.parseRange('bytes=20-10', 100), { unsatisfiable: true }, 'backwards range is rejected');
A.eq(F.parseRange('bytes=1-2,4-5', 100), { unsatisfiable: true }, 'multi-range input is rejected explicitly');
A.eq(F.CHANNEL_UPLOAD_MAX_BYTES, 20 * 1024 * 1024, 'channel upload ceiling remains 20 MiB');

/* THE READABLE DOCUMENT VIEW (live walk 10-14: OPEN on a worker's tagline.md showed raw text on a white, unstyled
   browser tab). /api/file?…&view=doc wraps a TEXT deliverable in the station's own reading page: every byte escaped
   into one <pre>, no script, no remote anything — the deliverable is something to read and use, not a raw dump. */
A.ok(F.isTextDocument('tagline.md') && F.isTextDocument('notes.TXT') && F.isTextDocument('rows.csv') && F.isTextDocument('data.json') && F.isTextDocument('build.log'),
  'markdown, text, csv, json and logs read as documents');
A.ok(!F.isTextDocument('page.html') && !F.isTextDocument('photo.png') && !F.isTextDocument('archive.zip') && !F.isTextDocument('noext'),
  'pages, media and binaries keep their own doors (the browser window, the lightbox, the OS)');
const hostile = '# Launch\n<script>alert(1)</script><img src=x onerror=alert(2)> & "quotes" \'too\'\nRun agents on your machine.';
const page = F.documentViewHtml('tag<line>.md', hostile);
A.ok(/^<!doctype html>/i.test(page) && /<title>tag&lt;line&gt;\.md<\/title>/.test(page), 'a whole document titled by the escaped file name');
A.ok(page.indexOf('<script>') === -1 && page.indexOf('<img') === -1 && page.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') >= 0, 'every byte of the file is escaped text, never markup');
A.ok(page.indexOf('Run agents on your machine.') >= 0 && /<pre[^>]*>/.test(page), 'the text reads as written, line breaks kept');
A.ok(/background:\s*#[0-9a-f]{3,6}/i.test(page) && !/background:\s*#fff/i.test(page), 'a station-dark page, never the browser\'s white');
A.ok(/sandbox/.test(F.DOC_VIEW_CSP) && /default-src 'none'/.test(F.DOC_VIEW_CSP) && !/script-src [^;]*'unsafe/.test(F.DOC_VIEW_CSP), 'served sandboxed with no script and no remote loads');
A.ok(F.DOC_VIEW_MAX_BYTES >= 256 * 1024 && F.DOC_VIEW_MAX_BYTES <= 4 * 1024 * 1024, 'bounded: a huge file opens raw rather than as a giant page');

A.report('file-response.test');
