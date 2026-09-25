const answered=session=>(session?.queue||[]).filter(q=>q.result);
const unique=items=>[...new Set(items)];

export function sessionBaseline(model,queue) {
  return Object.fromEntries(unique((queue||[]).map(q=>q.wordId)).map(wordId=>{
    const word=model.words[wordId],question=(queue||[]).find(q=>q.wordId===wordId);
    const review=word?.review||question?.snapshot?.review||{};
    const errors=word?.errors||question?.snapshot?.errors||{};
    return [wordId,{phase:review.phase||'new',step:review.step??0,rev:review.rev||'',
      inBook:!!errors.inBook,total:errors.total||0,failures:errors.failures||0}];
  }));
}
export function buildSessionSummary(session,model,pending=0,now=Date.now()) {
  const done=answered(session),baseline=session?.baseline||sessionBaseline(model,session?.queue||[]);
  const touched=unique(done.map(q=>q.wordId));
  const current=id=>model.words[id];
  const scheduledReviews=done.filter(q=>q.mode==='review'&&q.snapshot?.review?.phase==='review').length;
  const freePracticeAnswers=done.filter(q=>['free','errors'].includes(q.mode)).length;
  const newStarted=touched.filter(id=>baseline[id]?.phase==='new'&&current(id)?.review?.phase!=='new').length;
  const newGraduated=touched.filter(id=>['new','learning'].includes(baseline[id]?.phase)
    &&current(id)?.review?.phase==='review').length;
  const enteredErrorBook=touched.filter(id=>!baseline[id]?.inBook&&current(id)?.errors?.inBook).length;
  const leftErrorBook=touched.filter(id=>baseline[id]?.inBook&&!current(id)?.errors?.inBook).length;
  const pendingLearning=touched.map(id=>current(id)).filter(word=>word&&!word.deleted
    &&['learning','relearn'].includes(word.review?.phase)).map(word=>({
      wordId:word.id,word:word.word,phase:word.review.phase,step:word.review.step,
      dueAt:word.review.dueAt,waiting:Number.isFinite(word.review.dueAt)&&word.review.dueAt>now
    }));
  return {
    answered:done.length,scheduledReviews,freePracticeAnswers,newStarted,newGraduated,
    enteredErrorBook,leftErrorBook,pendingLearning,unsyncedChanges:pending,
    clean:done.filter(q=>q.result.grade!=='forget'&&!q.hadError&&!q.hint).length,
    mistakes:done.filter(q=>q.hadError||q.result.grade==='forget').length
  };
}
