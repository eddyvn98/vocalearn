import {app,current} from '../state.js';
import {t,esc,button,badge,brand} from '../ui.js';
import {pendingCount} from '../storage.js';
import {shell} from './shell.js';
import {usesAudio} from '/core/questions.js';
import {mediaMarkup} from '../media-store.js';
import {buildSessionSummary} from '/core/session-summary.js';
import {handwritingMarkup} from '../handwriting-ui.js';
function mediaAttrs(value) {
  const mark=mediaMarkup(value);
  return (mark.src?`src="${esc(mark.src)}" `:'')+(mark.ref?`data-media-ref="${esc(mark.ref)}" `:'');
}
function faceValue(face,value,alt='') {
  if(face==='image')return `<img class="answer-image" ${mediaAttrs(value)}alt="${esc(alt||t('image'))}">`;
  return esc(value);
}
function rubyWord(q,value=q.snapshot.word){
  return q.twoStep?.profileId==='ja'&&q.snapshot.kana?`<ruby>${esc(value)}<rt>${esc(q.snapshot.kana)}</rt></ruby>`:esc(value);
}
function feedback(q) {
  if(!q.result)return '';
  const ok=q.result.grade!=='forget';
  return `<section id="feedback" tabindex="-1" class="feedback ${ok?'':'bad'}" role="status"><div class="row between wrap"><h2>${t(ok?q.hadError?'afterFix':q.hint?'withHint':'correct':'wrong')}</h2>${q.familiarize?'':badge(t(q.result.grade),ok?'good':'warn')}</div><p class="result-word">${q.answerFace==='image'?faceValue('image',q.answers[0],q.snapshot.word):q.answerFace==='word'?rubyWord(q,q.answers[0]):esc(q.answers.join(' / '))} <span>${esc(q.snapshot.meaning)}</span></p>${q.game.startsWith('cloze')?`<p>${esc(q.prompt.replace('___',q.answers[0]))}</p>`:''}<p>${esc(q.snapshot.note||'')}</p>
  <p class="muted small">${q.result.assisted?t('helpCap'):q.result.grade==='hard'&&q.twoStep?.gradeCap?t('twoStepCap'):q.result.grade==='hard'&&!q.familiarize?t('recognitionCap'):''}</p><div class="row between wrap"><small>${t(q.mode==='free'||q.mode==='errors'?'noSchedule':'localSchedule')} \u00b7 ${t('saved')}</small>${button(t('next'),'next','primary')}</div></section>`;
}
function scriptTyping(q,disabled) {
  if(q.twoStep.readingRequired&&!q.twoStep.readingPassed){
    return `<form id="answer-form"><label>${t(q.twoStep.profileId==='ja'?'kana':'pinyin')}<input id="answer" name="answer" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(q.input)}" ${q.result||disabled?'disabled':''} aria-invalid="${q.retry&&!q.result}" aria-describedby="input-error"></label><p class="muted">${t('typeReadingPrompt')}</p><p id="input-error" class="error-text" role="status">${q.inputError||(q.retry&&!q.result?t('retry')+q.position:'')}</p>${!q.result?`<div class="row between wrap">${button(t('dontKnow'),'unknown','quiet',disabled?'disabled':'')}${button(t('hint'),'hint','quiet',q.hint||disabled?'disabled':'')}<button type="submit" class="btn primary" ${disabled?'disabled':''}>${t('continue')}</button></div>`:''}</form>`;
  }
  if(q.twoStep.mode==='confirm')return `<div class="stack"><p class="muted">${t('confirmWritingHelp')}</p><p class="assembled">${esc(q.snapshot.word)}</p>${!q.result?button(t('confirmWriting'),'formChoice','primary full',`data-value="${esc(q.snapshot.word)}"`):''}</div>`;
  return `<div class="stack"><p class="muted">${t('chooseWriting')}</p><div class="answers">${q.twoStep.choices.map(value=>button(esc(value),'formChoice','answer',`data-value="${esc(value)}" ${q.result?'disabled':''}`)).join('')}</div>${!q.result?button(t('dontKnow'),'unknown','quiet'):''}</div>`;
}
function chineseGame(q){
  if(q.game==='tone'){
    const selected=q.toneAnswers||[];
    return `<div class="stack"><div class="tone-grid">${q.tone.syllables.map((s,i)=>`<fieldset><legend>${esc(s.base)}</legend><div class="row wrap">${[1,2,3,4,0].map(tone=>button(tone===0?'nhẹ':String(tone),'toneChoice',selected[i]===tone?'primary':'',`data-index="${i}" data-tone="${tone}" ${q.result?'disabled':''}`)).join('')}</div></fieldset>`).join('')}</div>${!q.result?button(t('check'),'checkTones','primary full',selected.length!==q.tone.syllables.length||selected.some(x=>x===null)?'disabled':''):''}</div>`;
  }
  if(q.game==='classifier')return `<div class="stack"><p class="assembled">${esc(q.classifier.prompt)}</p><div class="answers">${q.classifier.answers.map(value=>button(esc(value),'classifierChoice','answer',`data-value="${esc(value)}" ${q.result?'disabled':''}`)).join('')}</div></div>`;
  return '';
}
function typing(q) {
  const disabled=usesAudio(q)&&!q.audioPlayed;
  if(q.twoStep)return scriptTyping(q,disabled);
  return `<form id="answer-form"><label>${t('word')}<input id="answer" name="answer" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(q.input)}" ${q.result||disabled?'disabled':''} aria-invalid="${q.retry&&!q.result}" aria-describedby="input-error"></label><p id="input-error" class="error-text" role="status">${q.inputError|| (q.retry&&!q.result?t('retry')+q.position:'')}</p>${!q.result?`<div class="row between wrap">${button(t('dontKnow'),'unknown','quiet',disabled?'disabled':'')}${button(t('hint'),'hint','quiet',q.hint||disabled?'disabled':'')}<button type="submit" class="btn primary" ${disabled?'disabled':''}>${t('check')}</button></div>`:''}</form>`;
}
function spelling(q) {
  const letters=Array.from(q.snapshot.word).map((ch,id)=>({ch,id}));
  const order=[...letters].sort((a,b)=>a.ch.localeCompare(b.ch)||a.id-b.id);
  const used=q.letters||[];
  return `<p class="assembled" aria-live="polite">${esc(used.map(id=>letters[id].ch).join(''))||'\u2026'}</p><div class="letters">${order.map(a=>button(esc(a.ch),'letter','',`data-index="${a.id}" ${q.result||!q.audioPlayed||used.includes(a.id)?'disabled':''}`)).join('')}</div><div class="row between wrap">${button(t('clear'),'clearLetters','quiet',q.result?'disabled':'')}${button(t('dontKnow'),'unknown','quiet',!q.audioPlayed||q.result?'disabled':'')}${button(t('check'),'checkLetters','primary',q.result||!q.audioPlayed?'disabled':'')}</div>`;
}
function speechMarkup(q){
  const attempts=q.speechState?.validAttempts||0,transcript=q.input||'';
  return `<div class="stack speech-panel"><p class="muted">${t('speechAttempt')}: ${attempts}/2</p>
    ${transcript?`<p><strong>${t('speechTranscript')}:</strong> ${esc(transcript)}</p>`:''}
    ${q.speechMessage?`<p class="info" role="status">${t(q.speechMessage)||t('speechTechnical')}</p>`:''}
    ${!q.result?button(t(q.speechBusy?'speechListening':attempts?'speechAgain':'speechStart'),'speechStart','primary full',q.speechBusy?'disabled':''):''}</div>`;
}
export function studyView() {
  const s=app.session, q=current(),completed=s.queue.filter(x=>x.result).length;
  if(s.match)return matchView();
  return `<main class="study-shell"><header class="row between wrap">${brand()}${button(t('pause'),'pause','quiet')}</header><div class="study-meta row between wrap">${badge(t(s.mode)+' \u00b7 '+t(q.game))}<span>${completed}/${s.queue.length} ${t('answered')}</span></div><progress max="${s.queue.length}" value="${completed}" aria-label="${t('answered')}"></progress>
  <section class="question-panel"><div class="prompt"><span class="eyebrow">${t('question')} ${s.index+1} ${q.snapshot.review.phase!=='review'&&['review','new'].includes(q.mode)?' \u00b7 '+t('step')+' '+(q.snapshot.review.step+1):''}</span>
  ${usesAudio(q)?`<h1 tabindex="-1">${t(q.game)}</h1><p class="muted">${t('audioPrompt')}</p><audio id="audio" preload="auto" ${mediaAttrs(q.snapshot.audio)}></audio><div class="row center wrap">${button(t(q.audioPlayed?'listenAgain':'listen'),'playAudio','primary')}${button(t('slow'),'slowAudio')}</div>`:q.face==='image'&&!['cloze','clozeChoice'].includes(q.game)?`<img class="question-image" ${mediaAttrs(q.prompt)}alt="${t('image')}">`:`<h1 tabindex="-1">${esc(q.prompt)}</h1>`}
  ${q.game==='typing'&&!q.twoStep?`<p class="muted">${t('typePrompt')}</p>`:''}${q.game==='quiz'||q.game==='clozeChoice'?`<p class="muted">${t('quizPrompt')}</p>`:''}</div>
  ${q.fallback?`<p class="info">${t(q.fallback)} \u2192 ${t(q.game)}</p>`:''}
  ${q.hint?`<p class="info">${t('hint')}: ${esc(q.snapshot.pinyin||q.snapshot.ipa||q.answers[0].slice(0,1)+'\u2026')} \u00b7 ${t('helpCap')}</p>`:''}
  ${q.game==='handwriting'?handwritingMarkup(q):q.game==='speak'?speechMarkup(q):['typing','dictation','cloze'].includes(q.game)?typing(q):['tone','classifier'].includes(q.game)?chineseGame(q):q.game==='spell'?spelling(q):q.game==='flash'?`
  ${q.flipped?`<div class="flash-back"><h2>${rubyWord(q)}</h2><p>${esc(q.snapshot.meaning)}</p><p class="muted">${esc(q.snapshot.kana||q.snapshot.pinyin||q.snapshot.ipa||'')}</p><p>${esc(q.snapshot.note||'')}</p></div>${!q.result?`<div class="row center wrap">${q.familiarize?button(t('next'),'remember','primary'):button(t('forget'),'unknown')+button(t('remember'),'remember','primary')}</div>`:''}`:button(t('show'),'flip','primary full',usesAudio(q)&&!q.audioPlayed?'disabled':'')}`:
  `<div class="answers">${q.choices.map((choice,i)=>button(
    `${String.fromCharCode(65+i)}. ${faceValue(q.answerFace,choice.label,q.answerFace==='image'?t('image'):'')}${q.result&&choice.correct?' ✓':''}`,
    'choose',`answer ${q.result&&choice.correct?'correct':q.result&&q.chosen===i?'wrong':''}`,
    `data-index="${i}" ${q.result||usesAudio(q)&&!q.audioPlayed?'disabled':''}`)).join('')}</div>`}
  ${feedback(q)}<p id="study-error" class="error-text" role="alert">${esc(s.error||'')}</p></section><p class="muted small center">${t('saved')} \u00b7 ${pendingCount()} ${t('pending')}</p></main>`;
}
function matchView() {
  const s=app.session,done=s.queue.filter(q=>q.result).length;
  const answers=s.matchOrder.map(i=>s.queue[i]),sample=s.queue[0];
  const left=q=>faceValue(q.face,q.prompt,q.snapshot.word);
  const right=q=>faceValue(q.answerFace,q.answers[0],q.snapshot.word);
  return `<main class="study-shell"><header class="row between wrap">${brand()}${button(t('pause'),'pause')}</header>
  <div class="study-meta row between">${badge(t(s.mode)+' · '+t('match'))}<span>${done}/${s.queue.length}</span></div>
  <progress max="${s.queue.length}" value="${done}" aria-label="${t('answered')}"></progress>
  <section class="question-panel"><h1 tabindex="-1">${t('match')}</h1><p class="muted">${t('matchPrompt')}</p>
  <div class="matching"><div role="group" aria-label="${t(sample?.face||'word')}">${s.queue.map((q,i)=>button(
    `${left(q)} ${q.result?'✓ '+t('matched'):s.selected===i?t('selected'):''}`,'matchLeft',
    `match-cell ${s.selected===i?'selected':''}`,`data-index="${i}" aria-pressed="${s.selected===i}" ${q.result?'disabled':''}`)).join('')}</div>
  <div role="group" aria-label="${t(sample?.answerFace||'meaning')}">${answers.map(q=>button(
    `${right(q)} ${q.result?'✓':''}`,'matchRight','match-cell',`data-id="${q.wordId}" ${q.result?'disabled':''}`)).join('')}</div></div>
  <p role="status" class="error-text">${esc(s.matchMessage||'')}</p><p id="study-error" class="error-text" role="alert">${esc(s.error||'')}</p>
  ${done===s.queue.length?button(t('results'),'finish','primary'):''}</section></main>`;
}
function summaryMetric(value,label){
  return `<div class="metric" data-summary-metric="${esc(label)}"><strong>${value}</strong><span>${t(label)}</span></div>`;
}
export function resultsView() {
  const s=app.session,now=Date.now(),summary=buildSessionSummary(s,app.model,pendingCount(),now);
  const pending=summary.pendingLearning;
  const next=pending.filter(item=>item.waiting&&Number.isFinite(item.dueAt)).sort((a,b)=>a.dueAt-b.dueAt)[0];
  return shell(`<section class="summary"><span class="summary-icon">✓</span>
    ${badge(t(summary.answered===s.queue.length?'complete':'finishEarly'),'good')}
    <h1 tabindex="-1">${t('resultTitle')}</h1><p>${t(s.mode)}</p>
    <div class="metrics">
      ${summaryMetric(summary.scheduledReviews,'scheduledReviews')}
      ${summaryMetric(summary.newStarted,'newStarted')}
      ${summaryMetric(summary.newGraduated,'newGraduated')}
      ${summaryMetric(summary.freePracticeAnswers,'freePracticeAnswers')}
      ${summaryMetric(summary.enteredErrorBook,'enteredErrorBook')}
      ${summaryMetric(summary.leftErrorBook,'leftErrorBook')}
    </div>
    <p class="muted small">${summary.answered} ${t('answered')} · ${summary.clean} ${t('clean')} · ${summary.mistakes} ${t('mistakes')}</p>
    ${pending.length?`<section class="info"><strong>${pending.length} ${t('pendingLearning')}</strong>
      ${pending.map(item=>`<p>${esc(item.word)} · ${t(item.phase)} · ${t('step')} ${Number(item.step)+1}${item.dueAt?` · ${new Date(item.dueAt).toLocaleString('vi-VN',{timeZone:app.model.settings.zone})}`:''}</p>`).join('')}
      ${next?`<p class="muted small">${t('nextAt')} ${new Date(next.dueAt).toLocaleString('vi-VN',{timeZone:app.model.settings.zone})}</p>`:''}
    </section>`:''}
    ${summary.unsyncedChanges?`<p class="info">${summary.unsyncedChanges} ${t('unsyncedSummary')}</p>`:`<p class="muted small">${t('allSynced')}</p>`}
    <p>${t(['free','errors'].includes(s.mode)?'noSchedule':'localSchedule')}</p>
    <div class="row center wrap actions">${button(t('home'),'home','primary')}${button(t('errors'),'errors')}</div>
  </section>`);
}
