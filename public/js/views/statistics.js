import {app} from '../state.js';
import {button,t,esc} from '../ui.js';
import {shell} from './shell.js';
import {scopeStats,activitySeries,statsDescription} from '/core/statistics.js';
import {inScope} from '/core/model.js';

function currentWords(){
  return Object.values(app.model.words||{}).filter(w=>!w.deleted&&w.setId===app.setId);
}
function scopeLabel(){
  if(!app.scope?.length)return t('all');
  return app.scope.map(id=>app.model.categories[id]?.name||t(id)).join(' / ');
}
function dateLabel(value){
  return new Date(value).toLocaleDateString('vi-VN',{timeZone:app.model.settings.zone});
}
function scopedModel(){
  const words=Object.fromEntries(currentWords().map(w=>[w.id,w]));
  return {...app.model,words};
}
export function statisticsView(){
  const now=Date.now(),from=now-29*86400000;
  const model=scopedModel();
  const stats=scopeStats(model,app.scope,now);
  const wordIds=currentWords().filter(w=>inScope(w,app.scope,app.model.categories)).map(w=>w.id);
  const activity=activitySeries(app.model.events||[],{from,to:now,wordIds});
  const description=statsDescription(stats,scopeLabel(),dateLabel(from),dateLabel(now));
  return shell(`<header class="page-heading row between wrap"><div><span class="eyebrow">${esc(app.model.sets[app.setId]?.name||'')}</span><h1 tabindex="-1">${t('statistics')}</h1><p class="muted">${t('statisticsHelp')}</p></div><div class="row wrap">${button(t('chooseScope'),'scope')}${button(t('home'),'home','quiet')}</div></header>
  <p class="muted small">${t('scope')}: ${esc(scopeLabel())}</p>
  <section class="metrics" aria-label="${t('statistics')}">
    <div class="metric"><strong>${stats.mastered}</strong><span>${t('mastered')}</span></div>
    <div class="metric"><strong>${stats.active}</strong><span>${t('activeCards')}</span></div>
    <div class="metric"><strong>${stats.percentLabel}</strong><span>${t('masteredRate')}</span></div>
  </section>
  <p class="info">${esc(description)}</p>
  <section class="panel"><div class="row between wrap"><div><h2>${t('activity30Days')}</h2><p class="muted small">${esc(dateLabel(from))} – ${esc(dateLabel(now))}</p></div></div>
  ${activity.length?`<div class="word-list" role="list">${activity.map(day=>`<article class="word-row" role="listitem"><div><h3>${esc(day.day)}</h3></div><p>${t('scheduledReviews')}: <strong>${day.scheduled}</strong></p><p>${t('practiceAnswers')}: <strong>${day.practice}</strong></p><p>${t('errorAnswers')}: <strong>${day.errors}</strong></p></article>`).join('')}</div>`:`<p class="muted">${t('noActivity')}</p>`}
  </section>`);
}
