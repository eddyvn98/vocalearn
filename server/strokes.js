const HANZI_VERSION='68d10a4b21150cae5e1ebbd223eed289cf32d90c';
const KANJIVG_VERSION='422b5538595676da918c288a4230cb5e22a1ee7e';
const HANZI_BASE='https://raw.githubusercontent.com/chanind/hanzi-writer-data/'+HANZI_VERSION+'/data/';
const KANJIVG_BASE='https://raw.githubusercontent.com/KanjiVG/kanjivg/'+KANJIVG_VERSION+'/kanji/';
const cache=new Map();

const provenance={
  zh:{source:'Hanzi Writer Data / Make Me A Hanzi',version:HANZI_VERSION,license:'Arphic Public License'},
  ja:{source:'KanjiVG',version:KANJIVG_VERSION,license:'CC BY-SA 3.0'}
};
const timeoutFetch=async(fetchImpl,url)=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{return await fetchImpl(url,{signal:controller.signal});}finally{clearTimeout(timer);}
};
const scaleMedian=points=>points.map(([x,y])=>[Math.round(x/10.24*100)/100,Math.round((1024-y)/10.24*100)/100]);
export function parseHanziData(json,char){
  const strokes=Array.isArray(json?.medians)?json.medians.map(scaleMedian):[];
  if(!strokes.length||strokes.some(points=>points.length<2))return null;
  return {char,format:'points',strokes};
}
export function parseKanjiSvg(svg,char){
  const paths=[...String(svg||'').matchAll(/<path\b[^>]*\bid="kvg:[^"]+-s\d+"[^>]*\bd="([^"]+)"/g)].map(match=>match[1]);
  return paths.length?{char,format:'svg-path',strokes:paths,viewBox:109}:null;
}
async function loadCharacter(language,char,fetchImpl){
  const key=language+':'+char;if(cache.has(key))return cache.get(key);
  let record=null;
  try{
    if(language==='zh'){
      const response=await timeoutFetch(fetchImpl,HANZI_BASE+encodeURIComponent(char)+'.json');
      if(response.ok)record=parseHanziData(await response.json(),char);
    }else if(language==='ja'){
      const hex=char.codePointAt(0).toString(16).padStart(5,'0');
      const response=await timeoutFetch(fetchImpl,KANJIVG_BASE+hex+'.svg');
      if(response.ok)record=parseKanjiSvg(await response.text(),char);
    }
  }catch{}
  cache.set(key,record);return record;
}
export async function strokesFor(language,text,fetchImpl=fetch){
  if(!['zh','ja'].includes(language))throw new Error('Unsupported stroke language');
  const chars=[...String(text||'')];
  if(!chars.length||chars.length>16)throw new Error('Text must contain 1 to 16 characters');
  const characters=[],missing=[];
  for(const char of chars){
    const record=await loadCharacter(language,char,fetchImpl);
    if(record)characters.push(record);else missing.push(char);
  }
  return {language,text:String(text),...provenance[language],characters,missing,complete:missing.length===0};
}
export const STROKE_SOURCES=Object.freeze(provenance);
