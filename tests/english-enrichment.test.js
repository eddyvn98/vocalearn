import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEnglishEnricher} from '../server/english-enrichment.js';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'vocalearn-english-'));
  writeFileSync(join(dir,'cefrj-vocabulary-profile-1.5.csv'),
    'headword,pos,CEFR,CoreInventory 1,CoreInventory 2,Threshold\nconfirm,verb,B1,,,\napple,noun,A1,,,\n');
  writeFileSync(join(dir,'octanove-vocabulary-profile-c1c2-1.0.csv'),
    'headword,pos,CEFR,meaning\nabstruse,adjective,C2,\n');
  return dir;
}
function datamuse(url){
  const parsed=new URL(url);
  if(parsed.searchParams.has('rel_syn'))return [{word:'verify'}];
  if(parsed.searchParams.has('rel_ant'))return [{word:'deny'}];
  if(parsed.searchParams.has('rel_bga'))return [{word:'receipt'},{word:'details'}];
  if(parsed.searchParams.has('rel_bgb'))return [{word:'please'}];
  return [];
}

test('open English sources fill CEFR, morphology and lexical relations before AI',async()=>{
  const dir=fixture();let calls=0;
  const fetchImpl=async url=>{calls++;return {ok:true,json:async()=>datamuse(url)};};
  try{
    const enricher=createEnglishEnricher({dataDir:dir,fetchImpl,timeoutMs:500});
    const result=await enricher.enrich({word:'confirm',pos:'verb',fields:{}});
    assert.equal(enricher.available,true);
    assert.equal(result.fields.level,'B1');
    assert.deepEqual(result.fields.variants,['confirms','confirmed','confirming']);
    assert.deepEqual(result.fields.synonyms,['verify']);
    assert.deepEqual(result.fields.antonyms,['deny']);
    assert.deepEqual(result.fields.collocations,['confirm receipt','confirm details','please confirm']);
    assert.equal(result.fieldSources.level,'cefr-j:v1.5+octanove:v1.0');
    assert.equal(result.fieldSources.collocations,'datamuse:v1');
    assert.equal(calls,4);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('existing lexical relation data avoids Datamuse calls',async()=>{
  const dir=fixture();let calls=0;
  try{
    const enricher=createEnglishEnricher({dataDir:dir,fetchImpl:async()=>{calls++;throw new Error('unused');}});
    const result=await enricher.enrich({word:'apple',pos:'noun',fields:{
      synonyms:['pome'],antonyms:['nonapple'],collocations:['apple pie']
    }});
    assert.equal(result.fields.level,'A1');
    assert.deepEqual(result.fields.variants,['apples']);
    assert.equal(calls,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
