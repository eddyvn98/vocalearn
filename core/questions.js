import {normalize} from './grading.js';
import {opportunityId} from './opportunity.js';
import {isDue, dayAt} from './time.js';
import {maskMonolingualDefinition} from './language-profiles.js';

export const GAMES = ['flash','quiz','match','typing','spell','dictation','cloze','clozeChoice'];
export const MIX_GAMES = ['flash','quiz','typing','spell','dictation','cloze','clozeChoice'];
export const GAME_FACES = Object.freeze({
  flash:['meaning','word','ipa','image','audio'],
  quiz:['meaning','word','ipa','image','audio'],
  match:['word','meaning','ipa','image'],
  typing:['meaning','ipa','image'],
  spell:['audio'], dictation:['audio'],
  cloze:['sentence'], clozeChoice:['sentence'],
  mix:['meaning','word','ipa','image','audio','sentence'],
});
export const GAME_ANSWER_FACES = Object.freeze({
  flash:['word'], quiz:['word','meaning','ipa','image'],
  match:['word','meaning','ipa','image'], typing:['word'],
  spell:['word'], dictation:['word'], cloze:['word'], clozeChoice:['word'],
});
export const FACES = ['word','meaning','ipa','image','audio','sentence'];
export const usesAudio = q => ['spell','dictation'].includes(q.game) || q.face === 'audio';

