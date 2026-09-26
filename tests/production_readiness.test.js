import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {application} from '../server/main.js';
import {openDatabase,synchronize} from '../server/database.js';
import {loadConfig,DEFAULT_LIMITS} from '../server/config.js';
import {createRateLimiter} from '../server/rate-limit.js';
import {schemaVersion,SCHEMA_VERSION} from '../server/migrations.js';
import {createBackup,restoreBackup} from '../server/backup.js';
import {createLogger} from '../server/logger.js';
const temp=()=>mkdtempSync(join(tmpdir(),'vocalearn-ops-'));
async function withServer(options,run){
  const server=application(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{await run(base);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function request(base,path,data,cookie=''){
  const response=await fetch(base+path,{method:data===undefined?'GET':'POST',
    headers:{...(data!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},
    body:data===undefined?undefined:JSON.stringify(data)});
  return {status:response.status,headers:response.headers,data:await response.json()};
}
test('Production config rejects unsafe startup and gates public recovery',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production',APP_ORIGIN:'http://example.test',DB_PATH:'./db.sqlite'}),/HTTPS APP_ORIGIN/);
  assert.throws(()=>loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.test',DB_PATH:'./db.sqlite',ALLOW_SIGNUP:'true'}),/signup requires webhook or Resend/);
  const config=loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.test',DB_PATH:'./db.sqlite',ALLOW_SIGNUP:'true',
    PASSWORD_RESET_MODE:'webhook',PASSWORD_RESET_PROVIDER_URL:'https://mailer.example/hook',PASSWORD_RESET_PROVIDER_TOKEN:'x'.repeat(24)});
  assert.equal(config.production,true);assert.equal(config.reset.mode,'webhook');assert.equal(config.limits.maxSyncEvents,200);
  const resend=loadConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.test',DB_PATH:'./db.sqlite',ALLOW_SIGNUP:'true',
    PASSWORD_RESET_MODE:'resend',RESEND_API_KEY:'re_abcdefghijklmnopqrstuvwxyz',RESEND_FROM:'VocaLearn <noreply@example.test>'});
  assert.equal(resend.reset.mode,'resend');assert.equal(resend.reset.resendFrom,'VocaLearn <noreply@example.test>');
  assert.equal(config.limits.maxAccountEvents,50000);assert.equal(config.limits.maxActiveSessions,20);
});
test('Legacy database is adopted by ordered migrations without losing accounts',()=>{
  const dir=temp(),path=join(dir,'legacy.sqlite');
  const legacy=new DatabaseSync(path);
  legacy.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL); INSERT INTO users VALUES('u','old@example.test','h','s');");legacy.close();
  const db=openDatabase(path);
  try{
    assert.equal(schemaVersion(db),SCHEMA_VERSION);
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get('u').email,'old@example.test');
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'").get());
  }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('Rate limiter blocks within a window and resets after it',()=>{
  const limiter=createRateLimiter({limit:2,windowMs:1000});
  assert.equal(limiter.consume('key',0).allowed,true);assert.equal(limiter.consume('key',1).allowed,true);
  assert.equal(limiter.consume('key',2).allowed,false);assert.equal(limiter.consume('key',1001).allowed,true);
});
test('Health/readiness expose migration state and request limits',async()=>{
  await withServer({dbPath:':memory:'},async base=>{
    const health=await request(base,'/api/health');assert.equal(health.status,200);assert.equal(health.data.ok,true);
    const ready=await request(base,'/api/ready');assert.equal(ready.status,200);assert.equal(ready.data.schemaVersion,SCHEMA_VERSION);
    assert.equal(ready.data.maxSyncEvents,DEFAULT_LIMITS.maxSyncEvents);assert.equal(ready.data.maxAccountEvents,DEFAULT_LIMITS.maxAccountEvents);
  });
});
test('Same-origin password reset form accepts opaque Origin while cross-site remains blocked',async()=>{
  await withServer({dbPath:':memory:',origin:'https://example.test'},async base=>{
    const accepted=await fetch(base+'/reset-password/request',{method:'POST',headers:{
      'Content-Type':'application/x-www-form-urlencoded',Origin:'null','Sec-Fetch-Site':'same-origin'
    },body:'email=person%40example.test'});
    assert.equal(accepted.status,202);
    const blocked=await fetch(base+'/reset-password/request',{method:'POST',headers:{
      'Content-Type':'application/x-www-form-urlencoded',Origin:'null','Sec-Fetch-Site':'cross-site'
    },body:'email=person%40example.test'});
    assert.equal(blocked.status,403);
  });
});
test('Resend password recovery sends a bounded reset email and removes token after delivery failure',async()=>{
  const db=openDatabase(':memory:');
  try{
    const record=await import('../server/auth.js').then(m=>m.passwordRecord('initial-password-123'));
    db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','resend@example.test',record.hash,record.salt);
    const calls=[];
    const config={mode:'resend',appOrigin:'https://example.test',ttlMs:30*60000,resendApiKey:'re_test_key',resendFrom:'VocaLearn <noreply@example.test>'};
    const ok=await import('../server/recovery.js').then(m=>m.requestPasswordReset(db,'resend@example.test',config,{
      now:1000,fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200};}
    }));
    assert.equal(ok.issued,true);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');
    const payload=JSON.parse(calls[0].options.body);
    assert.equal(payload.from,config.resendFrom);assert.deepEqual(payload.to,['resend@example.test']);
    assert.match(payload.text,/https:\/\/example\.test\/reset-password\?token=/);
    assert.match(calls[0].options.headers.Authorization,/^Bearer re_test_key$/);
    const failed=await import('../server/recovery.js').then(m=>m.requestPasswordReset(db,'resend@example.test',config,{
      now:2000,fetchImpl:async()=>({ok:false,status:500})
    }));
    assert.equal(failed.issued,false);assert.match(failed.deliveryError,/Resend returned 500/);
    const count=db.prepare('SELECT COUNT(*) count FROM password_reset_tokens').get().count;
    assert.equal(count,0);
  }finally{db.close();}
});
test('Password reset token changes password and revokes old sessions',async()=>{
  await withServer({dbPath:':memory:',reset:{mode:'return-token',appOrigin:'http://localhost',ttlMs:60000}},async base=>{
    const registered=await request(base,'/api/register',{email:'reset@example.test',password:'initial-password-123'});
    const oldCookie=registered.headers.get('set-cookie').split(';')[0];
    const issued=await request(base,'/api/password-reset/request',{email:'reset@example.test'});
    assert.equal(issued.status,202);assert.match(issued.data.resetToken,/^[a-f0-9]{64}$/);
    const changed=await request(base,'/api/password-reset/confirm',{token:issued.data.resetToken,password:'replacement-password-456'});
    assert.equal(changed.status,200);assert.equal((await request(base,'/api/me',undefined,oldCookie)).status,401);
    assert.equal((await request(base,'/api/login',{email:'reset@example.test',password:'initial-password-123'})).status,400);
    assert.equal((await request(base,'/api/login',{email:'reset@example.test',password:'replacement-password-456'})).status,200);
  });
});
test('Auth throttling returns 429 and oversized JSON returns 413',async()=>{
  await withServer({dbPath:':memory:',limits:{...DEFAULT_LIMITS,authAttempts:2,maxRequestBytes:128}},async base=>{
    await request(base,'/api/register',{email:'limit@example.test',password:'initial-password-123'});
    assert.equal((await request(base,'/api/login',{email:'limit@example.test',password:'wrong-password-123'})).status,400);
    assert.equal((await request(base,'/api/login',{email:'limit@example.test',password:'wrong-password-456'})).status,400);
    const limited=await request(base,'/api/login',{email:'limit@example.test',password:'wrong-password-789'});
    assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>=1);
    const response=await fetch(base+'/api/password-reset/request',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:'x'.repeat(300)+'@example.test'})});
    assert.equal(response.status,413);
  });
});
test('Account event and active-session caps are enforced',async()=>{
  const db=openDatabase(':memory:');
  try{
    db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','cap@example.test','h','s');
    const set={id:'s1',kind:'set',deviceId:'dev',at:1000,data:{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'}};
    synchronize(db,'u',{events:[set],deviceId:'dev',clientNow:1000,cursor:0},1000,10,1);
    const next={id:'s2',kind:'settings',deviceId:'dev',at:1001,data:{newLimit:10}};
    assert.throws(()=>synchronize(db,'u',{events:[next],deviceId:'dev',clientNow:1001,cursor:0},1001,10,1),/event limit/i);
  }finally{db.close();}
  await withServer({dbPath:':memory:',limits:{...DEFAULT_LIMITS,maxActiveSessions:2}},async base=>{
    const first=await request(base,'/api/register',{email:'sessions@example.test',password:'initial-password-123'});
    const firstCookie=first.headers.get('set-cookie').split(';')[0];
    await request(base,'/api/login',{email:'sessions@example.test',password:'initial-password-123'});
    await request(base,'/api/login',{email:'sessions@example.test',password:'initial-password-123'});
    assert.equal((await request(base,'/api/me',undefined,firstCookie)).status,401);
  });
});
test('Structured request logs omit query tokens and submitted credentials',async()=>{
  const lines=[],logger=createLogger({sink:line=>lines.push(line),clock:()=> '2026-09-25T00:00:00.000Z'});
  await withServer({dbPath:':memory:',logger},async base=>{
    await request(base,'/api/register',{email:'private@example.test',password:'do-not-log-this-123'});
    await fetch(base+'/reset-password?token=secret-reset-token');
  });
  const joined=lines.join('\n');
  assert.doesNotMatch(joined,/do-not-log-this|private@example|secret-reset-token/);
  assert.match(joined,/http_request/);
});
test('Backup restores into a fresh database and preserves rows',()=>{
  const dir=temp(),source=join(dir,'source.sqlite'),backup=join(dir,'backup.sqlite'),restored=join(dir,'restored.sqlite');
  const db=openDatabase(source);db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','backup@example.test','h','s');db.close();
  const snapshot=createBackup(source,backup);assert.equal(snapshot.integrity,'ok');assert.equal(snapshot.version,SCHEMA_VERSION);
  const restore=restoreBackup(backup,restored);assert.equal(restore.integrity,'ok');
  const check=openDatabase(restored);
  try{assert.equal(check.prepare('SELECT COUNT(*) count FROM users').get().count,1);}
  finally{check.close();rmSync(dir,{recursive:true,force:true});}
});
