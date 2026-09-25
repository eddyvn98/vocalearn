const scheduled=e=>e?.kind==='answer'&&!['free','errors'].includes(e.data?.mode);

export function scheduleAdjustments(before,after) {
  const changes=[];
  for(const [wordId,next] of Object.entries(after?.words||{})) {
    const prior=before?.words?.[wordId];
    if(!prior||prior.review?.rev===next.review?.rev)continue;
    const priorAccepted=new Set(prior.accepted||[]);
    const nextAccepted=new Set(next.accepted||[]);
    const invalidated=[...priorAccepted].filter(id=>!nextAccepted.has(id));
    const newlyAccepted=[...nextAccepted].filter(id=>!priorAccepted.has(id));
    const retained=(after.events||[]).filter(e=>scheduled(e)&&e.data.wordId===wordId
      &&invalidated.includes(e.id)).map(e=>e.id);
    changes.push({
      wordId,
      word:next.word||'',
      beforeRev:prior.review?.rev||'',
      afterRev:next.review?.rev||'',
      beforePhase:prior.review?.phase||'',
      afterPhase:next.review?.phase||'',
      beforeStep:prior.review?.step??null,
      afterStep:next.review?.step??null,
      invalidated,
      newlyAccepted,
      retained,
      reason:invalidated.length?'late-parent':newlyAccepted.length?'merged-result':'replay'
    });
  }
  return changes;
}
