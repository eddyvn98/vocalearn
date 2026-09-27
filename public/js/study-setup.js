import {app,words} from './state.js';
import {t,modal,button,notify} from './ui.js';
import {setMeta,uuid} from './storage.js';
import {availablePool,learningAllowed,question,GAMES,MIX_GAMES,FACES,GAME_ANSWER_FACES} from '/core/questions.js';
import {inScope} from '/core/model.js';
import {normalize} from '/core/grading.js';
import {studySetProfile} from '/core/language-profiles.js';
import {ensureSentencePool} from './sentence-pool.js';
import {speechAvailability} from './speech.js';

const inCurrentScope=w=>inScope(w,app.scope,app.model.categories);
const profile=()=>studySetProfile(app.model.sets[app.setId])||{};
const gameForProfile=game=>game==='speak'?speechAvailability(profile().id).available
  :game==='handwriting'?['zh','ja'].includes(profile().id)
  :!['tone','classifier'].includes(game)||profile().id==='zh';
const profileGames=()=>GAMES.filter(gameForProfile);
const profileMixGames=()=>MIX_GAMES.filter(gameForProfile);
const profileFaces=()=>FACES.filter(face=>{
  if(['pinyin','hanViet'].includes(face))return profile().id==='zh';
  if(face==='kana')return profile().id==='ja';
  return face!=='ipa'||profile().id==='en';
});
const answerFaceFor=game=>['quiz','match'].includes(game)?app.answerFace:undefined;
const enabledMix=()=>app.mixGames.filter(game=>profileMixGames().includes(game));

export function applyStudySetup(saved) {
  if(!saved||typeof saved!=='object')return;
  if(['mix',...profileGames()].includes(saved.game))app.game=saved.game;
  if(profileFaces().includes(saved.face))app.face=saved.face;
  if(['word','meaning','ipa','pinyin','kana','hanViet','image'].includes(saved.answerFace))app.answerFace=saved.answerFace;
  if(['trace','guided','memory'].includes(saved.handwritingLevel))app.handwritingLevel=saved.handwritingLevel;
  if(Array.isArray(saved.mixGames)){
    const games=[...new Set(saved.mixGames.filter(game=>profileMixGames().includes(game)))];
    app.mixGames=games;
  }
}
export const saveStudySetup=()=>setMeta('studySetup',{
  game:app.game,face:app.face,answerFace:app.answerFace,handwritingLevel:app.handwritingLevel,mixGames:[...app.mixGames]
});

