import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkAnswer,distance,normalize,gradeAnswer} from '../core/grading.js';
import {errorBook} from '../core/errors.js';
import {recoveryStatus} from '../core/recovery.js';
import {question,reasons,learningAllowed} from '../core/questions.js';
import {initialState,DEFAULTS} from '../core/srs.js';
const at=Date.parse('2026-09-25T00:00:00Z');
test('AT-06: per-sentence answers, not every word form',()=>{
 assert.equal(checkAnswer('went',['went']).kind,'correct');for(const input of ['go','goes','gone'])assert.notEqual(checkAnswer(input,['went']).kind,'correct');
});
test('AT-07: typo can retry once, never silently correct',()=>{
 assert.equal(checkAnswer('appl',['apple']).kind,'retry');assert.equal(checkAnswer('appl',['apple'],true).kind,'wrong');
 assert.equal(checkAnswer('   ',['apple']).kind,'empty');assert.equal(checkAnswer('APPLE',['apple']).kind,'correct');
 assert.equal(gradeAnswer({correct:true,game:'typing',hadError:true,activeMs:20}).grade,'hard');
});
test('Unicode normalization and no transposition-as-one',()=>{
 assert.equal(normalize('  A  B '),'a b');assert.equal(distance('ab','ba'),2);assert.equal(distance('e\u0301','\u00e9'),0);
});
test('Recognition cap, equality threshold, hints and interruptions',()=>{
 assert.deepEqual(gradeAnswer({correct:true,game:'quiz',activeMs:1}),{grade:'hard',assisted:false});
 assert.equal(gradeAnswer({correct:true,game:'typing',activeMs:5000}).grade,'good');
 assert.equal(gradeAnswer({correct:true,game:'typing',activeMs:4999}).grade,'easy');
 assert.equal(gradeAnswer({correct:true,game:'typing',activeMs:1,interrupted:true}).grade,'good');
 assert.equal(gradeAnswer({correct:true,game:'typing',activeMs:1,hint:true}).grade,'hard');
});
const answer=(id,time,game='typing',grade='good',more={})=>({id,kind:'answer',at:time,data:{wordId:'w',questionId:id,baseRev:id,mode:'free',game,grade,hadError:grade==='forget',assisted:false,...more}});
test('AT-16: requires different games, recall and at least 10 minutes',()=>{
 const input=[answer('a',at,'typing','forget'),answer('b',at+1000,'quiz')];
 assert.equal(errorBook([...input,answer('c',at+60000,'typing')]).inBook,true);
 assert.equal(errorBook([...input,answer('c',at+601000,'typing')]).inBook,false);
 assert.equal(errorBook([...input,answer('c',at+601000,'flash')]).inBook,true);
});
test('AT-17: six completed errors persistent, recovery resets episode but not lifetime',()=>{
 const es=Array.from({length:6},(_,i)=>answer(`f${i}`,at+i*1000,'typing','forget'));
 assert.equal(errorBook(es).persistent,true);
 const state=errorBook([...es,answer('x',at+10000,'quiz'),answer('y',at+610000,'typing')]);
 assert.equal(state.persistent,false);assert.equal(state.failures,0);assert.equal(state.total,6);
});
test('Retry enters book; one final answer counts one failure',()=>{
 const attempt={id:'try',kind:'attempt',at,data:{questionId:'q',wordId:'w',wrong:true}};
 assert.equal(errorBook([attempt]).inBook,true);assert.equal(errorBook([attempt]).failures,0);
 assert.equal(errorBook([attempt,answer('q',at+1000,'typing','hard',{hadError:true,assisted:true})]).failures,1);
});
test('Hint breaks evidence without adding a failure',()=>{
 const state=errorBook([answer('a',at,'typing','forget'),answer('b',at+1000,'quiz'),answer('c',at+601000,'typing','hard',{assisted:true})]);
 assert.equal(state.failures,1);assert.equal(state.evidence.length,0);
});
const card=(id,word,meaning)=>({id,word,meaning,ready:!!meaning,review:initialState(id)});
test('AT-04: small decks produce 2/3 options and reject ambiguous duplicates',()=>{
 const a=card('a','apple','fruit'),b=card('b','book','object'),c=card('c','car','vehicle');
 assert.equal(question(a,[a,b,c],'quiz','meaning','free',DEFAULTS,()=>String(Math.random())).choices.length,3);
 assert.equal(question(a,[a,b],'quiz','meaning','free',DEFAULTS,()=>String(Math.random())).choices.length,2);
 assert.ok(reasons(a,'quiz','meaning',[a,card('b','pear','fruit')]).length);
});
test('Audio-dependent games require actual offline audio',()=>{
 assert.deepEqual(reasons(card('a','apple','fruit'),'dictation','meaning',[]),['missingAudio']);
});
test('Learning falls back from missing audio to typing; no audio claim',()=>{
 const a=card('a','apple','fruit');a.review.phase='learning';a.review.step=2;
 const q=question(a,[a],'spell','meaning','review',DEFAULTS,()=>String(Math.random()));
 assert.equal(q.game,'typing');assert.equal(q.fallback,'missingAudio');
});
test('Learning daily cap does not block saving words',()=>{
 const a=card('a','apple','fruit');a.review.startedDay='2026-09-25';
 assert.equal(learningAllowed({words:{a},settings:{...DEFAULTS,newLimit:1}},[],at),'dailyLimit');
});


test('Typing blocks identical prompts that map to different answers',()=>{
 const a=card('a','bank','tài chính'),b=card('b','finance','tài chính');
 assert.deepEqual(reasons(a,'typing','meaning',[a,b]),['ambiguousPrompt']);
 const clear=card('c','river bank','bờ sông');
 assert.equal(reasons(a,'typing','meaning',[a,clear]).includes('ambiguousPrompt'),false);
});

test('Reverse quiz blocks one spelling with multiple meanings unless context differs',()=>{
 const a=card('a','bank','ngân hàng'),b=card('b','bank','bờ sông');
 assert.deepEqual(reasons(a,'quiz','word',[a,b]),['ambiguousPrompt']);
});

test('Error-book recovery status exposes remaining evidence requirements',()=>{
 const empty=recoveryStatus({inBook:true,evidence:[]},at);
 assert.deepEqual(empty,{remaining:2,needsRecall:true,nextAfter:null,waitMs:0,usedGames:[]});
 const one=recoveryStatus({inBook:true,evidence:[{game:'quiz',recall:false,at}]},at+120000);
 assert.equal(one.remaining,1);assert.equal(one.needsRecall,true);assert.equal(one.nextAfter,at+600000);assert.equal(one.waitMs,480000);
 const recall=recoveryStatus({inBook:true,evidence:[{game:'typing',recall:true,at}]},at+700000);
 assert.equal(recall.remaining,1);assert.equal(recall.needsRecall,false);assert.equal(recall.waitMs,0);
 assert.equal(recoveryStatus({inBook:false,evidence:[]},at).remaining,0);
});
