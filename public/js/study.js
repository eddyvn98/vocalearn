import {app,current,words} from './state.js';
import {t,notify,modal,button,esc,closeModal} from './ui.js';
import {prepare,transact,transactAnswer,model,setMeta,getMeta,uuid} from './storage.js';
import {learningAllowed,usesAudio} from '/core/questions.js';
import {inScope} from '/core/model.js';
import {previewQueue,setup as setupDialog,applyStudySetup,saveStudySetup} from './study-setup.js';
import {checkAnswer,gradeAnswer} from '/core/grading.js';
import {pushHistory} from './navigation.js';
import {mediaBlob,mediaUrl} from './media-store.js';
import {sessionBaseline} from '/core/session-summary.js';
import {readingMatches,twoStepSnapshot} from '/core/script-typing.js';
import {gradeTones,gradeClassifier} from '/core/chinese-games.js';
import {ensureSentencePool} from './sentence-pool.js';
import {handwritingAction,setHandwritingResultHandler} from './handwriting-ui.js';
import {speechAttempt} from '/core/capabilities.js';
import {studySetProfile} from '/core/language-profiles.js';
import {recognizeSpeech} from './speech.js';
const inCurrentScope=w=>inScope(w,app.scope,app.model.categories);
let started=0;
setHandwritingResultHandler(async correct=>{const q=current();if(!q||q.result)return;q.input='[handwriting]';await writeAnswer(q,correct);});
async function ensureQuestionMedia(q,allMatch=false) {
  const values=[];
  if(q?.face==='image'){
    if(allMatch)for(const item of app.session.queue)values.push(item.prompt);
    else values.push(q.prompt);
  }
  if(q?.answerFace==='image'){
    if(allMatch)for(const item of app.session.queue)values.push(item.answers?.[0]);
    else if(q.game==='quiz')for(const choice of q.choices||[])values.push(choice.label);
    else values.push(q.answers?.[0]);
  }
  if(usesAudio(q))values.push(q.snapshot.audio);
  try{for(const value of values.filter(Boolean))await mediaBlob(value);}
  catch{app.session.error=t('mediaUnavailable');app.render();throw new Error(t('mediaUnavailable'));}
}
export function startClock() {
  const q=current();
  started=q&&!q.result&&(!usesAudio(q)||q.audioPlayed)?performance.now():0;
}
export function stopClock(interrupt=false) {
  const q=current();
  if(q&&!q.result){if(started)q.activeMs+=performance.now()-started;if(interrupt)q.interrupted=true;}
  started=0;
}
export {applyStudySetup,saveStudySetup};
export function setup(mode=app.mode,game=app.game){return setupDialog(mode,game);}
export async function beginSession() {
  if(app.mode==='new'&&learningAllowed(app.model,words().filter(inCurrentScope),Date.now()))return;
  let queue=previewQueue().filter(q=>!q.blocked);
  if(app.mode==='new'){
    const day=(await import('/core/time.js')).dayAt(Date.now(),app.model.settings.zone);
    const used=Object.values(app.model.words).filter(w=>w.review.startedDay===day).length;
    queue=queue.slice(0,Math.max(0,app.model.settings.newLimit-used));
  }
  if(!queue.length)return;
  const session={id:uuid(),setId:app.setId,mode:app.mode,queue,index:0,finished:false,match:queue.every(q=>q.game==='match'),
    baseline:sessionBaseline(app.model,queue),
    setup:{game:app.game,face:app.face,answerFace:app.answerFace,mixGames:[...app.mixGames]},
    matchOrder:queue.map((_,i)=>i).reverse(),selected:null,error:''};
  await setMeta('session',session);app.session=session;closeModal();app.page='study';app.render();pushHistory();startClock();
}
let submitting=false;
async function writeAnswer(q,correct) {
  if(submitting||q.result)return;
  submitting=true;
  try {
    stopClock();
    await ensureQuestionMedia(q);
    if(usesAudio(q)&&!q.audioPlayed)throw new Error(t('audioError'));
    const result=gradeAnswer({correct,game:q.game,hint:q.hint,hadError:q.hadError,gradeCap:q.twoStep?.gradeCap,
      activeMs:Math.round(q.activeMs),interrupted:q.interrupted,answer:q.answers[0],easyMs:q.config.easyMs});
    const next=structuredClone(app.session),target=next.queue.find(x=>x.id===q.id);
    target.result=result;if(!correct)target.hadError=true;
    next.error='';
    const data={schemaVersion:2,wordId:q.wordId,questionId:q.id,opportunityId:q.opportunityId,baseRev:q.baseRev,mode:q.mode,game:q.game,
      answerFace:q.answerFace,...(q.sentenceId?{sentenceId:q.sentenceId}:{}),
      ...result,hadError:target.hadError,config:q.config,familiarize:q.familiarize,
      activeMs:Math.round(q.activeMs),input:q.input,readingInput:q.twoStep?.readingInput||'',selectedForm:q.twoStep?.selected||'',face:q.face,hint:q.hint,interrupted:q.interrupted,
      unknown:!correct,selectedWordId:q.selectedWordId,question:{prompt:['image','audio'].includes(q.face)?`[${q.face}]`:q.prompt,answers:q.answers,
        word:q.snapshot.word,meaning:q.snapshot.meaning,fields:q.snapshot.fields,twoStep:twoStepSnapshot(q.twoStep)}};
    const event=q.pendingAnswer || prepare('answer',data,q.eventId);
    q.pendingAnswer=event;target.hadError=event.data.hadError;target.result={grade:event.data.grade,assisted:event.data.assisted};
    delete target.pendingAnswer;
    const recorded=await transactAnswer(event,next);
    if(recorded.inserted)app.session=next;
    else {
      const latest=await getMeta('session');
      if(latest?.id===app.session.id)app.session=latest;
      else {
        const winner=recorded.event.data;
        target.hadError=winner.hadError;target.result={grade:winner.grade,assisted:winner.assisted};
        next.error=t('answeredElsewhere');await setMeta('session',next);app.session=next;
      }
      notify(t('answeredElsewhere'));
    }
    app.model=model();app.render('#feedback');
    if(q.sentenceNeedsRefill)ensureSentencePool(q.wordId,{force:true}).catch(()=>{});
  } catch(error){app.session.error=t('saveError')+' '+error.message;app.render();throw error;}
  finally{submitting=false;}
}
export async function submitInput(value) {
  const q=current();if(!q||q.result||submitting)return;
  await ensureQuestionMedia(q);
  if(usesAudio(q)&&!q.audioPlayed)throw new Error(t('audioError'));
  q.input=value;
  if(q.twoStep&&q.twoStep.readingRequired&&!q.twoStep.readingPassed){
    q.twoStep.readingInput=value;
    if(readingMatches(q.twoStep.profileId,value,q.twoStep.reading,q.snapshot.word)){
      q.twoStep.readingPassed=true;q.retry=false;q.input='';q.inputError='';
      if(q.twoStep.mode==='skip'){q.twoStep.selected=q.snapshot.word;q.input=q.snapshot.word;return writeAnswer(q,true);}
      await setMeta('session',app.session);app.render('#answer');return;
    }
    const readingResult=checkAnswer(value,[q.twoStep.reading],q.retry);
    if(readingResult.kind==='empty'){q.inputError=t('inputFirst');app.render('#answer');return;}
    if(readingResult.kind==='retry'){
      q.hadError=true;q.retry=true;q.position=readingResult.position;
      await transact([prepare('attempt',{wordId:q.wordId,questionId:q.id,wrong:true,input:value})],app.session);
      app.model=model();app.render('#answer');return;
    }
    return writeAnswer(q,false);
  }
  const result=checkAnswer(value,q.answers,q.retry);
  if(result.kind==='empty'){q.inputError=t('inputFirst');app.render('#answer');return;}
  if(result.kind==='retry'&&q.game!=='spell'){
    q.hadError=true;q.retry=true;q.position=result.position;
    await transact([prepare('attempt',{wordId:q.wordId,questionId:q.id,wrong:true,input:value})],app.session);
    app.model=model();app.render('#answer');return;
  }
  await writeAnswer(q,result.kind==='correct');
}
async function runSpeech(q){
  if(q.result||q.speechBusy)return;
  q.speechBusy=true;q.speechPhase='recording';q.speechMessage='';stopClock();
  await setMeta('session',app.session);app.render();
  const language=studySetProfile(app.model.sets[app.setId])?.id||'en';
  const recognized=await recognizeSpeech(language,phase=>{q.speechPhase=phase;setMeta('session',app.session).then(()=>app.render()).catch(()=>{});});
  q.speechBusy=false;
  if(recognized.kind==='technical'){
    q.speechState=speechAttempt(q.speechState,{kind:'technical',code:recognized.code});
    q.speechPhase='ready';q.speechMessage=recognized.code||'speechTechnical';
    await setMeta('session',app.session);app.render();startClock();return;
  }
  q.speechPhase='ready';q.input=recognized.transcript;q.activeMs+=(recognized.activeMs||0);
  const correct=checkAnswer(recognized.transcript,q.answers,true).kind==='correct';
  q.speechState=speechAttempt(q.speechState,{kind:'recognition',correct});
  if(!correct)q.hadError=true;
  if(q.speechState.final)return writeAnswer(q,q.speechState.final.correct);
  await transact([prepare('attempt',{wordId:q.wordId,questionId:q.id,wrong:true,input:recognized.transcript,transcript:recognized.transcript})],app.session);
  app.model=model();await setMeta('session',app.session);app.render();startClock();
}

