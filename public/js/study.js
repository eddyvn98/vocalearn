import {app,current,words} from './state.js';
import {t,notify,modal,button,esc,closeModal} from './ui.js';
import {prepare,transact,transactAnswer,model,setMeta,getMeta,uuid} from './storage.js';
import {learningAllowed,usesAudio} from '/core/questions.js';
import {inScope} from '/core/model.js';
import {previewQueue,setup as setupDialog,applyStudySetup,saveStudySetup} from './study-setup.js';
import {checkAnswer,gradeAnswer} from '/core/grading.js';
import {pushHistory} from './navigation.js';
const inCurrentScope=w=>inScope(w,app.scope,app.model.categories);
let started=0;
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
    if(usesAudio(q)&&!q.audioPlayed)throw new Error(t('audioError'));
    const result=gradeAnswer({correct,game:q.game,hint:q.hint,hadError:q.hadError,
      activeMs:Math.round(q.activeMs),interrupted:q.interrupted,answer:q.answers[0],easyMs:q.config.easyMs});
    const next=structuredClone(app.session),target=next.queue.find(x=>x.id===q.id);
    target.result=result;if(!correct)target.hadError=true;
    next.error='';
    const data={schemaVersion:2,wordId:q.wordId,questionId:q.id,opportunityId:q.opportunityId,baseRev:q.baseRev,mode:q.mode,game:q.game,
      answerFace:q.answerFace,
      ...result,hadError:target.hadError,config:q.config,familiarize:q.familiarize,
      activeMs:Math.round(q.activeMs),input:q.input,face:q.face,hint:q.hint,interrupted:q.interrupted,
      unknown:!correct,selectedWordId:q.selectedWordId,question:{prompt:['image','audio'].includes(q.face)?`[${q.face}]`:q.prompt,answers:q.answers,
        word:q.snapshot.word,meaning:q.snapshot.meaning,fields:q.snapshot.fields}};
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
  } catch(error){app.session.error=t('saveError')+' '+error.message;app.render();throw error;}
  finally{submitting=false;}
}
export async function submitInput(value) {
  const q=current();if(!q||q.result||submitting)return;
  if(usesAudio(q)&&!q.audioPlayed)throw new Error(t('audioError'));
  q.input=value;
  const result=checkAnswer(value,q.answers,q.retry);
  if(result.kind==='empty'){q.inputError=t('inputFirst');app.render('#answer');return;}
  if(result.kind==='retry'&&q.game!=='spell'){
    q.hadError=true;q.retry=true;q.position=result.position;
    await transact([prepare('attempt',{wordId:q.wordId,questionId:q.id,wrong:true,input:value})],app.session);
    app.model=model();app.render('#answer');return;
  }
  await writeAnswer(q,result.kind==='correct');
}
export async function playAudio(slow=false) {
  const q=current(),audio=document.querySelector('#audio');
  if(!audio||q.result)return;
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
  if(action==='finish'){stopClock(true);app.session.finished=true;await setMeta('session',app.session);app.page='results';app.render();pushHistory();return;}
  if(!q)return;
  if(action==='playAudio'||action==='slowAudio')return playAudio(action==='slowAudio');
  if(action==='flip'){q.flipped=true;await setMeta('session',app.session);app.render();}
  if(action==='hint'){q.hint=true;await setMeta('session',app.session);app.render('#answer');}
  if(action==='unknown')await writeAnswer(q,false);
  if(action==='remember')await writeAnswer(q,true);
  if(action==='choose'){q.chosen=Number(element.dataset.index);q.input=q.choices[q.chosen].label;await writeAnswer(q,q.choices[q.chosen].correct);}
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
