import { createServer } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const devDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(devDir, '..');
const certDir = resolve(devDir, 'certs');
const keyPath = resolve(certDir, 'localhost-key.pem');
const certPath = resolve(certDir, 'localhost-cert.pem');
const port = Number(process.env.KUPLAFIX_DEV_PORT || 8443);

if (!existsSync(keyPath) || !existsSync(certPath)) {
  throw new Error('Local HTTPS certificate is missing. Run dev/setup-local-https.ps1 first.');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `https://${request.headers.host}`).pathname);
  const relativePath = requestPath === '/' ? 'dev/index.local.html' : requestPath.replace(/^\/+/, '');
  const filePath = resolve(rootDir, relativePath);

  if (!filePath.startsWith(`${rootDir}\\`) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
  });
  response.end(readFileSync(filePath));
}).listen(port, '127.0.0.1', () => {
  console.log(`KuplaFix local development server: https://localhost:${port}/dev/index.local.html`);
});
