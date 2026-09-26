import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateEvent} from '../core/validation.js';
import {replay,inScope,descendants,categoryPath} from '../core/model.js';

const event=(id,kind,data,seq=1)=>({id,kind,data,deviceId:'dev',at:seq,seq});

test('Custom field definitions and values are journal-safe',()=>{
  const set=event('set-event','set',{
    id:'set1',name:'Deck',language:'en',meaningLanguage:'vi',
    customFields:[
      {id:'priority',label:'Priority',type:'select',options:['low','high']},
      {id:'score',label:'Score',type:'number',options:[]},
      {id:'context',label:'Context',type:'text',options:[]},
    ]
  });
  assert.doesNotThrow(()=>validateEvent(set));
  const word=event('word-event','word',{
    id:'w1',setId:'set1',patch:{
      word:'bank',meaning:'ngân hàng',variants:['banks'],synonyms:['lender'],tags:['finance'],
      collocations:['central bank'],wordFamily:['banking'],level:'B1',register:'neutral',
      translation:'ngân hàng',mnemonic:'money',source:'project',custom:{priority:'high',score:8,context:'BIM'}
    },baseFields:{}
  });
  assert.doesNotThrow(()=>validateEvent(word));
});

test('Invalid custom field definitions and unsafe custom keys are rejected',()=>{
  const badSet=event('bad-set','set',{
    id:'set1',name:'Deck',language:'en',meaningLanguage:'vi',
    customFields:[{id:'bad field',label:'Bad',type:'text',options:[]}]
  });
  assert.throws(()=>validateEvent(badSet));
  const badWord=event('bad-word','word',{
    id:'w1',setId:'set1',patch:{word:'bank',custom:{'bad field':'x'}},baseFields:{}
  });
  assert.throws(()=>validateEvent(badWord));
});

test('Recursive topic scope deduplicates multi-membership',()=>{
  const categories={
    root:{id:'root',setId:'set1',name:'Work',parentId:null},
    child:{id:'child',setId:'set1',name:'BIM',parentId:'root'},
    leaf:{id:'leaf',setId:'set1',name:'Revit',parentId:'child'},
    other:{id:'other',setId:'set1',name:'Other',parentId:null},
  };
  assert.deepEqual([...descendants(categories,'root')].sort(),['child','leaf','root']);
  assert.equal(categoryPath(categories,'leaf'),'Work > BIM > Revit');
  const word={categoryIds:['child','leaf']};
  assert.equal(inScope(word,['root'],categories),true);
  assert.equal(inScope(word,['other'],categories),false);
});

test('Same spelling with different meaning keeps independent card identity and schedule',()=>{
  const events=[
    event('s','set',{id:'set1',name:'Deck',language:'en',meaningLanguage:'vi'},1),
    event('wa','word',{id:'bank-money',setId:'set1',patch:{word:'bank',meaning:'ngân hàng',pos:'noun'},baseFields:{}},2),
    event('wb','word',{id:'bank-river',setId:'set1',patch:{word:'bank',meaning:'bờ sông',pos:'noun'},baseFields:{}},3),
  ];
  const state=replay(events);
  assert.equal(state.words['bank-money'].word,'bank');
  assert.equal(state.words['bank-river'].word,'bank');
  assert.notEqual(state.words['bank-money'].id,state.words['bank-river'].id);
  assert.notEqual(state.words['bank-money'].review.rev,state.words['bank-river'].review.rev);
});


test('AT-27 topic transfer replaces only the source membership and keeps schedule',()=>{
  const base=[
    event('s','set',{id:'set1',name:'Deck',language:'en',meaningLanguage:'vi'},1),
    event('c1','category',{id:'source',setId:'set1',name:'Source',parentId:null},2),
    event('c2','category',{id:'other',setId:'set1',name:'Other',parentId:null},3),
    event('c3','category',{id:'target',setId:'set1',name:'Target',parentId:null},4),
    event('w','word',{id:'w1',setId:'set1',patch:{word:'bank',meaning:'ngân hàng'},baseFields:{}},5),
    event('l1','link',{wordId:'w1',categoryId:'source',base:null},6),
    event('l2','link',{wordId:'w1',categoryId:'other',base:null},7),
  ];
  const before=replay(base);
  const sourceRev=before.links['w1/source'].rev;
  const after=replay([
    ...base,
    event('l3','link',{wordId:'w1',categoryId:'target',base:null},8),
    event('u1','unlink',{wordId:'w1',categoryId:'source',base:sourceRev},9),
  ]);
  assert.deepEqual(after.words.w1.categoryIds.sort(),['other','target']);
  assert.equal(after.words.w1.generation,before.words.w1.generation);
  assert.equal(after.words.w1.review.rev,before.words.w1.review.rev);
});
