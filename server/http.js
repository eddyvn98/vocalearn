import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
export function json(res, status, value, headers = {}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});
  res.end(JSON.stringify(value));
}
export async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw new Error('Request too large');
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new Error('Invalid JSON');}
}
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
export async function staticFile(path, res, root) {
  const isCore = path.startsWith('/core/');
  const base = resolve(root, isCore ? 'core' : 'public');
  const relative = isCore ? path.slice(6) : path === '/' ? 'index.html' : path.slice(1);
  const file = resolve(base, relative);
  if (!file.startsWith(base + sep) || !mime[extname(file)]) return json(res, 404, {error:'Not found'});
  try {
    const contents = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)],'Cache-Control':'no-cache',
      ...(path === '/sw.js' ? {'Service-Worker-Allowed':'/'} : {})});
    res.end(contents);
  } catch {json(res,404,{error:'Not found'});}
}
export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Permissions-Policy','microphone=(), geolocation=(), camera=()');
}
