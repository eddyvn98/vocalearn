import {app} from '../state.js';
import {button,t,esc} from '../ui.js';
import {statisticsSnapshot} from '/core/statistics.js';
import {shell} from './shell.js';

const percent=value=>value==null?'—':Math.round(value*100)+'%';
function scopeLabel(){
  if(!app.scope.length)return t('all');
  return app.scope.map(id=>id==='uncategorized'?t('uncategorized'):app.model.categories[id]?.name||id).join(' / ');
}
function tableRows(rows,render,empty,colspan){
  return rows.length?rows.map(render).join(''):`<tr><td colspan="${colspan}" class="muted">${esc(empty)}</td></tr>`;
}
export function statsView(){
  const snap=statisticsSnapshot(app.model,{setId:app.setId,scope:app.scope,includeChildren:app.scopeChildren,
    now:Date.now(),days:app.statsDays});
  const selected=String(app.statsDays),range=snap.startDay?`${snap.startDay} → ${snap.endDay}`:t('allTime');
  return shell(`<header class="page-heading row between wrap"><div><span class="eyebrow">${esc(app.model.sets[app.setId]?.name)}</span><h1 tabindex="-1">${t('statsTitle')}</h1><p class="muted">${t('statsSubtitle')}</p></div>${button(t('home'),'home','quiet')}</header>
  <section class="panel"><div class="row between wrap"><div><strong>${t('scope')}:</strong> ${esc(scopeLabel())}<p class="muted small">${range}</p></div><label>${t('timeRange')}<select id="stats-window">${[[7,'range7'],[30,'range30'],[90,'range90'],['all','allTime']].map(([value,key])=>`<option value="${value}" ${String(value)===selected?'selected':''}>${t(key)}</option>`).join('')}</select></label></div></section>
  <div class="metrics">${[[snap.activeCount,'activeCards'],[`${snap.masteredCount}/${snap.activeCount}`,'mastered'],[snap.dueCount,'dueNow'],[snap.errorCount,'errors'],[snap.waitingCount,'waiting'],[snap.answerCount,'answerResults'],[percent(snap.cleanRate),'cleanRate']].map(([value,key])=>`<div class="metric"><strong>${value}</strong><span>${t(key)}</span></div>`).join('')}</div>
  <p class="muted small stats-note">${t('masteredDefinition')} ${t('mastered')}: ${percent(snap.masteredRate)}.</p>
  <section class="panel"><h2>${t('gameBreakdown')}</h2><div class="table-scroll"><table class="stats-table"><thead><tr><th>${t('game')}</th><th>${t('answerResults')}</th><th>${t('forget')}</th><th>${t('hard')}</th><th>${t('good')}</th><th>${t('easy')}</th></tr></thead><tbody>${tableRows(snap.gameRows,row=>`<tr><td>${esc(t(row.game))}</td><td>${row.total}</td><td>${row.forget}</td><td>${row.hard}</td><td>${row.good}</td><td>${row.easy}</td></tr>`,t('noActivity'),6)}</tbody></table></div></section>
  <section class="panel"><h2>${t('recentActivity')}</h2><div class="table-scroll"><table class="stats-table"><thead><tr><th>Ngày</th><th>${t('answerResults')}</th><th>${t('cleanRate')}</th></tr></thead><tbody>${tableRows(snap.dayRows,row=>`<tr><td>${row.day}</td><td>${row.total}</td><td>${percent(row.total?row.clean/row.total:null)}</td></tr>`,t('noActivity'),3)}</tbody></table></div></section>`);
}
