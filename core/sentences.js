/** Phase-2 sentence-pool validation and deterministic cloze selection. */
const text=(value,max=5000)=>typeof value==='string'&&value.length<=max;
const hash=value=>{
  let h=2166136261;
  for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
};

export function sentenceContentVersion(word){
  const f=word?.fields||{};
  return [
    f.word||word?.word||'',f.meaning||word?.meaning||'',f.pos||word?.pos||'',
    f.pinyin||word?.pinyin||'',word?.language||'',word?.meaningLanguage||''
  ].join('|');
}

export function validateSentence(sentence,wordContentVersion){
  if(!sentence||!text(sentence.id,100)||!text(sentence.text)||!text(sentence.targetForm,500))
    return {ok:false,reason:'missingText'};
  const {gapStart,gapEnd,targetForm,acceptedAnswers=[]}=sentence;
  if(!Number.isInteger(gapStart)||!Number.isInteger(gapEnd)||gapStart<0||gapEnd<=gapStart||gapEnd>sentence.text.length)
    return {ok:false,reason:'invalidGap'};
  if(sentence.text.slice(gapStart,gapEnd)!==targetForm)return {ok:false,reason:'targetMismatch'};
  if(!Array.isArray(acceptedAnswers)||!acceptedAnswers.length||acceptedAnswers.some(x=>!text(x,500))
    ||!acceptedAnswers.includes(targetForm))return {ok:false,reason:'missingAcceptedAnswer'};
  if(sentence.wordContentVersion!==wordContentVersion)return {ok:false,reason:'staleContent'};
  if(['deleted','reported','needsReview'].includes(sentence.status))return {ok:false,reason:'inactive'};
  return {ok:true};
}

export function normalizeGeneratedSentences(raw,word,limit=5){
  const version=sentenceContentVersion(word),out=[],seen=new Set();
  for(const item of Array.isArray(raw)?raw:[]){
    if(out.length>=limit)break;
    if(!item)continue;
    const sentenceText=String(item.text||'').trim(),targetForm=String(item.targetForm||'').trim();
    if(!sentenceText||!targetForm)continue;
    let start=Number(item.gapStart),end=Number(item.gapEnd);
    if(!Number.isInteger(start)||!Number.isInteger(end)||sentenceText.slice(start,end)!==targetForm){
      start=sentenceText.indexOf(targetForm);
      if(start<0||sentenceText.indexOf(targetForm,start+targetForm.length)>=0)continue;
      end=start+targetForm.length;
    }
    const answers=[targetForm,...(Array.isArray(item.acceptedAnswers)?item.acceptedAnswers:[])]
      .map(value=>String(value||'').trim()).filter(Boolean);
    const acceptedAnswers=[...new Set(answers)].slice(0,10);
    const key=sentenceText+'\u0000'+targetForm;if(seen.has(key))continue;seen.add(key);
    const sentence={id:'sp-'+hash(version+'\u0000'+key),text:sentenceText,gapStart:start,gapEnd:end,targetForm,
      acceptedAnswers,acceptedReadings:[],wordContentVersion:version,status:'ready'};
    if(validateSentence(sentence,version).ok)out.push(sentence);
  }
  return out;
}

export function legacySentence(word){
  const prompt=String(word?.sentence||''),answers=Array.isArray(word?.answers)?word.answers.filter(Boolean):[];
  if(prompt.split('___').length!==2||!answers.length)return null;
  const targetForm=String(answers[0]),gapStart=prompt.indexOf('___');
  const full=prompt.slice(0,gapStart)+targetForm+prompt.slice(gapStart+3),version=sentenceContentVersion(word);
  return {id:'manual-'+hash(version+'\u0000'+full),text:full,gapStart,gapEnd:gapStart+targetForm.length,targetForm,
    acceptedAnswers:[...new Set(answers.map(String))],acceptedReadings:[],wordContentVersion:version,status:'ready'};
}

export function sentenceCandidates(word){
  const version=sentenceContentVersion(word),pool=Array.isArray(word?.sentencePool)?word.sentencePool:[];
  const valid=pool.filter(sentence=>validateSentence(sentence,version).ok),manual=legacySentence(word);
  if(manual&&validateSentence(manual,version).ok&&!valid.some(item=>item.id===manual.id))valid.push(manual);
  return valid;
}

export function selectSentence(sentences,usage,wordContentVersion){
  const valid=sentences.filter(sentence=>validateSentence(sentence,wordContentVersion).ok);
  if(!valid.length)return {sentence:null,reused:false,needsRefill:false};
  const stats=new Map(valid.map(sentence=>[sentence.id,{count:0,last:-Infinity}]));
  for(const item of usage||[]){
    const stat=stats.get(item.sentenceId);if(!stat)continue;
    stat.count++;stat.last=Math.max(stat.last,Number(item.at)||0);
  }
  const unused=valid.filter(sentence=>stats.get(sentence.id).count===0),pool=unused.length?unused:[...valid];
  pool.sort((a,b)=>{
    const A=stats.get(a.id),B=stats.get(b.id);
    return A.last-B.last||A.count-B.count||String(a.id).localeCompare(String(b.id));
  });
  return {sentence:pool[0],reused:!unused.length,needsRefill:!unused.length};
}

export function selectWordSentence(word){
  const version=sentenceContentVersion(word);
  return selectSentence(sentenceCandidates(word),word?.sentenceUsage||[],version);
}

export function clozeFromSentence(sentence){
  if(!sentence)return null;
  return {prompt:sentence.text.slice(0,sentence.gapStart)+'___'+sentence.text.slice(sentence.gapEnd),
    answers:[...sentence.acceptedAnswers],readings:[...(sentence.acceptedReadings||[])],sentenceId:sentence.id};
}
