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
export function putDictionary(db,language,word,dictionary,now=Date.now()){
  const normalized=keyWord(word);
  db.prepare(`INSERT INTO dictionary_cache(language,normalized_word,source,payload,enrichments,fetched_at,updated_at,last_used_at)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(language,normalized_word) DO UPDATE SET source=excluded.source,payload=excluded.payload,
      fetched_at=excluded.fetched_at,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at`)
    .run(language,normalized,SOURCE,JSON.stringify(dictionary),'{}',now,now,now);
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
    ipa:dictionary.ipa||'',pos:dictionary.pos||'',sentence:cloze.sentence,
    answers:cloze.answers,synonyms:dictionary.synonyms||[],
    antonyms:dictionary.antonyms||[],source:SOURCE
  };
}
function enrichmentFields(enrichment){
  if(!enrichment)return {};
  return {
    meaning:clean(enrichment.meaning),collocations:list(enrichment.collocations,12),
    register:clean(enrichment.register),level:clean(enrichment.level),
    mnemonic:clean(enrichment.mnemonic)
  };
}
export async function autofillWord(db,provider,{language,meaningLanguage,word},fetchImpl=fetch){
  const value=clean(word),normalized=keyWord(value);
  if(language!=='en'||!normalized)throw new Error('English word required');
  let cached=cachedDictionary(db,language,value),cacheHit=Boolean(cached);
  if(!cached){
    let dictionary;
    try{dictionary=await fetchDictionary(value,fetchImpl);}
    catch(error){
      if(error.code!=='DICTIONARY_TEMPORARY')throw error;
      const local=lookupWord('en',value),ipa=local.fields?.ipa||'';
      return {status:'partial',temporary:true,cacheHit:false,aiCacheHit:false,
        aiConfigured:Boolean(provider?.configured),fields:{...(ipa?{ipa}: {})},
        lookupMeta:local.meta||{},source:'local-fallback',errorCode:error.code};
    }
    if(!dictionary)return {status:'missing',cacheHit:false,fields:{},source:SOURCE};
    cached=putDictionary(db,language,value,dictionary);
  }
  let enrichment=cached.enrichments?.[meaningLanguage]||null,aiCacheHit=Boolean(enrichment),aiErrorCode='';
  if(!enrichment&&provider?.configured){
    try{
      enrichment=await provider.generate({type:'dictionary-autofill',word:{
        word:value,language,meaningLanguage,dictionary:cached.dictionary
      }});
      cached=putEnrichment(db,language,value,meaningLanguage,enrichment);
    }catch(error){aiErrorCode=String(error.code||'AI_ERROR');}
  }
  return {
    status:'found',cacheHit,aiCacheHit,aiConfigured:Boolean(provider?.configured),aiErrorCode,
    fields:{...dictionaryFields(cached.dictionary),...enrichmentFields(enrichment)},
    dictionary:{definitions:cached.dictionary.definitions,audioUrl:cached.dictionary.audioUrl,
      sourceUrls:cached.dictionary.sourceUrls,license:cached.dictionary.license},
    source:SOURCE,fetchedAt:cached.fetchedAt
  };
}
export const DICTIONARY_SOURCE={id:SOURCE,url:'https://dictionaryapi.dev/'};
