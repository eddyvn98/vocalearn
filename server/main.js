import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {allEvents,openDatabase,synchronize} from './database.js';
import {cleanupMedia,getMedia,mediaStats,putMedia,sendMedia} from './media.js';
import {authenticate,sessionUser,logout,cookie,normalizeEmail} from './auth.js';
import {body,formBody,html,json,staticFile,securityHeaders} from './http.js';
import {DEFAULT_LIMITS,loadConfig} from './config.js';
import {createRateLimiter} from './rate-limit.js';
import {createLogger,noopLogger} from './logger.js';
import {confirmPasswordReset,requestPasswordReset} from './recovery.js';
import {confirmPage,requestPage,successPage} from './reset-page.js';
import {schemaVersion} from './migrations.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const resetDefaults={mode:'disabled',appOrigin:'http://localhost',providerUrl:'',providerToken:'',resendApiKey:'',resendFrom:'',ttlMs:30*60000};
const ipOf=req=>String(req.socket.remoteAddress||'unknown');
const retryHeader=result=>({'Retry-After':String(Math.max(1,Math.ceil(result.retryAfterMs/1000)))});
function checkLimit(limiter,keys,now=Date.now()){
  let blocked=null;
  for(const key of keys){const result=limiter.consume(key,now);if(!result.allowed)blocked=blocked||result;}
  return blocked;
}
function rejectOrigin(req,origin){
  const expected=origin||`http://${req.headers.host}`;
  const supplied=String(req.headers.origin||'');
  const fetchSite=String(req.headers['sec-fetch-site']||'');
  if(fetchSite==='cross-site')return true;
  if(supplied==='null')return fetchSite!=='same-origin';
  return Boolean(supplied&&supplied!==expected);
}
export function application({dbPath=resolve(root,'data/vocalearn.sqlite'),secure=false,origin='',allowSignup=true,
  limits={},reset={},logger=noopLogger}={}){
  const db=openDatabase(dbPath),configuredLimits={...DEFAULT_LIMITS,...limits},resetConfig={...resetDefaults,...reset};
  const authLimiter=createRateLimiter({limit:configuredLimits.authAttempts,windowMs:configuredLimits.authWindowMs});
  const resetLimiter=createRateLimiter({limit:configuredLimits.resetAttempts,windowMs:configuredLimits.resetWindowMs});
  const server=createServer(async(req,res)=>{
    securityHeaders(res);
    const requestId=randomUUID(),started=Date.now();let path='unknown',actor='anonymous';
    res.setHeader('X-Request-Id',requestId);
    res.on('finish',()=>logger.info('http_request',{requestId,method:req.method,path,status:res.statusCode,durationMs:Date.now()-started,actor}));
    try{
      const url=new URL(req.url,'http://localhost');path=url.pathname;
      if(path==='/reset-password'&&req.method==='GET'){
        const token=url.searchParams.get('token')||'';
        return html(res,200,token?confirmPage(token):requestPage());
      }
      if(path==='/reset-password/request'&&req.method==='POST'){
        if(rejectOrigin(req,origin))return html(res,403,requestPage('Yêu cầu bị từ chối.'));
        const input=await formBody(req,64*1024),email=normalizeEmail(input.email);
        const blocked=checkLimit(resetLimiter,[`reset:ip:${ipOf(req)}`,`reset:email:${email}`]);
        if(blocked)return html(res,429,requestPage('Quá nhiều yêu cầu. Vui lòng thử lại sau.'));
        const result=await requestPasswordReset(db,email,resetConfig);
        if(result.deliveryError)logger.warn('password_reset_delivery_failed',{requestId});
        return html(res,202,requestPage('Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.'));
      }
      if(path==='/reset-password/confirm'&&req.method==='POST'){
        if(rejectOrigin(req,origin))return html(res,403,confirmPage('','Yêu cầu bị từ chối.',true));
        const blocked=checkLimit(resetLimiter,[`confirm:ip:${ipOf(req)}`]);
        if(blocked)return html(res,429,confirmPage('','Quá nhiều yêu cầu. Vui lòng thử lại sau.',true));
        const input=await formBody(req,64*1024);
        try{await confirmPasswordReset(db,input.token,input.password);return html(res,200,successPage());}
        catch(error){return html(res,400,confirmPage(input.token,error.message,true));}
      }
      if(!path.startsWith('/api/')){
        if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
        return await staticFile(decodeURIComponent(path),res,root);
      }
      if(req.method==='POST'){
        if(rejectOrigin(req,origin))return json(res,403,{error:'Origin rejected'});
        if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'JSON required'});
      }
      if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'0.1.0',commit:process.env.RAILWAY_GIT_COMMIT_SHA||null});
      if(path==='/api/ready'&&req.method==='GET'){
        db.prepare('SELECT 1 ok').get();
        return json(res,200,{ok:true,schemaVersion:schemaVersion(db),maxSyncEvents:configuredLimits.maxSyncEvents,
          maxAccountEvents:configuredLimits.maxAccountEvents});
      }
      if(['/api/register','/api/login'].includes(path)&&req.method==='POST'){
        const input=await body(req,configuredLimits.maxRequestBytes),email=normalizeEmail(input.email);
        const blocked=checkLimit(authLimiter,[`${path}:ip:${ipOf(req)}`,`${path}:email:${email}`]);
        if(blocked)return json(res,429,{error:'Too many attempts. Try again later.'},retryHeader(blocked));
        const auth=await authenticate(db,input,path==='/api/register',allowSignup,configuredLimits.maxActiveSessions);
        return json(res,200,{user:auth.user},{'Set-Cookie':cookie(auth.token,secure)});
      }
      if(path==='/api/password-reset/request'&&req.method==='POST'){
        const input=await body(req,configuredLimits.maxRequestBytes),email=normalizeEmail(input.email);
        const blocked=checkLimit(resetLimiter,[`reset:ip:${ipOf(req)}`,`reset:email:${email}`]);
        if(blocked)return json(res,429,{error:'Too many attempts. Try again later.'},retryHeader(blocked));
        const result=await requestPasswordReset(db,email,resetConfig);
        if(result.deliveryError)logger.warn('password_reset_delivery_failed',{requestId});
        return json(res,202,{ok:true,...(resetConfig.mode==='return-token'&&result.debugToken?{resetToken:result.debugToken}:{})});
      }
      if(path==='/api/password-reset/confirm'&&req.method==='POST'){
        const blocked=checkLimit(resetLimiter,[`confirm:ip:${ipOf(req)}`]);
        if(blocked)return json(res,429,{error:'Too many attempts. Try again later.'},retryHeader(blocked));
        const input=await body(req,configuredLimits.maxRequestBytes);
        await confirmPasswordReset(db,input.token,input.password);
        return json(res,200,{ok:true});
      }
      const user=sessionUser(db,req);if(!user)return json(res,401,{error:'Please sign in'});actor=user.id;
      if(path==='/api/me'&&req.method==='GET')return json(res,200,{user});
      if(path==='/api/logout'&&req.method==='POST'){
        logout(db,req);return json(res,200,{ok:true},{'Set-Cookie':cookie('',secure,true)});
      }
      if(path==='/api/media'&&req.method==='POST')return json(res,200,putMedia(db,user.id,await body(req,configuredLimits.maxRequestBytes)));
      if(path==='/api/media-info'&&req.method==='GET')return json(res,200,mediaStats(db,user.id));
      if(path==='/api/media-cleanup'&&req.method==='POST')return json(res,200,cleanupMedia(db,user.id,allEvents(db,user.id)));
      if(path.startsWith('/api/media/')&&req.method==='GET')return sendMedia(res,getMedia(db,user.id,decodeURIComponent(path.slice('/api/media/'.length))));
      if(path==='/api/sync'&&req.method==='POST')return json(res,200,synchronize(db,user.id,
        await body(req,configuredLimits.maxRequestBytes),Date.now(),configuredLimits.maxSyncEvents,configuredLimits.maxAccountEvents));
      return json(res,404,{error:'Not found'});
    }catch(error){
      const status=Number(error.status)||400;
      logger[status>=500?'error':'warn']('http_error',{requestId,path,status,error:error.name,message:error.message});
      if(!res.headersSent)json(res,status,{error:error.message});else res.end();
    }
  });
  server.on('close',()=>db.close());
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{process.loadEnvFile?.();}catch{}
  const config=loadConfig();
  const server=application({dbPath:config.dbPath,secure:config.production,origin:config.appOrigin,
    allowSignup:config.allowSignup,limits:config.limits,reset:config.reset,logger:createLogger()});
  server.listen(config.port,config.host,()=>console.log(`VocaLearn: http://${config.host}:${config.port}`));
  process.on('SIGTERM',()=>server.close());process.on('SIGINT',()=>server.close());
}
