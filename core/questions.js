import {normalize} from './grading.js';
import {isDue, dayAt} from './time.js';
export const GAMES = ['flash','quiz','match','typing','spell','dictation','cloze','clozeChoice'];
export function requiredGame(w) {
  if (w.review.phase === 'new') return 'flash';
  if (w.review.phase === 'relearn') return 'typing';
  return ['flash','quiz','spell','typing'][w.review.step];
}
export function reasons(w, game, face, pool) {
  if (!w.word || !w.ready) return ['missingPrompt'];
  if (['typing','flash'].includes(game) && !w[face]) return ['missingPrompt'];
  if (['quiz','match'].includes(game)) {
    if (!w.meaning) return ['missingMeaning'];
    const others = pool.filter(x => x.id !== w.id && x.meaning && normalize(x.meaning) !== normalize(w.meaning) && normalize(x.word) !== normalize(w.word));
    if (!others.length) return ['missingChoices'];
  }
  if (['spell','dictation'].includes(game) && !w.audio) return ['missingAudio'];
  if (['cloze','clozeChoice'].includes(game) && (!w.sentence || w.sentence.split('___').length !== 2 || !w.answers?.length)) return ['missingSentence'];
  if (game === 'clozeChoice' && pool.filter(x => x.id !== w.id && !w.answers.map(normalize).includes(normalize(x.word))).length < 1) return ['missingChoices'];
  return [];
}
export function availablePool(model, setId, scopeFn, mode, now) {
  return Object.values(model.words).filter(w => !w.deleted && w.setId === setId && scopeFn(w)
    && (mode === 'review' ? isDue(w.review, now, model.settings.zone)
      : mode === 'new' ? w.review.phase === 'new' : mode === 'errors' ? w.errors.inBook : true));
}
export function learningAllowed(model, scoped, now) {
  if (scoped.some(w => w.ready && isDue(w.review, now, model.settings.zone))) return 'reviewFirst';
  const day = dayAt(now, model.settings.zone);
  const used = Object.values(model.words).filter(w => w.review.startedDay === day).length;
  return used >= model.settings.newLimit ? 'dailyLimit' : null;
}
export function question(w, pool, game, face, mode, config, uuid) {
  const learning = mode === 'new' || mode === 'review' && w.review.phase !== 'review';
  let fallback = null, familiarize = false;
  if (learning) {
    game = requiredGame(w);
    if (game === 'quiz' && reasons(w, game, face, pool).length) {
      game = 'flash'; fallback = 'missingChoices'; familiarize = true;
    }
    if (game === 'spell' && !w.audio) {game = 'typing'; fallback = 'missingAudio';}
    face = w.meaning ? 'meaning' : w.ipa ? 'ipa' : 'image';
    if (w.review.phase === 'new') familiarize = true;
  }
  const why = reasons(w, game, face, pool);
  if (why.length) return {blocked: why, wordId: w.id};
  const answers = game.startsWith('cloze') ? w.answers : [w.word];
  const prompt = game.startsWith('cloze') ? w.sentence : game === 'quiz' || game === 'match' ? w.word : w[face];
  const correctChoice = game === 'quiz' ? w.meaning : answers[0];
  const distractors = pool.filter(x => x.id !== w.id && normalize(x.word) !== normalize(w.word))
    .map(x => game === 'quiz' ? x.meaning : x.word)
    .filter(x => x && normalize(x) !== normalize(correctChoice) && !answers.map(normalize).includes(normalize(x)));
  const choices = [...new Set([correctChoice, ...distractors])].slice(0, 4).map((label, index) => ({label, correct: index === 0}));
  const rotation = w.word.length % choices.length;
  choices.push(...choices.splice(0, rotation));
  return {id: uuid(), eventId: uuid(), wordId: w.id, baseRev: w.review.rev, mode, game, face,
    config: {...config}, snapshot: structuredClone(w), prompt, answers, choices, fallback, familiarize,
    input: '', hadError: false, hint: false, retry: false, flipped: false, result: null,
    activeMs: 0, interrupted: false, audioPlayed: false};
}
