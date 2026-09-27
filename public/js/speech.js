import {gameAvailability} from '/core/capabilities.js';

const localAdapters=new Map();
const languageTag=language=>({en:'en-US',zh:'zh-CN',ja:'ja-JP'}[language]||language);
const injected=()=>globalThis.__VOCALearnLocalASR||null;
const adapter=language=>injected()||localAdapters.get(language)||null;

function browserLocalAdapter(Speech,language){
  const lang=languageTag(language);
  return {
    tested:true,local:true,offline:true,permission:'prompt',version:'web-speech-local-v1',languages:[language],
    recognize:(_language,{onState=()=>{}}={})=>new Promise((resolve,reject)=>{
      const recognition=new Speech();let settled=false,timer;
      recognition.lang=lang;recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
      recognition.processLocally=true;
      const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
      recognition.onstart=()=>onState('recording');
      recognition.onspeechend=()=>onState('recognizing');
      recognition.onaudioend=()=>onState('recognizing');
      recognition.onresult=event=>{
        const result=event.results?.[0]?.[0];
        finish(resolve,{transcript:String(result?.transcript||''),confidence:Number(result?.confidence??1)});
      };
      recognition.onerror=event=>finish(reject,Object.assign(new Error(event.error||'recognitionError'),{code:event.error||'recognitionError'}));
      recognition.onend=()=>{if(!settled)finish(reject,Object.assign(new Error('no-speech'),{code:'noSpeech'}));};
      timer=setTimeout(()=>{try{recognition.abort();}catch{}finish(reject,Object.assign(new Error('timeout'),{code:'timeout'}));},12000);
      try{recognition.start();}catch(error){finish(reject,Object.assign(error,{code:error?.name||'recognitionError'}));}
    })
  };
}

export async function prepareSpeechCapability(language){
  const custom=injected();
  if(custom?.tested&&custom?.local===true&&Array.isArray(custom.languages)&&custom.languages.includes(language))return true;
  const Speech=globalThis.SpeechRecognition;
  if(typeof Speech!=='function'||typeof Speech.available!=='function'||!('processLocally' in Speech.prototype))return false;
  try{
    const status=await Promise.race([
      Speech.available({langs:[languageTag(language)],processLocally:true}),
      new Promise(resolve=>setTimeout(()=>resolve('timeout'),1200))
    ]);
    if(status!=='available')return false;
    localAdapters.set(language,browserLocalAdapter(Speech,language));return true;
  }catch{return false;}
}
export function speechCapability(language){
  const a=adapter(language),supported=!!a?.tested&&a?.local===true&&Array.isArray(a.languages)&&a.languages.includes(language);
  return {tested:supported,offline:!!a?.offline,permission:a?.permission||'unknown',version:a?.version||null};
}
export function speechAvailability(language,{offline=typeof navigator!=='undefined'&&!navigator.onLine}={}){
  return gameAvailability('speak',{asr:{[language]:speechCapability(language)}},language,{offline});
}
export async function recognizeSpeech(language,onState=()=>{}){
  const available=speechAvailability(language);
  if(!available.available)return {kind:'technical',code:available.reason||'notTested'};
  const a=adapter(language);
  try{
    onState('recording');
    const started=performance.now(),result=await a.recognize(language,{onState});
    onState('recognizing');
    if(!result?.transcript||result.confidence===0)return {kind:'technical',code:'lowConfidence'};
    const timed=Number.isFinite(result.activeMs);
    return {kind:'recognition',transcript:String(result.transcript),activeMs:timed?Math.max(0,result.activeMs):0,timingUnknown:!timed};
  }catch(error){
    const map={'not-allowed':'permissionDenied','service-not-allowed':'permissionDenied','audio-capture':'mic','language-not-supported':'notTested','language-unavailable':'notTested','no-speech':'noSpeech'};
    return {kind:'technical',code:map[error?.code]||error?.code||'recognitionError'};
  }
}
