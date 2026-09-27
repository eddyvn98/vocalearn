import {app,current} from './state.js';
import {setMeta} from './storage.js';
import {t,esc} from './ui.js';
import {normalize} from '/core/grading.js';
import {speechAttempt} from '/core/capabilities.js';

const tags={en:'en-US',zh:'zh-CN',ja:'ja-JP'};
const cache=new Map();
let resultHandler=async()=>{};

const adapter=()=>globalThis.__vocaSpeechTestAdapter||null;
const Recognition=()=>globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition||null;
export const setSpeechResultHandler=handler=>{resultHandler=handler;};
export const speechStatus=language=>cache.get(language)||{available:false,reason:'notTested',tested:false};

export async function probeLocalSpeech(language){
  const tag=tags[language];if(!tag)return {available:false,reason:'unsupportedLanguage',tested:true};
  try{
    const mock=adapter();
    if(mock?.probe){const status=await mock.probe(language,tag);cache.set(language,status);return status;}
    const Ctor=Recognition();
    if(!Ctor||typeof Ctor.available!=='function')return cache.set(language,{available:false,reason:'notSupported',tested:true})&&cache.get(language);
    const state=await Ctor.available({langs:[tag],processLocally:true,quality:'command'});
    const status=state==='available'
      ?{available:true,reason:null,tested:true,offline:true,version:'web-speech-local-v1',state}
      :{available:false,reason:state==='downloadable'||state==='downloading'?'languagePackNeeded':'offlineUnavailable',
        tested:true,offline:false,installable:state==='downloadable'||state==='downloading',state};
    cache.set(language,status);return status;
  }catch(error){
    const status={available:false,reason:'probeFailed',tested:true,error:String(error?.message||error)};
    cache.set(language,status);return status;
  }
}
export async function installLocalSpeech(language){
  const tag=tags[language],Ctor=Recognition(),mock=adapter();
  try{
    if(mock?.install){await mock.install(language,tag);return probeLocalSpeech(language);}
    if(!tag||!Ctor||typeof Ctor.install!=='function')return {available:false,reason:'installUnsupported',tested:true};
    const ok=await Ctor.install({langs:[tag],processLocally:true,quality:'command'});
    if(!ok)return {available:false,reason:'installFailed',tested:true};
    return probeLocalSpeech(language);
  }catch(error){return {available:false,reason:'installFailed',tested:true,error:String(error?.message||error)};}
}
export function speechCapabilityMarkup(language){
  const s=speechStatus(language);
  if(s.available)return \`<p class="info">\${t('speechLocalReady')}</p>\`;
  if(s.reason==='languagePackNeeded')return \`<p class="info">\${t('speechPackNeeded')} <button type="button" class="btn quiet" data-speech-install="\${esc(language)}">\${t('speechInstallPack')}</button></p>\`;
  return \`<p class="muted small">\${t('speechUnavailable')}: \${t('speechReason_'+s.reason)}</p>\`;
}
function correctTranscript(q,transcript){
  const candidates=[q.snapshot.word,...(q.snapshot.variants||[])];
  if(q.speech?.language==='ja'&&q.snapshot.kana)candidates.push(q.snapshot.kana);
  return candidates.some(value=>normalize(value)===normalize(transcript));
}
async function technical(q,code){
  q.speechAttempt=speechAttempt(q.speechAttempt,{kind:'technical',code});
  q.speechStatus='technical';q.speechError=code;
  await setMeta('session',app.session);app.render();
}
async function recognized(q,transcript){
  const correct=correctTranscript(q,transcript);
  q.input=transcript;q.speechTranscript=transcript;q.speechStatus=correct?'recognizedCorrect':'recognizedWrong';
  const next=speechAttempt(q.speechAttempt,{kind:'recognition',correct});q.speechAttempt=next;
  if(!correct)q.hadError=true;
  if(!next.final){await setMeta('session',app.session);app.render();return;}
  q.speechGrade={grade:next.final.grade,assisted:next.final.hadError};
  await setMeta('session',app.session);await resultHandler(next.final.correct,next.final);
}
export async function startLocalSpeech(){
  const q=current();if(!q?.speech||q.result)return;
  const availability=await probeLocalSpeech(q.speech.language);
  if(!availability.available){q.speechStatus='unavailable';q.speechError=availability.reason;await setMeta('session',app.session);app.render();return;}
  q.speechStatus='recording';q.speechError='';await setMeta('session',app.session);app.render();
  const mock=adapter();
  if(mock?.recognize){
    try{const transcript=await mock.recognize(q.speech.language,q.snapshot.word);return recognized(q,String(transcript||''));}
    catch(error){return technical(q,error?.code||'adapterError');}
  }
  const Ctor=Recognition();if(!Ctor)return technical(q,'notSupported');
  const recognition=new Ctor();recognition.lang=tags[q.speech.language];recognition.continuous=false;recognition.interimResults=false;recognition.maxAlternatives=1;
  recognition.processLocally=true;
  recognition.onresult=event=>recognized(q,String(event.results?.[0]?.[0]?.transcript||'')).catch(()=>technical(q,'resultError'));
  recognition.onerror=event=>technical(q,event.error||'recognitionError');
  recognition.onend=()=>{if(q.speechStatus==='recording'){q.speechStatus='ended';setMeta('session',app.session).then(()=>app.render());}};
  try{recognition.start();}catch(error){await technical(q,error?.name||'startError');}
}
export function speechMarkup(q){
  const status=q.speechStatus||'ready',transcript=q.speechTranscript||'',error=q.speechError||'';
  return \`<div class="stack center"><p class="muted">\${t('speechPrompt')}</p>
    <button type="button" class="btn primary" data-speech-record \${q.result?'disabled':''}>\${t(status==='recording'?'speechListening':'speechRecord')}</button>
    <p role="status">\${transcript?t('speechRecognized')+': '+esc(transcript):t('speechStatus_'+status)}</p>
    \${error?\`<p class="error-text">\${t('speechTechnicalNoPenalty')} · \${esc(error)}</p>\`:''}
    <p class="muted small">\${t('speechLocalOnly')}</p></div>\`;
}
document.addEventListener('click',async event=>{
  const install=event.target.closest?.('[data-speech-install]');
  if(install){install.disabled=true;await installLocalSpeech(install.dataset.speechInstall);document.dispatchEvent(new CustomEvent('voca-speech-capability'));return;}
  if(event.target.closest?.('[data-speech-record]'))await startLocalSpeech();
});
