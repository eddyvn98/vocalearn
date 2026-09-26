import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSentence,selectSentence,clozeFromSentence} from '../core/sentences.js';

const s=(id,text='I study every day.',start=2,end=7)=>({id,text,gapStart:start,gapEnd:end,targetForm:text.slice(start,end),acceptedAnswers:[text.slice(start,end)],wordContentVersion:2,status:'ready'});

test('sentence validation rejects stale/invalid gaps and per-sentence answers are preserved',()=>{
  assert.equal(validateSentence(s('a'),2).ok,true);
  assert.equal(validateSentence({...s('a'),gapEnd:99},2).reason,'invalidGap');
  assert.equal(validateSentence({...s('a'),wordContentVersion:1},2).reason,'staleContent');
  assert.deepEqual(clozeFromSentence(s('a')),{prompt:'I ___ every day.',answers:['study'],readings:[],sentenceId:'a'});
});

test('AT-23 chooses unused first, then oldest/least-used deterministically and marks refill',()=>{
  const pool=[s('c'),s('a'),s('b'),s('d'),s('e')];
  let picked=selectSentence(pool,[{sentenceId:'a',at:10},{sentenceId:'b',at:20}],2);
  assert.equal(picked.sentence.id,'c');assert.equal(picked.reused,false);
  const usage=pool.flatMap((x,i)=>Array.from({length:i+1},(_,j)=>({sentenceId:x.id,at:100+i*10+j})));
  picked=selectSentence(pool,usage,2);
  assert.equal(picked.sentence.id,'c'); // oldest last-use wins before count
  assert.equal(picked.reused,true);assert.equal(picked.needsRefill,true);
});

test('AT-23 no valid sentence disables cloze without creating a learning result',()=>{
  const picked=selectSentence([{...s('x'),status:'reported'}],[],2);
  assert.deepEqual(picked,{sentence:null,reused:false,needsRefill:false});
});
