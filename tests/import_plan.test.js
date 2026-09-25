import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectCards,createImportEvents} from '../core/import-plan.js';

const prepare=(kind,data,id)=>({id,kind,data,deviceId:'dev',at:0});
const uuid=()=>{throw new Error('random IDs must not be needed for import retries');};
const baseModel=()=>({
  words:{},
  categories:{},
  links:{}
});

test('Import event IDs and new word IDs are stable for the same draft',()=>{
  const model=baseModel();
  const rows=inspectCards([{row:2,word:'resilient',meaning:'kien cuong',category:'Work > Traits'}],model,'set');
  const a=createImportEvents(rows,model,'set',prepare,uuid,'draft-123');
  const b=createImportEvents(rows,model,'set',prepare,uuid,'draft-123');
  assert.deepEqual(a,b);
  const word=a.find(e=>e.kind==='word');
  assert.ok(word.id);
  assert.match(word.data.id,/^iw-/);
  assert.equal(a.filter(e=>e.kind==='category').length,2);
  assert.equal(a.filter(e=>e.kind==='link').length,1);
});

test('Reimporting an unchanged card defaults to merge without duplicate content events',()=>{
  const existing={
    id:'w1',setId:'set',word:'deploy',meaning:'trien khai',pos:'verb',ipa:'',
    note:'same',fields:{word:'ev1',meaning:'ev1',pos:'ev1',note:'ev1'},categoryIds:[],deleted:false
  };
  const model={...baseModel(),words:{w1:existing}};
  const rows=inspectCards([{row:2,word_id:'w1',word:'deploy',meaning:'trien khai',pos:'verb',note:'same'}],model,'set');
  assert.equal(rows[0].action,'merge');
  assert.equal(rows[0].targetId,'w1');
  const events=createImportEvents(rows,model,'set',prepare,uuid,'retry-1');
  assert.equal(events.filter(e=>e.kind==='word').length,0);
});

test('Conflict choice updates only selected fields and preserves the target word ID',()=>{
  const existing={
    id:'w1',setId:'set',word:'deploy',meaning:'trien khai',pos:'verb',ipa:'',
    note:'local',image:'data:image/png;base64,AAAA',
    fields:{word:'ev1',meaning:'ev1',pos:'ev1',note:'ev2',image:'ev3'},categoryIds:[],deleted:false
  };
  const model={...baseModel(),words:{w1:existing}};
  const rows=inspectCards([{row:2,word_id:'w1',word:'deploy',meaning:'trien khai',pos:'verb',
    note:'sheet',image:'data:image/png;base64,BBBB'}],model,'set');
  assert.deepEqual(rows[0].conflicts.map(c=>c.key).sort(),['image','note']);
  rows[0].take.note=true;
  const events=createImportEvents(rows,model,'set',prepare,uuid,'draft-conflict');
  const word=events.find(e=>e.kind==='word');
  assert.equal(word.data.id,'w1');
  assert.deepEqual(word.data.patch,{note:'sheet'});
  assert.deepEqual(word.data.baseFields,existing.fields);
});
