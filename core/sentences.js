import {normalize} from './grading.js';

const VERSION_FIELDS=['word','meaning','pos','variants','level','ipa','pinyin','kana'];
export function contentVersion(word){
  const fields=word?.fields||{};
  return JSON.stringify({generation:word?.generation||word?.id||'',fields:Object.fromEntries(VERSION_FIELDS.map(key=>[key,fields[key]||'']))});
}

export function sentencePrompt(sentence){
  if(!sentence)return '';
  const text=String(sentence.text||''),start=Number(sentence.gapStart),end=Number(sentence.gapEnd);
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length)return '';
  return text.slice(0,start)+'___'+text.slice(end);
}

export function pickSentence(sentences,version){
  return (sentences||[]).filter(s=>!s.deleted&&s.status==='ready'&&s.wordContentVersion===version&&sentencePrompt(s))
    .sort((a,b)=>(a.usageCount||0?1:0)-(b.usageCount||0?1:0)
      ||(a.lastUsedAt||0)-(b.lastUsedAt||0)||(a.usageCount||0)-(b.usageCount||0)||a.id.localeCompare(b.id))[0]||null;
}

export function sentenceSource(word){
  const selected=pickSentence(word?.sentencePool,contentVersion(word));
  if(selected)return {id:selected.id,prompt:sentencePrompt(selected),answers:[...selected.acceptedAnswers],readings:[...(selected.acceptedReadings||[])],source:'pool'};
  if(typeof word?.sentence==='string'&&word.sentence.split('___').length===2&&Array.isArray(word.answers)&&word.answers.length)
    return {id:null,prompt:word.sentence,answers:[...word.answers],readings:[],source:'original'};
  return null;
}

export function sentenceUnits(text,language='en'){
  const value=String(text||'').trim();if(!value)return 0;
  try{
    const segmenter=new Intl.Segmenter(language,{granularity:'word'});
    const words=[...segmenter.segment(value)].filter(part=>part.isWordLike);
    if(words.length)return words.length;
  }catch{}
  if(['zh','ja'].includes(language))return [...value].filter(ch=>!/\s|[.,!?;:，。！？；：]/u.test(ch)).length;
  return value.split(/\s+/u).filter(Boolean).length;
}

export function normalizeGeneratedSentence(raw,word,language='en'){
  if(!raw||typeof raw!=='object')throw new Error('Invalid generated sentence');
  const text=String(raw.text||'').trim(),targetForm=String(raw.targetForm||raw.target_form||'').trim();
  if(!text||text.length>500||!targetForm||targetForm.length>100)throw new Error('Invalid generated sentence text');
  let gapStart=Number(raw.gapStart??raw.gap_start),gapEnd=Number(raw.gapEnd??raw.gap_end);
  if(!Number.isInteger(gapStart)||!Number.isInteger(gapEnd)){
    gapStart=text.indexOf(targetForm);gapEnd=gapStart+targetForm.length;
    if(gapStart<0||text.indexOf(targetForm,gapEnd)>=0)throw new Error('Generated sentence target is ambiguous');
  }
  if(gapStart<0||gapEnd<=gapStart||gapEnd>text.length||text.slice(gapStart,gapEnd)!==targetForm)throw new Error('Generated sentence gap mismatch');
  const accepted=[...(raw.acceptedAnswers||raw.accepted_answers||[])].map(x=>String(x).trim()).filter(Boolean);
  if(!accepted.length)accepted.push(targetForm);
  if(!accepted.some(answer=>normalize(answer)===normalize(targetForm)))accepted.unshift(targetForm);
  const readings=[...(raw.acceptedReadings||raw.accepted_readings||[])].map(x=>String(x).trim()).filter(Boolean);
  if(accepted.length>20||readings.length>20||sentenceUnits(text,language)>15)throw new Error('Generated sentence exceeds limits');
  return {text,gapStart,gapEnd,targetForm,acceptedAnswers:[...new Set(accepted)].slice(0,20),acceptedReadings:[...new Set(readings)].slice(0,20),
    level:String(raw.level||word.level||'').slice(0,50),status:'ready',wordContentVersion:contentVersion(word),source:'ai'};
}
