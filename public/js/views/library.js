import {app,words} from '../state.js';
import {button,iconButton,icon,t,esc,badge} from '../ui.js';
import {isDue} from '/core/time.js';
import {categoryPath} from '/core/model.js';
import {scoped} from './home.js';
import {shell} from './shell.js';
export function filtered() {
  const query=app.query.toLocaleLowerCase('vi');
  return scoped().filter(w=>{
    const text=[w.word,w.meaning,w.pos,w.ipa,w.level,w.register,w.source,...(w.variants||[]),...(w.tags||[]),...(w.synonyms||[]),...(w.antonyms||[]),...Object.values(w.custom||{}),...w.categoryIds.map(id=>app.model.categories[id]?.name)].join(' ').toLocaleLowerCase('vi');
    const status=app.filter==='all'||app.filter==='due'&&isDue(w.review,Date.now(),app.model.settings.zone)
      ||app.filter==='waiting'&&!w.ready||app.filter==='new'&&w.review.phase==='new'&&w.ready
      ||app.filter==='learning'&&['learning','relearn'].includes(w.review.phase)||app.filter==='errors'&&w.errors.inBook;
    return text.includes(query)&&status;
  });
}
function evidenceHint(w,now=Date.now()) {
  if(!w.errors?.inBook)return '';
  const evidence=w.errors.evidence||[];
  if(!evidence.length)return 'Cần 2 minh chứng đúng sạch từ 2 game khác nhau, cách nhau ít nhất 10 phút; ít nhất 1 game nhớ lại.';
  const first=evidence[0],wait=Math.max(0,Math.ceil((first.at+600000-now)/60000));
  const game=evidence.some(e=>e.recall)?'một game khác':'một game nhớ lại khác';
  return `Cần thêm minh chứng đúng sạch ở ${game}${wait?` sau ít nhất ${wait} phút`:''}.`;
}
function errorDetails(w,now=Date.now()) {
  if(!w.errors?.inBook)return '';
  const e=w.errors,req=e.requirements||{},next=req.nextEvidenceAt;
  return `<details class="error-evidence"><summary>${t('whyInErrorBook')}</summary>
    <p>${t('currentErrorEpisode')}: <strong>${e.episodeFailures??e.failures}</strong> · ${t('historicalErrors')}: <strong>${e.historicalFailures??e.total}</strong></p>
    ${e.persistent?`<p class="error-text">${t('persistentHelp')}</p>`:''}
    <p>${t('cleanEvidence')}: ${(e.evidence||[]).length}/2 · ${req.recallNeeded?t('recallStillNeeded'):t('recallSatisfied')}</p>
    ${(e.evidence||[]).map(item=>`<p>${t(item.game)} · ${item.recall?t('recallGame'):t('recognitionGame')} · ${new Date(item.at).toLocaleString('vi-VN',{timeZone:app.model.settings.zone})}</p>`).join('')}
    ${next&&next>now?`<p class="muted">${t('nextCleanEligible')}: ${new Date(next).toLocaleString('vi-VN',{timeZone:app.model.settings.zone})}</p>`:''}
    <p class="muted small">${t('errorExitRule')}</p><p class="muted small">${t('resetKeepsErrorHistory')}</p>
  </details>`;
}
export function rows() {
  app.selectedCards = app.selectedCards || new Set();
  const list = filtered();
  return list.map(w => {
    const topics=w.categoryIds?.map(id=>app.model.categories[id]).filter(Boolean).map(cat=>categoryPath(app.model.categories,cat.id)).join(' · ')||t('uncategorized');
    return `<article class="word-row ${app.selectedCards.has(w.id) ? 'selected' : ''}"><div class="row items-center word-primary"><label class="card-select-target"><input type="checkbox" class="card-select" data-action="toggleSelect" data-id="${w.id}" ${app.selectedCards.has(w.id) ? 'checked' : ''} aria-label="Chọn ${esc(w.word)}"></label><div><h3>${esc(w.word)}</h3><small class="muted">${esc(w.pos||'')} ${esc(w.ipa||'')}</small></div></div><p class="word-meaning">${esc(w.meaning||t('waiting'))}</p><p class="word-topic muted small" title="${esc(topics)}">${esc(topics)}</p><div class="word-status">${badge(t(!w.ready?'waiting':w.review.phase==='review'?'reviewing':w.review.phase))}${w.errors.inBook?badge(t(w.errors.persistent?'persistent':'errors'),'warn'):''}${w.review.dueDate?`<small>${esc(w.review.dueDate)}</small>`:''}${w.errors.inBook?`<small>${esc(evidenceHint(w))}</small>`:''}</div>${app.page==='errors'?errorDetails(w):''}${iconButton(t('edit'),'edit','edit','quiet',`data-id="${w.id}"`)}</article>`;
  }).join('') || `<div class="empty"><h2>${t('noResults')}</h2>${button(t('clear'),'clearFilter')}</div>`;
}

