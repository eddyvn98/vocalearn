export function opportunityId(data) {
  if (!data || typeof data !== 'object') return '';
  return ['new','review'].includes(data.mode)
    ? `schedule:${data.wordId}:${data.baseRev}`
    : `question:${data.questionId}`;
}
