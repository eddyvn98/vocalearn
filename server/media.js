import {createHash} from 'node:crypto';
import {allowedMedia,isMediaRef,MAX_USER_MEDIA_BYTES,mediaHash,MEDIA_VERSION} from '../core/media.js';

export function createMediaTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS media(
    user_id TEXT NOT NULL REFERENCES users(id),
    media_id TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY(user_id,media_id)
  ); CREATE INDEX IF NOT EXISTS user_media ON media(user_id);`);
}
const base64=value=>typeof value==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(value);
export function putMedia(db,userId,input,now=Date.now()) {
  if(!input||!isMediaRef(input.id)||typeof input.mime!=='string'||!base64(input.data))throw new Error('Invalid media upload');
  const bytes=Buffer.from(input.data,'base64');
  if(!bytes.length||!allowedMedia(input.mime,bytes.length))throw new Error('Media type or size is not allowed');
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==mediaHash(input.id))throw new Error('Media hash mismatch');
  const existing=db.prepare('SELECT media_id,mime,size FROM media WHERE user_id=? AND media_id=?').get(userId,input.id);
  if(existing){
    if(existing.mime!==input.mime||existing.size!==bytes.length)throw new Error('Media identity collision');
    return {id:existing.media_id,mime:existing.mime,size:existing.size,version:MEDIA_VERSION,deduplicated:true};
  }
  const total=Number(db.prepare('SELECT COALESCE(SUM(size),0) total FROM media WHERE user_id=?').get(userId).total||0);
  if(total+bytes.length>MAX_USER_MEDIA_BYTES)throw new Error('Media storage limit reached');
  db.prepare('INSERT INTO media(user_id,media_id,mime,size,bytes,created) VALUES(?,?,?,?,?,?)')
    .run(userId,input.id,input.mime,bytes.length,bytes,now);
  return {id:input.id,mime:input.mime,size:bytes.length,version:MEDIA_VERSION,deduplicated:false};
}
export function getMedia(db,userId,id) {
  if(!isMediaRef(id))return null;
  return db.prepare('SELECT media_id id,mime,size,bytes,created FROM media WHERE user_id=? AND media_id=?').get(userId,id)||null;
}
export function mediaStats(db,userId) {
  const row=db.prepare('SELECT COUNT(*) count,COALESCE(SUM(size),0) bytes FROM media WHERE user_id=?').get(userId);
  return {count:Number(row.count||0),bytes:Number(row.bytes||0),limit:MAX_USER_MEDIA_BYTES,version:MEDIA_VERSION};
}
function refs(value,out=new Set()) {
  if(typeof value==='string'){if(isMediaRef(value))out.add(value);return out;}
  if(Array.isArray(value)){for(const item of value)refs(item,out);return out;}
  if(value&&typeof value==='object')for(const item of Object.values(value))refs(item,out);
  return out;
}
export function cleanupMedia(db,userId,events) {
  const keep=new Set();
  for(const event of events)refs(event.data,keep);
  const rows=db.prepare('SELECT media_id FROM media WHERE user_id=?').all(userId);
  const remove=rows.map(row=>row.media_id).filter(id=>!keep.has(id));
  const del=db.prepare('DELETE FROM media WHERE user_id=? AND media_id=?');
  db.exec('BEGIN IMMEDIATE');
  try {for(const id of remove)del.run(userId,id);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
  return {removed:remove.length,...mediaStats(db,userId)};
}
