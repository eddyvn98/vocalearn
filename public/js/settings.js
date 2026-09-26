import {app,words} from './state.js';
import {t,esc,button,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,api,sync,pendingCount,getMeta,setMeta,currentDeviceId} from './storage.js';
import {descendants,inScope,categoryPath} from '/core/model.js';
import {scheduleAdjustments as diffSchedules} from '/core/sync-diff.js';
import {cleanupLocalMedia,cleanupServerMedia,currentMediaStatus,localMediaStats} from './media-store.js';
export function settings() {
  const s=app.model.settings,device=currentDeviceId(),primary=!s.reminderPrimaryDevice||s.reminderPrimaryDevice===device;
  const permission=typeof Notification==='undefined'?t('notificationUnsupported'):t('notification_'+Notification.permission);
  modal(t('settings'),`<form id="settings-form" class="stack">${field('newLimit','newLimit',s.newLimit,'type="number" min="0" max="200" required')}${field('zone','zone',s.zone,'required')}
  <label class="check-label"><input type="checkbox" name="reminder" ${s.reminder?'checked':''}>${t('reminder')}</label>${field('reminderTime','reminderTime',s.reminderTime,'type="time" required')}
  <label class="check-label"><input type="checkbox" name="reminderPrimary" ${primary?'checked':''}>${t('reminderPrimary')}</label>
  <p class="muted small">${t('reminderHelp')} ${t('notificationStatus')}: ${permission}.</p>
  <details><summary>${t('advanced')}</summary><div class="stack"><label>Hard multiplier<input type="number" name="hardFactor" step="0.1" min="1" max="3" value="${s.hardFactor}"></label><label>Easy multiplier<input type="number" name="easyFactor" step="0.1" min="1" max="3" value="${s.easyFactor}"></label><label>Easy threshold (ms)<input type="number" name="easyMs" min="1000" max="120000" value="${s.easyMs}"></label></div></details>
  <div class="row between"><button type="submit" class="btn primary">${t('save')}</button>${button(t('logout'),'logout','danger')}</div></form><p class="muted small">${esc(app.user.email)} \u00b7 ${t('onlyLocal')}</p>`);
}
export async function saveSettings(form) {
  const f=new FormData(form),oldZone=app.model.settings.zone,zone=f.get('zone');
  if(zone!==oldZone&&!confirm('Change account timezone? Existing due dates will not be rewritten.'))return;
  const reminder=f.has('reminder'),device=currentDeviceId(),claim=f.has('reminderPrimary'),old=app.model.settings.reminderPrimaryDevice;
  const reminderPrimaryDevice=reminder?(claim?device:(old===device?'':old)):old;
  if(reminder&&reminderPrimaryDevice===device&&typeof Notification!=='undefined'&&Notification.permission==='default'){
    const permission=await Notification.requestPermission();if(permission==='denied')notify(t('reminderFallback'));
  }
  const data={zone,newLimit:Number(f.get('newLimit')),hardFactor:Number(f.get('hardFactor')),
    easyFactor:Number(f.get('easyFactor')),easyMs:Number(f.get('easyMs')),reminder,reminderTime:f.get('reminderTime'),reminderPrimaryDevice};
  await transact([prepare('settings',data)]);app.model=model();closeModal();app.render();
}
export async function syncNow() {
  const before=app.model;
  await sync();app.model=model();
  const changes=diffSchedules(before,app.model);
  if(changes.length){
    const history=await getMeta('scheduleAdjustments')||[],at=Date.now();
    const fresh=changes.filter(change=>!history.some(old=>old.wordId===change.wordId
      &&old.beforeRev===change.beforeRev&&old.afterRev===change.afterRev));
    if(fresh.length)await setMeta('scheduleAdjustments',[...history,...fresh.map(change=>({...change,at}))].slice(-50));
    notify(t('scheduleAdjusted'));
  }
  if(app.page!=='study'&&!document.querySelector('#modal').open)app.render();return changes.length>0;
}
function scheduleChange(change) {
  const step=value=>value==null?'—':String(Number(value)+1);
  const reason=t(change.reason==='late-parent'?'lateParentReason':change.reason==='merged-result'?'mergedResultReason':'replayReason');
  const logs=change.retained?.length?change.retained.join(', '):change.newlyAccepted?.join(', ')||'—';
  return `<div class="conflict"><strong>${esc(change.word||app.model.words[change.wordId]?.word||change.wordId)}</strong>
    <p>${esc(change.beforePhase)} · ${t('step')} ${step(change.beforeStep)} → ${esc(change.afterPhase)} · ${t('step')} ${step(change.afterStep)}</p>
    <p>${esc(reason)}</p><small class="muted">${esc(change.beforeRev.slice(0,16))} → ${esc(change.afterRev.slice(0,16))}</small>
    <p class="muted small">${t('retainedLogs')}: ${esc(logs)}</p></div>`;
}
export async function syncInfo() {
  const [at,schedule]=await Promise.all([getMeta('lastSync'),getMeta('scheduleAdjustments')]);
  const changes=(schedule||[]).slice(-20).reverse();
  modal(t('sync'),`<div class="stack"><p>${t('saved')} · ${pendingCount()} ${t('pending')}</p><p>${t('lastSync')}: ${at?new Date(at).toLocaleString('vi-VN'):'—'}</p><p class="muted small">${t('phaseNotice')}</p>${button(t('sync'),'sync','primary')}
  <details><summary>${t('scheduleChanges')} (${changes.length})</summary>${changes.map(scheduleChange).join('')||`<p class="muted">${t('noScheduleChanges')}</p>`}</details>
  <details><summary>${t('conflicts')} (${app.model.conflicts.length})</summary>${app.model.conflicts.slice(-20).reverse().map(c=>`<div class="conflict"><strong>${esc(app.model.words[c.wordId]?.word)} · ${esc(c.field)}</strong><p>${esc(String(c.before).slice(0,200))} → ${esc(String(c.after).slice(0,200))}</p>${button(t('restore'),'restoreField','',`data-id="${c.eventId}" data-field="${c.field}"`)}</div>`).join('')}</details></div>`);
}

