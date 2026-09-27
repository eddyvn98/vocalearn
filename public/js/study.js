import {app,current,words} from './state.js';
import {t,notify,modal,button,esc,closeModal} from './ui.js';
import {prepare,transact,model,setMeta,getMeta,uuid} from './storage.js';
import {availablePool,learningAllowed,question,GAMES,GAME_FACES,usesAudio} from '/core/questions.js';
import {inScope} from '/core/model.js';
import {checkAnswer,gradeAnswer} from '/core/grading.js';
const inCurrentScope=w=>inScope(w,app.scope,app.model.categories,app.scopeChildren);
const MIXABLE=['flash','quiz','typing','spell','dictation','cloze','clozeChoice'];
let started=0;
export async function restoreSetup() {
  const saved=await getMeta(`setup:${app.setId}`);
  if(!saved)return;
  if(saved.game&&['mix',...GAMES].includes(saved.game))app.game=saved.game;
  if(saved.face)app.face=saved.face;
  if(Array.isArray(saved.mixGames))app.mixGames=saved.mixGames.filter(g=>MIXABLE.includes(g));
}
function persistSetup() {
  setMeta(`setup:${app.setId}`,{game:app.game,face:app.face,mixGames:app.mixGames}).catch(()=>{});
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
export function previewQueue() {
  const pool=availablePool(app.model,app.setId,inCurrentScope,app.mode,Date.now());
  const all=words();
  const selected=app.game==='match'?pool.slice(0,6):pool;
  const seenWords=new Set(),seenMeanings=new Set();
  return selected.map((w,i)=>{
    if(app.game==='match'){
      const left=w.word?.toLowerCase(),right=w.meaning?.toLowerCase();
      if(seenWords.has(left)||seenMeanings.has(right))return {blocked:['ambiguousMatch'],wordId:w.id};
      seenWords.add(left);seenMeanings.add(right);
    }
    let game=app.game;
    if(game==='mix'){
      const choices=app.mixGames.length?app.mixGames:['typing'];
      for(let n=0;n<choices.length;n++){
        const candidate=question(w,all,choices[(i+n)%choices.length],app.face,app.mode,app.model.settings,uuid);
        if(!candidate.blocked)return candidate;
      }
      game='typing';
    }
    return question(w,app.game==='match'?selected:all,game,app.face,app.mode,app.model.settings,uuid);
  });
}
export function setup(mode=app.mode,game=app.game) {
  if(app.session&&!app.session.finished){notify(t('paused'));return;}
  app.mode=mode;app.game=game;
  if(!GAME_FACES[game]?.includes(app.face))app.face=GAME_FACES[game]?.[0]||'meaning';
  const blocked=mode==='new'?learningAllowed(app.model,words().filter(inCurrentScope),Date.now()):null;
  const queue=previewQueue(),good=queue.filter(q=>!q.blocked);
  const errors=[...new Set(queue.flatMap(q=>q.blocked||[]))];
  const limited=app.game==='match'&&good.length<2;
  modal(t('setup'),`<div class="stack"><p>${t(mode)} \u00b7 ${t(mode==='free'||mode==='errors'?'noSchedule':'reviewHint')}</p>
    ${mode==='new'?'':`<label>${t('game')}<select id="setup-game">${['mix',...GAMES].map(g=>`<option value="${g}" ${g===app.game?'selected':''}>${t(g)}</option>`).join('')}</select></label>`}
    <label ${['mix','typing','flash','quiz'].includes(app.game)?'':'hidden'}>${t('face')}<select id="setup-face">${(GAME_FACES[app.game]||[]).map(f=>`<option value="${f}" ${f===app.face?'selected':''}>${t(f)}</option>`).join('')}</select></label>
    ${app.game==='mix'?`<fieldset><legend>${t('mixGames')}</legend><div class="row wrap">${MIXABLE.map(g=>`<label class="check-label"><input type="checkbox" data-mix-game="${g}" ${app.mixGames.includes(g)?'checked':''}>${t(g)}</label>`).join('')}</div></fieldset>`:''}
    <p><strong>${good.length}/${queue.length}</strong> ${t('validCards')}</p>${errors.map(e=>`<p class="info">${t(e)}</p>`).join('')}
    ${blocked||limited?`<p class="error-text">${t(blocked||'missingChoices')}</p>`:''}
    ${button(t('start'),'startSession','primary full',!good.length||blocked||limited?'disabled':'')}</div>`);
}
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
    matchOrder:queue.map((_,i)=>i).reverse(),selected:null,error:''};
  await setMeta('session',session);app.session=session;closeModal();app.page='study';app.render();startClock();
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
    const data={schemaVersion:2,wordId:q.wordId,questionId:q.id,baseRev:q.baseRev,mode:q.mode,game:q.game,
      ...result,hadError:target.hadError,config:q.config,familiarize:q.familiarize,
      activeMs:Math.round(q.activeMs),input:q.input,face:q.face,hint:q.hint,interrupted:q.interrupted,
      unknown:!correct,selectedWordId:q.selectedWordId,question:{prompt:['image','audio'].includes(q.face)?`[${q.face}]`:q.prompt,answers:q.answers,
        word:q.snapshot.word,meaning:q.snapshot.meaning,fields:q.snapshot.fields}};
    const event=q.pendingAnswer || prepare('answer',data,q.eventId);
    q.pendingAnswer=event;target.hadError=event.data.hadError;target.result={grade:event.data.grade,assisted:event.data.assisted};
    delete target.pendingAnswer;
    await transact([event],next);app.session=next;app.model=model();app.render('#feedback');
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
  if(action==='resume'){app.page='study';app.setId=app.session.setId;app.render();startClock();return;}
  if(action==='pause'){stopClock(true);await setMeta('session',app.session);app.page='home';app.render();return;}
  if(action==='finish'){stopClock(true);app.session.finished=true;await setMeta('session',app.session);app.page='results';app.render();return;}
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