export function libraryView() {
  app.selectedCards = app.selectedCards || new Set();
  const list = filtered();
  const selectedCount = app.selectedCards.size;
  return shell(`<header class="page-heading row between wrap"><div><span class="eyebrow">${esc(app.model.sets[app.setId]?.name)}</span><h1 tabindex="-1">${t(app.page==='errors'?'errors':'library')}</h1></div>${iconButton(t('chooseScope'),'scope','tag','quiet')}</header>
  <div class="row wrap toolbar"><input id="search" type="search" class="search" placeholder="${t('search')}" aria-label="${t('search')}" value="${esc(app.query)}"><div class="row toolbar-icons">${button(`${icon('plus')}<span>${t('add')}</span>`,'add','primary library-add')}<details class="toolbar-more"><summary class="btn icon-button" aria-label="Thêm thao tác" title="Thêm thao tác">${icon('sliders')}</summary><div class="toolbar-menu">${button(`${icon('tag')}${t('topics')}`,'topics','quiet')}${button(`${icon('sliders')}${t('customFields')}`,'customFields','quiet')}${button(`${icon('download')}Xuất Excel`,'export','quiet')}${button(`${icon('database')}Tài nguyên`,'offlineResources','quiet')}</div></details></div></div>
  <div class="tabs">${['all','due','new','learning','waiting','errors'].map(f=>button(t(f),'filter',app.filter===f?'active':'',`data-filter="${f}" aria-pressed="${app.filter===f}"`)).join('')}</div>
  ${selectedCount ? `<section class="resume row between wrap"><div><strong>${selectedCount} thẻ đã chọn</strong></div><div class="row wrap">${iconButton(t('topics'),'bulkTopic','tag')}${iconButton('Chuyển chủ đề','moveCardTopic','arrow')}${iconButton('Đặt lại lịch','bulkReset','refresh')}${iconButton('Xóa','bulkDelete','trash','danger')}${iconButton('Bỏ chọn','clearSelect','x','quiet')}</div></section>` : ''}
  <div class="row between items-center sub-toolbar"><small class="muted">${list.length} thẻ</small>${list.length ? button(selectedCount === list.length ? 'Bỏ chọn tất cả' : t('selectVisible'), 'toggleSelectAll', 'quiet small') : ''}</div>
  ${app.page==='errors'?`<section class="resume"><p>${t('evidenceHelp')}</p>${button(t('free'),'setupErrors','primary')}</section>`:''}<div class="word-list-head" aria-hidden="true"><span>Từ</span><span>Nghĩa</span><span>Chủ đề</span><span>Trạng thái / đến hạn</span><span></span></div><div id="word-rows" class="word-list">${rows()}</div>
  <div class="row wrap foot-actions">${iconButton(t('import'),'import','upload')}${!words().length?button(t('loadSamples'),'samples'):''}${iconButton(t('deleted'),'trash','trash','quiet')}</div>`);
}
