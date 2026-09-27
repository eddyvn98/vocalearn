import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const allowed = new Set(['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4']);
const maxItem = 1500000;
const maxUser = 200 * 1024 * 1024;
const safeUser = value => String(value).replace(/[^A-Za-z0-9_-]/g,'_');

function pathFor(root,userId,id) {
  return join(root,safeUser(userId),id);
}

export function putMedia(db,userId,input,root) {
  if(!input || !/^[a-f0-9]{64}$/.test(input.id) || typeof input.uri!=='string')throw new Error('Invalid media upload');
  const match=input.uri.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match || !allowed.has(match[1]))throw new Error('Unsupported media type');
  const data=Buffer.from(match[2],'base64');
  if(!data.length || data.length>maxItem)throw new Error('Media item too large');
  const digest=createHash('sha256').update(data).digest('hex');
  if(digest!==input.id)throw new Error('Media hash mismatch');
  const prior=db.prepare('SELECT id FROM media_files WHERE user_id=? AND id=?').get(userId,input.id);
  if(prior){
    const file=pathFor(root,userId,input.id);
    if(!existsSync(file))writeFileSync(file,data,{mode:0o600,flag:'wx'});
    return {id:input.id,size:data.length,deduplicated:true,repaired:true};
  }
  const used=Number(db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM media_files WHERE user_id=?').get(userId).total);
  if(used+data.length>maxUser)throw new Error('Media quota exceeded');
  const dir=join(root,safeUser(userId));mkdirSync(dir,{recursive:true,mode:0o700});
  const file=pathFor(root,userId,input.id);
  if(!existsSync(file))writeFileSync(file,data,{mode:0o600,flag:'wx'});
  db.prepare('INSERT INTO media_files(user_id,id,mime,size,created) VALUES(?,?,?,?,?)')
    .run(userId,input.id,match[1],data.length,Date.now());
  return {id:input.id,size:data.length,deduplicated:false};
}

export function getMedia(db,userId,id,root) {
  if(!/^[a-f0-9]{64}$/.test(id))return null;
  const item=db.prepare('SELECT mime,size FROM media_files WHERE user_id=? AND id=?').get(userId,id);
  if(!item)return null;
  const file=pathFor(root,userId,id);
  if(!existsSync(file))return null;
  return {...item,data:readFileSync(file)};
}


export function mediaUsage(db,userId) {
  const row=db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size),0) AS bytes FROM media_files WHERE user_id=?').get(userId);
  return {count:Number(row.count),bytes:Number(row.bytes),limit:maxUser,remaining:Math.max(0,maxUser-Number(row.bytes))};
}
