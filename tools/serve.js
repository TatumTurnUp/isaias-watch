// Local stand-in for Vercel: static files, /api/watch handler, /api/feed proxied to the live old dashboard,
// and Host-based routing to /tt for the old dashboard (Host: isaias-tatumturnup.vercel.app or cookie iw_old=1).
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const PORT = +process.argv[3] || 8787;
const watch = require(path.join(ROOT, 'api/watch.js'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/watch') return watch(req, res);
  if (u.pathname === '/api/x') { req.query = Object.fromEntries(u.searchParams); return require(path.join(ROOT, 'api/x.js'))(req, res); }
  if (u.pathname === '/api/feed') {
    try { const r = await fetch('https://isaias-watch.vercel.app' + req.url); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(Buffer.from(await r.arrayBuffer())); } catch (e) { res.writeHead(502); res.end('{}'); }
    return;
  }
  let p = u.pathname;
  if (/^\/(icon-192|icon-512|apple-touch-icon)\.png$/.test(p)) { res.writeHead(200, { 'content-type': 'image/png' }); fs.createReadStream(path.join(ROOT, 'icons', p)).pipe(res); return; }
  const old = /isaias-tatumturnup/.test(req.headers.host || '') || /iw_old=1/.test(req.headers.cookie || '');
  if (old && !p.startsWith('/tt/')) p = p === '/' ? '/tt/index.html' : '/tt' + p;
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('listening', PORT));
