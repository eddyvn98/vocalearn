import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {createJob,getJob,listJobs,runJob,retryJob} from '../server/ai-jobs.js';

function db(){
  const value=openDatabase(':memory:');
  value.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','u@example.test','h','s');
  return value;
}
const word={id:'w',setId:'s',word:'deploy',meaning:'',contentVersion:2,fields:{mnemonic:'m1',meaning:'m0'}};

test('Phase 2 AI job persists meaning candidates and safe fields',async()=>{
  const database=db(),provider={configured:true,generate:async()=>({meaningCandidates:['triển khai','đưa vào vận hành'],mnemonic:'deploy = đưa lên'})};
  const created=createJob(database,'u',word,'fill',100,'j1');
  assert.equal(created.status,'queued');
  const done=await runJob(database,'u','j1',word,provider,101);
  assert.equal(done.status,'ready');
  assert.deepEqual(done.result.meaningCandidates,['triển khai','đưa vào vận hành']);
  assert.equal(done.safePatch.mnemonic,'deploy = đưa lên');
  assert.equal(listJobs(database,'u','w').length,1);
  database.close();
});

test('Phase 2 AI completion protects a field edited after job creation',async()=>{
  const database=db(),provider={configured:true,generate:async()=>({meaningCandidates:['triển khai'],mnemonic:'generated'})};
  createJob(database,'u',word,'fill',100,'j2');
  const edited={...word,mnemonic:'manual',fields:{...word.fields,mnemonic:'m2'}};
  const done=await runJob(database,'u','j2',edited,provider,101);
  assert.equal(done.status,'suggestion');
  assert.equal(done.suggestions.mnemonic,'generated');
  assert.equal(done.safePatch.mnemonic,undefined);
  database.close();
});

test('temporary AI errors retry automatically then allow explicit retry',async()=>{
  const database=db(),provider={configured:true,generate:async()=>{const e=new Error('timeout');e.code='AI_TIMEOUT';throw e;}};
  createJob(database,'u',word,'fill',100,'j3');
  const failed=await runJob(database,'u','j3',word,provider,101);
  assert.equal(failed.status,'queued');assert.equal(failed.retryCount,1);assert.ok(failed.notBefore>101);
  database.prepare("UPDATE ai_jobs SET status='failed' WHERE user_id='u' AND id='j3'").run();
  assert.equal(retryJob(database,'u','j3',200).status,'queued');
  assert.equal(getJob(database,'u','j3').errorCode,null);
  database.close();
});