export function buildTopicTree(categories, parentId = null, depth = 0) {
  const list = Object.values(categories).filter(c => (c.parentId || null) === parentId)
    .sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name,'vi'));
  const out = [];
  for (const c of list) {
    out.push({...c, depth});
    out.push(...buildTopicTree(categories, c.id, depth + 1));
  }
  return out;
}

export function scopeModal() {
  const cs = Object.values(app.model.categories).filter(c => c.setId === app.setId);
  const tree = buildTopicTree(Object.fromEntries(cs.map(cat => [cat.id, cat])));
  const allCards = words();
  modal(t('scope'), `<form id="scope-form" class="stack"><p>${t('all')}: ${t('clear')}</p>
    ${tree.map(c => {
      const count = allCards.filter(w => inScope(w, [c.id], app.model.categories)).length;
      const indent = '\u00a0\u00a0\u00a0\u00a0'.repeat(c.depth) + (c.depth ? '└─ ' : '');
      return `<label class="check-label"><input type="checkbox" name="scope" value="${c.id}" ${app.scope.includes(c.id)?'checked':''}>${indent}${esc(c.name)} <small class="muted">(${count})</small></label>`;
    }).join('')}
    <label class="check-label"><input type="checkbox" name="scope" value="uncategorized" ${app.scope.includes('uncategorized')?'checked':''}>${t('uncategorized')} <small class="muted">(${allCards.filter(w => !w.categoryIds.length).length})</small></label>
    <div class="row"><button class="btn primary" type="submit">${t('save')}</button>${button(t('clear'),'clearScope')}</div></form>`);
}

