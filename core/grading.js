export const RECOGNITION = new Set(['flash', 'quiz', 'match', 'spell', 'clozeChoice', 'tone', 'classifier', 'speak']);
export const RECALL = new Set(['typing', 'dictation', 'cloze']);
const segmenter = new Intl.Segmenter('en', {granularity: 'grapheme'});
export const graphemes = s => Array.from(segmenter.segment(s), p => p.segment);
export const normalize = s => String(s).normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');
export function distance(a, b) {
  const x = graphemes(normalize(a)), y = graphemes(normalize(b));
  const row = Array.from({length: y.length + 1}, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[y.length];
}
/** Grade against the question's immutable answers, NOT all forms of a word. */
export function checkAnswer(input, answers, retried = false) {
  if (!normalize(input)) return {kind: 'empty'};
  if (answers.some(a => normalize(a) === normalize(input))) return {kind: 'correct'};
  if (!retried && answers.some(a => distance(input, a) === 1)) {
    const answer = answers.find(a => distance(input, a) === 1);
    const x = graphemes(normalize(input)), y = graphemes(normalize(answer));
    let position = 0;
    while (position < x.length && x[position] === y[position]) position++;
    return {kind: 'retry', position: position + 1};
  }
  return {kind: 'wrong'};
}
export function gradeAnswer({correct, game, hint = false, hadError = false,
  activeMs = Infinity, interrupted = false, answer = '', easyMs = 5000, gradeCap = null}) {
  if (!correct) return {grade: 'forget', assisted: false};
  const assisted = hint || hadError;
  if (assisted || RECOGNITION.has(game) || gradeCap === 'hard') return {grade: 'hard', assisted};
  const units = normalize(answer).split(' ').filter(Boolean).length;
  const threshold = (game === 'cloze' ? Math.max(10000, easyMs) : easyMs) + Math.max(0, units - 1) * 2000;
  return {grade: !interrupted && activeMs < threshold ? 'easy' : 'good', assisted: false};
}
