import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {openDatabase, synchronize} from './database.js';
import {authenticate, sessionUser, logout, cookie} from './auth.js';
import {body, json, staticFile, securityHeaders} from './http.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function application({dbPath = resolve(root,'data/vocalearn.sqlite'), secure = false,
  origin = '', allowSignup = true} = {}) {
  const db = openDatabase(dbPath), attempts = new Map();
  const server = createServer(async (req, res) => {
    securityHeaders(res);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'Method not allowed'});
        return await staticFile(decodeURIComponent(url.pathname), res, root);
      }
      if (req.method === 'POST') {
        const expectedOrigin = origin || `http://${req.headers.host}`;
        if (req.headers.origin && req.headers.origin !== expectedOrigin) return json(res,403,{error:'Origin rejected'});
        if (!String(req.headers['content-type']).startsWith('application/json')) return json(res,415,{error:'JSON required'});
        if (req.headers['sec-fetch-site'] === 'cross-site') return json(res,403,{error:'Cross-site request rejected'});
      }
      if (url.pathname === '/api/health') return json(res,200,{ok:true,version:'0.1.0',allowSignup});
      if (['/api/register','/api/login'].includes(url.pathname) && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now();
        for (const [key, values] of attempts) if (now - values[0] >= 600000) attempts.delete(key);
        const recent = (attempts.get(ip) || []).filter(t => now - t < 600000);
        if (recent.length >= 20) return json(res,429,{error:'Too many attempts. Try again in 10 minutes.'});
        attempts.set(ip,[...recent,now]);
        const auth = await authenticate(db, await body(req), url.pathname === '/api/register', allowSignup);
        return json(res,200,{user:auth.user},{'Set-Cookie':cookie(auth.token,secure)});
      }
      const user = sessionUser(db,req);
      if (!user) return json(res,401,{error:'Please sign in'});
      if (url.pathname === '/api/me' && req.method === 'GET') return json(res,200,{user});
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        logout(db,req);return json(res,200,{ok:true},{'Set-Cookie':cookie('',secure,true)});
      }
      if (url.pathname === '/api/sync' && req.method === 'POST') return json(res,200,synchronize(db,user.id,await body(req)));
      return json(res,404,{error:'Not found'});
    } catch (error) {
      if (!res.headersSent) json(res,400,{error:error.message});
      else res.end();
    }
  });
  server.on('close',()=>db.close());
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile?.(); } catch {}
  const production = process.env.NODE_ENV === 'production';
  if (production && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('Production requires HTTPS APP_ORIGIN');
  const server = application({dbPath:process.env.DB_PATH, secure:production,
    origin:process.env.APP_ORIGIN, allowSignup:process.env.ALLOW_SIGNUP !== 'false'});
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  server.listen(port,host,()=>console.log(`VocaLearn: http://${host}:${port}`));
  process.on('SIGTERM',()=>server.close());
  process.on('SIGINT',()=>server.close());
}
