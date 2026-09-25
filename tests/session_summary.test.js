import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSessionSummary,sessionBaseline} from '../core/session-summary.js';
import {errorBook} from '../core/errors.js';

const result={grade:'hard',assisted:false};
const q=(id,mode,phase='review',extra={})=>({
  id:'q-'+id,wordId:id,mode,result:{...result},hadError:false,hint:false,
  snapshot:{review:{phase,step:0,rev:'r-'+id},errors:{inBook:false,total:0,failures:0}},...extra
});
const word=(id,phase='review',errors={inBook:false,total:0,failures:0},dueAt=null)=>({
  id,word:id,review:{phase,step:phase==='learning'?1:0,dueAt,rev:'next-'+id},errors
});

test('Session summary separates scheduled, started, graduated, free and error-book transitions',()=>{
  const queue=[
    q('reviewed','review','review'),
    q('started','new','new'),
    q('graduated','review','learning'),
    q('practice','free','review'),
    q('entered','free','review'),
    q('left','errors','review',{snapshot:{review:{phase:'review'},errors:{inBook:true,total:2,failures:1}}}),
  ];
  const model={words:{
    reviewed:word('reviewed','review'),
    started:word('started','learning'),
    graduated:word('graduated','review'),
    practice:word('practice','review'),
    entered:word('entered','review',{inBook:true,total:1,failures:1}),
    left:word('left','review',{inBook:false,total:2,failures:0}),
  }};
  const session={queue,baseline:sessionBaseline({words:Object.fromEntries(queue.map(item=>[
    item.wordId,{review:item.snapshot.review,errors:item.snapshot.errors}
  ]))},queue)};
  const summary=buildSessionSummary(session,model,3,1000);
  assert.equal(summary.scheduledReviews,2);
  assert.equal(summary.newStarted,1);
  assert.equal(summary.newGraduated,1);
  assert.equal(summary.freePracticeAnswers,3);
  assert.equal(summary.enteredErrorBook,1);
  assert.equal(summary.leftErrorBook,1);
  assert.equal(summary.unsyncedChanges,3);
});

test('Waiting learning step is pending, not graduated',()=>{
  const now=1_000_000,queue=[q('new','new','new')];
  const session={queue,baseline:{new:{phase:'new',step:0,inBook:false}}};
  const model={words:{new:word('new','learning',{inBook:false},now+60000)}};
  const summary=buildSessionSummary(session,model,1,now);
  assert.equal(summary.newStarted,1);
  assert.equal(summary.newGraduated,0);
  assert.equal(summary.pendingLearning.length,1);
  assert.equal(summary.pendingLearning[0].waiting,true);
});

test('Error book exposes historical total, current episode, recall and spacing requirements',()=>{
  const at=1_000_000;
  const fail={id:'f',kind:'answer',effectiveAt:at,data:{
    questionId:'qf',baseRev:'r1',mode:'free',game:'typing',grade:'forget',
    hadError:true,assisted:false,familiarize:false
  }};
  const clean={id:'c',kind:'answer',effectiveAt:at+1000,data:{
    questionId:'qc',baseRev:'r2',mode:'free',game:'quiz',grade:'hard',
    hadError:false,assisted:false,familiarize:false
  }};
  const state=errorBook([fail,clean]);
  assert.equal(state.inBook,true);
  assert.equal(state.episodeFailures,1);
  assert.equal(state.historicalFailures,1);
  assert.equal(state.requirements.cleanNeeded,1);
  assert.equal(state.requirements.recallNeeded,true);
  assert.equal(state.requirements.minSpacingMs,600000);
  assert.equal(state.requirements.nextEvidenceAt,at+601000);
});

test('Leaving the error book resets the current episode but preserves historical totals',()=>{
  const at=2_000_000;
  const events=[
    {id:'f',kind:'answer',effectiveAt:at,data:{questionId:'qf',mode:'free',game:'typing',grade:'forget',hadError:true,assisted:false,familiarize:false}},
    {id:'a',kind:'answer',effectiveAt:at+1000,data:{questionId:'qa',mode:'free',game:'quiz',grade:'hard',hadError:false,assisted:false,familiarize:false}},
    {id:'b',kind:'answer',effectiveAt:at+601000,data:{questionId:'qb',mode:'free',game:'typing',grade:'good',hadError:false,assisted:false,familiarize:false}},
  ];
  const state=errorBook(events);
  assert.equal(state.inBook,false);
  assert.equal(state.episodeFailures,0);
  assert.equal(state.historicalFailures,1);
  assert.equal(state.persistent,false);
});
