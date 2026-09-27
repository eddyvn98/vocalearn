import {vi} from './vi.js';
export const t = key => vi[key] ?? key;
export const esc = s => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const button = (label,action,cls='',attrs='') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
export const badge = (label,kind='')=>`<span class="badge ${kind}">${label}</span>`;
export const field = (label,name,value='',extra='')=>`<label>${t(label)}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const paths={book:'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z M12 5v15',
 home:'m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
 flag:'M5 21V4 M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0',arrow:'M5 12h14 m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',
 plus:'M12 5v14 M5 12h14',gear:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'};
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
export const brand=()=>`<div class="brand"><span class="brand-mark">${icon('book')}</span>VocaLearn</div>`;
export function notify(text,error=false) {
  const el=document.querySelector('#notice');el.textContent=text;el.className=error?'notice error':'notice';
  if(!error)setTimeout(()=>{if(el.textContent===text)el.textContent='';},4500);
}
let opener;
export function modal(title,html) {
  const d=document.querySelector('#modal');opener=document.activeElement;
  d.innerHTML=`<header class="row between"><h2 id="dialog-title">${esc(title)}</h2>${button('&times;','close','icon-button',`aria-label="${t('close')}"`)}</header>${html}<p id="form-error" class="error-text" role="alert"></p>`;
  d.showModal();
  requestAnimationFrame(()=>d.querySelector('[autofocus],input:not([type="hidden"]),select,textarea,button:not([data-action="close"])')?.focus());
}
export function closeModal(){document.querySelector('#modal').close();if(opener?.isConnected)opener.focus();}
