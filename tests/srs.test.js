import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,advance,DEFAULTS,scheduleFor,conservative} from '../core/srs.js';
import {dayAt,isDue,addDays} from '../core/time.js';
const at=Date.parse('2026-09-25T05:00:00Z');
const base={...initialState('w'),phase:'review',ef:2.5,interval:4,lastDay:'2026-09-21',dueDate:'2026-09-25'};
for(const [name,result,interval,ef] of [
 ['recognition',{grade:'hard',assisted:false},5,2.5],
 ['assisted',{grade:'hard',assisted:true},5,2.35],
 ['good',{grade:'good',assisted:false},10,2.5],
 ['easy',{grade:'easy',assisted:false},13,2.65]]) {
  test(`AT-12: ${name} interval and old EF`,()=>{const s=advance(base,result,at);assert.equal(s.interval,interval);assert.ok(Math.abs(s.ef-ef)<1e-9);assert.equal(s.dueDate,addDays('2026-09-25',interval));});
}
test('AT-13: overdue and half-up rounding',()=>{const s=advance(base,{grade:'good'},at+3*86400000);assert.equal(s.interval,18);});
test('AT-14: lapse penalizes EF once, relearn failures do not',()=>{
 const failed=advance(base,{grade:'forget'},at);assert.equal(failed.phase,'relearn');assert.equal(failed.dueAt,at+600000);
 const again=advance(failed,{grade:'forget'},at+600000);assert.equal(again.ef,failed.ef);
 const done=advance(again,{grade:'good'},at+1200000);assert.equal(done.interval,1);assert.equal(done.phase,'review');
});
test('EF floor and interval ceiling',()=>{
 assert.equal(advance({...base,ef:1.3},{grade:'forget'},at).ef,1.3);
 assert.equal(advance({...base,interval:3650},{grade:'easy'},at).interval,3650);
});
test('AT-15: exact learning steps 1,10,10 minutes and preserved step on failure',()=>{
 let s=advance(initialState('w'),{grade:'hard'},at);assert.equal(s.step,1);assert.equal(s.dueAt,at+60000);
 s=advance(s,{grade:'hard'},at+60000);assert.equal(s.step,2);assert.equal(s.dueAt,at+660000);
 s=advance(s,{grade:'hard'},at+660000);assert.equal(s.step,3);assert.equal(s.dueAt,at+1260000);
 s=advance(s,{grade:'forget'},at+1260000);assert.equal(s.step,3);assert.equal(s.ef,2.5);
 s=advance(s,{grade:'good'},at+1860000);assert.equal(s.phase,'review');assert.equal(s.interval,1);
});
const event=(id,baseRev,grade,time=at,mode='review')=>({id,kind:'answer',at:time,data:{wordId:'w',baseRev,grade,assisted:false,mode,config:DEFAULTS}});
test('AT-18: duplicate opportunity produces one transition, conservative winner',()=>{
 const first=event('a','root-w','hard'),second=event('b','root-w','forget');
 const one=scheduleFor('w',[first,second]),two=scheduleFor('w',[second,first]);
 assert.deepEqual(one.state,two.state);assert.equal(one.state.step,1);assert.equal(one.accepted.size,2);
});
test('AT-19: late parent contradiction reclassifies dependent answers',()=>{
 const first=event('a','root-w','hard');const s=scheduleFor('w',[first]);
 const child=event('b',s.state.rev,'good',at+60000);
 const advanced=scheduleFor('w',[first,child]);assert.equal(advanced.state.step,2);
 const late=event('c','root-w','forget');
 const final=scheduleFor('w',[first,child,late]);assert.equal(final.state.step,1);assert.equal(final.accepted.has('b'),false);
});
test('AT-11: free practice does not change schedule',()=>assert.equal(scheduleFor('w',[event('a','root-w','easy',at,'free')]).state.phase,'new'));
test('Hard from help is more conservative than hard from recognition',()=>{
 const a=event('a','root-w','hard'),b=event('b','root-w','hard');b.data.assisted=true;assert.equal(conservative([a,b]).id,'b');
});
test('Account timezone and due dates',()=>{
 assert.equal(dayAt(Date.parse('2026-09-24T18:00Z'),'Asia/Ho_Chi_Minh'),'2026-09-25');
 assert.equal(isDue(base,at,'Asia/Ho_Chi_Minh'),true);assert.equal(isDue(initialState('w'),at,'Asia/Ho_Chi_Minh'),false);
});


test('AT-10: scheduled recognition owns the schedule; later free-practice failure is ignored by scheduler',()=>{
 let state=initialState('w');const events=[];
 const add=(id,grade,time,mode='review')=>{const e=event(id,state.rev,grade,time,mode);events.push(e);state=advance(state,e.data,time);return e;};
 add('new','hard',at,'new');
 add('step1','hard',at+60000);
 add('step2','hard',at+660000);
 add('step3','good',at+1260000);
 assert.equal(state.phase,'review');
 const reviewBase={...state};
 add('scheduled-quiz','hard',at+86400000);
 const scheduled=scheduleFor('w',events);
 const practice=event('free-fail',state.rev,'forget',at+86401000,'free');
 const withPractice=scheduleFor('w',[...events,practice]);
 assert.deepEqual(withPractice.state,scheduled.state);
 assert.equal(withPractice.state.ef,reviewBase.ef);
 assert.equal(withPractice.accepted.has('free-fail'),false);
});