export async function playAudio(slow=false) {
  const q=current(),audio=document.querySelector('#audio');
  if(!audio||q.result)return;
  try{audio.src=await mediaUrl(q.snapshot.audio);}
  catch{app.session.error=t('mediaUnavailable');app.render();return;}
  if(q.audioPlayed||slow)q.hint=true;
  stopClock();audio.onerror=()=>{app.session.error=t('audioError');app.render();};audio.playbackRate=slow ? 0.75 : 1;
  audio.onended=async()=>{q.audioPlayed=true;await setMeta('session',app.session);app.render('#answer');startClock();};
  try{await audio.play();}catch{app.session.error=t('audioError');app.render();}
}
export async function studyAction(action,element) {
  const q=current();
  if(action==='startSession')return beginSession();
  if(action==='resume'){app.page='study';app.setId=app.session.setId;app.render();pushHistory();startClock();return;}
  if(action==='pause'){stopClock(true);await setMeta('session',app.session);app.page='home';app.render();pushHistory();return;}
  if(action==='finish'){stopClock(true);app.session.finished=true;await setMeta('session',app.session);app.page='results';await setMeta('view',{setId:app.setId,scope:app.scope,page:app.page,filter:app.filter,query:app.query});app.render();pushHistory();return;}
  if(!q)return;
  if(action==='playAudio'||action==='slowAudio')return playAudio(action==='slowAudio');
  if(action==='speechStart')return runSpeech(q);
  if(action.startsWith('handwriting'))return handwritingAction(action,q);
  if(['flip','unknown','remember','choose','toneChoice','checkTones','classifierChoice','formChoice','letter','checkLetters','matchLeft','matchRight'].includes(action))
    await ensureQuestionMedia(action.startsWith('match')?app.session.queue[app.session.selected??0]:q,app.session.match);
  if(action==='flip'){q.flipped=true;await setMeta('session',app.session);app.render();}
  if(action==='hint'){q.hint=true;await setMeta('session',app.session);app.render('#answer');}
  if(action==='unknown')await writeAnswer(q,false);
  if(action==='remember')await writeAnswer(q,true);
  if(action==='choose'){q.chosen=Number(element.dataset.index);const choice=q.choices[q.chosen];q.selectedWordId=choice.wordId;q.input=q.answerFace==='image'?'[image]':choice.label;await writeAnswer(q,choice.correct);}
  if(action==='toneChoice'){
    const index=Number(element.dataset.index),tone=Number(element.dataset.tone);
    q.toneAnswers??=Array(q.tone.syllables.length).fill(null);q.toneAnswers[index]=tone;
    await setMeta('session',app.session);app.render();
  }
  if(action==='checkTones'){q.input=(q.toneAnswers||[]).join(',');await writeAnswer(q,gradeTones(q.tone,q.toneAnswers||[]));}
  if(action==='classifierChoice'){q.input=element.dataset.value||'';await writeAnswer(q,gradeClassifier(q.classifier,q.input));}
  if(action==='formChoice'){q.twoStep.selected=element.dataset.value||'';q.input=q.twoStep.selected;await writeAnswer(q,q.twoStep.selected===q.snapshot.word);}
  if(action==='next'){
    if(!q.result)return;
    if(app.session.index+1>=app.session.queue.length)return studyAction('finish');
    app.session.index++;await setMeta('session',app.session);app.render('#answer');startClock();
  }
  if(action==='letter'){(q.letters??=[]).push(Number(element.dataset.index));await setMeta('session',app.session);app.render();}
  if(action==='clearLetters'){q.letters=[];await setMeta('session',app.session);app.render();}
  if(action==='checkLetters')await submitInput((q.letters||[]).map(i=>Array.from(q.snapshot.word)[i]).join(''));
  if(action==='matchLeft'){app.session.selected=Number(element.dataset.index);app.render();}
  if(action==='matchRight'&&app.session.selected!==null){
    const target=app.session.queue[app.session.selected];
    if(target.wordId===element.dataset.id){target.selectedWordId=element.dataset.id;await writeAnswer(target,true);app.session.selected=null;app.session.matchMessage='';}
    else{target.hadError=true;app.session.matchMessage=t('wrong');await transact([prepare('attempt',{wordId:target.wordId,questionId:target.id,wrong:true})],app.session);app.model=model();}
    await setMeta('session',app.session);app.render();
  }
}
