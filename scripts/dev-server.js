// Local stand-in for Vercel: serves index.html and mounts /api/metrics.
const http = require('http');
const fs = require('fs');
const path = require('path');
const metrics = require('../api/metrics');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT || 3000);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/metrics') {
    req.query = Object.fromEntries(url.searchParams);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return res; };
    return metrics(req, res);
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return fs.createReadStream(path.join(root, 'index.html')).pipe(res);
  }
  const types = { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.txt': 'text/plain' };
  const file = path.join(root, path.normalize(url.pathname));
  if (url.pathname.startsWith('/assets/') && file.startsWith(path.join(root, 'assets')) && fs.existsSync(file)) {
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    return fs.createReadStream(file).pipe(res);
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(port, () => console.log(`likepolling dev server on http://localhost:${port}`));
