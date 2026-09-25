import {RECALL} from './grading.js';
import {conservative} from './srs.js';
export function errorBook(events) {
  const groups = new Map();
  for (const event of events.filter(e => e.kind === 'answer')) {
    const d = event.data;
    const key = d.mode === 'free' || d.mode === 'errors' ? d.questionId : d.baseRev;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const answers = [...groups.values()].map(group => ({...conservative(group),
    when: Math.min(...group.map(e => e.effectiveAt ?? e.at))})).sort((a, b) => a.when - b.when || a.id.localeCompare(b.id));
  const state = {inBook: false, failures: 0, total: 0, evidence: [], persistent: false, lastError: null};
  for (const e of answers) {
    const d = e.data;
    if (d.familiarize) continue;
    if (d.hadError || d.grade === 'forget') {
      Object.assign(state, {inBook: true, failures: state.failures + 1, total: state.total + 1,
        evidence: [], lastError: e.when});
      state.persistent = state.failures >= 6;
    } else if (d.assisted) state.evidence = [];
    else if (state.inBook) {
      const item = {game: d.game === 'clozeChoice' ? 'cloze' : d.game === 'spell' ? 'dictation' : d.game,
        recall: RECALL.has(d.game), at: e.when};
      const prior = state.evidence.find(p => p.game !== item.game && item.at - p.at >= 600000 && (p.recall || item.recall));
      if (prior) Object.assign(state, {inBook: false, failures: 0, persistent: false, evidence: []});
      else if (!state.evidence.some(p => p.game === item.game)) state.evidence.push(item);
    }
  }
  // A retryable wrong attempt puts the card in the book immediately, but does not
  // increment the completed-question counter until a final answer exists.
  const answered = new Set(events.filter(e => e.kind === 'answer').map(e => e.data.questionId));
  if (events.some(e => e.kind === 'attempt' && e.data.wrong && !answered.has(e.data.questionId))) {
    state.inBook = true; state.evidence = [];
  }
  return state;
}
