import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalLexicon,lookupLocalEnglish,LOCAL_LEXICON_SOURCE} from '../server/local-lexicon.js';
import {openDatabase} from '../server/database.js';
import {autofillWord} from '../server/dictionary-cache.js';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'vocalearn-lexicon-')),path=join(dir,'dictionary.db');
  const db=new DatabaseSync(path);
  db.exec(`
    CREATE TABLE words(id INTEGER PRIMARY KEY,word TEXT,lang_code TEXT);
    CREATE TABLE definitions(id INTEGER PRIMARY KEY,definition TEXT,definition_lang TEXT,pos TEXT,sub_pos TEXT,links TEXT);
    CREATE TABLE word_definitions(word_id INTEGER,definition_id INTEGER,example TEXT,source_id INTEGER);
    CREATE TABLE sources(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE pronunciations(word_id INTEGER,ipa TEXT,region TEXT);
    CREATE TABLE translations(word_id INTEGER,lang_code TEXT,translation TEXT);
    CREATE TABLE word_relations(word_id INTEGER,related_word TEXT,relation_type TEXT);
  `);
  db.prepare('INSERT INTO words VALUES(?,?,?)').run(1,'deploy','en');
  db.prepare('INSERT INTO sources VALUES(?,?)').run(1,'fixture');
  db.prepare('INSERT INTO definitions VALUES(?,?,?,?,?,?)').run(1,'to put into use','en','V',null,'[]');
  db.prepare('INSERT INTO word_definitions VALUES(?,?,?,?)').run(1,1,'We deploy the app tonight.',1);
  db.prepare('INSERT INTO pronunciations VALUES(?,?,?)').run(1,'/dɪˈplɔɪ/','US');
  db.prepare('INSERT INTO translations VALUES(?,?,?)').run(1,'vi','triển khai');
  db.prepare('INSERT INTO word_relations VALUES(?,?,?)').run(1,'release','s');
  db.prepare('INSERT INTO word_relations VALUES(?,?,?)').run(1,'withdraw','a');
  db.prepare('INSERT INTO word_relations VALUES(?,?,?)').run(1,'deployment','d');
  db.close();
  return {dir,path};
}

test('local lexical store returns structured English data',()=>{
  const {dir,path}=fixture(),lexicon=createLocalLexicon(path);
  try{
    assert.equal(lexicon.available,true);
    assert.equal(lexicon.source.id,LOCAL_LEXICON_SOURCE.id);
    const result=lexicon.lookup('en','Deploy','vi');
    assert.equal(result.fields.meaning,'triển khai');
    assert.equal(result.fields.ipa,'dɪˈplɔɪ');
    assert.equal(result.fields.pos,'verb');
    assert.equal(result.fields.sentence,'We ___ the app tonight.');
    assert.deepEqual(result.fields.answers,['deploy']);
    assert.deepEqual(result.fields.synonyms,['release']);
    assert.deepEqual(result.fields.antonyms,['withdraw']);
    assert.deepEqual(result.fields.wordFamily,['deployment']);
  }finally{lexicon.close();rmSync(dir,{recursive:true,force:true});}
});

test('local lexical store is used before external dictionary while AI fills only missing fields',async()=>{
  const {dir,path}=fixture(),lexicon=createLocalLexicon(path),db=openDatabase(':memory:');
  let fetchCalls=0,aiCalls=0;
  const provider={configured:true,generate:async()=>{aiCalls++;return {meaning:'AI meaning',collocations:['deploy an app']};}};
  try{
    const result=await autofillWord(db,provider,{language:'en',meaningLanguage:'vi',word:'deploy'},
      async()=>{fetchCalls++;throw new Error('network should not be called');},lexicon);
    assert.equal(result.localHit,true);
    assert.equal(result.aiSkipped,false);
    assert.equal(result.fields.meaning,'triển khai');
    assert.deepEqual(result.fields.collocations,['deploy an app']);
    assert.equal(fetchCalls,0);
    assert.equal(aiCalls,1);
  }finally{db.close();lexicon.close();rmSync(dir,{recursive:true,force:true});}
});

test('missing lexical database degrades without breaking startup',()=>{
  const lexicon=createLocalLexicon('/path/that/does/not/exist.sqlite');
  assert.equal(lexicon.available,false);
  assert.equal(lexicon.lookup('en','deploy','vi'),null);
  lexicon.close();
});
