import {app,words} from './state.js';
import {t,esc,button,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,api,sync,pendingCount,getMeta} from './storage.js';
import {descendants} from '/core/model.js';
export function settings() {
  const s=app.model.settings;
  modal(t('settings'),`<form id="settings-form" class="stack">${field('newLimit','newLimit',s.newLimit,'type="number" min="0" max="200" required')}${field('zone','zone',s.zone,'required')}
  <label class="check-label"><input type="checkbox" name="reminder" ${s.reminder?'checked':''}>${t('reminder')}</label>${field('reminderTime','reminderTime',s.reminderTime,'type="time" required')}<p class="muted small">${t('reminderHelp')}</p>
  <details><summary>${t('advanced')}</summary><div class="stack"><label>Hard multiplier<input type="number" name="hardFactor" step="0.1" min="1" max="3" value="${s.hardFactor}"></label><label>Easy multiplier<input type="number" name="easyFactor" step="0.1" min="1" max="3" value="${s.easyFactor}"></label><label>Easy threshold (ms)<input type="number" name="easyMs" min="1000" max="120000" value="${s.easyMs}"></label></div></details>
  <div class="row between"><button type="submit" class="btn primary">${t('save')}</button>${button(t('logout'),'logout','danger')}</div></form><p class="muted small">${esc(app.user.email)} \u00b7 ${t('onlyLocal')}</p>`);
}
export async function saveSettings(form) {
  const f=new FormData(form),oldZone=app.model.settings.zone,zone=f.get('zone');
  if(zone!==oldZone&&!confirm('Change account timezone? Existing due dates will not be rewritten.'))return;
  const data={zone,newLimit:Number(f.get('newLimit')),hardFactor:Number(f.get('hardFactor')),
    easyFactor:Number(f.get('easyFactor')),easyMs:Number(f.get('easyMs')),reminder:f.has('reminder'),reminderTime:f.get('reminderTime')};
  await transact([prepare('settings',data)]);app.model=model();closeModal();app.render();
}
export async function syncNow() {
  const prior=Object.fromEntries(Object.values(app.model.words).map(w=>[w.id,w.review.rev]));
  await sync();app.model=model();
  const changed=Object.values(app.model.words).some(w=>prior[w.id]&&prior[w.id]!==w.review.rev);
  if(changed)notify(t('scheduleAdjusted'));
  app.render();return changed;
}
export async function syncInfo() {
  const at=await getMeta('lastSync');
  modal(t('sync'),`<div class="stack"><p>${t('saved')} \u00b7 ${pendingCount()} ${t('pending')}</p><p>${t('lastSync')}: ${at?new Date(at).toLocaleString('vi-VN'):'\u2014'}</p><p class="muted small">${t('phaseNotice')}</p>${button(t('sync'),'sync','primary')}
  <details><summary>${t('conflicts')} (${app.model.conflicts.length})</summary>${app.model.conflicts.slice(-20).reverse().map(c=>`<div class="conflict"><strong>${esc(app.model.words[c.wordId]?.word)} \u00b7 ${esc(c.field)}</strong><p>${esc(String(c.before).slice(0,200))} \u2192 ${esc(String(c.after).slice(0,200))}</p>${button(t('restore'),'restoreField','',`data-id="${c.eventId}" data-field="${c.field}"`)}</div>`).join('')}</details></div>`);
}
export function scopeModal() {
  const categories=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
  const path=c=>{
    const names=[c.name];let parent=c.parentId,seen=new Set([c.id]);
    while(parent&&!seen.has(parent)){seen.add(parent);const p=app.model.categories[parent];if(!p)break;names.unshift(p.name);parent=p.parentId;}
    return names.join(' > ');
  };
  modal(t('scope'),`<form id="scope-form" class="stack"><p>${t('all')}: ${t('clear')}</p>${[...categories,{id:'uncategorized',name:t('uncategorized')}].map(c=>`<label class="check-label"><input type="checkbox" name="scope" value="${c.id}" ${app.scope.includes(c.id)?'checked':''}>${esc(path(c))}</label>`).join('')}<div class="row"><button class="btn primary" type="submit">${t('save')}</button>${button(t('clear'),'clearScope')}</div></form>`);
}
export function topics(editId) {
  const cs=Object.values(app.model.categories).filter(c=>c.setId===app.setId),c=app.model.categories[editId];
  modal(t('topics'),`${cs.map(cat=>`<div class="topic-row"><span>${esc(cat.name)}</span><div class="row">${button(t('edit'),'editTopic','quiet',`data-id="${cat.id}"`)}${button('&times;','deleteTopic','icon-button',`data-id="${cat.id}" aria-label="${t('delete')} ${esc(cat.name)}"`)}</div></div>`).join('')}
  <form id="topic-form" data-id="${c?.id||''}" class="stack">${field('topicName','name',c?.name||'','required maxlength="100"')}<label>${t('parent')}<select name="parentId"><option value="">${t('root')}</option>${cs.filter(cat=>!c||!descendants(app.model.categories,c.id).has(cat.id)).map(cat=>`<option value="${cat.id}" ${cat.id===c?.parentId?'selected':''}>${esc(cat.name)}</option>`).join('')}</select></label><button type="submit" class="btn primary">${t(c?'save':'addTopic')}</button></form>`);
}
export async function logoutAction() {
  if(pendingCount())throw new Error(t('logoutBlocked'));
  await api('logout',{});localStorage.removeItem('vocalearn-user');location.reload();
}
