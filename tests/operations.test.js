import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDatabase} from '../server/database.js';
import {SCHEMA_VERSION} from '../server/migrations.js';
import {backupData,restoreData,verifyDatabase} from '../server/operations.js';

test('database migrations are versioned and repeatable',()=>{
  const dir=mkdtempSync(join(tmpdir(),'voca-migrate-')),path=join(dir,'db.sqlite');
  try{
    let db=openDatabase(path);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);
    db.close();db=openDatabase(path);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_jobs'").get());
    db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('legacy unversioned data is preserved when migrations adopt it',()=>{
  const dir=mkdtempSync(join(tmpdir(),'voca-legacy-')),path=join(dir,'db.sqlite');
  try{
    const raw=new DatabaseSync(path);
    raw.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,salt TEXT NOT NULL); INSERT INTO users VALUES('u','u@example.test','h','s');");
    raw.close();
    const db=openDatabase(path);
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get('u').email,'u@example.test');
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);db.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('backup and restore include a verified SQLite snapshot and media files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'voca-backup-')),dbPath=join(dir,'live.sqlite'),media=join(dir,'media'),backup=join(dir,'backup');
  try{
    const db=openDatabase(dbPath);db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('u','backup@example.test','hash','salt');db.close();
    mkdirSync(media);writeFileSync(join(media,'blob'),'media-bytes');
    const saved=backupData({dbPath,mediaPath:media,destination:backup});assert.ok(saved.database);assert.equal(verifyDatabase(saved.database).ok,true);
    const restoredDb=join(dir,'restored','db.sqlite'),restoredMedia=join(dir,'restored','media');
    restoreData({backup,destinationDb:restoredDb,destinationMedia:restoredMedia});
    const restored=new DatabaseSync(restoredDb,{readOnly:true});assert.equal(restored.prepare('SELECT email FROM users').get().email,'backup@example.test');restored.close();
    assert.equal(readFileSync(join(restoredMedia,'blob'),'utf8'),'media-bytes');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
