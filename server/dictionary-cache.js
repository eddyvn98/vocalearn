const SOURCE='dictionaryapi.dev';
const API='https://api.dictionaryapi.dev/api/v2/entries/en/';
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
export function cachedDictionary(db,language,word){
  return rowData(db.prepare('SELECT * FROM dictionary_cache WHERE language=? AND normalized_word=?')
    .get(language,keyWord(word)));
}
export function putDictionary(db,language,word,dictionary,now=Date.now()){
  const normalized=keyWord(word);
  db.prepare(`INSERT INTO dictionary_cache(language,normalized_word,source,payload,enrichments,fetched_at,updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(language,normalized_word) DO UPDATE SET source=excluded.source,payload=excluded.payload,
      fetched_at=excluded.fetched_at,updated_at=excluded.updated_at`)
    .run(language,normalized,SOURCE,JSON.stringify(dictionary),'{}',now,now);
  return cachedDictionary(db,language,word);
}
export function putEnrichment(db,language,word,meaningLanguage,enrichment,now=Date.now()){
  const row=cachedDictionary(db,language,word);if(!row)throw new Error('Dictionary cache entry missing');
  const enrichments={...row.enrichments,[meaningLanguage]:enrichment};
  db.prepare('UPDATE dictionary_cache SET enrichments=?,updated_at=? WHERE language=? AND normalized_word=?')
    .run(JSON.stringify(enrichments),now,language,keyWord(word));
  return cachedDictionary(db,language,word);
}
async function fetchDictionary(word,fetchImpl){
  const response=await fetchImpl(API+encodeURIComponent(word),{headers:{Accept:'application/json'}});
  if(response.status===404)return null;
  if(!response.ok){const error=new Error('Dictionary provider returned '+response.status);error.status=502;throw error;}
  return normalizeEnglish(await response.json(),word);
}
function dictionaryFields(dictionary){
  if(!dictionary)return {};
  return {
    ipa:dictionary.ipa||'',pos:dictionary.pos||'',sentence:dictionary.example||'',
    answers:dictionary.example?[dictionary.word]:[],synonyms:dictionary.synonyms||[],
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
    const dictionary=await fetchDictionary(value,fetchImpl);
    if(!dictionary)return {status:'missing',cacheHit:false,fields:{},source:SOURCE};
    cached=putDictionary(db,language,value,dictionary);
  }
  let enrichment=cached.enrichments?.[meaningLanguage]||null,aiCacheHit=Boolean(enrichment);
  if(!enrichment&&provider?.configured){
    try{
      enrichment=await provider.generate({type:'dictionary-autofill',word:{
        word:value,language,meaningLanguage,dictionary:cached.dictionary
      }});
      cached=putEnrichment(db,language,value,meaningLanguage,enrichment);
    }catch(error){
      if(!['AI_PROVIDER_UNAVAILABLE','AI_EMPTY_RESULT'].includes(error.code))throw error;
    }
  }
  return {
    status:'found',cacheHit,aiCacheHit,aiConfigured:Boolean(provider?.configured),
    fields:{...dictionaryFields(cached.dictionary),...enrichmentFields(enrichment)},
    dictionary:{definitions:cached.dictionary.definitions,audioUrl:cached.dictionary.audioUrl,
      sourceUrls:cached.dictionary.sourceUrls,license:cached.dictionary.license},
    source:SOURCE,fetchedAt:cached.fetchedAt
  };
}
export const DICTIONARY_SOURCE={id:SOURCE,url:'https://dictionaryapi.dev/'};
