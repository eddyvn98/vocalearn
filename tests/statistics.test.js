import test from 'node:test';
import assert from 'node:assert/strict';
import {masteredWord,statisticsSnapshot} from '../core/statistics.js';

const now=Date.parse('2026-09-28T05:00:00Z');
const review=(dueDate,interval=1)=>({phase:'review',step:0,interval,dueDate,dueAt:null,rev:'r'});
const base={setId:'s',deleted:false,categoryIds:[],errors:{inBook:false},ready:true};

test('advanced statistics uses the product mastery denominator and current due state',()=>{
  const model={settings:{zone:'Asia/Ho_Chi_Minh'},categories:{},words:{
    mastered:{...base,id:'mastered',review:review('2026-10-28',30)},
    dueToday:{...base,id:'dueToday',review:review('2026-09-28',30)},
    overdue:{...base,id:'overdue',review:review('2026-09-27',30)},
    waiting:{...base,id:'waiting',ready:false,review:{phase:'new',step:0,interval:0,dueDate:null,dueAt:null}}
  },events:[]};
  assert.equal(masteredWord(model.words.mastered,now,model.settings.zone),true);
  assert.equal(masteredWord(model.words.dueToday,now,model.settings.zone),true);
  assert.equal(masteredWord(model.words.overdue,now,model.settings.zone),false);
  const stats=statisticsSnapshot(model,{setId:'s',now,days:30});
  assert.equal(stats.activeCount,4);
  assert.equal(stats.masteredCount,2);
  assert.equal(stats.masteredRate,0.5);
  assert.equal(stats.dueCount,2);
  assert.equal(stats.waitingCount,1);
});

test('statistics respects scope, time window and reports answer outcomes without turning them into proficiency',()=>{
  const model={settings:{zone:'Asia/Ho_Chi_Minh'},categories:{c:{id:'c',parentId:null}},words:{
    a:{...base,id:'a',categoryIds:['c'],review:review('2026-10-28',30)},
    b:{...base,id:'b',categoryIds:[],review:review('2026-10-28',30)}
  },events:[
    {id:'e1',kind:'answer',effectiveAt:now-86400000,data:{wordId:'a',game:'typing',grade:'good',hadError:false,assisted:false,hint:false}},
    {id:'e2',kind:'answer',effectiveAt:now-2*86400000,data:{wordId:'a',game:'typing',grade:'hard',hadError:true,assisted:true,hint:false}},
    {id:'e3',kind:'answer',effectiveAt:now-20*86400000,data:{wordId:'a',game:'quiz',grade:'hard',hadError:false,assisted:false,hint:false}},
    {id:'e4',kind:'answer',effectiveAt:now-86400000,data:{wordId:'b',game:'typing',grade:'forget',hadError:true,assisted:false,hint:false}}
  ]};
  const stats=statisticsSnapshot(model,{setId:'s',scope:['c'],now,days:7});
  assert.equal(stats.activeCount,1);
  assert.equal(stats.answerCount,2);
  assert.equal(stats.cleanCount,1);
  assert.equal(stats.cleanRate,0.5);
  assert.deepEqual(stats.gameRows,[{game:'typing',total:2,forget:0,hard:1,good:1,easy:0}]);
  assert.equal(stats.dayRows.length,2);
});
