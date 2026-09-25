import {gradeAnswer,normalize} from '../core/grading.js';
import {DEFAULTS,scheduleFor} from '../core/srs.js';
import {question as makeQuestion,GAME_FACES,answerFaces,defaultAnswerFace,reasons} from '../core/questions.js';
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
  if(d.schemaVersion===2 && !d.question.fields)throw new Error('Missing content revisions');
  if(!validConfig(d.config,events))throw new Error('Unknown configuration snapshot');
  if(!Number.isFinite(d.activeMs)||d.activeMs<0||d.activeMs>7*86400000)throw new Error('Invalid active time');
  const input=d.input ?? '';
  if(typeof input!=='string'||input.length>5000)throw new Error('Invalid answer input');
  const face=d.face || (d.game.startsWith('cloze')?'sentence':d.game==='match'?'word':
    d.question.prompt===snapshot.word && d.game==='quiz'?'word':'meaning');
  const legacyAnswerFace=d.game==='quiz'&&face==='word'?'meaning':'word';
  const answerFace=d.answerFace||legacyAnswerFace;
  if(d.schemaVersion===2 && !GAME_FACES[d.game]?.includes(face))throw new Error('Invalid game face');
  if(d.schemaVersion===2 && !snapshot[face] && face!=='sentence')throw new Error('Missing question resource');
  if(d.schemaVersion===2&&d.answerFace&&['quiz','match'].includes(d.game)&&!answerFaces(d.game,face).includes(answerFace))
    throw new Error('Invalid answer face');
  const answers=d.game.startsWith('cloze')?snapshot.answers:
    d.answerFace&&['quiz','match'].includes(d.game)?[snapshot[answerFace]]:
    d.game==='quiz'&&face==='word'?[snapshot.meaning]:[snapshot.word];
  if(!Array.isArray(answers)||answers.some(a=>typeof a!=='string'||!a.trim())||!same(d.question.answers,answers))throw new Error('Question answer key mismatch');
  const prompt=['image','audio'].includes(face)?`[${face}]`:d.game.startsWith('cloze')?snapshot.sentence:
    d.answerFace&&d.game==='match'?snapshot[face]:d.game==='match'?snapshot.word:snapshot[face];
  if(d.schemaVersion===2 && d.question.prompt!==prompt)throw new Error('Question prompt mismatch');
  const attempts=events.filter(e=>e.kind==='attempt'&&e.data.questionId===d.questionId);
  if(attempts.some(e=>e.data.wordId!==d.wordId))throw new Error('Question belongs to another word');
  if(attempts.some(e=>e.data.wrong)&&!d.hadError)throw new Error('Cannot erase a recorded failed attempt');
  const unknown=d.unknown===true || d.schemaVersion!==2 && d.grade==='forget';
  let correct=!unknown && answers.some(a=>normalize(a)===normalize(input));
  if(d.game==='flash')correct=!unknown;
  if(d.game==='quiz'&&d.answerFace==='image')correct=!unknown&&d.selectedWordId===d.wordId;
  if(d.game==='match')correct=!unknown && (d.selectedWordId===d.wordId || d.schemaVersion!==2 && d.grade!=='forget');
  const expected=gradeAnswer({correct,game:d.game,hint:d.hint||false,hadError:d.hadError,
    activeMs:d.activeMs,interrupted:d.interrupted||false,answer:answers[0],easyMs:d.config?.easyMs});
  if(expected.grade!==d.grade||expected.assisted!==d.assisted)throw new Error('Grade does not match the recorded response');
  if(!correct&&!d.hadError)throw new Error('Incorrect response must record an error');
  if(['free','errors'].includes(d.mode))return;
  const reset=events.findLastIndex(e=>e.kind==='resetWord'&&e.data.id===current.id);
  const related=events.slice(reset+1).filter(e=>e.data.wordId===current.id);
  const pool=Object.values(state.words).filter(w=>!w.deleted&&w.setId===current.setId).map(w=>w.id===snapshot.id?snapshot:w);
  const bestFace=snapshot.meaning?'meaning':snapshot.ipa?'ipa':'image';
  event.reviewGate={ready:!!snapshot.ready,hasAudio:!!snapshot.audio,
    quizAvailable:!reasons(snapshot,'quiz',bestFace,pool,defaultAnswerFace('quiz',bestFace)).length};
  const history=scheduleFor(current.generation,related),base=history.states.get(d.baseRev);
  if(!base) {
    // A child may arrive before its parent. Replay gates it when that parent exists.
    // Unresolved/invalidated descendants remain logged without advancing the schedule.
    event.scheduleEligible=d.schemaVersion===2;event.deferredReview=true;return;
  }
  if(base.phase==='new' && d.mode!=='new' || base.phase!=='new' && d.mode==='new')throw new Error('Invalid learning mode');
  if(base.phase!=='new'&&!isDue(base,event.effectiveAt,d.config?.zone||DEFAULTS.zone))throw new Error('Review step is not due');
  const word={...snapshot,review:base};
  const generated=makeQuestion(word,pool,d.game,face,d.mode,d.config,()=> 'validation',d.answerFace);
  if(generated.blocked||generated.game!==d.game||!!d.familiarize!==generated.familiarize)throw new Error('Invalid learning step or unavailable game');
  if(generated.familiarize && (d.grade!=='hard'||d.hadError||d.assisted))throw new Error('Familiarization is not a scored failure');
  event.scheduleEligible=true;
}
