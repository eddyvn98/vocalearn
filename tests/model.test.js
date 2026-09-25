import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replay,inScope} from '../core/model.js';
import {validateEvent} from '../core/validation.js';
const event=(id,kind,data,seq)=>({id,kind,data,seq,at:100,deviceId:'device'});
const set=event('s','set',{id:'set',name:'EN',language:'en',meaningLanguage:'vi'},1);
const word=event('w','word',{id:'word',setId:'set',patch:{word:'bank',meaning:'financial institution'}},2);
test('AT-01: bare word saves as waiting without a due date',()=>{
 const state=replay([set,event('w','word',{id:'word',setId:'set',patch:{word:'apple'}},2)]);
 assert.equal(state.words.word.ready,false);assert.equal(state.words.word.review.dueAt,null);
});
test('AT-02: equal spelling, different senses maintain independent IDs',()=>{
 const state=replay([set,word,event('w2','word',{id:'other',setId:'set',patch:{word:'bank',meaning:'river edge'}},3)]);
 assert.equal(Object.keys(state.words).length,2);assert.notEqual(state.words.word.review.rev,state.words.other.review.rev);
});
test('AT-20: per-field edits merge, conflicting same field retains old value',()=>{
 const state=replay([set,word,event('a','word',{id:'word',setId:'set',patch:{note:'memo'},baseFields:{}},3),
 event('b','word',{id:'word',setId:'set',patch:{meaning:'money place'},baseFields:{meaning:'w'}},4),
 event('c','word',{id:'word',setId:'set',patch:{meaning:'finance'},baseFields:{meaning:'w'}},5)]);
 assert.equal(state.words.word.note,'memo');assert.equal(state.words.word.meaning,'finance');assert.equal(state.conflicts.length,1);
});
test('AT-21: tombstone stops stale edits; restoration explicit',()=>{
 const es=[set,word,event('d','deleteWord',{id:'word'},3),event('u','word',{id:'word',setId:'set',patch:{meaning:'stale'}},4)];
 assert.equal(replay(es).words.word.meaning,'financial institution');assert.equal(replay(es).words.word.deleted,true);
 assert.equal(replay([...es,event('r','restoreWord',{id:'word'},5)]).words.word.deleted,false);
});
test('AT-27: categories do not clone schedule; deleting categories does not delete words',()=>{
 const es=[set,word,event('c1','category',{id:'a',setId:'set',name:'A'},3),event('c2','category',{id:'b',setId:'set',name:'B',parentId:'a'},4),
 event('l1','link',{wordId:'word',categoryId:'a'},5),event('l2','link',{wordId:'word',categoryId:'b'},6)];
 const state=replay(es);assert.equal(state.words.word.categoryIds.length,2);assert.equal(inScope(state.words.word,['a'],state.categories),true);
 const after=replay([...es,event('d','deleteCategory',{id:'a'},7)]);assert.equal(after.words.word.deleted,false);assert.equal(after.words.word.categoryIds.length,0);
});
test('Concurrent unlink wins; explicit re-add after observed removal works',()=>{
 const es=[set,word,event('c','category',{id:'a',setId:'set',name:'A'},3),event('l','link',{wordId:'word',categoryId:'a'},4),
 event('u','unlink',{wordId:'word',categoryId:'a',base:'l'},5),event('l2','link',{wordId:'word',categoryId:'a',base:'l'},6)];
 assert.equal(replay(es).words.word.categoryIds.length,0);
 assert.equal(replay([...es,event('l3','link',{wordId:'word',categoryId:'a',base:'u'},7)]).words.word.categoryIds.length,1);
});
test('Reject unsafe media, prototype fields, invalid clocks/settings',()=>{
 assert.throws(()=>validateEvent(event('bad','word',{id:'x',setId:'set',patch:{image:'javascript:alert(1)'}})));
 assert.throws(()=>validateEvent(event('bad','word',{id:'__proto__',setId:'set',patch:{word:'x'}})));
 assert.throws(()=>validateEvent(event('bad','settings',{zone:'invalid/zone'})));
 assert.throws(()=>validateEvent(event('bad','settings',{newLimit:1.5})));
 assert.throws(()=>validateEvent(event('bad','settings',JSON.parse('{"__proto__":{}}'))));
});
