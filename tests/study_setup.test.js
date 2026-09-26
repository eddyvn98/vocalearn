import {test} from 'node:test';
import assert from 'node:assert/strict';
import {question,reasons,answerFaces,MIX_GAMES,dailyNewUsage,learningAllowed} from '../core/questions.js';
import {initialState,DEFAULTS} from '../core/srs.js';
import {studySetProfile,maskMonolingualDefinition} from '../core/language-profiles.js';

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


test('Stage 1 English study-set profile distinguishes bilingual and monolingual meaning modes',()=>{
  assert.equal(studySetProfile({language:'en',meaningLanguage:'vi'}).meaningMode,'bilingual');
  assert.equal(studySetProfile({language:'en',meaningLanguage:'en'}).meaningMode,'monolingual');
});

test('English-English meaning prompts mask the target word and declared variants',()=>{
  const word=make('m','deploy','To deploy a service after the deployed build',{});
  word.variants=['deployed'];
  const profile=studySetProfile({language:'en',meaningLanguage:'en'});
  const q=question(word,[word,make('x','confirm','to verify')],'typing','meaning','free',DEFAULTS,()=> 'id',undefined,profile);
  assert.equal(q.prompt,'To ____ a service after the ____ build');
  assert.equal(maskMonolingualDefinition('Deployment is not deploy.','deploy',[]),'Deployment is not ____.');
});


test('AT-32 merged offline new-card starts keep the total and block more starts until the next account day',()=>{
  const now=Date.parse('2026-09-26T05:00:00Z'),day='2026-09-26';
  const model={settings:{...DEFAULTS,newLimit:15,zone:'Asia/Ho_Chi_Minh'},words:{}};
  for(let i=0;i<18;i++)model.words['w'+i]={id:'w'+i,ready:true,deleted:false,review:{...initialState('w'+i),phase:'learning',startedDay:day,dueAt:now+60000}};
  const usage=dailyNewUsage(model,now);
  assert.deepEqual(usage,{day,started:18,limit:15,remaining:0,overflow:3});
  assert.equal(learningAllowed(model,[],now),'dailyLimit');
  assert.equal(Object.values(model.words).filter(w=>w.review.phase==='learning').length,18);
  const next=Date.parse('2026-09-27T05:00:00Z');
  assert.equal(dailyNewUsage(model,next).started,0);
  assert.equal(learningAllowed(model,[],next),null);
});
