import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityStatus,gameAvailability,speechAttempt} from '../core/capabilities.js';

const device={asr:{en:{tested:true,offline:true,permission:'granted',version:'1'}},tts:{en:{tested:true,offline:false}},pen:{zh:{tested:true,permission:'granted'}}};

test('AT-24 untested/offline-unavailable capability is disabled and never implies cloud upload',()=>{
  assert.deepEqual(capabilityStatus({},'asr','en',{offline:true}),{available:false,reason:'notTested'});
  assert.equal(gameAvailability('speak',{asr:{en:{tested:true,offline:false}}},'en',{offline:true}).reason,'offlineUnavailable');
  assert.equal(gameAvailability('dictation',device,'en',{offline:true,hasAudio:true}).source,'storedAudio');
  assert.equal(gameAvailability('dictation',device,'en',{offline:true,hasAudio:false}).available,false);
});

test('AT-08 microphone technical failure consumes no valid attempt; second valid recognition after an error is Hard',()=>{
  let s=speechAttempt(null,{kind:'technical',code:'mic'});
  assert.equal(s.validAttempts,0);assert.equal(s.final,null);
  s=speechAttempt(s,{kind:'recognition',correct:false});
  assert.equal(s.validAttempts,1);assert.equal(s.final,null);
  s=speechAttempt(s,{kind:'recognition',correct:true});
  assert.equal(s.validAttempts,2);assert.deepEqual(s.final,{correct:true,grade:'hard',hadError:true});
});

test('handwriting is gated by both tested pen capability and stroke data',()=>{
  assert.equal(gameAvailability('handwriting',device,'zh',{hasStrokes:false}).reason,'missingStrokeData');
  assert.equal(gameAvailability('handwriting',device,'zh',{hasStrokes:true}).available,true);
});
