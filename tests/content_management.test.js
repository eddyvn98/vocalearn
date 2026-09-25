import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent} from '../core/validation.js';
import {replay,inScope,descendants} from '../core/model.js';

const event=(id,kind,data)=>({id,kind,data,deviceId:'dev',at:1});
const set=event('set','set',{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'});

test('Custom fields are bounded plain text journal data',()=>{
  const good=event('w1','word',{id:'word1',setId:'set',patch:{
    word:'bank',meaning:'ngân hàng',level:'B1',variants:['banks'],tags:['finance'],
    custom:{Source:'Internal notes',Priority:'high'}
  }});
  assert.equal(validateEvent(good),good);

  const tooMany=Object.fromEntries(Array.from({length:31},(_,i)=>['k'+i,'v']));
  assert.throws(()=>validateEvent(event('w2','word',{id:'word2',setId:'set',patch:{word:'x',custom:tooMany}})));
  assert.throws(()=>validateEvent(event('w3','word',{id:'word3',setId:'set',patch:{word:'x',custom:{'':'bad'}}})));
});

test('Same spelling with different meanings retains distinct identities and schedules',()=>{
  const events=[
    set,
    event('a','word',{id:'a',setId:'set',patch:{word:'bank',meaning:'ngân hàng',pos:'noun'}}),
    event('b','word',{id:'b',setId:'set',patch:{word:'bank',meaning:'bờ sông',pos:'noun'}}),
    event('reset-a','resetWord',{id:'a'})
  ];
  const state=replay(events);
  assert.equal(state.words.a.word,'bank');
  assert.equal(state.words.b.word,'bank');
  assert.notEqual(state.words.a.id,state.words.b.id);
  assert.notEqual(state.words.a.generation,state.words.b.generation);
  assert.equal(state.words.b.generation,'b');
});

test('Topic scope includes descendants and multi-membership without leaking siblings',()=>{
  const events=[
    set,
    event('root','category',{id:'root',setId:'set',name:'Work',parentId:null}),
    event('child','category',{id:'child',setId:'set',name:'Meetings',parentId:'root'}),
    event('sib','category',{id:'sib',setId:'set',name:'Travel',parentId:null}),
    event('w1','word',{id:'w1',setId:'set',patch:{word:'confirm',meaning:'xác nhận'}}),
    event('w2','word',{id:'w2',setId:'set',patch:{word:'deploy',meaning:'triển khai'}}),
    event('l1','link',{wordId:'w1',categoryId:'child',base:null}),
    event('l2','link',{wordId:'w1',categoryId:'sib',base:null}),
    event('l3','link',{wordId:'w2',categoryId:'sib',base:null}),
  ];
  const state=replay(events);
  assert.deepEqual([...descendants(state.categories,'root')].sort(),['child','root']);
  assert.equal(inScope(state.words.w1,['root'],state.categories),true);
  assert.equal(inScope(state.words.w2,['root'],state.categories),false);
  assert.deepEqual(state.words.w1.categoryIds.sort(),['child','sib']);
});
