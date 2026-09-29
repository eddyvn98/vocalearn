import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

export const ENGLISH_ENRICHMENT_SOURCES=Object.freeze({
  cefr:{id:'cefr-j:v1.5+octanove:v1.0',name:'CEFR-J / Octanove Vocabulary Profiles',
    license:'CEFR-J citation terms + CC BY-SA 4.0',url:'https://github.com/openlanguageprofiles/olp-en-cefrj'},
  datamuse:{id:'datamuse:v1',name:'Datamuse',license:'API terms / upstream source licenses',url:'https://www.datamuse.com/api/'},
  morphology:{id:'vocalearn-morphology:v1',name:'VocaLearn English morphology rules',license:'project code',url:''}
});

const clean=value=>String(value||'').normalize('NFC').trim();
const key=value=>clean(value).toLocaleLowerCase('en-US');
const unique=(values,limit=12)=>[...new Set(values.map(clean).filter(Boolean))].slice(0,limit);
const LEVEL_ORDER=Object.freeze({A1:1,A2:2,B1:3,B2:4,C1:5,C2:6});

function csvCells(line){
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
    }else if(char===','&&!quoted){cells.push(value);value='';}
    else value+=char;
  }
  cells.push(value);return cells;
}
function profileRows(path){
  if(!path||!existsSync(path))return [];
  const lines=readFileSync(path,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map(line=>{
    const [headword,pos,cefr]=csvCells(line);
    return {headword:clean(headword),pos:key(pos),level:clean(cefr).toUpperCase()};
  }).filter(row=>row.headword&&LEVEL_ORDER[row.level]);
}
function profileIndex(paths){
  const index=new Map();
  for(const path of paths)for(const row of profileRows(path)){
    const forms=row.headword.split('/').map(key).filter(Boolean);
    for(const form of forms){
      const rows=index.get(form)||[];rows.push(row);index.set(form,rows);
    }
  }
  return index;
}
function cefrFor(index,word,pos){
  const rows=index.get(key(word))||[];if(!rows.length)return '';
  const wanted=key(pos),exact=wanted?rows.filter(row=>row.pos===wanted):[];
  const candidates=exact.length?exact:rows;
  const levels=unique(candidates.map(row=>row.level),6);
  if(!exact.length&&levels.length>1)return '';
  return levels.sort((a,b)=>LEVEL_ORDER[a]-LEVEL_ORDER[b])[0]||'';
}

const IRREGULAR_VERBS=Object.freeze({
  be:['am','is','are','was','were','been','being'],begin:['begins','began','begun','beginning'],
  break:['breaks','broke','broken','breaking'],bring:['brings','brought','bringing'],
  build:['builds','built','building'],buy:['buys','bought','buying'],choose:['chooses','chose','chosen','choosing'],
  come:['comes','came','coming'],cut:['cuts','cutting'],do:['does','did','done','doing'],
  drink:['drinks','drank','drunk','drinking'],drive:['drives','drove','driven','driving'],
  eat:['eats','ate','eaten','eating'],fall:['falls','fell','fallen','falling'],
  feel:['feels','felt','feeling'],find:['finds','found','finding'],get:['gets','got','gotten','getting'],
  give:['gives','gave','given','giving'],go:['goes','went','gone','going'],grow:['grows','grew','grown','growing'],
  have:['has','had','having'],hear:['hears','heard','hearing'],hold:['holds','held','holding'],
  keep:['keeps','kept','keeping'],know:['knows','knew','known','knowing'],lead:['leads','led','leading'],
  leave:['leaves','left','leaving'],let:['lets','letting'],lose:['loses','lost','losing'],
  make:['makes','made','making'],mean:['means','meant','meaning'],meet:['meets','met','meeting'],
  pay:['pays','paid','paying'],put:['puts','putting'],read:['reads','read','reading'],
  run:['runs','ran','running'],say:['says','said','saying'],see:['sees','saw','seen','seeing'],
  send:['sends','sent','sending'],set:['sets','setting'],sit:['sits','sat','sitting'],
  speak:['speaks','spoke','spoken','speaking'],spend:['spends','spent','spending'],
  stand:['stands','stood','standing'],take:['takes','took','taken','taking'],
  tell:['tells','told','telling'],think:['thinks','thought','thinking'],
  understand:['understands','understood','understanding'],wear:['wears','wore','worn','wearing'],
  write:['writes','wrote','written','writing']
});
const IRREGULAR_NOUNS=Object.freeze({
  child:['children'],foot:['feet'],goose:['geese'],man:['men'],mouse:['mice'],
  person:['people'],tooth:['teeth'],woman:['women']
});
function consonantBeforeY(word){return /[^aeiou]y$/i.test(word);}
function regularVerb(word){
  const third=/(s|sh|ch|x|z|o)$/i.test(word)?word+'es':consonantBeforeY(word)?word.slice(0,-1)+'ies':word+'s';
  let past,gerund;
  if(/e$/i.test(word)&&!/ee$/i.test(word)){past=word+'d';gerund=word.slice(0,-1)+'ing';}
  else if(consonantBeforeY(word)){past=word.slice(0,-1)+'ied';gerund=word+'ing';}
  else {past=word+'ed';gerund=word+'ing';}
  return [third,past,gerund];
}
function variantsFor(word,pos){
  const value=key(word),part=key(pos);
  if(!/^[a-z]+$/.test(value)||value.length<2)return [];
  if(part==='verb')return unique(IRREGULAR_VERBS[value]||regularVerb(value),8).filter(item=>item!==value);
  if(part==='noun'){
    const forms=IRREGULAR_NOUNS[value]||[
      /(s|sh|ch|x|z)$/i.test(value)?value+'es':consonantBeforeY(value)?value.slice(0,-1)+'ies':value+'s'
    ];
    return unique(forms,4).filter(item=>item!==value);
  }
  return [];
}
async function fetchWords(fetchImpl,url,signal){
  try{
    const response=await fetchImpl(url,{headers:{Accept:'application/json'},signal});
    if(!response.ok)return [];
    const data=await response.json();
    return unique((Array.isArray(data)?data:[]).map(item=>item?.word).filter(Boolean),12);
  }catch{return [];}
}
async function datamuse(fetchImpl,word,timeoutMs){
  const base='https://api.datamuse.com/words?',value=encodeURIComponent(word);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const [syn,ant,after,before]=await Promise.all([
      fetchWords(fetchImpl,base+'rel_syn='+value+'&max=10',controller.signal),
      fetchWords(fetchImpl,base+'rel_ant='+value+'&max=10',controller.signal),
      fetchWords(fetchImpl,base+'rel_bga='+value+'&max=8',controller.signal),
      fetchWords(fetchImpl,base+'rel_bgb='+value+'&max=8',controller.signal)
    ]);
    const safe=item=>/^[A-Za-z][A-Za-z '-]{0,48}$/.test(item);
    const collocations=unique([
      ...after.filter(safe).map(item=>word+' '+item),
      ...before.filter(safe).map(item=>item+' '+word)
    ],8);
    return {synonyms:syn.filter(safe),antonyms:ant.filter(safe),collocations};
  }finally{clearTimeout(timer);}
}
function mergeLists(existing,incoming,limit){
  return unique([...(Array.isArray(existing)?existing:[]),...(Array.isArray(incoming)?incoming:[])],limit);
}

export function createEnglishEnricher({dataDir='./data/english',fetchImpl=fetch,timeoutMs=1800}={}){
  const dir=resolve(dataDir);
  const profiles=profileIndex([
    join(dir,'cefrj-vocabulary-profile-1.5.csv'),
    join(dir,'octanove-vocabulary-profile-c1c2-1.0.csv')
  ]);
  const remoteCache=new Map();
  return {
    available:profiles.size>0,
    sources:ENGLISH_ENRICHMENT_SOURCES,
    async enrich({word,pos,fields={}}){
      const result={},fieldSources={},used=[];
      const level=clean(fields.level)||cefrFor(profiles,word,pos);
      if(!clean(fields.level)&&level){result.level=level;fieldSources.level=ENGLISH_ENRICHMENT_SOURCES.cefr.id;used.push('CEFR-J');}
      const variants=Array.isArray(fields.variants)&&fields.variants.length?[]:variantsFor(word,pos);
      if(variants.length){result.variants=variants;fieldSources.variants=ENGLISH_ENRICHMENT_SOURCES.morphology.id;used.push('Morphology');}
      const needsRemote=!(fields.synonyms?.length&&fields.antonyms?.length&&fields.collocations?.length);
      let remote={};
      if(needsRemote&&fetchImpl){
        const cacheKey=key(word);
        if(remoteCache.has(cacheKey))remote=remoteCache.get(cacheKey);
        else {remote=await datamuse(fetchImpl,word,timeoutMs);remoteCache.set(cacheKey,remote);}
      }
      for(const [name,limit] of [['synonyms',20],['antonyms',20],['collocations',12]]){
        const merged=mergeLists(fields[name],remote[name],limit);
        if(merged.length>(Array.isArray(fields[name])?fields[name].length:0)){
          result[name]=merged;fieldSources[name]=ENGLISH_ENRICHMENT_SOURCES.datamuse.id;
          if(!used.includes('Datamuse'))used.push('Datamuse');
        }
      }
      return {fields:result,fieldSources,sources:used};
    }
  };
}
