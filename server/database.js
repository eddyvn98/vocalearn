import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {replay} from '../core/model.js';
import {validateEvent} from '../core/validation.js';
import {RECOGNITION} from '../core/grading.js';
import {validateReview} from './reviews.js';
import {contentVersion} from '../core/sentences.js';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,event_id));
    CREATE INDEX IF NOT EXISTS user_events ON events(user_id,seq);
    CREATE TABLE IF NOT EXISTS devices(user_id TEXT,device_id TEXT,server_at INTEGER,client_at INTEGER,PRIMARY KEY(user_id,device_id));
    CREATE TABLE IF NOT EXISTS media_files(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,mime TEXT NOT NULL,
      size INTEGER NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,id));
    CREATE INDEX IF NOT EXISTS user_media_files_created ON media_files(user_id,created);
    CREATE TABLE IF NOT EXISTS ai_jobs(user_id TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,kind TEXT NOT NULL,word_id TEXT NOT NULL,
      input_version TEXT NOT NULL,request_key TEXT NOT NULL,input_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL,retry_count INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER,
      result_json TEXT,error_code TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,id),UNIQUE(user_id,kind,word_id,request_key));
    CREATE INDEX IF NOT EXISTS user_ai_jobs ON ai_jobs(user_id,word_id,updated);`);
  return db;
}
export function allEvents(db, userId) {
  return db.prepare('SELECT seq,payload FROM events WHERE user_id=? ORDER BY seq').all(userId)
    .map(row => ({...JSON.parse(row.payload), seq: row.seq}));
}
export function synchronize(db, userId, input, now = Date.now()) {
  if (!input || !Array.isArray(input.events) || input.events.length > 200
    || !/^[\w-]{1,100}$/.test(input.deviceId) || !Number.isFinite(input.clientNow)) throw new Error('Invalid sync batch');
  const anchor = db.prepare('SELECT * FROM devices WHERE user_id=? AND device_id=?').get(userId, input.deviceId);
  const existing = allEvents(db, userId);
  const received = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const raw of [...input.events].sort((a,b)=>(a.localOrder??a.at)-(b.localOrder??b.at)||a.id.localeCompare(b.id))) {
      validateEvent(raw);
      if (raw.deviceId !== input.deviceId) throw new Error('Wrong device');
      const prior = db.prepare('SELECT payload FROM events WHERE user_id=? AND event_id=?').get(userId, raw.id);
      if (prior) {
        const original=JSON.parse(prior.payload);
        if(original.deviceId!==raw.deviceId||original.kind!==raw.kind||JSON.stringify(original.data)!==JSON.stringify(raw.data))throw new Error('Event ID already used with different content');
        received.push(raw.id); continue;
      }
      const estimatedAt = anchor ? anchor.server_at + raw.at - anchor.client_at : now;
      const effectiveAt = anchor ? Math.max(anchor.server_at, Math.min(now, estimatedAt)) : now;
      const event = {id: raw.id, kind: raw.kind, data: raw.data, at: raw.at,
        deviceId: raw.deviceId, localOrder: raw.localOrder, effectiveAt, receivedAt: now,
        clockAdjusted: !!anchor && effectiveAt !== estimatedAt};
      const model = replay(existing);
      assertReferences(model, event, existing);
      if(event.kind==='answer')validateReview(model,event,existing);
      const row = db.prepare('INSERT INTO events(user_id,event_id,payload) VALUES(?,?,?)').run(userId, event.id, JSON.stringify(event));
      event.seq = Number(row.lastInsertRowid); existing.push(event); received.push(event.id);
    }
    db.prepare(`INSERT INTO devices VALUES(?,?,?,?)
      ON CONFLICT(user_id,device_id) DO UPDATE SET server_at=excluded.server_at,client_at=excluded.client_at`)
      .run(userId, input.deviceId, now, input.clientNow);
    db.exec('COMMIT');
  } catch (error) {db.exec('ROLLBACK'); throw error;}
  return {received, events: existing.filter(e => e.seq > (Number(input.cursor) || 0) || received.includes(e.id)),
    cursor: existing.at(-1)?.seq ?? 0, serverNow: now,
    anchorServer: now, anchorClient: input.clientNow};
}
export function appendServerEvents(db,userId,items,now=Date.now()) {
  if(!Array.isArray(items)||items.length>50)throw new Error('Invalid server event batch');
  const existing=allEvents(db,userId),received=[];
  db.exec('BEGIN IMMEDIATE');
  try{
    for(let i=0;i<items.length;i++){
      const raw=items[i],event={id:raw.id,kind:raw.kind,data:raw.data,at:now+i,deviceId:'ai-server',
        localOrder:now*1000+i,effectiveAt:now,receivedAt:now,clockAdjusted:false};
      validateEvent(event);
      const prior=db.prepare('SELECT payload FROM events WHERE user_id=? AND event_id=?').get(userId,event.id);
      if(prior){const original=JSON.parse(prior.payload);if(original.kind!==event.kind||JSON.stringify(original.data)!==JSON.stringify(event.data))throw new Error('Event ID already used with different content');continue;}
      const model=replay(existing);assertReferences(model,event,existing);
      const row=db.prepare('INSERT INTO events(user_id,event_id,payload) VALUES(?,?,?)').run(userId,event.id,JSON.stringify(event));
      event.seq=Number(row.lastInsertRowid);existing.push(event);received.push(event.id);
    }
    db.exec('COMMIT');return received;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
function assertReferences(state, event, existing = []) {
  const {kind, data: d} = event;
  if (['category','word'].includes(kind) && !state.sets[d.setId]) throw new Error('Unknown study set');
  if (kind === 'word' && !state.words[d.id] && !d.patch.word) throw new Error('A word is required');
  if (kind === 'category' && state.categories[d.id] && state.categories[d.id].setId !== d.setId) throw new Error('Cannot move a category between sets');
  if (kind === 'word' && state.words[d.id] && state.words[d.id].setId !== d.setId) throw new Error('Cannot move a word between sets');
  if (kind === 'category') {
    let parent = d.parentId, seen = new Set([d.id]);
    while (parent) {
      if (seen.has(parent)) throw new Error('Category cycle');
      seen.add(parent);
      const c = state.categories[parent];
      if (!c || c.setId !== d.setId) throw new Error('Invalid category parent');
      parent = c.parentId;
    }
  }
  if (['answer','attempt','link','unlink','sentence','deleteSentence','sentenceUsage'].includes(kind) && !state.words[d.wordId]) throw new Error('Unknown word');
  if (['answer','attempt','sentence'].includes(kind) && state.words[d.wordId].deleted) throw new Error('Deleted word is not learnable');
  if (kind==='sentence' && d.wordContentVersion!==contentVersion(state.words[d.wordId])) throw new Error('Stale sentence content');
  if (kind==='deleteSentence' && (!state.sentences[d.id]||state.sentences[d.id].wordId!==d.wordId)) throw new Error('Unknown sentence');
  if (kind==='sentenceUsage') {
    const sentence=state.sentences[d.sentenceId];
    if(!sentence||sentence.wordId!==d.wordId||sentence.deleted)throw new Error('Unavailable sentence');
    if(existing.some(e=>e.kind==='sentenceUsage'&&e.data.questionId===d.questionId))throw new Error('Duplicate sentence usage');
  }
  if (['link','unlink'].includes(kind) && (!state.categories[d.categoryId]
    || state.categories[d.categoryId].setId !== state.words[d.wordId].setId)) throw new Error('Invalid word category');
  if (kind === 'answer') {
    if (!['free','errors'].includes(d.mode) && !d.baseRev) throw new Error('Missing schedule revision');
    if (RECOGNITION.has(d.game) && ['good','easy'].includes(d.grade)) throw new Error('Recognition games cannot produce good or easy grade');
    if ((d.hadError || d.hint || d.assisted) && ['good','easy'].includes(d.grade)) throw new Error('Assisted answers cannot produce good or easy grade');
    if (d.grade === 'forget' && d.assisted) throw new Error('Forget grade cannot be assisted');
    if (d.interrupted && d.grade === 'easy') throw new Error('Interrupted answers cannot produce easy grade');
    if (existing.some(e => e.kind === 'answer' && e.data.questionId === d.questionId && e.id !== event.id)) {
      throw new Error('Duplicate final answer for question');
    }
  }
  if (kind === 'attempt') {
    const final=existing.find(e => e.kind === 'answer' && e.data.questionId === d.questionId);
    if (final) {
      const reordered=event.deviceId===final.deviceId
        && Number.isFinite(event.localOrder) && Number.isFinite(final.localOrder)
        && event.localOrder<final.localOrder;
      if(!reordered)throw new Error('Cannot add attempt to completed question');
    }
  }
}
