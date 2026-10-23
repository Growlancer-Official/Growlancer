// Local static server for the built dist/ — used only for release verification.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist');
const PORT = Number(process.env.E2E_PORT || 4175);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    // Vercel injects these at the edge, so a local mirror must answer them too
    // or every page reports a 404 the deployed site never has.
    if (url.startsWith('/_vercel/')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end('/* vercel analytics: served by the platform, absent in a local mirror */');
      return;
    }
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      const candidate = path.join(ROOT, url, 'index.html');
      if (fs.existsSync(candidate)) {
        file = candidate;
      } else if (path.extname(url)) {
        // A missing asset/script must 404 like production does. Falling back to
        // index.html here made `npm`-style analytics scripts parse HTML as JS.
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      } else {
        file = path.join(ROOT, 'index.html');
      }
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`dist server on http://127.0.0.1:${PORT}`));