function makeQuestion(w,pool,game) {
  const profile=studySetProfile(app.model.sets[app.setId]);
  const q=question(w,pool,game,app.face,app.mode,app.model.settings,uuid,answerFaceFor(game),profile||{});
  if(q.handwriting)q.handwriting.level=app.handwritingLevel;
  return q;
}
function matchQueue(pool) {
  const selected=pool.slice(0,6),seenPrompt=new Set(),seenAnswer=new Set();
  return selected.map(w=>{
    const q=makeQuestion(w,selected,'match');
    if(q.blocked)return q;
    const prompt=normalize(q.prompt),answer=normalize(q.answers[0]);
    if(seenPrompt.has(prompt)||seenAnswer.has(answer))
      return {blocked:['ambiguousMatch'],wordId:w.id,game:'match',face:app.face,answerFace:app.answerFace};
    seenPrompt.add(prompt);seenAnswer.add(answer);return q;
  });
}
function mixedQuestion(w,pool,index) {
  const learning=app.mode==='new'||app.mode==='review'&&w.review.phase!=='review';
  if(learning)return makeQuestion(w,pool,'flash');
  const games=enabledMix(),blocked=[];
  for(let n=0;n<games.length;n++){
    const game=games[(index+n)%games.length],candidate=makeQuestion(w,pool,game);
    if(!candidate.blocked)return candidate;
    blocked.push(...candidate.blocked);
  }
  return {blocked:[...new Set(blocked.length?blocked:['noMixGames'])],wordId:w.id,game:'mix'};
}
export function previewQueue() {
  const pool=availablePool(app.model,app.setId,inCurrentScope,app.mode,Date.now()),all=words();
  if(app.game==='match')return matchQueue(pool);
  return pool.map((w,index)=>app.game==='mix'?mixedQuestion(w,all,index):makeQuestion(w,all,app.game));
}
function reasonCounts(queue) {
  const counts=new Map();
  for(const q of queue)for(const reason of q.blocked||[])counts.set(reason,(counts.get(reason)||0)+1);
  return [...counts];
}
function gameStats(pool) {
  if(app.game!=='mix')return '';
  const games=enabledMix();
  if(!games.length)return `<p class="error-text">${t('noMixGames')}</p>`;
  return `<div class="setup-stats">${games.map(game=>{
    const valid=pool.filter(w=>!makeQuestion(w,words(),game).blocked).length;
    return `<p><strong>${valid}/${pool.length}</strong> ${t(game)}</p>`;
  }).join('')}</div>`;
}
function mixControls() {
  if(app.game!=='mix')return '';
  return `<fieldset><legend>${t('mixGames')}</legend><p class="muted small">${t('mixHelp')}</p>
    ${profileMixGames().map(game=>`<label class="check-label"><input type="checkbox" data-mix-game="${game}"
      ${app.mixGames.includes(game)?'checked':''}>${t(game)}</label>`).join('')}
    <p class="muted small">${t('matchSeparate')}</p></fieldset>`;
}
function faceControls() {
  if(app.mode==='new')return `<p class="info">${t('requiredLearningSetup')}</p>`;
  const level=app.game==='handwriting'?`<label>${t('handwritingLevel')}<select id="setup-handwriting-level">${['trace','guided','memory'].map(value=>`<option value="${value}" ${value===app.handwritingLevel?'selected':''}>${t('handwriting_'+value)}</option>`).join('')}</select></label>`:'';
  const face=`<label>${t('questionFace')}<select id="setup-face">${profileFaces().map(value=>
    `<option value="${value}" ${value===app.face?'selected':''}>${t(value)}</option>`).join('')}</select></label>`;
  if(!['mix','quiz','match'].includes(app.game))return face+level;
  const answerGame=app.game==='mix'?'quiz':app.game,answers=(GAME_ANSWER_FACES[answerGame]||[]).filter(value=>profileFaces().includes(value));
  return face+level+`<label>${t(app.game==='mix'?'quizAnswerFace':'answerFace')}<select id="setup-answer-face">${answers.map(value=>
    `<option value="${value}" ${value===app.answerFace?'selected':''}>${t(value)}</option>`).join('')}</select></label>`;
}
export function setup(mode=app.mode,game=app.game) {
  if(app.session&&!app.session.finished){notify(t('paused'));return;}
  app.mode=mode;app.game=game;
  const globalBlock=mode==='new'?learningAllowed(app.model,words().filter(inCurrentScope),Date.now()):null;
  const queue=previewQueue(),good=queue.filter(q=>!q.blocked),reasons=reasonCounts(queue);
  const limited=app.game==='match'&&good.length<2;
  const pool=availablePool(app.model,app.setId,inCurrentScope,app.mode,Date.now());
  const gamePicker=mode==='new'?'':`<label>${t('game')}<select id="setup-game">${['mix',...profileGames()].map(value=>
    `<option value="${value}" ${value===app.game?'selected':''}>${t(value)}</option>`).join('')}</select></label>`;
  modal(t('setup'),`<div class="stack"><p>${t(mode)} · ${t(mode==='free'||mode==='errors'?'noSchedule':'reviewHint')}</p>
    ${gamePicker}${mixControls()}${faceControls()}
    <p><strong>${good.length}/${queue.length}</strong> ${t('validCards')}</p>
    ${gameStats(pool)}
    ${reasons.map(([reason,count])=>`<p class="info"><strong>${count}</strong> · ${t(reason)}</p>`).join('')}
    ${globalBlock||limited?`<p class="error-text">${t(globalBlock||'missingChoices')}</p>`:''}
    ${button(t('start'),'startSession','primary full',!good.length||globalBlock||limited?'disabled':'')}</div>`);
  if(['cloze','clozeChoice'].includes(app.game)&&typeof navigator!=='undefined'&&navigator.onLine){
    const ids=[...new Set(queue.filter(q=>q.blocked?.includes('missingSentence')).map(q=>q.wordId))].slice(0,5);
    if(ids.length)Promise.allSettled(ids.map(wordId=>ensureSentencePool(wordId))).then(results=>{
      if(results.some(result=>result.status==='fulfilled'&&result.value)&&!app.session
        &&document.querySelector('#modal')?.open&&['cloze','clozeChoice'].includes(app.game))setup(app.mode,app.game);
    });
  }
}
