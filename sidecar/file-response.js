/* sidecar/file-response.js — shared file/download response policy. */
'use strict';

const path = require('node:path');

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.opus': 'audio/ogg; codecs=opus'
});

const CHANNEL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const ACTIVE_DELIVERABLE_EXTS = new Set(['.html', '.htm', '.xhtml', '.js', '.mjs', '.cjs', '.svg', '.xml', '.xsl', '.xslt', '.wasm']);

function mimeForPath(file) {
  const mime = MIME[path.extname(String(file || '')).toLowerCase()];
  return mime ? String(mime).split(';')[0].trim() : 'application/octet-stream';
}

function safeDownloadName(file) {
  return path.basename(file).replace(/[^A-Za-z0-9_.-]/g, '_') || 'download';
}

function isActiveDeliverable(file) {
  return ACTIVE_DELIVERABLE_EXTS.has(path.extname(file).toLowerCase());
}

// Parse one RFC 7233 byte range. Multi-range requests are deliberately unsupported because the media/file
// callers only need seeking and resumable single ranges.
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === '' && match[2] === '')) return { unsatisfiable: true };
  let start;
  let end;
  if (match[1] === '') {
    const count = parseInt(match[2], 10);
    if (!count) return { unsatisfiable: true };
    start = Math.max(0, size - count);
    end = size - 1;
  } else {
    start = parseInt(match[1], 10);
    end = match[2] === '' ? size - 1 : Math.min(parseInt(match[2], 10), size - 1);
  }
  if (!(start >= 0) || start > end || start >= size) return { unsatisfiable: true };
  return { start, end };
}

/* THE READABLE DOCUMENT VIEW (live walk 10-14: OPEN on a worker's tagline.md landed on raw text in a white, unstyled
   browser tab). A deliverable is a thing to use (deliverable-open-not-read): in a browser — where the station cannot
   hand a file to the OS — a TEXT deliverable opens on a station-dark reading page instead. Every byte is escaped
   into one <pre>; the page carries no script and loads nothing (DOC_VIEW_CSP), so it is exactly as inert as the
   raw text it replaces. Pages (.html) keep the BROWSER window, media the lightbox/players, binaries the OS. */
const TEXT_DOC_EXTS = new Set(['.md', '.markdown', '.txt', '.text', '.csv', '.tsv', '.log', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.py', '.ts', '.tsx', '.jsx', '.css', '.scss', '.sh', '.ps1', '.bat', '.sql', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.cs', '.php']);
const DOC_VIEW_MAX_BYTES = 1024 * 1024;
const DOC_VIEW_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
function isTextDocument(file) { return TEXT_DOC_EXTS.has(path.extname(String(file || '')).toLowerCase()); }
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function documentViewHtml(name, text) {
  const title = escapeHtml(path.basename(String(name || 'document')));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="referrer" content="no-referrer"><title>' + title + '</title><style>'
    + ':root{color-scheme:dark}html,body{margin:0;background:#0b0904;color:#ffd9a3}'
    + 'body{font:15px/1.65 ui-monospace,"Cascadia Mono",Consolas,"SF Mono",Menlo,monospace}'
    + 'main{max-width:900px;margin:0 auto;padding:28px 22px 56px}'
    + 'header{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid #4a3410;padding-bottom:10px;margin-bottom:20px}'
    + 'h1{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#ffaa33;font-weight:600;word-break:break-all}'
    + 'header span{font-size:11px;letter-spacing:.12em;color:#b9791c;text-transform:uppercase;margin-left:auto}'
    + 'pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;color:#ffe6c2}'
    + '::selection{background:#ffaa33;color:#0b0904}'
    + '</style></head><body><main><header><h1>' + title + '</h1><span>StarNet · read-only</span></header>'
    + '<pre>' + escapeHtml(text) + '</pre></main></body></html>';
}

module.exports = { MIME, CHANNEL_UPLOAD_MAX_BYTES, mimeForPath, safeDownloadName, isActiveDeliverable, parseRange,
  isTextDocument, documentViewHtml, DOC_VIEW_CSP, DOC_VIEW_MAX_BYTES };
