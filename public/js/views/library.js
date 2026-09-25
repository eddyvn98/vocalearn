import {app,words} from '../state.js';
import {button,t,esc,badge} from '../ui.js';
import {isDue} from '/core/time.js';
import {scoped} from './home.js';
import {shell} from './shell.js';
export function filtered() {
  const query=app.query.toLocaleLowerCase('vi');
  return scoped().filter(w=>{
    const text=[w.word,w.meaning,...w.categoryIds.map(id=>app.model.categories[id]?.name)].join(' ').toLocaleLowerCase('vi');
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
export function rows() {
  app.selectedCards = app.selectedCards || new Set();
  const list = filtered();
  return list.map(w => `<article class="word-row ${app.selectedCards.has(w.id) ? 'selected' : ''}"><div class="row items-center"><input type="checkbox" class="card-select" data-action="toggleSelect" data-id="${w.id}" ${app.selectedCards.has(w.id) ? 'checked' : ''} aria-label="Chọn ${esc(w.word)}"><div><h3>${esc(w.word)}</h3><small class="muted">${esc(w.pos||'')} ${esc(w.ipa||'')}</small></div></div><p>${esc(w.meaning||t('waiting'))}</p><div class="word-status">${badge(t(!w.ready?'waiting':w.review.phase==='review'?'reviewing':w.review.phase))}${w.errors.inBook?badge(t(w.errors.persistent?'persistent':'errors'),'warn'):''}${w.review.dueDate?`<small>${esc(w.review.dueDate)}</small>`:''}${w.errors.inBook?`<small>${esc(evidenceHint(w))}</small>`:''}</div>${button(t('edit'),'edit','quiet',`data-id="${w.id}"`)}</article>`).join('') || `<div class="empty"><h2>${t('noResults')}</h2>${button(t('clear'),'clearFilter')}</div>`;
}

export function libraryView() {
  app.selectedCards = app.selectedCards || new Set();
  const list = filtered();
  const selectedCount = app.selectedCards.size;
  return shell(`<header class="page-heading row between wrap"><div><span class="eyebrow">${esc(app.model.sets[app.setId]?.name)}</span><h1 tabindex="-1">${t(app.page==='errors'?'errors':'library')}</h1></div>${button(t('chooseScope'),'scope')}</header>
  <div class="row wrap toolbar"><input id="search" type="search" class="search" placeholder="${t('search')}" aria-label="${t('search')}" value="${esc(app.query)}">${button('+ '+t('add'),'add','primary')}${button(t('topics'),'topics')}${button('Xuất Excel','export')}${button('Tài nguyên','offlineResources','quiet')}</div>
  <div class="tabs">${['all','due','new','learning','waiting','errors'].map(f=>button(t(f),'filter',app.filter===f?'active':'',`data-filter="${f}" aria-pressed="${app.filter===f}"`)).join('')}</div>
  ${selectedCount ? `<section class="resume row between wrap"><div><strong>${selectedCount} thẻ đã chọn</strong></div><div class="row wrap">${button('Gán chủ đề','bulkTopic')}${button('Đặt lại lịch','bulkReset')}${button('Xóa','bulkDelete','danger')}${button('Bỏ chọn','clearSelect','quiet')}</div></section>` : ''}
  <div class="row between items-center sub-toolbar"><small class="muted">${list.length} thẻ</small>${list.length ? button(selectedCount === list.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả', 'toggleSelectAll', 'quiet small') : ''}</div>
  ${app.page==='errors'?`<section class="resume"><p>${t('evidenceHelp')}</p>${button(t('free'),'setupErrors','primary')}</section>`:''}<div id="word-rows" class="word-list">${rows()}</div>
  <div class="row wrap foot-actions">${button(t('import'),'import')}${!words().length?button(t('loadSamples'),'samples'):''}${button(t('deleted'),'trash','quiet')}</div>`);
}
