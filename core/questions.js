import {normalize} from './grading.js';
import {opportunityId} from './opportunity.js';
import {isDue, dayAt} from './time.js';
export const GAMES = ['flash','quiz','match','typing','spell','dictation','cloze','clozeChoice'];
// Only expose implemented, valid pairs. Typing always answers the target word.
export const GAME_FACES = Object.freeze({
  flash:['meaning','word','ipa','image','audio'], quiz:['meaning','word','ipa','image','audio'],
  typing:['meaning','ipa','image'], match:['word'], spell:['audio'], dictation:['audio'],
  cloze:['sentence'], clozeChoice:['sentence'], mix:['meaning','ipa','image'],
});
export const FACES = ['meaning','word','ipa','image','audio'];
export const usesAudio = q => ['spell','dictation'].includes(q.game) || q.face === 'audio';
export function requiredGame(w) {
  if (w.review.phase === 'new') return 'flash';
  if (w.review.phase === 'relearn') return 'typing';
  return ['flash','quiz','spell','typing'][w.review.step];
}
const promptFace = (game, face) => GAME_FACES[game]?.length === 1 ? GAME_FACES[game][0] : face;
function alternatives(w, pool, game, face) {
  const cloze = game === 'clozeChoice';
  const answers = cloze ? (w.answers || []) : face === 'word' ? [w.meaning] : [w.word];
  const seen = new Set(answers.map(normalize));
  return pool.filter(x => !x.deleted && x.setId === w.setId && x.id !== w.id)
    .filter(x => cloze || normalize(x[face] || '') !== normalize(w[face] || ''))
    .map(x => face === 'word' && !cloze ? x.meaning : x.word)
    .filter(x => {if (!x || seen.has(normalize(x))) return false; seen.add(normalize(x)); return true;});
}
export function reasons(w, game, face = 'meaning', pool = []) {
  face = promptFace(game, face);
  if (!GAME_FACES[game]?.includes(face)) return ['invalidFace'];
  if (!w.word || w.deleted || !w.ready && game !== 'flash') return ['missingPrompt'];
  if (!w[face] && !['match','cloze','clozeChoice'].includes(game)) return [face === 'audio' ? 'missingAudio' : face === 'image' ? 'missingImage' : 'missingPrompt'];
  if (game === 'quiz' && face === 'word' && !w.meaning) return ['missingMeaning'];
  if (['spell','dictation'].includes(game) && !w.audio) return ['missingAudio'];
  if (['cloze','clozeChoice'].includes(game) && (!w.sentence || w.sentence.split('___').length !== 2 || !w.answers?.length)) return ['missingSentence'];
  if (['quiz','clozeChoice'].includes(game) && !alternatives(w,pool,game,face).length) return ['missingChoices'];
  if (game === 'match') {
    if (!w.meaning) return ['missingMeaning'];
    const other = pool.some(x => x.id !== w.id && x.meaning && normalize(x.word) !== normalize(w.word) && normalize(x.meaning) !== normalize(w.meaning));
    if (!other) return ['missingChoices'];
  }
  return [];
}
export function availablePool(model, setId, scopeFn, mode, now) {
  return Object.values(model.words).filter(w => !w.deleted && w.setId === setId && scopeFn(w)
    && (mode === 'review' ? isDue(w.review, now, model.settings.zone)
      : mode === 'new' ? w.review.phase === 'new' : mode === 'errors' ? w.errors.inBook : true))
    .sort((a,b) => String(a.review.dueDate || '').localeCompare(String(b.review.dueDate || ''))
      || (a.review.dueAt || 0) - (b.review.dueAt || 0) || a.id.localeCompare(b.id));
}
export function learningAllowed(model, scoped, now) {
  if (scoped.some(w => w.ready && isDue(w.review, now, model.settings.zone))) return 'reviewFirst';
  const day = dayAt(now, model.settings.zone);
  const used = Object.values(model.words).filter(w => w.review.startedDay === day).length;
  return used >= model.settings.newLimit ? 'dailyLimit' : null;
}
export function question(w, pool, game, face = 'meaning', mode = 'review', config = {}, uuid = () => crypto.randomUUID()) {
  const learning = mode === 'new' || mode === 'review' && w.review.phase !== 'review';
  let fallback = null, familiarize = false;
  if (learning) {
    if (!w.ready) return {blocked:['missingPrompt'],wordId:w.id};
    face = w.meaning ? 'meaning' : w.ipa ? 'ipa' : 'image';
    game = requiredGame(w);
    if (game === 'quiz' && reasons(w,game,face,pool).length) {
      game = 'flash'; fallback = 'missingChoices'; familiarize = true;
    }
    if (game === 'spell' && !w.audio) {game = 'typing'; fallback = 'missingAudio';}
    if (w.review.phase === 'new') familiarize = true;
  }
  face = promptFace(game,face);
  const why = reasons(w,game,face,pool);
  if (why.length) return {blocked:why,wordId:w.id};
  const reverse = game === 'quiz' && face === 'word';
  const answers = game.startsWith('cloze') ? [...w.answers] : reverse ? [w.meaning] : [w.word];
  const prompt = game.startsWith('cloze') ? w.sentence : game === 'match' ? w.word : w[face];
  const choices = ['quiz','clozeChoice'].includes(game) ? [answers[0],...alternatives(w,pool,game,face)].slice(0,4)
    .map((label,index) => ({label,correct:index === 0})) : [];
  const rotation = w.word.length % Math.max(1,choices.length); choices.push(...choices.splice(0,rotation));
  const id=uuid(),eventId=uuid(),baseRev=w.review.rev;
  return {id,eventId,opportunityId:opportunityId({wordId:w.id,baseRev,mode,questionId:id}),wordId:w.id,baseRev,mode,game,face,
    config:{...config},snapshot:structuredClone(w),prompt,answers,choices,fallback,familiarize,
    input:'',hadError:false,hint:false,retry:false,flipped:false,result:null,
    activeMs:0,interrupted:false,audioPlayed:false};
}
