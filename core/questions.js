import {normalize} from './grading.js';
import {opportunityId} from './opportunity.js';
import {isDue, dayAt} from './time.js';
import {maskMonolingualDefinition} from './language-profiles.js';
import {twoStepFor} from './script-typing.js';
import {toneQuestion,classifierQuestion} from './chinese-games.js';
import {selectWordSentence,clozeFromSentence} from './sentences.js';

export const GAMES = ['flash','quiz','match','typing','spell','dictation','cloze','clozeChoice','tone','classifier','handwriting','speak'];
export const MIX_GAMES = ['flash','quiz','typing','spell','dictation','cloze','clozeChoice','tone','classifier','handwriting','speak'];
export const GAME_FACES = Object.freeze({
  flash:['meaning','word','ipa','pinyin','kana','hanViet','image','audio'],
  quiz:['meaning','word','ipa','pinyin','kana','hanViet','image','audio'],
  match:['word','meaning','ipa','pinyin','kana','hanViet','image'],
  typing:['meaning','ipa','pinyin','kana','hanViet','image'],
  spell:['audio'], dictation:['audio'],
  cloze:['sentence'], clozeChoice:['sentence'],
  tone:['pinyin'], classifier:['word','meaning'], handwriting:['meaning','image'], speak:['word'],
  mix:['meaning','word','ipa','pinyin','kana','hanViet','image','audio','sentence'],
});
export const GAME_ANSWER_FACES = Object.freeze({
  flash:['word'], quiz:['word','meaning','ipa','pinyin','kana','hanViet','image'],
  match:['word','meaning','ipa','pinyin','kana','hanViet','image'], typing:['word'],
  spell:['word'], dictation:['word'], cloze:['word'], clozeChoice:['word'], tone:['word'], classifier:['word'], handwriting:['word'], speak:['word'],
});
export const FACES = ['word','meaning','ipa','pinyin','kana','hanViet','image','audio','sentence'];
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
const valueFor=(w,face)=>face==='pinyin'?(w?.pinyin||w?.ipa||''):face==='kana'?(w?.kana||w?.ipa||''):w?.[face]||'';
const readingConfirmed=(w,field)=>w?.lookupMeta?.[field]?.confirmed!==false;
function answerValue(w,game,answerFace) {
  if(game.startsWith('cloze'))return w.word||'';
  return ['quiz','match'].includes(game)?valueFor(w,answerFace):w.word;
}
function clozeData(w){
  const picked=selectWordSentence(w),data=clozeFromSentence(picked.sentence);
  return data?{...data,reused:picked.reused,needsRefill:picked.needsRefill}:null;
}
function alternatives(w,pool,game,face,answerFace,correctOverride='') {
  const cloze=game==='clozeChoice';
  const correct=cloze?correctOverride:answerValue(w,game,answerFace);
  const seen=new Set([normalize(correct)]);
  return pool.filter(x=>!x.deleted&&x.setId===w.setId&&x.id!==w.id)
    .filter(x=>cloze||normalize(valueFor(x,face))!==normalize(valueFor(w,face)))
    .map(x=>cloze?x.word:answerValue(x,game,answerFace))
    .filter(x=>{const key=normalize(x);if(!key||seen.has(key))return false;seen.add(key);return true;});
}
export function reasons(w,game,face='meaning',pool=[],answerFace,profile={}) {
  if(game==='tone')return w?.pinyinSyllables?.length&&readingConfirmed(w,'pinyin')?[]:['missingToneData'];
  if(game==='classifier')return w?.classifiers?.length?[]:['missingClassifierData'];
  if(game==='handwriting'){
    if(!['zh','ja'].includes(profile.id))return ['unsupportedGame'];
    const data=w?.strokeData,chars=[...String(w?.word||'')];
    if(!data?.complete||data.language!==profile.id||data.characters?.length!==chars.length
      ||data.characters.some((item,index)=>item.char!==chars[index]))return ['missingStrokeData'];
  }
  if(game==='typing'&&['zh','ja'].includes(profile.id)){
    const readingField=profile.id==='zh'?'pinyin':'kana';
    if(!readingConfirmed(w,readingField))return ['missingReading'];
    const flow=twoStepFor(w,pool,game,face,profile.id);
    if(flow?.blocked)return [flow.blocked];
  }
  face=promptFace(game,face);
  if(!GAME_FACES[game]?.includes(face))return ['invalidFace'];
  if(['ipa','pinyin','kana','hanViet'].includes(face)&&!readingConfirmed(w,face))return ['missingReading'];
  if(!w.word||w.deleted||!w.ready&&game!=='flash')return ['missingPrompt'];
  if(!w[face]&&!['match','cloze','clozeChoice'].includes(game))
    return [face==='audio'?'missingAudio':face==='image'?'missingImage':'missingPrompt'];
  if(['quiz','match'].includes(game)) {
    const requested=answerFace===undefined?defaultAnswerFace(game,face):answerFace;
    if(!answerFaces(game,face).includes(requested))return ['invalidAnswerFace'];
    if(['ipa','pinyin','kana','hanViet'].includes(requested)&&!readingConfirmed(w,requested))return ['missingAnswerFace'];
    if(!valueFor(w,requested))return [requested==='image'?'missingImage':requested==='meaning'?'missingMeaning':'missingAnswerFace'];
    const promptKey=normalize(valueFor(w,face)),answerKey=normalize(valueFor(w,requested));
    if(pool.some(x=>x.id!==w.id&&!x.deleted&&normalize(valueFor(x,face))===promptKey
      &&normalize(valueFor(x,requested))&&normalize(valueFor(x,requested))!==answerKey))return ['ambiguousPrompt'];
    answerFace=requested;
  }
  if(['spell','dictation'].includes(game)&&!w.audio)return ['missingAudio'];
  const cloze=['cloze','clozeChoice'].includes(game)?clozeData(w):null;
  if(['cloze','clozeChoice'].includes(game)&&!cloze)return ['missingSentence'];
  if(game==='quiz'&&!alternatives(w,pool,game,face,answerFace).length)return ['missingChoices'];
  if(game==='clozeChoice'&&!alternatives(w,pool,game,face,'word',cloze.answers[0]).length)return ['missingChoices'];
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
export function dailyNewUsage(model,now) {
  const day=dayAt(now,model.settings.zone),limit=model.settings.newLimit;
  const started=Object.values(model.words).filter(w=>w.review.startedDay===day).length;
  return {day,started,limit,remaining:Math.max(0,limit-started),overflow:Math.max(0,started-limit)};
}
export function learningAllowed(model,scoped,now) {
  if(scoped.some(w=>w.ready&&isDue(w.review,now,model.settings.zone)))return 'reviewFirst';
  const usage=dailyNewUsage(model,now);
  return usage.started>=usage.limit?'dailyLimit':null;
}
export function question(w,pool,game,face='meaning',mode='review',config={},uuid=()=>crypto.randomUUID(),answerFace,profile={}) {
  const learning=mode==='new'||mode==='review'&&w.review.phase!=='review';
  let fallback=null,familiarize=false;
  if(learning) {
    if(!w.ready)return {blocked:['missingPrompt'],wordId:w.id};
    face=w.meaning?'meaning':w.ipa?'ipa':'image';
    game=requiredGame(w);
    answerFace=defaultAnswerFace(game,face);
    if(game==='quiz'&&reasons(w,game,face,pool,answerFace,profile).length) {
      game='flash';answerFace='word';fallback='missingChoices';familiarize=true;
    }
    if(game==='spell'&&!w.audio){game='typing';answerFace='word';fallback='missingAudio';}
    if(w.review.phase==='new')familiarize=true;
  }
  face=promptFace(game,face);
  answerFace=answerFace===undefined?defaultAnswerFace(game,face):answerFace;
  const why=reasons(w,game,face,pool,answerFace,profile);
  if(why.length)return {blocked:why,wordId:w.id,game,face,answerFace};
  const tone=game==='tone'?toneQuestion(w.pinyinSyllables,w.audio||null):null;
  const classifier=game==='classifier'?classifierQuestion(w):null;
  const twoStep=game==='typing'&&['zh','ja'].includes(profile.id)?twoStepFor(w,pool,game,face,profile.id):null;
  const handwriting=game==='handwriting'?{language:profile.id,level:'guided',strokeData:structuredClone(w.strokeData)}:null;
  const speech=game==='speak'?{language:profile.id}:null;
  const cloze=game.startsWith('cloze')?clozeData(w):null;
  const answers=cloze?[...cloze.answers]:
    ['quiz','match'].includes(game)?[valueFor(w,answerFace)]:game==='classifier'?[...(classifier?.answers||[])]:[w.word];
  let prompt=cloze?cloze.prompt:game==='tone'
    ?tone.syllables.map(s=>s.base).join(' '):game==='classifier'?classifier.prompt:valueFor(w,face);
  if(profile.meaningMode==='monolingual'&&face==='meaning')
    prompt=maskMonolingualDefinition(prompt,w.word,w.variants);
  const choices=['quiz','clozeChoice'].includes(game)?[answers[0],...alternatives(w,pool,game,face,answerFace,cloze?.answers?.[0]||'')].slice(0,4)
    .map((label,index)=>({label,correct:index===0,wordId:game==='quiz'
      ?(index===0?w.id:pool.find(x=>x.id!==w.id&&answerValue(x,game,answerFace)===label)?.id):undefined})):[];
  const rotation=w.word.length%Math.max(1,choices.length);choices.push(...choices.splice(0,rotation));
  const id=uuid(),eventId=uuid(),baseRev=w.review.rev;
  return {id,eventId,opportunityId:opportunityId({wordId:w.id,baseRev,mode,questionId:id}),
    wordId:w.id,baseRev,mode,game,face,answerFace,config:{...config},snapshot:structuredClone(w),
    prompt,answers,choices,tone,classifier,twoStep,handwriting,speech,sentenceId:cloze?.sentenceId||'',sentenceNeedsRefill:cloze?.needsRefill||false,
    sentenceReused:cloze?.reused||false,fallback,familiarize,input:'',hadError:false,hint:false,retry:false,
    flipped:false,result:null,activeMs:0,interrupted:false,audioPlayed:false};
}
