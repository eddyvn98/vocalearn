/** Capability gates for device-dependent games. Never infer offline support. */

export function capabilityStatus(device,kind,language,{offline=false}={}){
  const cap=device?.[kind]?.[language];
  if(!cap?.tested)return {available:false,reason:'notTested'};
  if(cap.permission==='denied')return {available:false,reason:'permissionDenied'};
  if(offline&&!cap.offline)return {available:false,reason:'offlineUnavailable'};
  return {available:true,reason:null,version:cap.version||null};
}

export function gameAvailability(game,device,language,{offline=false,hasAudio=false,hasStrokes=false}={}){
  if(game==='speak')return capabilityStatus(device,'asr',language,{offline});
  if(game==='dictation'){
    if(hasAudio)return {available:true,reason:null,source:'storedAudio'};
    const tts=capabilityStatus(device,'tts',language,{offline});
    return {...tts,source:tts.available?'testedTts':null};
  }
  if(game==='handwriting'){
    if(!hasStrokes)return {available:false,reason:'missingStrokeData'};
    return capabilityStatus(device,'pen',language,{offline:false});
  }
  return {available:true,reason:null};
}

export function speechAttempt(state,event){
  const next={validAttempts:state?.validAttempts||0,hadError:state?.hadError||false,technicalErrors:[...(state?.technicalErrors||[])]};
  if(event.kind==='technical'){
    next.technicalErrors.push(event.code||'speechTechnicalError');
    return {...next,final:null};
  }
  next.validAttempts++;
  if(!event.correct){
    next.hadError=true;
    return {...next,final:next.validAttempts>=2?{correct:false,grade:'forget',hadError:true}:null};
  }
  return {...next,final:{correct:true,grade:next.hadError||next.validAttempts>1?'hard':'good',hadError:next.hadError}};
}
