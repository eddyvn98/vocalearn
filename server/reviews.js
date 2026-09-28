import {gradeAnswer,normalize} from '../core/grading.js';
import {DEFAULTS,scheduleFor} from '../core/srs.js';
import {question as makeQuestion,GAME_FACES,reasons} from '../core/questions.js';
import {classifierQuestion,toneQuestion} from '../core/chinese-games.js';
import {readingMatches,twoStepFor,twoStepSnapshot} from '../core/script-typing.js';
import {contentVersion,sentencePrompt} from '../core/sentences.js';
import {isDue} from '../core/time.js';
import {WORD_FIELDS} from '../core/validation.js';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function snapshotFor(current, q, events) {
  if(!q || typeof q !== 'object' || !Array.isArray(q.answers) || !q.answers.length)throw new Error('Missing question snapshot');
  if(!q.fields) {
    // Compatibility with older pending records: only current, matching content is accepted.
    if(q.word!==current.word)throw new Error('Question snapshot word mismatch');
    return {...current};
  }
  const snapshot={id:current.id,setId:current.setId,fields:q.fields,deleted:false};
  for(const [field,id] of Object.entries(q.fields)) {
    if(!WORD_FIELDS.has(field))throw new Error('Invalid snapshot field');
    const origin=events.find(e=>e.id===id && e.kind==='word' && e.data.id===current.id && Object.hasOwn(e.data.patch,field));
    if(!origin)throw new Error('Unknown snapshot field revision');
    snapshot[field]=origin.data.patch[field];
  }
  if(snapshot.word!==q.word || (q.meaning!==undefined && snapshot.meaning!==q.meaning))throw new Error('Question snapshot mismatch');
  snapshot.ready=!!(snapshot.word && (snapshot.meaning||snapshot.ipa||snapshot.image));
  return snapshot;
}
function validConfig(config, events) {
  const requested={...DEFAULTS,...config}, known={...DEFAULTS};
  const equal=()=>Object.keys(DEFAULTS).every(k=>known[k]===requested[k]);
  if(equal())return true;
  for(const e of events)if(e.kind==='settings'){Object.assign(known,e.data);if(equal())return true;}
  return false;
}
export function validateReview(state, event, events) {
  const d=event.data,current=state.words[d.wordId],snapshot=snapshotFor(current,d.question,events);
  const profileId=state.sets[current.setId]?.language||'en';
  const withSentences=word=>({...word,sentencePool:Object.values(state.sentences||{}).filter(sentence=>sentence.wordId===word.id)});
  Object.assign(snapshot,withSentences(snapshot));
  const pool=Object.values(state.words).filter(w=>!w.deleted&&w.setId===current.setId).map(w=>withSentences(w.id===snapshot.id?snapshot:w));
  if(d.schemaVersion===2 && !d.question.fields)throw new Error('Missing content revisions');
  if(!validConfig(d.config,events))throw new Error('Unknown configuration snapshot');
  if(!Number.isFinite(d.activeMs)||d.activeMs<0||d.activeMs>7*86400000)throw new Error('Invalid active time');
  const input=d.input ?? '';
  if(typeof input!=='string'||input.length>5000)throw new Error('Invalid answer input');
  const face=d.face || (d.game.startsWith('cloze')?'sentence':d.game==='match'?'word':
    d.question.prompt===snapshot.word && d.game==='quiz'?'word':'meaning');
  if(d.schemaVersion===2 && !GAME_FACES[d.game]?.includes(face))throw new Error('Invalid game face');
  if(d.schemaVersion===2 && !snapshot[face] && face!=='sentence')throw new Error('Missing question resource');
  const selectedSentence=d.game.startsWith('cloze')&&d.question.sentenceId?state.sentences?.[d.question.sentenceId]:null;
  if(d.question.sentenceId&&(!selectedSentence||selectedSentence.deleted||selectedSentence.wordId!==snapshot.id||selectedSentence.wordContentVersion!==contentVersion(snapshot)))
    throw new Error('Unknown or stale sentence snapshot');
  const answers=d.game.startsWith('cloze') ? (selectedSentence?.acceptedAnswers||snapshot.answers) : d.game==='tone' ? (snapshot.pinyinSyllables||[]).map(x=>String(x.tone))
    : d.game==='classifier' ? (snapshot.classifiers||[]) : d.game==='quiz'&&face==='word' ? [snapshot.meaning] : [snapshot.word];
  if(!Array.isArray(answers)||answers.some(a=>typeof a!=='string'||!a.trim())||!same(d.question.answers,answers))throw new Error('Question answer key mismatch');
  const prompt=['image','audio'].includes(face)?`[${face}]`:d.game.startsWith('cloze')?(selectedSentence?sentencePrompt(selectedSentence):snapshot.sentence):d.game==='match'?snapshot.word:
    d.game==='tone'?toneQuestion(snapshot.pinyinSyllables||[])?.syllables.map(s=>s.base).join(' '):
    d.game==='classifier'?classifierQuestion(snapshot)?.prompt:snapshot[face];
  if(d.schemaVersion===2 && d.question.prompt!==prompt)throw new Error('Question prompt mismatch');
  const twoStep=twoStepFor(snapshot,pool,d.game,face,profileId);
  if(d.schemaVersion===2&&!same(d.question.twoStep??null,twoStepSnapshot(twoStep)))throw new Error('Question two-step mismatch');
  const attempts=events.filter(e=>e.kind==='attempt'&&e.data.questionId===d.questionId);
  if(attempts.some(e=>e.data.wordId!==d.wordId))throw new Error('Question belongs to another word');
  if(attempts.some(e=>e.data.wrong)&&!d.hadError)throw new Error('Cannot erase a recorded failed attempt');
  const unknown=d.unknown===true || d.schemaVersion!==2 && d.grade==='forget';
  let correct=!unknown && answers.some(a=>normalize(a)===normalize(input));
  if(d.game==='tone')correct=!unknown&&same(String(input).split(',').map(x=>x.trim()),answers);
  if(twoStep&&!twoStep.blocked){
    const readingOk=!twoStep.readingRequired||readingMatches(profileId,d.readingInput||'',twoStep.reading,snapshot.word);
    const formOk=normalize(input)===normalize(snapshot.word);
    correct=!unknown&&readingOk&&formOk;
    if(d.selectedForm&&normalize(d.selectedForm)!==normalize(input))throw new Error('Selected form mismatch');
  }
  if(d.game==='flash')correct=!unknown;
  if(d.game==='match')correct=!unknown && (d.selectedWordId===d.wordId || d.schemaVersion!==2 && d.grade!=='forget');
  const expected=gradeAnswer({correct,game:d.game,hint:d.hint||false,hadError:d.hadError,gradeCap:twoStep?.gradeCap,
    activeMs:d.activeMs,interrupted:d.interrupted||false,answer:answers[0],easyMs:d.config?.easyMs});
  if(expected.grade!==d.grade||expected.assisted!==d.assisted)throw new Error('Grade does not match the recorded response');
  if(!correct&&!d.hadError)throw new Error('Incorrect response must record an error');
  if(['free','errors'].includes(d.mode))return;
  const reset=events.findLastIndex(e=>e.kind==='resetWord'&&e.data.id===current.id);
  const related=events.slice(reset+1).filter(e=>e.data.wordId===current.id);
  const bestFace=snapshot.meaning?'meaning':profileId==='zh'&&snapshot.pinyin?'pinyin':profileId==='ja'&&snapshot.kana?'kana':snapshot.ipa?'ipa':'image';
  event.reviewGate={ready:!!snapshot.ready,hasAudio:!!snapshot.audio,quizAvailable:!reasons(snapshot,'quiz',bestFace,pool,profileId).length};
  const history=scheduleFor(current.generation,related),base=history.states.get(d.baseRev);
  if(!base) {
    // A child may arrive before its parent. Replay gates it when that parent exists.
    // Unresolved/invalidated descendants remain logged without advancing the schedule.
    event.scheduleEligible=d.schemaVersion===2;event.deferredReview=true;return;
  }
  if(base.phase==='new' && d.mode!=='new' || base.phase!=='new' && d.mode==='new')throw new Error('Invalid learning mode');
  if(base.phase!=='new'&&!isDue(base,event.effectiveAt,d.config?.zone||DEFAULTS.zone))throw new Error('Review step is not due');
  const word={...snapshot,review:base};
  const generated=makeQuestion(word,pool,d.game,face,d.mode,d.config,()=> 'validation',profileId);
  if(generated.blocked||generated.game!==d.game||!!d.familiarize!==generated.familiarize)throw new Error('Invalid learning step or unavailable game');
  if(generated.familiarize && (d.grade!=='hard'||d.hadError||d.assisted))throw new Error('Familiarization is not a scored failure');
  event.scheduleEligible=true;
}
