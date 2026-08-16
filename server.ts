import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const FUNCTIONS_DIR = path.join(__dirname, 'netlify', 'functions');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Ensure index.html and metadata.json are copied if present
const rootIndexHtml = path.join(__dirname, 'index.html');
const distIndexHtml = path.join(DIST_DIR, 'index.html');
if (fs.existsSync(rootIndexHtml) && !fs.existsSync(distIndexHtml)) {
  fs.copyFileSync(rootIndexHtml, distIndexHtml);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Handle Netlify / API Functions: /.netlify/functions/:name or /api/:name
    if (pathname.startsWith('/.netlify/functions/') || pathname.startsWith('/api/')) {
      const functionName = pathname.startsWith('/.netlify/functions/')
        ? pathname.replace('/.netlify/functions/', '').split('/')[0]
        : pathname.replace('/api/', '').split('/')[0];

      const functionPath = path.join(FUNCTIONS_DIR, `${functionName}.js`);

      if (fs.existsSync(functionPath)) {
        try {
          // Read request body
          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }

          // Build Netlify-compatible event object
          const queryParams: Record<string, string> = {};
          parsedUrl.searchParams.forEach((value, key) => {
            queryParams[key] = value;
          });

          const event = {
            rawUrl: parsedUrl.toString(),
            rawQuery: parsedUrl.search.slice(1),
            path: pathname,
            httpMethod: req.method || 'GET',
            headers: req.headers,
            multiValueHeaders: {},
            queryStringParameters: queryParams,
            multiValueQueryStringParameters: {},
            body: body || null,
            isBase64Encoded: false,
          };

          const mod = await import(`file://${functionPath}?t=${Date.now()}`);
          const handler = mod.handler || mod.default;

          if (typeof handler === 'function') {
            const result = await handler(event, {});
            const statusCode = result?.statusCode || 200;
            const headers = result?.headers || { 'Content-Type': 'application/json' };

            res.writeHead(statusCode, headers);
            res.end(result?.body || '');
            return;
          }
        } catch (fnErr: any) {
          console.error(`Error executing function ${functionName}:`, fnErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: fnErr.message || 'Internal Function Error' }));
          return;
        }
      }
    }

    // 2. Serve Static Files
    let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);

    // If file doesn't exist in dist, check in root directory
    if (!fs.existsSync(filePath)) {
      const rootPath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
      if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
        filePath = rootPath;
      }
    }

    // If file exists and is a file, serve it
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileStream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      fileStream.pipe(res);
      return;
    }

    // 3. Fallback to index.html for SPA routing
    if (fs.existsSync(distIndexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(distIndexHtml).pipe(res);
      return;
    } else if (fs.existsSync(rootIndexHtml)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(rootIndexHtml).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err: any) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${err.message}`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Development and production server listening on http://0.0.0.0:${PORT}`);
});