export function defaultAnswerFace(game,face) {
  if(!['quiz','match'].includes(game))return GAME_ANSWER_FACES[game]?.[0]||'word';
  const allowed=GAME_ANSWER_FACES[game].filter(value=>value!==face);
  if(face==='word'&&allowed.includes('meaning'))return 'meaning';
  return allowed.includes('word')?'word':allowed[0];
}
export function answerFaces(game,face) {
  if(!['quiz','match'].includes(game))return GAME_ANSWER_FACES[game]||['word'];
  return (GAME_ANSWER_FACES[game]||[]).filter(value=>value!==face);
}
export function requiredGame(w) {
  if (w.review.phase === 'new') return 'flash';
  if (w.review.phase === 'relearn') return 'typing';
  return ['flash','quiz','spell','typing'][w.review.step];
}
const promptFace = (game, face) => GAME_FACES[game]?.length === 1 ? GAME_FACES[game][0] : face;
const valueFor=(w,face)=>w?.[face]||'';
function answerValue(w,game,answerFace) {
  if(game.startsWith('cloze'))return w.answers?.[0]||'';
  return ['quiz','match'].includes(game)?valueFor(w,answerFace):w.word;
}
function alternatives(w,pool,game,face,answerFace) {
  const cloze=game==='clozeChoice';
  const correct=cloze?(w.answers?.[0]||''):answerValue(w,game,answerFace);
  const seen=new Set([normalize(correct)]);
  return pool.filter(x=>!x.deleted&&x.setId===w.setId&&x.id!==w.id)
    .filter(x=>cloze||normalize(valueFor(x,face))!==normalize(valueFor(w,face)))
    .map(x=>cloze?x.word:answerValue(x,game,answerFace))
    .filter(x=>{const key=normalize(x);if(!key||seen.has(key))return false;seen.add(key);return true;});
}
export function reasons(w,game,face='meaning',pool=[],answerFace) {
  face=promptFace(game,face);
  if(!GAME_FACES[game]?.includes(face))return ['invalidFace'];
  if(!w.word||w.deleted||!w.ready&&game!=='flash')return ['missingPrompt'];
  if(!w[face]&&!['match','cloze','clozeChoice'].includes(game))
    return [face==='audio'?'missingAudio':face==='image'?'missingImage':'missingPrompt'];
  if(['quiz','match'].includes(game)) {
    const requested=answerFace===undefined?defaultAnswerFace(game,face):answerFace;
    if(!answerFaces(game,face).includes(requested))return ['invalidAnswerFace'];
    if(!valueFor(w,requested))return [requested==='image'?'missingImage':requested==='meaning'?'missingMeaning':'missingAnswerFace'];
    const promptKey=normalize(valueFor(w,face)),answerKey=normalize(valueFor(w,requested));
    if(pool.some(x=>x.id!==w.id&&!x.deleted&&normalize(valueFor(x,face))===promptKey
      &&normalize(valueFor(x,requested))&&normalize(valueFor(x,requested))!==answerKey))return ['ambiguousPrompt'];
    answerFace=requested;
  }
  if(['spell','dictation'].includes(game)&&!w.audio)return ['missingAudio'];
  if(['cloze','clozeChoice'].includes(game)&&(!w.sentence||w.sentence.split('___').length!==2||!w.answers?.length))
    return ['missingSentence'];
  if(game==='quiz'&&!alternatives(w,pool,game,face,answerFace).length)return ['missingChoices'];
  if(game==='clozeChoice'&&!alternatives(w,pool,game,face,'word').length)return ['missingChoices'];
  if(game==='match') {
    const prompt=normalize(valueFor(w,face)),answer=normalize(valueFor(w,answerFace));
    const other=pool.some(x=>x.id!==w.id&&!x.deleted&&normalize(valueFor(x,face))
      &&normalize(valueFor(x,answerFace))&&normalize(valueFor(x,face))!==prompt
      &&normalize(valueFor(x,answerFace))!==answer);
    if(!other)return ['missingChoices'];
  }
  return [];
}
export function availablePool(model,setId,scopeFn,mode,now) {
  return Object.values(model.words).filter(w=>!w.deleted&&w.setId===setId&&scopeFn(w)
    &&(mode==='review'?isDue(w.review,now,model.settings.zone)
      :mode==='new'?w.review.phase==='new':mode==='errors'?w.errors.inBook:true))
    .sort((a,b)=>String(a.review.dueDate||'').localeCompare(String(b.review.dueDate||''))
      ||(a.review.dueAt||0)-(b.review.dueAt||0)||a.id.localeCompare(b.id));
}
export function learningAllowed(model,scoped,now) {
  if(scoped.some(w=>w.ready&&isDue(w.review,now,model.settings.zone)))return 'reviewFirst';
  const day=dayAt(now,model.settings.zone);
  const used=Object.values(model.words).filter(w=>w.review.startedDay===day).length;
  return used>=model.settings.newLimit?'dailyLimit':null;
}
export function question(w,pool,game,face='meaning',mode='review',config={},uuid=()=>crypto.randomUUID(),answerFace,profile={}) {
  const learning=mode==='new'||mode==='review'&&w.review.phase!=='review';
  let fallback=null,familiarize=false;
  if(learning) {
    if(!w.ready)return {blocked:['missingPrompt'],wordId:w.id};
    face=w.meaning?'meaning':w.ipa?'ipa':'image';
    game=requiredGame(w);
    answerFace=defaultAnswerFace(game,face);
    if(game==='quiz'&&reasons(w,game,face,pool,answerFace).length) {
      game='flash';answerFace='word';fallback='missingChoices';familiarize=true;
    }
    if(game==='spell'&&!w.audio){game='typing';answerFace='word';fallback='missingAudio';}
    if(w.review.phase==='new')familiarize=true;
  }
  face=promptFace(game,face);
  answerFace=answerFace===undefined?defaultAnswerFace(game,face):answerFace;
  const why=reasons(w,game,face,pool,answerFace);
  if(why.length)return {blocked:why,wordId:w.id,game,face,answerFace};
  const answers=game.startsWith('cloze')?[...w.answers]:
    ['quiz','match'].includes(game)?[valueFor(w,answerFace)]:[w.word];
  let prompt=game.startsWith('cloze')?w.sentence:valueFor(w,face);
  if(profile.meaningMode==='monolingual'&&face==='meaning')
    prompt=maskMonolingualDefinition(prompt,w.word,w.variants);
  const choices=['quiz','clozeChoice'].includes(game)?[answers[0],...alternatives(w,pool,game,face,answerFace)].slice(0,4)
    .map((label,index)=>({label,correct:index===0,wordId:game==='quiz'
      ?(index===0?w.id:pool.find(x=>x.id!==w.id&&answerValue(x,game,answerFace)===label)?.id):undefined})):[];
  const rotation=w.word.length%Math.max(1,choices.length);choices.push(...choices.splice(0,rotation));
  const id=uuid(),eventId=uuid(),baseRev=w.review.rev;
  return {id,eventId,opportunityId:opportunityId({wordId:w.id,baseRev,mode,questionId:id}),
    wordId:w.id,baseRev,mode,game,face,answerFace,config:{...config},snapshot:structuredClone(w),
    prompt,answers,choices,fallback,familiarize,input:'',hadError:false,hint:false,retry:false,
    flipped:false,result:null,activeMs:0,interrupted:false,audioPlayed:false};
}
