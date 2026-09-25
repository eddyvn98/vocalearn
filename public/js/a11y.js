let composing=false;
const focusable='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
export const isComposing=()=>composing;
function trap(dialog,event){
  if(event.key!=='Tab')return;
  const items=[...dialog.querySelectorAll(focusable)].filter(el=>!el.hidden&&el.getClientRects().length);
  if(!items.length){event.preventDefault();dialog.focus();return;}
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
function viewport(){
  const v=window.visualViewport;
  if(!v)return;
  const inset=Math.max(0,Math.round(window.innerHeight-v.height-v.offsetTop));
  document.documentElement.style.setProperty('--visual-viewport-height',Math.round(v.height)+'px');
  document.documentElement.style.setProperty('--keyboard-inset',inset+'px');
  document.body.classList.toggle('keyboard-open',inset>80);
}
export function installAccessibility(){
  document.addEventListener('compositionstart',()=>{composing=true;},true);
  document.addEventListener('compositionend',()=>{composing=false;},true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&(event.isComposing||composing))event.preventDefault();
    const dialog=document.querySelector('#modal');
    if(dialog?.open)trap(dialog,event);
  },true);
  document.addEventListener('focusin',event=>{
    if(!document.body.classList.contains('keyboard-open'))return;
    if(!event.target.matches('input,textarea,select,[contenteditable="true"]'))return;
    requestAnimationFrame(()=>event.target.scrollIntoView({block:'center',inline:'nearest'}));
  });
  window.visualViewport?.addEventListener('resize',viewport);
  window.visualViewport?.addEventListener('scroll',viewport);
  viewport();
}
