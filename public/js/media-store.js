import {allowedMedia,AUDIO_TYPES,IMAGE_TYPES,isMediaRef,MAX_AUDIO_BYTES,MAX_IMAGE_BYTES,MAX_IMAGE_INPUT,MEDIA_VERSION,mediaHash} from '/core/media.js';
import {allMediaRecords,api,deleteMediaRecord,getMediaRecord,getMeta,localEvents,model,prepare,putMediaRecord,rewritePendingEvents,transact} from './storage.js';

const urls=new Map();
const dataUri=/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/;
const refs=(value,out=new Set())=>{
  if(typeof value==='string'){if(isMediaRef(value))out.add(value);return out;}
  if(Array.isArray(value)){for(const item of value)refs(item,out);return out;}
  if(value&&typeof value==='object')for(const item of Object.values(value))refs(item,out);
  return out;
};
const bytesToHex=bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function hashBlob(blob){return bytesToHex(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));}
const canvasBlob=(canvas,type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
async function normalizeImage(blob) {
  if(blob.size>MAX_IMAGE_INPUT||!IMAGE_TYPES.has(blob.type))throw new Error('PNG, JPEG hoặc WebP; ảnh nguồn tối đa 12 MB');
  const bitmap=await createImageBitmap(blob),scale=Math.min(1,800/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  let output=null;
  for(const quality of [0.82,0.68,0.52]){output=await canvasBlob(canvas,'image/webp',quality);if(output&&output.size<=MAX_IMAGE_BYTES)break;}
  if(!output||output.size>MAX_IMAGE_BYTES)throw new Error('Ảnh sau khi nén vẫn vượt quá 1,5 MB');
  return output;
}
async function normalizeBlob(blob,kind) {
  if(kind==='image')return normalizeImage(blob);
  if(kind==='audio'){
    if(!AUDIO_TYPES.has(blob.type)||blob.size>MAX_AUDIO_BYTES)throw new Error('Audio không hỗ trợ hoặc vượt quá 3 MB');
    return blob;
  }
  throw new Error('Loại tài nguyên không hỗ trợ');
}
async function saveBlob(blob,status='local') {
  if(!allowedMedia(blob.type,blob.size))throw new Error('Tài nguyên vượt giới hạn lưu trữ');
  const id=`media:${await hashBlob(blob)}`,prior=await getMediaRecord(id);
  if(prior?.blob)return prior;
  return putMediaRecord({id,mime:blob.type,size:blob.size,blob,status,version:MEDIA_VERSION,updatedAt:Date.now()});
}
export async function ingestBlob(blob,kind){return (await saveBlob(await normalizeBlob(blob,kind))).id;}
export async function ingestFile(file,kind){return ingestBlob(file,kind);}
export async function ingestDataUri(uri,kind) {
  const match=dataUri.exec(uri||'');if(!match)throw new Error('Dữ liệu media cũ không hợp lệ');
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return ingestBlob(new Blob([bytes],{type:match[1]}),kind);
}
async function verifiedRemote(ref) {
  const response=await fetch(`/api/media/${encodeURIComponent(ref)}`,{credentials:'same-origin',cache:'no-store'});
  if(!response.ok){
    if(response.status===404)await putMediaRecord({id:ref,mime:'',size:0,status:'not-downloaded',version:MEDIA_VERSION,updatedAt:Date.now()});
    throw new Error(response.status===404?'not-downloaded':'media-fetch-failed');
  }
  const blob=await response.blob();
  if(!allowedMedia(blob.type,blob.size)||await hashBlob(blob)!==mediaHash(ref)){
    await putMediaRecord({id:ref,mime:blob.type,size:blob.size,status:'corrupt',version:MEDIA_VERSION,updatedAt:Date.now()});
    throw new Error('corrupt');
  }
  await putMediaRecord({id:ref,mime:blob.type,size:blob.size,blob,status:'synced',version:MEDIA_VERSION,updatedAt:Date.now()});
  return blob;
}
export async function mediaBlob(value) {
  if(!isMediaRef(value)){
    const match=dataUri.exec(value||'');if(!match)return null;
    const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:match[1]});
  }
  const local=await getMediaRecord(value);
  if(local?.blob)return local.blob;
  if(local?.status==='corrupt')throw new Error('corrupt');
  if(!navigator.onLine){
    if(!local)await putMediaRecord({id:value,mime:'',size:0,status:'not-downloaded',version:MEDIA_VERSION,updatedAt:Date.now()});
    throw new Error('not-downloaded');
  }
  return verifiedRemote(value);
}
export async function mediaUrl(value) {
  if(!isMediaRef(value))return value||'';
  if(urls.has(value))return urls.get(value);
  const blob=await mediaBlob(value),url=URL.createObjectURL(blob);urls.set(value,url);return url;
}
export async function hydrateMedia(root=document) {
  const nodes=[...root.querySelectorAll('[data-media-ref]')];
  await Promise.all(nodes.map(async node=>{
    const ref=node.dataset.mediaRef;if(!ref)return;
    try{node.src=await mediaUrl(ref);node.dataset.mediaStatus='available';}
    catch(error){node.removeAttribute('src');node.dataset.mediaStatus=error.message==='corrupt'?'corrupt':'missing';}
  }));
}
export async function toDataUri(value) {
  if(!isMediaRef(value))return value||'';
  const blob=await mediaBlob(value);
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
}
export const mediaMarkup=value=>isMediaRef(value)?{src:'',ref:value}:{src:value||'',ref:''};

