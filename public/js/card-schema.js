import {app} from './state.js';
import {t,esc,button,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,uuid} from './storage.js';

const currentSet=()=>app.model.sets[app.setId];
const defs=()=>currentSet()?.customFields||[];

export function customFields(editId) {
  const editing=defs().find(item=>item.id===editId);
  modal(t('customFields'),`<div class="stack">
    <div class="topic-tree">${defs().map(item=>`<div class="topic-row"><span><strong>${esc(item.label)}</strong> <small class="muted">· ${t('customType_'+item.type)}</small></span>
      <div class="row">${button(t('edit'),'editCustomField','quiet',`data-id="${item.id}"`)}
      ${button('&times;','deleteCustomField','icon-button',`data-id="${item.id}" aria-label="${t('delete')} ${esc(item.label)}"`)}</div></div>`).join('')||`<p class="muted">${t('noCustomFields')}</p>`}</div>
    <form id="custom-field-form" data-id="${editing?.id||''}" class="stack">
      ${field('customFieldName','label',editing?.label||'','required maxlength="100"')}
      <label>${t('customFieldType')}<select name="type">
        ${['text','number','select'].map(type=>`<option value="${type}" ${editing?.type===type?'selected':''}>${t('customType_'+type)}</option>`).join('')}
      </select></label>
      <label>${t('customFieldOptions')}<input name="options" value="${esc((editing?.options||[]).join(', '))}" maxlength="2000" placeholder="${t('customFieldOptionsHint')}"></label>
      <p class="muted small">${t('customFieldsHelp')}</p>
      <button type="submit" class="btn primary">${t(editing?'save':'add')}</button>
    </form></div>`);
}
function setEvent(customFields) {
  const set=currentSet();
  return prepare('set',{id:set.id,name:set.name,language:set.language,meaningLanguage:set.meaningLanguage,customFields});
}
export async function saveCustomField(form) {
  const data=new FormData(form),id=form.dataset.id||uuid(),label=String(data.get('label')||'').trim();
  const type=String(data.get('type')||'text');
  const options=type==='select'?[...new Set(String(data.get('options')||'').split(',').map(x=>x.trim()).filter(Boolean))]:[];
  if(!label)throw new Error(t('customFieldName'));
  if(type==='select'&&!options.length)throw new Error(t('customFieldOptionsRequired'));
  const next=defs().filter(item=>item.id!==id);
  if(next.some(item=>item.label.toLocaleLowerCase('vi')===label.toLocaleLowerCase('vi')))throw new Error(t('duplicateCustomField'));
  next.push({id,label,type,options});
  await transact([setEvent(next)]);app.model=model();closeModal();customFields();notify(t('saved'));
}
export async function deleteCustomField(id) {
  const item=defs().find(field=>field.id===id);if(!item)return;
  if(!confirm(`${t('delete')} "${item.label}"? ${t('customDeleteKeepsData')}`))return;
  await transact([setEvent(defs().filter(field=>field.id!==id))]);app.model=model();customFields();notify(t('saved'));
}
