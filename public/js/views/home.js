import {app,words} from '../state.js';
import {button,icon,t,esc,badge} from '../ui.js';
import {inScope} from '/core/model.js';
import {isDue} from '/core/time.js';
import {shell} from './shell.js';
export const scoped=()=>words().filter(w=>inScope(w,app.scope,app.model.categories));
const waitText=(at,now,zone)=>`${new Date(at).toLocaleString('vi-VN',{timeZone:zone})} · còn ${Math.max(1,Math.ceil((at-now)/60000))} phút`;
export function homeView() {
  const list=scoped(),now=Date.now(),zone=app.model.settings.zone;
  const due=list.filter(w=>w.ready&&isDue(w.review,now,zone));
  const blocked=list.filter(w=>!w.ready&&isDue(w.review,now,zone));
  const waiting=list.filter(w=>!w.ready),fresh=list.filter(w=>w.review.phase==='new'&&w.ready);
  const learning=list.filter(w=>['learning','relearn'].includes(w.review.phase));
  const resume=app.session&&!app.session.finished;
  return shell(`<header class="page-heading row between wrap"><div><div class="eyebrow">${t('intro')}</div><h1 tabindex="-1">${t('todayTitle')}</h1><p class="muted">${t('todaySub')}</p></div>${button(t('chooseScope'),'scope')}</header>
  <p class="muted small">${t('scope')}: ${app.scope.length?app.scope.map(id=>esc(app.model.categories[id]?.name||t(id))).join(' / '):t('all')}</p>
  ${resume?`<section class="resume row between wrap"><div><strong>${t('paused')}</strong><p>${app.session.queue.filter(q=>q.result).length}/${app.session.queue.length} ${t('answered')}</p></div><div class="row">${button(t('continue'),'resume','primary')}${button(t('finish'),'finish')}</div></section>`:''}
  <section class="hero"><div>${badge(t('due'))}<h2>${due.length?due.length+' '+t('dueIntro'):t(list.length?'allDone':'noData')}</h2><p class="muted">${t('reviewHint')}</p><div class="row wrap actions">${button(t(resume?'continue':due.length?'reviewStart':fresh.length?'newStart':'add'),resume?'resume':due.length?'setupReview':fresh.length?'setupNew':'add','primary')}${button(t('free'),'setupFree')}</div>${blocked.length?`<p class="small">${blocked.length} ${t('blocked')}</p>`:''}</div><div class="hero-count">${String(due.length).padStart(2,'0')}<small>${t('cards').toUpperCase()}</small></div></section>
  <div class="metrics">${[[fresh.length,'new'],[learning.length,'learning'],[waiting.length,'waiting'],[list.filter(w=>w.errors.inBook).length,'errors']].map(([n,key])=>`<button class="metric" data-action="filter" data-filter="${key}"><strong>${n}</strong><span>${t(key)}</span></button>`).join('')}</div>
  ${learning.some(w=>w.review.dueAt>now)?`<section class="wait-panel"><strong>${t('nextAt')}</strong> ${waitText(Math.min(...learning.filter(w=>w.review.dueAt>now).map(w=>w.review.dueAt)),now,zone)}<p class="muted small">${t('freeHint')}</p></section>`:''}
  <div class="columns"><section class="panel"><h2>${t('free')}</h2><p class="muted small">${t('freeHint')}</p><div class="game-grid">${['mix','flash','quiz','match','typing','spell','cloze'].map((g,i)=>`<button class="game-tile" data-action="practice" data-game="${g}"><span class="tile-icon">${['✦','Aa','?','\u2194','\u2328','\u25b6','___'][i]}</span>${t(g)}</button>`).join('')}</div></section>
  <section class="panel"><div class="row between"><h2>${t('topics')}</h2>${button('+','topics','icon-button',`aria-label="${t('topics')}"`)}</div>${Object.values(app.model.categories).filter(c=>c.setId===app.setId).map(c=>`<button class="topic-row" data-action="topicScope" data-id="${c.id}"><span>${esc(c.name)}</span>${badge(words().filter(w=>inScope(w,[c.id],app.model.categories)).length+' '+t('cards'),'neutral')}</button>`).join('')||`<p class="muted">${t('noTopics')}</p>`}${!words().length?button(t('loadSamples'),'samples','quiet'):''}</section></div>`);
}
