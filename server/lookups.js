import {readFileSync} from 'node:fs';

const IPA_SOURCE={
  id:'open-dict-data/ipa-dict:en_US',
  version:'43c3570eb3553bdd19fccd2bd0091534889af023',
  license:'MIT',
  dialect:'en-US'
};
const UNIHAN_SOURCE={
  id:'Unicode Unihan via @vearvip/hanzi-readings',
  version:'Unicode-17.0.0 / 7981a16a19938a3e54ba293f362a8920b88a77e4',
  license:'Unicode-3.0 (data), MIT (adapter snapshot)'
};

const ipaMap=new Map();
for(const line of readFileSync(new URL('./data/en-us-ipa.txt',import.meta.url),'utf8').split(/\r?\n/)){
  if(!line||line.startsWith('#'))continue;
  const tab=line.indexOf('\t');if(tab<1)continue;
  const word=line.slice(0,tab).trim().toLocaleLowerCase('en-US');
  const values=line.slice(tab+1).split(',').map(v=>v.trim().replace(/^\//,'').replace(/\/$/,'')).filter(Boolean);
  if(values.length)ipaMap.set(word,[...new Set(values)]);
}
const unihan=JSON.parse(readFileSync(new URL('./data/unihan-readings.json',import.meta.url),'utf8'));

const cleanWord=value=>String(value||'').normalize('NFC').trim();
const isHan=ch=>/\p{Script=Han}/u.test(ch);
const splitReadings=value=>String(value||'').trim().split(/\s+/).filter(Boolean);
const firstReading=value=>splitReadings(value)[0]||'';

function english(word){
  const key=cleanWord(word).toLocaleLowerCase('en-US'),values=ipaMap.get(key)||[];
  if(!values.length)return {language:'en',word,status:'missing',fields:{},meta:{ipa:{...IPA_SOURCE,status:'unsupported'}}};
  return {language:'en',word,status:'found',fields:{ipa:values[0]},candidates:{ipa:values},
    meta:{ipa:{...IPA_SOURCE,status:'lookup',needsCheck:values.length>1,confirmed:false}}};
}
function chinese(word){
  const chars=[...cleanWord(word)],han=chars.filter(isHan);
  if(!han.length)return {language:'zh',word,status:'missing',fields:{},
    meta:{pinyin:{...UNIHAN_SOURCE,status:'unsupported'},hanViet:{...UNIHAN_SOURCE,status:'unsupported'}}};
  const pinyin=[],hanViet=[],missingPinyin=[],missingHanViet=[],ambiguousPinyin=[],ambiguousHanViet=[];
  for(const ch of han){
    const row=unihan[ch];
    const mandarin=splitReadings(row?.[0]),vietnamese=splitReadings(row?.[5]);
    if(mandarin.length){pinyin.push(mandarin[0]);if(mandarin.length>1)ambiguousPinyin.push(ch);}
    else missingPinyin.push(ch);
    if(vietnamese.length){hanViet.push(vietnamese[0]);if(vietnamese.length>1)ambiguousHanViet.push(ch);}
    else missingHanViet.push(ch);
  }
  const fields={};
  if(!missingPinyin.length)fields.pinyin=pinyin.join(' ');
  if(!missingHanViet.length)fields.hanViet=hanViet.join(' ');
  const found=Boolean(fields.pinyin||fields.hanViet);
  return {language:'zh',word,status:found?'found':'missing',fields,
    unsupported:{pinyin:missingPinyin,hanViet:missingHanViet},
    meta:{
      pinyin:{...UNIHAN_SOURCE,status:fields.pinyin?'lookup':'unsupported',
        needsCheck:Boolean(missingPinyin.length||ambiguousPinyin.length),ambiguous:ambiguousPinyin,confirmed:false},
      hanViet:{...UNIHAN_SOURCE,status:fields.hanViet?'lookup':'unsupported',
        needsCheck:Boolean(missingHanViet.length||ambiguousHanViet.length),ambiguous:ambiguousHanViet,confirmed:false}
    }};
}
export const LOOKUP_SOURCES={ipa:IPA_SOURCE,unihan:UNIHAN_SOURCE};
export function lookupWord(language,word){
  const value=cleanWord(word);if(!value)return {language,word:value,status:'missing',fields:{},meta:{}};
  if(language==='en')return english(value);
  if(language==='zh')return chinese(value);
  return {language,word:value,status:'unsupported-language',fields:{},meta:{}};
}
