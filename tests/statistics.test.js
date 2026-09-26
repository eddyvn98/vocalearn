import test from 'node:test';
import assert from 'node:assert/strict';
import {mastered,scopeStats,activitySeries,statsDescription} from '../core/statistics.js';

test('advanced statistics uses the v0.5 mastered definition and active-card denominator',()=>{
 const now=1000000;
 const model={categories:{},words:{
  a:{id:'a',deleted:false,categoryIds:[],review:{phase:'review',interval:21,due:now+1},errors:{inBook:false}},
  b:{id:'b',deleted:false,categoryIds:[],review:{phase:'review',interval:30,due:now-1},errors:{inBook:false}},
  c:{id:'c',deleted:false,categoryIds:[],review:{phase:'review',interval:40,due:now+1},errors:{inBook:true}},
  d:{id:'d',deleted:false,categoryIds:[],review:{phase:'new',interval:0,due:null},errors:{inBook:false}}
 }};
 assert.equal(mastered(model.words.a,now),true);
 assert.deepEqual(scopeStats(model,[],now),{active:4,mastered:1,ratio:.25,ratioLabel:'1/4',percentLabel:'25%'});
 assert.equal(statsDescription(scopeStats(model,[],now),'Tất cả','01/09','30/09'),'Tất cả: 1/4 thẻ đã thuộc (25%), 01/09–30/09.');
});
test('empty scope reports 0/0 and dash instead of a misleading percentage',()=>{
 assert.deepEqual(scopeStats({words:{},categories:{}},[],0),{active:0,mastered:0,ratio:null,ratioLabel:'0/0',percentLabel:'—'});
});
test('activity series keeps scheduled review separate from free/error practice',()=>{
 const events=[{kind:'answer',at:Date.UTC(2026,8,1),data:{wordId:'a',mode:'review',grade:'good'}},{kind:'answer',at:Date.UTC(2026,8,1)+1,data:{wordId:'a',mode:'free',grade:'forget',hadError:true}}];
 assert.deepEqual(activitySeries(events,{}),[{day:'2026-09-01',scheduled:1,practice:1,errors:1}]);
});
