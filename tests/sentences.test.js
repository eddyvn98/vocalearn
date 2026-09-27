import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSentence,selectSentence,clozeFromSentence,normalizeGeneratedSentences,
  sentenceContentVersion,selectWordSentence
} from '../core/sentences.js';

const s=(id,text='I study every day.',start=2,end=7)=>({id,text,gapStart:start,gapEnd:end,targetForm:text.slice(start,end),
  acceptedAnswers:[text.slice(start,end)],wordContentVersion:'v2',status:'ready'});

test('sentence validation rejects stale/invalid gaps and per-sentence answers are preserved',()=>{
  assert.equal(validateSentence(s('a'),'v2').ok,true);
  assert.equal(validateSentence({...s('a'),gapEnd:99},'v2').reason,'invalidGap');
  assert.equal(validateSentence({...s('a'),wordContentVersion:'v1'},'v2').reason,'staleContent');
  assert.deepEqual(clozeFromSentence(s('a')),{prompt:'I ___ every day.',answers:['study'],readings:[],sentenceId:'a'});
});

test('AT-23 chooses unused first, then oldest/least-used deterministically and marks refill',()=>{
  const pool=[s('c'),s('a'),s('b'),s('d'),s('e')];
  let picked=selectSentence(pool,[{sentenceId:'a',at:10},{sentenceId:'b',at:20}],'v2');
  assert.equal(picked.sentence.id,'c');assert.equal(picked.reused,false);
  const usage=pool.flatMap((x,i)=>Array.from({length:i+1},(_,j)=>({sentenceId:x.id,at:100+i*10+j})));
  picked=selectSentence(pool,usage,'v2');
  assert.equal(picked.sentence.id,'c');
  assert.equal(picked.reused,true);assert.equal(picked.needsRefill,true);
});

test('AT-23 no valid sentence disables cloze without creating a learning result',()=>{
  const picked=selectSentence([{...s('x'),status:'reported'}],[],'v2');
  assert.deepEqual(picked,{sentence:null,reused:false,needsRefill:false});
});

test('generated sentence pools are normalized, bounded and tied to current card revisions',()=>{
  const word={id:'w1',word:'deploy',meaning:'triển khai',fields:{word:'rw',meaning:'rm'}};
  const pool=normalizeGeneratedSentences([
    {text:'We deploy after tests pass.',targetForm:'deploy',acceptedAnswers:['deploy']},
    {text:'Teams deploy on Fridays.',targetForm:'deploy',acceptedAnswers:['deploy']},
  ],word);
  assert.equal(pool.length,2);
  assert.equal(pool[0].gapStart,3);
  assert.equal(pool[0].wordContentVersion,sentenceContentVersion(word));
  const changed={...word,meaning:'phát hành',fields:{...word.fields,meaning:'rm2'},sentencePool:pool,sentenceUsage:[]};
  assert.equal(selectWordSentence(changed).sentence,null);
});

test('legacy manual cloze remains usable alongside generated pools',()=>{
  const word={id:'w1',word:'deploy',meaning:'triển khai',sentence:'We ___ after tests.',answers:['deploy'],
    fields:{word:'rw',meaning:'rm'},sentenceUsage:[]};
  const picked=selectWordSentence(word);
  assert.equal(picked.sentence.targetForm,'deploy');
  assert.equal(clozeFromSentence(picked.sentence).prompt,'We ___ after tests.');
});
