import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openDatabase,synchronize} from '../server/database.js';
import {cleanupMedia,getMedia,mediaStats,putMedia} from '../server/media.js';
import {allowedMedia,MAX_AUDIO_BYTES,MAX_IMAGE_BYTES,MAX_USER_MEDIA_BYTES} from '../core/media.js';
import {validateEvent} from '../core/validation.js';

const idFor=bytes=>`media:${createHash('sha256').update(bytes).digest('hex')}`;
const dbWithUser=()=>{
  const db=openDatabase(':memory:');
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','media@test','h','s');
  return db;
};
const event=(id,kind,data,deviceId='dev',at=1000)=>({id,kind,data,deviceId,at});
const batch=events=>({events,deviceId:'dev',clientNow:1000,cursor:0});

test('Content-addressed media deduplicates identical bytes',()=>{
  const db=dbWithUser();
  try{
    const bytes=Buffer.from('small-image-bytes'),id=idFor(bytes),data=bytes.toString('base64');
    const first=putMedia(db,'u',{id,mime:'image/webp',data},1000);
    const second=putMedia(db,'u',{id,mime:'image/webp',data},2000);
    assert.equal(first.deduplicated,false);
    assert.equal(second.deduplicated,true);
    assert.equal(mediaStats(db,'u').count,1);
    assert.deepEqual(Buffer.from(getMedia(db,'u',id).bytes),bytes);
  }finally{db.close();}
});

test('Media rejects forged hashes and enforces type/size bounds',()=>{
  const db=dbWithUser();
  try{
    assert.throws(()=>putMedia(db,'u',{
      id:'media:'+'0'.repeat(64),mime:'image/webp',data:Buffer.from('not-zero').toString('base64')
    }));
    assert.equal(allowedMedia('image/webp',MAX_IMAGE_BYTES),true);
    assert.equal(allowedMedia('image/webp',MAX_IMAGE_BYTES+1),false);
    assert.equal(allowedMedia('audio/wav',MAX_AUDIO_BYTES),true);
    assert.equal(allowedMedia('audio/wav',MAX_AUDIO_BYTES+1),false);
    assert.equal(allowedMedia('text/plain',1),false);
  }finally{db.close();}
});

test('Per-user media quota rejects new unique blobs at the configured bound',()=>{
  const db=dbWithUser();
  try{
    db.prepare('INSERT INTO media(user_id,media_id,mime,size,bytes,created) VALUES(?,?,?,?,?,?)')
      .run('u','media:'+'1'.repeat(64),'image/webp',MAX_USER_MEDIA_BYTES,Buffer.from('x'),1);
    const bytes=Buffer.from('next'),id=idFor(bytes);
    assert.throws(()=>putMedia(db,'u',{id,mime:'image/webp',data:bytes.toString('base64')}),/storage limit/i);
  }finally{db.close();}
});

test('Word media refs are journal-safe but server requires uploaded content first',()=>{
  const db=dbWithUser();
  try{
    const set=event('s','set',{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'});
    synchronize(db,'u',batch([set]),1000);
    const bytes=Buffer.from('img'),ref=idFor(bytes);
    const word=event('w','word',{id:'w',setId:'set',patch:{word:'cat',image:ref},baseFields:{}});
    assert.doesNotThrow(()=>validateEvent(word));
    assert.throws(()=>synchronize(db,'u',batch([word]),1000),/Unknown media resource/);
    putMedia(db,'u',{id:ref,mime:'image/webp',data:bytes.toString('base64')},1000);
    assert.doesNotThrow(()=>synchronize(db,'u',batch([word]),1000));
  }finally{db.close();}
});

test('Server cleanup retains event-referenced media and removes orphan uploads',()=>{
  const db=dbWithUser();
  try{
    const used=Buffer.from('used'),orphan=Buffer.from('orphan'),usedId=idFor(used),orphanId=idFor(orphan);
    putMedia(db,'u',{id:usedId,mime:'image/webp',data:used.toString('base64')});
    putMedia(db,'u',{id:orphanId,mime:'audio/wav',data:orphan.toString('base64')});
    const result=cleanupMedia(db,'u',[{kind:'word',data:{patch:{image:usedId}}}]);
    assert.equal(result.removed,1);
    assert.ok(getMedia(db,'u',usedId));
    assert.equal(getMedia(db,'u',orphanId),null);
  }finally{db.close();}
});

test('Legacy data URIs remain valid during migration',()=>{
  const image='data:image/png;base64,'+Buffer.from('legacy').toString('base64');
  const audio='data:audio/wav;base64,'+Buffer.from('legacy-audio').toString('base64');
  assert.doesNotThrow(()=>validateEvent(event('legacy','word',{
    id:'legacy-word',setId:'set',patch:{word:'legacy',image,audio},baseFields:{}
  })));
});
