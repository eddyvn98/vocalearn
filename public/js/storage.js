import {replay} from '/core/model.js';
import {validateEvent} from '/core/validation.js';
let db, owner, cached = [], cursor = 0, deviceId, offset = 0, lastOrder = 0, queue = Promise.resolve(), mediaCache = new Map();
export const uuid = () => crypto.randomUUID();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('voca-events') : null;
function done(tx) {return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Storage transaction aborted'));});}
function request(req) {return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function openStore(user) {
  owner = user.id;
  db?.close();
  db = await new Promise((resolve,reject)=>{
    const req = indexedDB.open(`vocalearn-${owner}`,2);
    req.onupgradeneeded=()=>{
      const next=req.result;
      if(!next.objectStoreNames.contains('events'))next.createObjectStore('events',{keyPath:'id'});
      if(!next.objectStoreNames.contains('meta'))next.createObjectStore('meta');
      if(!next.objectStoreNames.contains('media'))next.createObjectStore('media',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  deviceId = await getMeta('deviceId');
  if (!deviceId) {deviceId=uuid();await setMeta('deviceId',deviceId);}
  offset = await getMeta('offset') || 0;
  await refresh();await loadMedia();
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
async function loadMedia() {
  const items=await request(db.transaction('media').objectStore('media').getAll());
  mediaCache=new Map(items.map(item=>[item.id,item]));
}
export const mediaSrc = value => {
  const match=String(value||'').match(/^media:([a-f0-9]{64})$/);
  return match ? mediaCache.get(match[1])?.uri || '' : value || '';
};
export async function storeMediaUri(uri) {
  const match=String(uri||'').match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match)throw new Error('Invalid media data');
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  if(!bytes.length||bytes.length>1500000)throw new Error('Maximum upload: 1.5 MB');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const id=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const tx=db.transaction('media','readwrite');
  tx.objectStore('media').put({id,uri,mime:match[1],pending:true,size:bytes.length});
  await done(tx);await loadMedia();channel?.postMessage({owner,media:true});
  return `media:${id}`;
}
async function markMediaUploaded(id) {
  const item=mediaCache.get(id);if(!item)return;
  const tx=db.transaction('media','readwrite');tx.objectStore('media').put({...item,pending:false});await done(tx);
  mediaCache.set(id,{...item,pending:false});
}
async function uploadMedia() {
  for(const item of mediaCache.values())if(item.pending){
    await api('media',{id:item.id,uri:item.uri});await markMediaUploaded(item.id);
  }
}
function refs(events) {
  const ids=new Set();
  for(const e of events)if(e.kind==='word')for(const key of ['image','audio']){
    const m=String(e.data.patch?.[key]||'').match(/^media:([a-f0-9]{64})$/);if(m)ids.add(m[1]);
  }
  return ids;
}
async function hydrateMedia(events) {
  for(const id of refs(events))if(!mediaCache.has(id)){
    const response=await fetch(`/api/media/${id}`,{credentials:'same-origin',cache:'force-cache'});
    if(!response.ok)continue;
    const blob=await response.blob();
    const uri=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
    const tx=db.transaction('media','readwrite');tx.objectStore('media').put({id,uri,mime:blob.type,pending:false,size:blob.size});await done(tx);
    mediaCache.set(id,{id,uri,mime:blob.type,pending:false,size:blob.size});
  }
}
export function prepare(kind,data,id=uuid()) {
  const at=Date.now();lastOrder=Math.max(lastOrder+1,at*1000);
  return {id,deviceId,kind,data,at,effectiveAt:at+offset,localOrder:lastOrder};
}
export async function transact(events,session,metadata={}) {
  const run = async()=>{
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
    await done(tx);await refresh();await hydrateMedia(data.events);channel?.postMessage({owner});
  };
  queue=queue.catch(()=>{}).then(()=>navigator.locks?navigator.locks.request(`voca-${owner}`,run):run());
  return queue;
}
export async function api(path, body) {
  const response = await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',
    credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}
let syncing = false;
export async function sync() {
  if(syncing)return;
  syncing=true;
  const run = async()=>{
    await refresh();await loadMedia();await uploadMedia();
    // Bound event batches by serialized size and count. Media bytes sync separately.
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
  try {await queue.catch(()=>{});await(navigator.locks?navigator.locks.request(`voca-${owner}`,run):run());}
  finally {syncing=false;}
}
channel?.addEventListener('message',async e=>{if(e.data.owner===owner){if(e.data.media)await loadMedia();window.dispatchEvent(new CustomEvent('voca-external'));}});
if (typeof window !== 'undefined') window.addEventListener('online', () => sync().catch(() => {}));
