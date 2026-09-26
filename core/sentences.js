/** Phase-2 sentence-pool validation and deterministic selection. */

export function validateSentence(sentence,wordContentVersion){
  if(!sentence||typeof sentence.text!=='string')return {ok:false,reason:'missingText'};
  const {gapStart,gapEnd,targetForm,acceptedAnswers=[]}=sentence;
  if(!Number.isInteger(gapStart)||!Number.isInteger(gapEnd)||gapStart<0||gapEnd<=gapStart||gapEnd>sentence.text.length)
    return {ok:false,reason:'invalidGap'};
  if(sentence.text.slice(gapStart,gapEnd)!==targetForm)return {ok:false,reason:'targetMismatch'};
  if(!acceptedAnswers.length||!acceptedAnswers.includes(targetForm))return {ok:false,reason:'missingAcceptedAnswer'};
  if(sentence.wordContentVersion!==wordContentVersion)return {ok:false,reason:'staleContent'};
  if(['deleted','reported','needsReview'].includes(sentence.status))return {ok:false,reason:'inactive'};
  return {ok:true};
}

export function selectSentence(sentences,usage,wordContentVersion){
  const valid=sentences.filter(s=>validateSentence(s,wordContentVersion).ok);
  if(!valid.length)return {sentence:null,reused:false,needsRefill:false};
  const stats=new Map(valid.map(s=>[s.id,{count:0,last:-Infinity}]));
  for(const u of usage||[]){
    const x=stats.get(u.sentenceId);if(x){x.count++;x.last=Math.max(x.last,Number(u.at)||0);}
  }
  const unused=valid.filter(s=>stats.get(s.id).count===0);
  const pool=unused.length?unused:valid;
  pool.sort((a,b)=>{
    const A=stats.get(a.id),B=stats.get(b.id);
    return A.last-B.last||A.count-B.count||String(a.id).localeCompare(String(b.id));
  });
  return {sentence:pool[0],reused:!unused.length,needsRefill:!unused.length&&valid.length>=5};
}

export function clozeFromSentence(sentence){
  if(!sentence)return null;
  return {prompt:sentence.text.slice(0,sentence.gapStart)+'___'+sentence.text.slice(sentence.gapEnd),
    answers:[...sentence.acceptedAnswers],readings:[...(sentence.acceptedReadings||[])],sentenceId:sentence.id};
}