export async function migrateLegacyMedia() {
  const rewrites=[];
  for(const event of localEvents().filter(event=>!event.seq&&event.kind==='word')){
    const patch={...event.data.patch};let changed=false;
    for(const kind of ['image','audio']){
      const value=patch[kind];if(typeof value!=='string'||!value.startsWith('data:'))continue;
      patch[kind]=await ingestDataUri(value,kind);changed=true;
    }
    if(changed)rewrites.push({...event,data:{...event.data,patch}});
  }
  if(rewrites.length)await rewritePendingEvents(rewrites);
  const state=model(),events=[];
  for(const word of Object.values(state.words)){
    if(word.deleted)continue;
    const patch={};
    for(const kind of ['image','audio']){
      const value=word[kind];if(typeof value!=='string'||!value.startsWith('data:'))continue;
      patch[kind]=await ingestDataUri(value,kind);
    }
    if(Object.keys(patch).length)events.push(prepare('word',{id:word.id,setId:word.setId,patch,baseFields:word.fields}));
  }
  if(events.length)await transact(events);
  return rewrites.length+events.length;
}
export async function convertImportMedia(rows) {
  for(const row of rows){
    if(row.error)continue;
    for(const kind of ['image','audio']){
      const value=row.patch?.[kind];if(typeof value==='string'&&value.startsWith('data:'))row.patch[kind]=await ingestDataUri(value,kind);
    }
  }
}
export async function localMediaStats() {
  const records=await allMediaRecords();
  return records.reduce((out,r)=>{out.count++;out.bytes+=r.size||0;out[r.status||'local']=(out[r.status||'local']||0)+1;return out;},
    {count:0,bytes:0,local:0,synced:0,'not-downloaded':0,corrupt:0});
}
export async function currentMediaStatus(words) {
  const unique=new Set();for(const word of words)for(const value of [word.image,word.audio])if(value)unique.add(value);
  const out={total:unique.size,available:0,legacy:0,'not-downloaded':0,corrupt:0};
  for(const value of unique){
    if(!isMediaRef(value)){out.legacy++;out.available++;continue;}
    const record=await getMediaRecord(value);
    if(record?.blob)out.available++;
    else if(record?.status==='corrupt')out.corrupt++;
    else out['not-downloaded']++;
  }
  return out;
}
export async function cleanupLocalMedia() {
  const keep=new Set(),state=model();refs(Object.values(state.words).map(w=>({image:w.image,audio:w.audio})),keep);
  for(const event of localEvents().filter(e=>!e.seq))refs(event.data,keep);
  refs(await getMeta('session'),keep);refs(await getMeta('importDraft'),keep);
  let removed=0;
  for(const record of await allMediaRecords())if(!keep.has(record.id)){urls.has(record.id)&&URL.revokeObjectURL(urls.get(record.id));urls.delete(record.id);await deleteMediaRecord(record.id);removed++;}
  return {removed,...await localMediaStats()};
}
export async function cleanupServerMedia(){return api('media-cleanup',{});}
