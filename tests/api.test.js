import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {application} from '../server/main.js';
let server,url,cookie,user;
async function request(path,data,session=cookie,extra={}) {
  const response=await fetch(url+path,{method:data===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(session?{Cookie:session}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:response.status,headers:response.headers,data:await response.json()};
}
before(async()=>{
 server=application({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;
 const r=await request('/api/register',{email:'test@example.com',password:'long-secure-password'},null);
 assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];user=r.data.user;
});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
const event=(id,kind,data,deviceId='device',at=Date.now())=>({id,kind,data,deviceId,at});
const batch=(events,deviceId='device',cursor=0)=>({events,deviceId,cursor,clientNow:Date.now()});
test('Authenticated session is HttpOnly, account owns its data',async()=>{
 const r=await request('/api/login',{email:'test@example.com',password:'long-secure-password'},null);
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);
 assert.equal((await request('/api/me')).data.user.id,user.id);
});
test('Unauthenticated sync is rejected',async()=>assert.equal((await request('/api/sync',batch([]),null)).status,401));
test('Incorrect password is rejected',async()=>assert.equal((await request('/api/login',{email:'test@example.com',password:'wrong-long-password'},null)).status,400));
test('Cross-origin writes and malformed JSON media type are rejected',async()=>{
 assert.equal((await request('/api/sync',batch([]),cookie,{Origin:'https://attacker.invalid'})).status,403);
 const r=await fetch(url+'/api/sync',{method:'POST',headers:{Cookie:cookie,'Content-Type':'text/plain'},body:'{}'});assert.equal(r.status,415);
});
test('Same-origin HTML reset form may send null Origin without being treated as cross-site',async()=>{
 const headers={'Content-Type':'application/x-www-form-urlencoded',Origin:'null','Sec-Fetch-Site':'same-origin'};
 const ok=await fetch(url+'/reset-password/request',{method:'POST',headers,body:'email=test%40example.com'});
 assert.equal(ok.status,202);
 const blocked=await fetch(url+'/reset-password/request',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site'},body:'email=test%40example.com'});
 assert.equal(blocked.status,403);
});
test('Idempotent event append and offline sync round trip',async()=>{
 const e=event('set-event','set',{id:'set',name:'Work',language:'en',meaningLanguage:'vi'});
 const a=await request('/api/sync',batch([e]));assert.equal(a.status,200);assert.equal(a.data.events.length,1);
 const b=await request('/api/sync',batch([e]));assert.equal(b.data.events.length,1);assert.equal(b.data.events[0].seq,a.data.events[0].seq);
 const next=event('word-event','word',{id:'word',setId:'set',patch:{word:'apple',meaning:'fruit'}});
 const c=await request('/api/sync',batch([next],'device',a.data.cursor));assert.equal(c.data.events.length,1);
 const second=await request('/api/sync',batch([],'other'));assert.equal(second.data.events.length,2);
});
test('Failed batches are atomic, malformed item cannot partially import',async()=>{
 const good=event('atomic-good','word',{id:'atomic',setId:'set',patch:{word:'atomic'}});
 const bad=event('atomic-bad','word',{id:'invalid',setId:'set',patch:{image:'javascript:bad'}});
 const r=await request('/api/sync',batch([good,bad]));assert.equal(r.status,400);
 const all=await request('/api/sync',batch([]));assert.equal(all.data.events.some(e=>e.id==='atomic-good'),false);
});
test('Category cycles are rejected without corrupting data',async()=>{
 const a=event('cat-a','category',{id:'a',setId:'set',name:'A',parentId:null});
 const b=event('cat-b','category',{id:'b',setId:'set',name:'B',parentId:'a'});
 assert.equal((await request('/api/sync',batch([a,b]))).status,200);
 const cycle=event('cat-cycle','category',{id:'a',setId:'set',name:'A',parentId:'b'});
 assert.equal((await request('/api/sync',batch([cycle]))).status,400);
});
test('Separate accounts cannot read another account events',async()=>{
 const r=await request('/api/register',{email:'other@example.com',password:'another-long-password'},null);
 const c=r.headers.get('set-cookie').split(';')[0];
 const state=await request('/api/sync',batch([]),c);assert.equal(state.data.events.length,0);
});
test('Server rejects event from another device in the batch',async()=>{
 assert.equal((await request('/api/sync',batch([event('wrong-device','settings',{newLimit:5},'mismatch')]))).status,400);
});
test('Record time is bounded; returning same ID preserves effective timestamp',async()=>{
 const e=event('clock-event','settings',{newLimit:10},'device',Date.now()+864000000);
 const a=await request('/api/sync',batch([e]));const accepted=a.data.events.find(x=>x.id===e.id);
 assert.ok(accepted.effectiveAt<=a.data.serverNow);
 const b=await request('/api/sync',batch([e]));assert.equal(b.data.events.find(x=>x.id===e.id).effectiveAt,accepted.effectiveAt);
});
test('Private files cannot be served; security headers are present',async()=>{
 const r=await fetch(url+'/server/auth.js');assert.equal(r.status,404);
 const page=await fetch(url+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
 assert.equal((await fetch(url+'/core/srs.js')).status,200);
});
test('An event ID cannot be reused with different data',async()=>{
 const changed=event('set-event','set',{id:'set',name:'Rewritten',language:'en',meaningLanguage:'vi'});
 assert.equal((await request('/api/sync',batch([changed]))).status,400);
 const all=await request('/api/sync',batch([]));
 assert.equal(all.data.events.find(e=>e.id==='set-event').data.name,'Work');
});
test('Logout invalidates server session',async()=>{
 assert.equal((await request('/api/logout',{})).status,200);
 assert.equal((await request('/api/me')).status,401);
});
