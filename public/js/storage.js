import {replay} from '/core/model.js';
import {validateEvent} from '/core/validation.js';
let db, owner, cached = [], cursor = 0, deviceId, offset = 0, lastOrder = 0, queue = Promise.resolve();
export const uuid = () => crypto.randomUUID();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('voca-events') : null;
function done(tx) {return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Storage transaction aborted'));});}
function request(req) {return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function openStore(user) {
  owner = user.id;
  db?.close();
  db = await new Promise((resolve,reject)=>{
    const req = indexedDB.open(`vocalearn-${owner}`,1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('events',{keyPath:'id'});req.result.createObjectStore('meta');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  deviceId = await getMeta('deviceId');
  if (!deviceId) {deviceId=uuid();await setMeta('deviceId',deviceId);}
  offset = await getMeta('offset') || 0;
  await refresh();
}
export async function refresh() {
  const tx = db.transaction(['events','meta'],'readonly');
  const [events,c] = await Promise.all([request(tx.objectStore('events').getAll()),request(tx.objectStore('meta').get('cursor'))]);
  cached=events;cursor=c || 0;
  return replay(cached);
}
export const model = () => replay(cached);
export const pendingCount = () => cached.filter(e=>!e.seq).length;
export const getMeta = key => request(db.transaction('meta').objectStore('meta').get(key));
export async function setMeta(key,value) {
  const tx = db.transaction('meta','readwrite');tx.objectStore('meta').put(value,key);await done(tx);
}
export function prepare(kind,data,id=uuid()) {
  const at=Date.now();lastOrder=Math.max(lastOrder+1,at*1000);
  return {id,deviceId,kind,data,at,effectiveAt:at+offset,localOrder:lastOrder};
}
async function writeTransaction(events,session,metadata={}) {
  events.forEach(validateEvent);
  const tx = db.transaction(['events','meta'],'readwrite');
  for(const e of events) {
    const store=tx.objectStore('events'), req=store.get(e.id);
    req.onsuccess=()=>{
      if(!req.result)store.add(e);
      else if(req.result.kind!==e.kind||JSON.stringify(req.result.data)!==JSON.stringify(e.data))tx.abort();
    };
  }
  if (session !== undefined) tx.objectStore('meta').put(session,'session');
  for(const [key,value] of Object.entries(metadata))tx.objectStore('meta').put(value,key);
  await done(tx);await refresh();channel?.postMessage({owner});
}
export async function transact(events,session,metadata={}) {
  const run=()=>writeTransaction(events,session,metadata);
  queue=queue.catch(()=>{}).then(()=>navigator.locks?navigator.locks.request(`voca-${owner}`,run):run());
  return queue;
}
export async function transactAnswer(event,session) {
  validateEvent(event);
  let result;
  const run=async()=>{
    await refresh();
    const scheduled=!['free','errors'].includes(event.data.mode);
    const prior=cached.find(e=>e.kind==='answer'&&(
      e.id===event.id || scheduled&&e.deviceId===event.deviceId&&e.data.opportunityId===event.data.opportunityId
    ));
    if(prior){result={inserted:false,event:prior};return;}
    await writeTransaction([event],session);
    result={inserted:true,event};
  };
  queue=queue.catch(()=>{}).then(()=>navigator.locks?navigator.locks.request(`voca-${owner}`,run):run());
  await queue;return result;
}
export async function api(path, body) {
  const response = await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',
    credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}
let syncPromise = null;
export function sync() {
  if(syncPromise)return syncPromise;
  const run = async()=>{
    await refresh();
    // Bound batches by serialized size, not only count (media may be large).
    const batch=[];let bytes=0;
    for(const e of cached.filter(e=>!e.seq).sort((a,b)=>a.localOrder-b.localOrder)) {
      const size=JSON.stringify(e).length;
      if(batch.length && (bytes+size>6000000||batch.length===150))break;
      batch.push(e);bytes+=size;
    }
    const data=await api('sync',{events:batch,cursor,deviceId,clientNow:Date.now()});
    const tx=db.transaction(['events','meta'],'readwrite');
    for(const e of data.events)tx.objectStore('events').put(e);
    tx.objectStore('meta').put(data.cursor,'cursor');
    offset=data.anchorServer-data.anchorClient;tx.objectStore('meta').put(offset,'offset');
    tx.objectStore('meta').put(Date.now(),'lastSync');
    await done(tx);await refresh();channel?.postMessage({owner});
  };
  syncPromise=(async()=>{
    await queue.catch(()=>{});
    await(navigator.locks?navigator.locks.request(`voca-${owner}`,run):run());
  })().finally(()=>{syncPromise=null;});
  return syncPromise;
}
channel?.addEventListener('message',e=>{if(e.data.owner===owner)window.dispatchEvent(new CustomEvent('voca-external'));});
if (typeof window !== 'undefined') window.addEventListener('online', () => sync().catch(() => {}));
