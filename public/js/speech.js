import {gameAvailability} from '/core/capabilities.js';

const adapter=()=>globalThis.__VOCALearnLocalASR||null;
export function speechCapability(language){
  const a=adapter(),supported=!!a?.tested&&a?.local===true&&Array.isArray(a.languages)&&a.languages.includes(language);
  return {tested:supported,offline:!!a?.offline,permission:a?.permission||'unknown',version:a?.version||null};
}
export function speechAvailability(language,{offline=typeof navigator!=='undefined'&&!navigator.onLine}={}){
  return gameAvailability('speak',{asr:{[language]:speechCapability(language)}},language,{offline});
}
export async function recognizeSpeech(language){
  const available=speechAvailability(language);
  if(!available.available)return {kind:'technical',code:available.reason||'notTested'};
  const a=adapter();
  try{
    const started=performance.now(),result=await a.recognize(language);
    if(!result?.transcript||result.confidence===0)return {kind:'technical',code:'lowConfidence'};
    return {kind:'recognition',transcript:String(result.transcript),activeMs:Number.isFinite(result.activeMs)?Math.max(0,result.activeMs):Math.max(0,performance.now()-started)};
  }catch(error){
    return {kind:'technical',code:error?.code||'recognitionError'};
  }
}
