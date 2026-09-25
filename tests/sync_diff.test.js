import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleAdjustments} from '../core/sync-diff.js';

const answer=(id,wordId,baseRev)=>({id,kind:'answer',data:{wordId,baseRev,mode:'review'}});

test('Schedule diff explains late-parent invalidation and retained logs',()=>{
  const before={words:{w:{word:'deploy',review:{rev:'rev-child',phase:'learning',step:3},accepted:new Set(['p','child'])}},events:[
    answer('p','w','root'),answer('child','w','rev-parent')
  ]};
  const after={words:{w:{word:'deploy',review:{rev:'rev-parent-alt',phase:'learning',step:1},accepted:new Set(['p','late']),
    practiceReclassified:['child']}},events:[
    answer('p','w','root'),answer('late','w','rev-1'),answer('child','w','rev-parent')
  ]};
  const changes=scheduleAdjustments(before,after);
  assert.equal(changes.length,1);
  assert.equal(changes[0].reason,'late-parent');
  assert.deepEqual(changes[0].invalidated,['child']);
  assert.deepEqual(changes[0].retained,['child']);
  assert.deepEqual(changes[0].newlyAccepted,['late']);
});

test('Schedule diff labels remote merged result when no accepted local answer is invalidated',()=>{
  const before={words:{w:{word:'deploy',review:{rev:'a',phase:'learning',step:1},accepted:new Set(['root'])}},events:[]};
  const after={words:{w:{word:'deploy',review:{rev:'b',phase:'learning',step:2},accepted:new Set(['root','remote'])}},events:[
    answer('remote','w','a')
  ]};
  const [change]=scheduleAdjustments(before,after);
  assert.equal(change.reason,'merged-result');
  assert.deepEqual(change.invalidated,[]);
  assert.deepEqual(change.newlyAccepted,['remote']);
});

test('Schedule diff is empty when replay revision does not change',()=>{
  const model={words:{w:{word:'deploy',review:{rev:'same',phase:'review',step:0},accepted:new Set(['a'])}},events:[]};
  assert.deepEqual(scheduleAdjustments(model,model),[]);
});
