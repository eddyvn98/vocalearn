import {lookupWord} from './lookups.js';
const SOURCE='dictionaryapi.dev';
const API='https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_CACHE_ENTRIES=20000;
const FETCH_TIMEOUT_MS=6000;
const FETCH_ATTEMPTS=2;
const clean=value=>String(value||'').normalize('NFC').trim();
const keyWord=value=>clean(value).toLocaleLowerCase('en-US');
const list=(value,limit=12)=>[...new Set((Array.isArray(value)?value:[]).map(x=>clean(x)).filter(Boolean))].slice(0,limit);

function normalizeEnglish(entries,word){
  const rows=Array.isArray(entries)?entries:[],first=rows[0]||{};
  const meanings=rows.flatMap(entry=>Array.isArray(entry.meanings)?entry.meanings:[]);
  const definitions=meanings.flatMap(meaning=>(meaning.definitions||[]).map(def=>({
    pos:clean(meaning.partOfSpeech),definition:clean(def.definition),example:clean(def.example),
    synonyms:list([...(meaning.synonyms||[]),...(def.synonyms||[])],20),
    antonyms:list([...(meaning.antonyms||[]),...(def.antonyms||[])],20)
  }))).filter(row=>row.definition);
  const phonetics=rows.flatMap(entry=>Array.isArray(entry.phonetics)?entry.phonetics:[]);
  const ipa=clean(first.phonetic)||clean(phonetics.find(p=>clean(p.text))?.text);
  const audio=clean(phonetics.find(p=>clean(p.audio))?.audio);
  const primary=definitions[0]||{};
  return {
    word:clean(first.word)||word,
    ipa:ipa.replace(/^\//,'').replace(/\/$/,''),
    audioUrl:audio.startsWith('//')?'https:'+audio:audio,
    pos:clean(primary.pos||meanings[0]?.partOfSpeech),
    definitions:definitions.slice(0,6).map(row=>row.definition),
    example:clean(definitions.find(row=>row.example)?.example),
    synonyms:list(definitions.flatMap(row=>row.synonyms),20),
    antonyms:list(definitions.flatMap(row=>row.antonyms),20),
    sourceUrls:list(rows.flatMap(entry=>entry.sourceUrls||[]),10),
    license:rows.find(entry=>entry.license)?.license||null
  };
}
function rowData(row){
  if(!row)return null;
  return {dictionary:JSON.parse(row.payload),enrichments:JSON.parse(row.enrichments||'{}'),
    source:row.source,fetchedAt:row.fetched_at,updatedAt:row.updated_at};
}
export function cachedDictionary(db,language,word,now=Date.now()){
  const normalized=keyWord(word),row=db.prepare('SELECT * FROM dictionary_cache WHERE language=? AND normalized_word=?')
    .get(language,normalized);
  if(row)db.prepare('UPDATE dictionary_cache SET last_used_at=? WHERE language=? AND normalized_word=?')
    .run(now,language,normalized);
  return rowData(row);
}
function pruneCache(db){
  const count=Number(db.prepare('SELECT COUNT(*) count FROM dictionary_cache').get().count||0);
  if(count<=MAX_CACHE_ENTRIES)return;
  db.prepare(`DELETE FROM dictionary_cache WHERE rowid IN (
    SELECT rowid FROM dictionary_cache ORDER BY last_used_at ASC LIMIT ?
  )`).run(count-MAX_CACHE_ENTRIES);
}
export function putDictionary(db,language,word,dictionary,now=Date.now(),source=SOURCE){
  const normalized=keyWord(word);
  db.prepare(`INSERT INTO dictionary_cache(language,normalized_word,source,payload,enrichments,fetched_at,updated_at,last_used_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(language,normalized_word) DO UPDATE SET source=excluded.source,payload=excluded.payload,
      fetched_at=excluded.fetched_at,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at`)
    .run(language,normalized,source,JSON.stringify(dictionary),'{}',now,now,now);
  pruneCache(db);
  return cachedDictionary(db,language,word,now);
}
export function putEnrichment(db,language,word,meaningLanguage,enrichment,now=Date.now()){
  const row=cachedDictionary(db,language,word);if(!row)throw new Error('Dictionary cache entry missing');
  const enrichments={...row.enrichments,[meaningLanguage]:enrichment};
  db.prepare('UPDATE dictionary_cache SET enrichments=?,updated_at=?,last_used_at=? WHERE language=? AND normalized_word=?')
    .run(JSON.stringify(enrichments),now,now,language,keyWord(word));
  return cachedDictionary(db,language,word);
}
async function fetchOnce(word,fetchImpl){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
  try{
    const response=await fetchImpl(API+encodeURIComponent(word),{headers:{Accept:'application/json'},signal:controller.signal});
    if(response.status===404)return null;
    if(!response.ok){
      const error=new Error('Dictionary provider returned '+response.status);
      error.status=503;error.code=response.status>=500?'DICTIONARY_TEMPORARY':'DICTIONARY_REJECTED';throw error;
    }
    return normalizeEnglish(await response.json(),word);
  }catch(error){
    if(error.name==='AbortError'){
      const timeout=new Error('Dictionary provider timed out');
      timeout.code='DICTIONARY_TEMPORARY';timeout.status=503;throw timeout;
    }
    throw error;
  }finally{clearTimeout(timer);}
}
async function fetchDictionary(word,fetchImpl){
  let last;
  for(let attempt=0;attempt<FETCH_ATTEMPTS;attempt++){
    try{return await fetchOnce(word,fetchImpl);}
    catch(error){last=error;if(error.code!=='DICTIONARY_TEMPORARY')throw error;}
  }
  throw last;
}
function clozeExample(example,word){
  const text=clean(example),target=clean(word);if(!text||!target)return {sentence:'',answers:[]};
  const escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=text.match(new RegExp('\\b'+escaped+'\\b','i'));
  if(!match)return {sentence:'',answers:[]};
  return {sentence:text.slice(0,match.index)+'___'+text.slice(match.index+match[0].length),answers:[match[0]]};
}
function dictionaryFields(dictionary){
  if(!dictionary)return {};
  const cloze=clozeExample(dictionary.example,dictionary.word);
  return {
    ipa:dictionary.ipa||'',pos:dictionary.pos||'',sentence:cloze.sentence,answers:cloze.answers,
    synonyms:list(dictionary.synonyms,20),antonyms:list(dictionary.antonyms,20),
    variants:list(dictionary.variants,12),collocations:list(dictionary.collocations,12),
    wordFamily:list(dictionary.wordFamily,20),register:clean(dictionary.register),level:clean(dictionary.level),
    translation:clean(dictionary.translation),source:SOURCE
  };
}
function enrichmentFields(enrichment){
  if(!enrichment)return {};
  return {
    meaning:clean(enrichment.meaning),translation:list(enrichment.alternateTranslations,6).join(', '),
    variants:list(enrichment.variants,12),collocations:list(enrichment.collocations,12),
    register:clean(enrichment.register),level:clean(enrichment.level),mnemonic:clean(enrichment.mnemonic)
  };
}
function localResult(lexicon,language,word,meaningLanguage){
  if(!lexicon?.available)return null;
  try{return lexicon.lookup(language,word,meaningLanguage);}catch{return null;}
}
function localDictionary(local,value){
  const fields=local?.fields||{},dictionary=local?.dictionary||{};
  return {
    word:clean(dictionary.word||local?.word||value),
    ipa:clean(dictionary.ipa||fields.ipa),pos:clean(dictionary.pos||fields.pos),
    definitions:list(dictionary.definitions,8),example:clean(dictionary.example),
    synonyms:list(dictionary.synonyms||fields.synonyms,20),antonyms:list(dictionary.antonyms||fields.antonyms,20),
    wordFamily:list(fields.wordFamily,20),translations:list(dictionary.translations||local?.meaningCandidates,8),
    translation:clean(fields.translation),sourceUrls:list(dictionary.sourceUrls,10),license:dictionary.license||null
  };
}
function mergeMissingFields(primary={},supplement={}){
  const result={...primary};
  for(const [key,value] of Object.entries(supplement)){
    const present=Array.isArray(result[key])?result[key].length>0:Boolean(clean(result[key]));
    const usable=Array.isArray(value)?value.length>0:Boolean(clean(value));
    if(!present&&usable)result[key]=value;
  }
  return result;
}
function sourceLabel(primary,sources=[],ai=false){
  const values=[primary,...sources,ai?'AI fallback':''].map(clean).filter(Boolean);
  return [...new Set(values)].join(' · ');
}
async function applyDataSources(db,cached,language,value,fields,enricher){
  if(!enricher)return {cached,fields,sources:[],fieldSources:{}};
  let result;
  try{result=await enricher.enrich({word:value,pos:fields.pos||cached.dictionary.pos,fields});}
  catch{return {cached,fields,sources:[],fieldSources:{}};}
  const sourceFields=result?.fields||{},fieldSources=result?.fieldSources||{};
  const merged=mergeMissingFields(fields,sourceFields);
  if(Object.keys(sourceFields).length){
    const next={...cached.dictionary,...sourceFields,
      fieldSources:{...(cached.dictionary.fieldSources||{}),...fieldSources}};
    cached=putDictionary(db,language,value,next,Date.now(),cached.source);
  }
  return {cached,fields:merged,sources:result?.sources||[],fieldSources};
}
function missingForAi(fields){
  return ['meaning','translation','variants','collocations','register','level'].filter(name=>{
    const value=fields[name];return Array.isArray(value)?!value.length:!clean(value);
  });
}
async function aiLast(db,provider,cached,language,meaningLanguage,value,fields){
  let enrichment=cached.enrichments?.[meaningLanguage]||null;
  const aiCacheHit=Boolean(enrichment),missing=missingForAi(fields);let aiErrorCode='';
  if(!enrichment&&provider?.configured&&missing.length){
    try{
      enrichment=await provider.generate({type:'dictionary-autofill',word:{
        word:value,language,meaningLanguage,dictionary:{...cached.dictionary,missingFields:missing}
      }});
      cached=putEnrichment(db,language,value,meaningLanguage,enrichment);
    }catch(error){aiErrorCode=String(error.code||'AI_ERROR');}
  }
  return {cached,enrichment,aiCacheHit,aiErrorCode,missing,used:Boolean(enrichment)};
}
export async function autofillWord(db,provider,{language,meaningLanguage,word},fetchImpl=fetch,lexicon=null,enricher=null){
  const value=clean(word),normalized=keyWord(value);
  if(language!=='en'||!normalized)throw new Error('English word required');
  const local=localResult(lexicon,language,value,meaningLanguage);
  if(local?.status==='found'&&clean(local.fields?.meaning)){
    let cached=cachedDictionary(db,language,value),cacheHit=Boolean(cached);
    if(!cached)cached=putDictionary(db,language,value,localDictionary(local,value),Date.now(),local.source||'local-lexicon');
    let base=mergeMissingFields(local.fields||{},dictionaryFields(cached.dictionary));
    const sourced=await applyDataSources(db,cached,language,value,base,enricher);
    cached=sourced.cached;base=sourced.fields;
    const ai=await aiLast(db,provider,cached,language,meaningLanguage,value,base);
    const fields=mergeMissingFields(base,enrichmentFields(ai.enrichment));
    fields.source=sourceLabel('MinhQND Dictionary',sourced.sources,ai.used);
    return {...local,localHit:true,cacheHit,aiCacheHit:ai.aiCacheHit,aiConfigured:Boolean(provider?.configured),
      aiErrorCode:ai.aiErrorCode,aiSkipped:!provider?.configured||ai.aiCacheHit||!ai.missing.length,
      fields,fieldSources:{...(cached.dictionary.fieldSources||{}),...sourced.fieldSources},
      source:local.source,fetchedAt:ai.cached.fetchedAt};
  }
  let cached=cachedDictionary(db,language,value),cacheHit=Boolean(cached);
  if(!cached){
    let dictionary;
    try{dictionary=await fetchDictionary(value,fetchImpl);}
    catch(error){
      if(error.code!=='DICTIONARY_TEMPORARY')throw error;
      const fallback=local||lookupWord('en',value),ipa=fallback.fields?.ipa||'';
      return {status:'partial',temporary:true,localHit:Boolean(local),cacheHit:false,aiCacheHit:false,
        aiConfigured:Boolean(provider?.configured),fields:{...(local?.fields||{}),...(ipa?{ipa}: {})},
        lookupMeta:local?.lookupMeta||fallback.meta||{},source:local?.source||'local-fallback',errorCode:error.code};
    }
    if(!dictionary){
      if(local)return {...local,localHit:true,cacheHit:false,aiCacheHit:false,aiConfigured:Boolean(provider?.configured)};
      return {status:'missing',cacheHit:false,fields:{},source:SOURCE};
    }
    cached=putDictionary(db,language,value,dictionary);
  }
  let base=mergeMissingFields(local?.fields||{},dictionaryFields(cached.dictionary));
  const sourced=await applyDataSources(db,cached,language,value,base,enricher);
  cached=sourced.cached;base=sourced.fields;
  const ai=await aiLast(db,provider,cached,language,meaningLanguage,value,base);
  const fields=mergeMissingFields(base,enrichmentFields(ai.enrichment));
  fields.source=sourceLabel(SOURCE,sourced.sources,ai.used);
  return {
    status:'found',localHit:Boolean(local),cacheHit,aiCacheHit:ai.aiCacheHit,aiConfigured:Boolean(provider?.configured),
    aiErrorCode:ai.aiErrorCode,aiSkipped:!provider?.configured||ai.aiCacheHit||!ai.missing.length,
    fields,fieldSources:{...(cached.dictionary.fieldSources||{}),...sourced.fieldSources},
    lookupMeta:local?.lookupMeta||{},dictionary:{definitions:cached.dictionary.definitions,audioUrl:cached.dictionary.audioUrl,
      sourceUrls:cached.dictionary.sourceUrls,license:cached.dictionary.license},
    source:ai.used?'ai-fallback':cached.source,fetchedAt:ai.cached.fetchedAt
  };
}
export const DICTIONARY_SOURCE={id:SOURCE,url:'https://dictionaryapi.dev/'};
