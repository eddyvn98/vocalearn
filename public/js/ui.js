import {vi} from './vi.js';
import {app} from './state.js';
export const t = key => vi[key] ?? key;
export const esc = s => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const button = (label,action,cls='',attrs='') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
export const iconButton = (label,action,name,cls='',attrs='') => `<button type="button" class="btn icon-button ${cls}" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(name)}</button>`;
export const badge = (label,kind='')=>`<span class="badge ${kind}">${label}</span>`;
export const field = (label,name,value='',extra='')=>`<label>${t(label)}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const paths={book:'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z M12 5v15',
 home:'m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-8h6v8',list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
 flag:'M5 21V4 M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0',arrow:'M5 12h14 m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',
 plus:'M12 5v14 M5 12h14',gear:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
 edit:'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',trash:'M4 7h16 M9 7V4h6v3 M7 7l1 13h8l1-13 M10 11v5 M14 11v5',
 download:'M12 3v12 m-5-5 5 5 5-5 M5 21h14',upload:'M12 21V9 m-5 5 5-5 5 5 M5 3h14',
 tag:'M3 12l9 9 9-9-9-9H3v9z M8 8h.01',sliders:'M4 6h16 M8 3v6 M4 12h16 M15 9v6 M4 18h16 M11 15v6',
 database:'M4 6c0-2 16-2 16 0s-16 2-16 0z M4 6v6c0 2 16 2 16 0V6 M4 12v6c0 2 16 2 16 0v-6',
 refresh:'M20 7v5h-5 M4 17v-5h5 M18 10a7 7 0 0 0-12-3 M6 14a7 7 0 0 0 12 3',
 search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M16 16l5 5',x:'M6 6l12 12 M18 6 6 18',
 sparkles:'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z M5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15z',
 eraser:'M4 16l8-8 6 6-6 6H8l-4-4z M11 20h9',folder:'M3 7h7l2 2h9v10H3V7z'};
export const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="${paths[name]||paths.arrow}"/></svg>`;
export const brand=()=>`<div class="brand"><span class="brand-mark">${icon('book')}</span>VocaLearn</div>`;
export function notify(text,error=false) {
  const el=document.querySelector('#notice');el.textContent=text;el.className=error?'notice error':'notice';
  if(!error)setTimeout(()=>{if(el.textContent===text)el.textContent='';},4500);
}
let opener,trigger,bound=false,lastModal=null,reopening=false;
export function setModalTrigger(el){trigger=el;}
export function clearModalTrigger(){trigger=null;}
function paintModal(title,html) {
  const d=document.querySelector('#modal');
  d.innerHTML=`<header class="row between"><h2 id="dialog-title">${esc(title)}</h2>${iconButton(t('close'),'close','x')}</header>${html}<p id="form-error" class="error-text" role="alert"></p>`;
  if(!bound){d.addEventListener('close',()=>{const target=opener;setTimeout(()=>{if(target?.isConnected)target.focus();},50);});bound=true;}
  if(!d.open)d.showModal();
  requestAnimationFrame(()=>d.querySelector('input,select,textarea,button,[href]')?.focus());
}
export function modal(title,html) {
  const d=document.querySelector('#modal');
  if(!d.open)opener=trigger?.isConnected?trigger:document.activeElement;
  lastModal={title,html};paintModal(title,html);
  if(!reopening&&history.state?.voca&&!history.state?.vocaModal)history.pushState({...history.state,vocaModal:true},'');
}
export function closeModal(viaHistory=false){
  const d=document.querySelector('#modal'),target=opener;
  if(viaHistory&&d.open&&history.state?.vocaModal){history.back();return;}
  if(d.open)d.close();
  if(history.state?.vocaModal)history.replaceState({...history.state,vocaModal:false},'');
  setTimeout(()=>{if(target?.isConnected)target.focus();},50);
}
window.addEventListener('popstate',event=>{
  const d=document.querySelector('#modal');
  if(event.state?.vocaModal){
    if(!d.open&&lastModal){reopening=true;paintModal(lastModal.title,lastModal.html);reopening=false;}
    return;
  }
  if(!d.open)return;
  if(app.dirty&&!confirm(t('unsaved'))){history.forward();return;}
  app.dirty=false;d.close();
});
