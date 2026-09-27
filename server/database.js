import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {replay} from '../core/model.js';
import {validateEvent} from '../core/validation.js';
import {RECOGNITION} from '../core/grading.js';
import {validateReview} from './reviews.js';
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(user_id,event_id));
    CREATE INDEX IF NOT EXISTS user_events ON events(user_id,seq);
    CREATE TABLE IF NOT EXISTS devices(user_id TEXT,device_id TEXT,server_at INTEGER,client_at INTEGER,PRIMARY KEY(user_id,device_id));`);
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
    for (const raw of input.events) {
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
    anchorServer: anchor?.server_at ?? now, anchorClient: anchor?.client_at ?? input.clientNow};
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
  if (['answer','attempt','link','unlink'].includes(kind) && !state.words[d.wordId]) throw new Error('Unknown word');
  if (['answer','attempt'].includes(kind) && state.words[d.wordId].deleted) throw new Error('Deleted word is not learnable');
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
    if (existing.some(e => e.kind === 'answer' && e.data.questionId === d.questionId)) {
      throw new Error('Cannot add attempt to completed question');
    }
  }
}
