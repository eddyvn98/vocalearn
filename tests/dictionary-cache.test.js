import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {autofillWord,cachedDictionary} from '../server/dictionary-cache.js';

const dictionaryPayload=[{
  word:'deploy',
  phonetic:'/dɪˈplɔɪ/',
  phonetics:[{text:'/dɪˈplɔɪ/',audio:'//example.test/deploy.mp3'}],
  meanings:[{
    partOfSpeech:'verb',
    synonyms:['roll out'],
    definitions:[{
      definition:'to bring resources into effective action',
      example:'We deploy the app tonight.',
      synonyms:['release'],
      antonyms:['withdraw']
    }]
  }],
  sourceUrls:['https://example.test/deploy'],
  license:{name:'Test license',url:'https://example.test/license'}
}];

test('shared dictionary cache avoids repeated provider and AI calls',async()=>{
  const db=openDatabase(':memory:');
  let fetchCalls=0,aiCalls=0;
  const fetchImpl=async()=>{
    fetchCalls++;
    return {ok:true,status:200,json:async()=>dictionaryPayload};
  };
  const provider={configured:true,generate:async({type,word})=>{
    aiCalls++;
    assert.equal(type,'dictionary-autofill');
    assert.equal(word.dictionary.pos,'verb');
    return {meaning:'triển khai',collocations:['deploy an app'],register:'trung tính',level:'B2',mnemonic:'đưa vào sử dụng'};
  }};
  const first=await autofillWord(db,provider,{language:'en',meaningLanguage:'vi',word:'Deploy'},fetchImpl);
  assert.equal(first.cacheHit,false);
  assert.equal(first.aiCacheHit,false);
  assert.equal(first.fields.meaning,'triển khai');
  assert.equal(first.fields.ipa,'dɪˈplɔɪ');
  assert.equal(first.fields.pos,'verb');
  assert.equal(first.fields.sentence,'We ___ the app tonight.');
  assert.deepEqual(first.fields.answers,['deploy']);
  assert.deepEqual(first.fields.synonyms,['roll out','release']);
  assert.equal(fetchCalls,1);
  assert.equal(aiCalls,1);

  const second=await autofillWord(db,provider,{language:'en',meaningLanguage:'vi',word:'deploy'},fetchImpl);
  assert.equal(second.cacheHit,true);
  assert.equal(second.aiCacheHit,true);
  assert.equal(fetchCalls,1);
  assert.equal(aiCalls,1);
  assert.equal(cachedDictionary(db,'en','DEPLOY').dictionary.word,'deploy');
  db.close();
});

test('same dictionary row can hold separate shared enrichments by meaning language',async()=>{
  const db=openDatabase(':memory:');
  let fetchCalls=0,aiCalls=0;
  const fetchImpl=async()=>{fetchCalls++;return {ok:true,status:200,json:async()=>dictionaryPayload};};
  const provider={configured:true,generate:async({word})=>{
    aiCalls++;
    return {meaning:word.meaningLanguage==='vi'?'triển khai':'deploy',collocations:[],register:'neutral',level:'',mnemonic:''};
  }};
  await autofillWord(db,provider,{language:'en',meaningLanguage:'vi',word:'deploy'},fetchImpl);
  const english=await autofillWord(db,provider,{language:'en',meaningLanguage:'en',word:'deploy'},fetchImpl);
  assert.equal(english.fields.meaning,'deploy');
  assert.equal(fetchCalls,1);
  assert.equal(aiCalls,2);
  const cached=cachedDictionary(db,'en','deploy');
  assert.equal(cached.enrichments.vi.meaning,'triển khai');
  assert.equal(cached.enrichments.en.meaning,'deploy');
  db.close();
});

test('missing dictionary entries are not fabricated or cached',async()=>{
  const db=openDatabase(':memory:');
  const result=await autofillWord(db,{configured:false},{language:'en',meaningLanguage:'vi',word:'not-real'},
    async()=>({ok:false,status:404,json:async()=>({})}));
  assert.equal(result.status,'missing');
  assert.equal(cachedDictionary(db,'en','not-real'),null);
  db.close();
});

test('temporary dictionary outage retries then returns local partial data without poisoning shared cache',async()=>{
  const db=openDatabase(':memory:');
  let calls=0;
  const result=await autofillWord(db,{configured:false},{language:'en',meaningLanguage:'vi',word:'deploy'},
    async()=>{calls++;return {ok:false,status:522,json:async()=>({})};});
  assert.equal(calls,2);
  assert.equal(result.status,'partial');
  assert.equal(result.temporary,true);
  assert.ok(result.fields.ipa);
  assert.equal(result.errorCode,'DICTIONARY_TEMPORARY');
  assert.equal(cachedDictionary(db,'en','deploy'),null);
  db.close();
});

test('AI outage does not discard dictionary fields or shared dictionary cache',async()=>{
  const db=openDatabase(':memory:');
  const provider={configured:true,generate:async()=>{const error=new Error('timeout');error.code='AI_TIMEOUT';throw error;}};
  const result=await autofillWord(db,provider,{language:'en',meaningLanguage:'vi',word:'deploy'},
    async()=>({ok:true,status:200,json:async()=>dictionaryPayload}));
  assert.equal(result.status,'found');
  assert.equal(result.aiErrorCode,'AI_TIMEOUT');
  assert.equal(result.fields.ipa,'dɪˈplɔɪ');
  assert.equal(result.fields.pos,'verb');
  assert.ok(cachedDictionary(db,'en','deploy'));
  db.close();
});
