import {createHash} from 'node:crypto';

const allowed = new Set(['image/png','image/jpeg','image/webp','audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4']);
const maxItem = 1500000;
const maxUser = 200 * 1024 * 1024;

export function putMedia(db,userId,input) {
  if(!input || !/^[a-f0-9]{64}$/.test(input.id) || typeof input.uri!=='string')throw new Error('Invalid media upload');
  const match=input.uri.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match || !allowed.has(match[1]))throw new Error('Unsupported media type');
  const data=Buffer.from(match[2],'base64');
  if(!data.length || data.length>maxItem)throw new Error('Media item too large');
  const digest=createHash('sha256').update(data).digest('hex');
  if(digest!==input.id)throw new Error('Media hash mismatch');
  const prior=db.prepare('SELECT id FROM media WHERE user_id=? AND id=?').get(userId,input.id);
  if(prior)return {id:input.id,size:data.length,deduplicated:true};
  const used=Number(db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM media WHERE user_id=?').get(userId).total);
  if(used+data.length>maxUser)throw new Error('Media quota exceeded');
  db.prepare('INSERT INTO media(user_id,id,mime,data,size,created) VALUES(?,?,?,?,?,?)')
    .run(userId,input.id,match[1],data,data.length,Date.now());
  return {id:input.id,size:data.length,deduplicated:false};
}

export function getMedia(db,userId,id) {
  if(!/^[a-f0-9]{64}$/.test(id))return null;
  return db.prepare('SELECT mime,data,size FROM media WHERE user_id=? AND id=?').get(userId,id) || null;
}
