import test from 'node:test';
import assert from 'node:assert/strict';
import {startAiJob,completeAiJob,applyAiResult,retryAiJob} from '../core/ai.js';

test('AT-22 AI completion never overwrites a field manually edited after job start',()=>{
  const original={id:'w1',contentVersion:3,fields:{meaning:'r1',note:'r2'},meaning:'old',note:'old note'};
  const job=startAiJob(original,'fill','j1',100);
  const edited={...original,fields:{...original.fields,meaning:'r3'},meaning:'manual'};
  const done=completeAiJob(job,edited,{meaning:'AI meaning',note:'AI note'},200);
  assert.equal(done.status,'suggestion');
  assert.deepEqual(done.safePatch,{note:'AI note'});
  assert.deepEqual(done.suggestions,{meaning:'AI meaning'});
  assert.deepEqual(applyAiResult(done,edited),{note:'AI note'});
  assert.deepEqual(applyAiResult(done,edited,['meaning']),{meaning:'AI meaning'});
});

test('AT-22 explicit clear is protected and deleted cards cannot receive AI writes',()=>{
  const original={id:'w1',contentVersion:1,fields:{meaning:'r1'},meaning:'old'};
  const job=startAiJob(original,'fill','j1',100);
  const cleared={...original,meaning:'',fields:{meaning:'clear-event'}};
  const done=completeAiJob(job,cleared,{meaning:'generated'},200);
  assert.deepEqual(done.suggestions,{meaning:'generated'});
  assert.deepEqual(applyAiResult(done,cleared),{});
  assert.deepEqual(applyAiResult(done,{...cleared,deleted:true},['meaning']),{});
});

test('AI job captures input versions and retry count without changing input snapshot',()=>{
  const word={id:'w1',contentVersion:7,fields:{meaning:'m7'}};
  const job=startAiJob(word,'sentence-bank','j1',100);
  const retry=retryAiJob(job,'timeout',200);
  assert.equal(retry.retryCount,1);
  assert.equal(retry.errorCode,'timeout');
  assert.equal(retry.inputContentVersion,7);
  assert.deepEqual(retry.inputFieldRevisions,{meaning:'m7'});
});
