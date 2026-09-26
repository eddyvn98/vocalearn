/** Phase-2 AI job semantics. Provider-independent and safe against stale writes. */

export function startAiJob(word,type,id,now=Date.now()){
  if(!word?.id)throw new Error('word required');
  if(!type)throw new Error('job type required');
  return {
    id,type,wordId:word.id,inputContentVersion:word.contentVersion??0,
    inputFieldRevisions:{...(word.fields||{})},status:'queued',retryCount:0,
    result:null,suggestions:{},errorCode:null,createdAt:now,updatedAt:now
  };
}

export function completeAiJob(job,currentWord,result,now=Date.now()){
  if(!job||!currentWord||job.wordId!==currentWord.id)throw new Error('job/word mismatch');
  const suggestions={};
  const safePatch={};
  if(currentWord.deleted){
    return {...job,status:'suggestion',result:{...result},suggestions:{...result},updatedAt:now};
  }
  for(const [field,value] of Object.entries(result||{})){
    const startedRev=job.inputFieldRevisions?.[field]??null;
    const currentRev=currentWord.fields?.[field]??null;
    // Any revision change after job creation, including an explicit clear, protects manual intent.
    if(startedRev!==currentRev)suggestions[field]=value;
    else safePatch[field]=value;
  }
  return {...job,status:Object.keys(suggestions).length?'suggestion':'ready',result:{...result},
    suggestions,safePatch,updatedAt:now};
}

export function applyAiResult(job,currentWord,acceptedFields=null){
  if(!job||!currentWord||job.wordId!==currentWord.id||currentWord.deleted)return {};
  const allowed=acceptedFields?new Set(acceptedFields):null,patch={};
  for(const [field,value] of Object.entries(job.safePatch||{})){
    if(!allowed||allowed.has(field))patch[field]=value;
  }
  // Stale fields are proposals only; they require an explicit field selection by the user.
  for(const [field,value] of Object.entries(job.suggestions||{})){
    if(allowed?.has(field))patch[field]=value;
  }
  return patch;
}

export function retryAiJob(job,errorCode,now=Date.now()){
  return {...job,status:'queued',retryCount:(job.retryCount||0)+1,errorCode:errorCode||null,updatedAt:now};
}