function topicBranches(categories,parentId,allCards) {
  const children=Object.values(categories).filter(cat=>(cat.parentId||null)===parentId)
    .sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name,'vi'));
  return children.map(cat=>{
    const count=allCards.filter(w=>inScope(w,[cat.id],categories)).length;
    const nested=topicBranches(categories,cat.id,allCards);
    return `<details class="topic-branch" open><summary>${esc(cat.name)} <small class="muted">(${count} thẻ)</small></summary>
      <div class="topic-row"><small class="muted">${esc(categoryPath(categories,cat.id))}</small><div class="row">
      ${button('↑','moveTopicUp','quiet',`data-id="${cat.id}" aria-label="${t('moveUp')} ${esc(cat.name)}"`)}
      ${button('↓','moveTopicDown','quiet',`data-id="${cat.id}" aria-label="${t('moveDown')} ${esc(cat.name)}"`)}
      ${button('+','addSubtopic','quiet',`data-id="${cat.id}" aria-label="${t('addSubtopic')} ${esc(cat.name)}"`)}
      ${button(t('edit'),'editTopic','quiet',`data-id="${cat.id}"`)}
      ${button('&times;','deleteTopic','icon-button',`data-id="${cat.id}" aria-label="${t('delete')} ${esc(cat.name)}"`)}</div></div>
      ${nested?`<div class="topic-children">${nested}</div>`:''}</details>`;
  }).join('');
}
export function topics(editId,parentDefault=null) {
  const cs=Object.values(app.model.categories).filter(c=>c.setId===app.setId),c=app.model.categories[editId];
  const categories=Object.fromEntries(cs.map(cat=>[cat.id,cat])),allCards=words();
  modal(t('topics'),`<div class="stack"><div class="topic-tree">${topicBranches(categories,null,allCards)||`<p class="muted">${t('noTopics')}</p>`}</div>
  <form id="topic-form" data-id="${c?.id||''}" class="stack">${field('topicName','name',c?.name||'','required maxlength="100"')}
    <label>${t('parent')}<select name="parentId"><option value="">${t('root')}</option>
    ${cs.filter(cat=>!c||!descendants(app.model.categories,c.id).has(cat.id)).map(cat=>`<option value="${cat.id}" ${cat.id===(c?.parentId||parentDefault)?'selected':''}>${esc(categoryPath(app.model.categories,cat.id))}</option>`).join('')}</select></label>
    <button type="submit" class="btn primary">${t(c?'save':'addTopic')}</button></form></div>`);
}
export async function moveTopic(id,direction) {
  const target=app.model.categories[id];if(!target)return;
  const siblings=Object.values(app.model.categories).filter(cat=>cat.setId===target.setId&&(cat.parentId||null)===(target.parentId||null))
    .sort((a,b)=>(a.order??0)-(b.order??0)||a.name.localeCompare(b.name,'vi'));
  const index=siblings.findIndex(cat=>cat.id===id),other=siblings[index+(direction<0?-1:1)];
  if(!other)return;
  const base=siblings.map((cat,i)=>({...cat,order:i}));
  const a=base.find(cat=>cat.id===id),b=base.find(cat=>cat.id===other.id),tmp=a.order;a.order=b.order;b.order=tmp;
  await transact([prepare('category',{id:a.id,setId:a.setId,name:a.name,parentId:a.parentId||null,order:a.order}),
    prepare('category',{id:b.id,setId:b.setId,name:b.name,parentId:b.parentId||null,order:b.order})]);
  app.model=model();topics();app.render();
}

const formatBytes=value=>value<1024?`${value} B`:value<1048576?`${(value/1024).toFixed(1)} KB`:`${(value/1048576).toFixed(1)} MB`;
export async function offlineResources() {
  const all=words(),status=await currentMediaStatus(all),local=await localMediaStats();
  let remote=null;try{remote=await api('media-info');}catch{}
  modal(t('offlineResources'),`<div class="stack">
    <p><strong>${all.length}</strong> ${t('cards')} · <strong>${status.total}</strong> ${t('mediaReferences')}</p>
    <div class="setup-stats"><p>✓ <strong>${status.available}</strong> ${t('mediaAvailable')}</p>
      <p>↓ <strong>${status['not-downloaded']}</strong> ${t('mediaNotDownloaded')}</p>
      <p>! <strong>${status.corrupt}</strong> ${t('mediaCorrupt')}</p>
      <p>↺ <strong>${status.legacy}</strong> ${t('mediaLegacy')}</p></div>
    <p>${t('localMediaCache')}: <strong>${local.count}</strong> · ${formatBytes(local.bytes)}</p>
    <p>${t('serverMediaStore')}: ${remote?`<strong>${remote.count}</strong> · ${formatBytes(remote.bytes)} / ${formatBytes(remote.limit)}`:t('offline')}</p>
    <div class="info"><p>${t('mediaResourceHelp')}</p><p>${t('mediaFailureSafe')}</p></div>
    <div class="row wrap">${button(t('cleanupLocal'),'cleanupMediaLocal')}${remote?button(t('cleanupServer'),'cleanupMediaServer','quiet'):''}${button(t('close'),'close','primary')}</div></div>`);
}
export async function cleanupResources(target) {
  const result=target==='server'?await cleanupServerMedia():await cleanupLocalMedia();
  notify(`${t('cleaned')} ${result.removed||0}`);
  await offlineResources();
}

export async function logoutAction() {
  if(pendingCount())throw new Error(t('logoutBlocked'));
  await api('logout',{});localStorage.removeItem('vocalearn-user');location.reload();
}
