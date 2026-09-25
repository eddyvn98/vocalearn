import {test} from 'node:test';
import assert from 'node:assert/strict';
import {question,reasons,answerFaces,MIX_GAMES} from '../core/questions.js';
import {initialState,DEFAULTS} from '../core/srs.js';

const make=(id,word,meaning,extra={})=>({
  id,setId:'set',word,meaning,ipa:extra.ipa||'',image:extra.image||'',audio:extra.audio||'',
  sentence:extra.sentence||'',answers:extra.answers||[],deleted:false,ready:true,
  fields:{word:'w-'+id,meaning:'w-'+id,ipa:'w-'+id,image:'w-'+id,audio:'w-'+id,
    sentence:'w-'+id,answers:'w-'+id},review:initialState(id)
});
const pool=[
  make('a','deploy','triển khai',{ipa:'/dɪˈplɔɪ/'}),
  make('b','confirm','xác nhận',{ipa:'/kənˈfɜːm/'}),
  make('c','improve','cải thiện',{ipa:'/ɪmˈpruːv/'}),
];

test('Quiz supports a distinct explicit answer face',()=>{
  const q=question(pool[0],pool,'quiz','meaning','free',DEFAULTS,()=> 'id','ipa');
  assert.equal(q.blocked,undefined);
  assert.equal(q.face,'meaning');
  assert.equal(q.answerFace,'ipa');
  assert.deepEqual(q.answers,['/dɪˈplɔɪ/']);
  assert.ok(q.choices.some(choice=>choice.correct&&choice.label==='/dɪˈplɔɪ/'));
  assert.ok(q.choices.every((choice,index,array)=>array.findIndex(x=>x.label===choice.label)===index));
});

test('Quiz and matching reject an answer face equal to the prompt face',()=>{
  assert.deepEqual(reasons(pool[0],'quiz','meaning',pool,'meaning'),['invalidAnswerFace']);
  assert.deepEqual(reasons(pool[0],'match','word',pool,'word'),['invalidAnswerFace']);
  assert.equal(answerFaces('quiz','meaning').includes('meaning'),false);
});

test('Quiz blocks a prompt shared by cards with different correct answers',()=>{
  const senses=[make('a','bank','ngân hàng'),make('b','bank','bờ sông'),make('c','shore','bờ')];
  assert.deepEqual(reasons(senses[0],'quiz','word',senses,'meaning'),['ambiguousPrompt']);
});

test('Matching requires a one-to-one distinguishable prompt and answer mapping',()=>{
  const ambiguous=[
    make('a','bank','ngân hàng'),
    make('b','bank','bờ sông'),
    make('c','shore','ngân hàng'),
  ];
  assert.deepEqual(reasons(ambiguous[0],'match','word',ambiguous,'meaning'),['ambiguousPrompt']);
});

test('Learning steps keep their required game regardless of a free-practice selection',()=>{
  const word=structuredClone(pool[0]);
  const q=question(word,pool,'typing','image','new',DEFAULTS,()=> 'id','image');
  assert.equal(q.game,'flash');
  assert.equal(q.face,'meaning');
  assert.equal(q.answerFace,'word');
  assert.equal(q.familiarize,true);
});

test('Mixed practice list contains only per-card games, not batch matching',()=>{
  assert.ok(MIX_GAMES.includes('quiz'));
  assert.ok(MIX_GAMES.includes('typing'));
  assert.equal(MIX_GAMES.includes('match'),false);
});
