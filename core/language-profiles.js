const escapeRegExp=value=>String(value||'').replace(/[.*+?^(){}|[\]\\$]/g,'\\$&');

export const LANGUAGE_PROFILES=Object.freeze({
  en:Object.freeze({
    id:'en',
    label:'English',
    transcription:'ipa',
    typing:'direct',
    releasedPhase:1,
    supportedMeaningLanguages:['vi','en'],
    readingFace:'ipa',readingSource:'dictionary',extraFaces:[],fields:[],games:[]
  }),
  zh:Object.freeze({
    id:'zh',label:'中文',transcription:'pinyin',typing:'reading-then-form',releasedPhase:2,
    supportedMeaningLanguages:['vi','zh'],readingFace:'pinyin',readingSource:'pinyin-library',
    extraFaces:['hanViet'],fields:['script','radical','strokeCount','classifier'],games:['tone','classifier','handwriting']
  }),
  ja:Object.freeze({
    id:'ja',label:'日本語',transcription:'kana',typing:'reading-then-form',releasedPhase:3,
    supportedMeaningLanguages:['vi','ja'],readingFace:'kana',readingSource:'morphology',
    extraFaces:[],fields:['onReading','kunReading'],games:['handwriting']
  })
});

export function languageProfile(code){
  return LANGUAGE_PROFILES[code]||null;
}

export function studySetProfile(set){
  if(!set)return null;
  const language=languageProfile(set.language);
  if(!language)return null;
  const monolingual=set.language===set.meaningLanguage;
  return {...language,meaningLanguage:set.meaningLanguage,meaningMode:monolingual?'monolingual':'bilingual'};
}

export function maskMonolingualDefinition(value,word,variants=[]){
  let output=String(value||'');
  const forms=[word,...(variants||[])].map(x=>String(x||'').trim()).filter(Boolean)
    .sort((a,b)=>b.length-a.length);
  for(const form of forms){
    const pattern=new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(form)})(?=$|[^\\p{L}\\p{N}])`,'giu');
    output=output.replace(pattern,(match,prefix)=>prefix+'____');
  }
  return output;
}


const toneMarks={
  ā:['a',1],á:['a',2],ǎ:['a',3],à:['a',4],ē:['e',1],é:['e',2],ě:['e',3],è:['e',4],
  ī:['i',1],í:['i',2],ǐ:['i',3],ì:['i',4],ō:['o',1],ó:['o',2],ǒ:['o',3],ò:['o',4],
  ū:['u',1],ú:['u',2],ǔ:['u',3],ù:['u',4],ǖ:['v',1],ǘ:['v',2],ǚ:['v',3],ǜ:['v',4],ü:['v',0]
};
function pinyinSyllable(raw){
  let s=raw.toLowerCase().normalize('NFC').replaceAll('u:','v'),tone=null,out='';
  for(const ch of s){const mark=toneMarks[ch];if(mark){out+=mark[0];if(mark[1])tone=mark[1];}
    else if(/[1-5]/.test(ch))tone=ch==='5'?0:Number(ch);else if(/[a-zv]/.test(ch))out+=ch;}
  return out+(tone??0);
}
export function normalizePinyin(input){
  const s=String(input||'').trim().toLowerCase().replaceAll('u:','v'),explicit=s.split(/\s+/).filter(Boolean);
  if(explicit.length>1)return explicit.map(pinyinSyllable);
  const chunks=[];let cur='';
  for(const ch of s){cur+=ch;if(toneMarks[ch]?.[1]||/[1-5]/.test(ch)){chunks.push(cur);cur='';}}
  if(cur)chunks.push(cur);
  return chunks.filter(Boolean).map(pinyinSyllable);
}
export function chineseReadingMatches(input,expected){
  const a=normalizePinyin(input),b=normalizePinyin(expected);
  return a.length===b.length&&a.every((x,i)=>x===b[i]);
}
const isKanaOnly=s=>[...String(s||'')].every(ch=>/[\u3040-\u30ffー々〆ヵヶ]/u.test(ch));
const hiraToKata=s=>[...s].map(ch=>{const n=ch.codePointAt(0);return n>=0x3041&&n<=0x3096?String.fromCodePoint(n+0x60):ch}).join('');
export function japaneseReadingMatches(input,expected,written){
  const raw=String(input||'').trim().normalize('NFC');if(/[A-Za-z]/.test(raw))return false;
  const exp=String(expected||'').trim().normalize('NFC');
  if([...String(written||'')].some(ch=>/[\u30a0-\u30ff]/u.test(ch)))return hiraToKata(raw)===hiraToKata(exp);
  return raw===exp;
}
export function writingStep(profileId,written,distractors=[]){
  if(!['zh','ja'].includes(profileId))return {required:false,mode:'none',choices:[]};
  if(profileId==='ja'&&isKanaOnly(written))return {required:false,mode:'skip',choices:[written]};
  const unique=[written,...distractors.filter(x=>x&&x!==written)].filter((x,i,a)=>a.indexOf(x)===i).slice(0,4);
  if(unique.length<2)return {required:false,mode:'confirm',choices:[written],gradeCap:'hard'};
  return {required:true,mode:'choose',choices:unique};
}
