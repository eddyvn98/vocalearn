import {app,words} from './state.js';
import {prepare,transact,model,uuid} from './storage.js';
import {esc,t,button,modal,closeModal,notify} from './ui.js';
import {normalize} from '/core/grading.js';
import {validateEvent} from '/core/validation.js';
const ENTRIES=[
 ['deploy','tri\u1ec3n khai','verb','We will ___ the app tomorrow.','deploy'],
 ['confirm','x\u00e1c nh\u1eadn','verb','Please ___ the meeting time.','confirm'],
 ['deadline','h\u1ea1n ch\u00f3t','noun','The ___ is Friday.','deadline'],
 ['improve','c\u1ea3i thi\u1ec7n','verb','We need to ___ the app.','improve'],
 ['go','\u0111i','verb','Yesterday, I ___ to school.','went'],
 ['reliable','\u0111\u00e1ng tin c\u1eady','adjective','She is a ___ teammate.','reliable'],
 ['opportunity','c\u01a1 h\u1ed9i','noun','This is a great ___.','opportunity'],
 ['estimate','\u01b0\u1edbc t\u00ednh','verb','Can you ___ the cost?','estimate'],
];
const meanings=['put an application into use','say that something is correct or agreed','the latest time something must be finished','make something better','move to another place','able to be trusted','a chance to do something','calculate an approximate value'];
export async function samples() {
  const events=ENTRIES.filter(([word])=>!words().some(w=>w.word===word)).map(([word,meaning,pos,sentence,answer])=>prepare('word',{
    id:uuid(),setId:app.setId,patch:{word,meaning:app.model.sets[app.setId].meaningLanguage==='en'?meanings[ENTRIES.findIndex(e=>e[0]===word)]:meaning,pos,sentence,answers:[answer],note:''}}));
  await transact(events);app.model=model();app.render();notify(t('samplesHelp'));
}
export function exportContent() {
  const content=words().map(({word,meaning,ipa,pos,sentence,answers,image,audio,note})=>({word,meaning,ipa,pos,sentence,answers,image,audio,note}));
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'vocalearn-content-1',cards:content},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='vocalearn-content.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let draft=[];
export function importDialog() {
  draft=[];modal(t('import'),`<div class="stack"><p>${t('jsonHelp')}</p><input id="json-file" type="file" accept="application/json,.json"><div id="import-preview"></div>${button(t('import'),'confirmImport','primary','disabled')}</div>`);
}
export async function readImport(file) {
  if(!file||file.size>6000000)throw new Error('Maximum file size: 6 MB');
  const data=JSON.parse(await file.text());
  if(data.format!=='vocalearn-content-1'||!Array.isArray(data.cards)||data.cards.length>200)throw new Error('Expected vocalearn-content-1; maximum 200 cards');
  const seen=new Set(words().map(w=>normalize(w.word)+'|'+normalize(w.meaning)));
  draft=[];let skipped=0;
  for(const card of data.cards){
    const key=normalize(card.word)+'|'+normalize(card.meaning);
    if(seen.has(key)){skipped++;continue;}
    const e=prepare('word',{id:uuid(),setId:app.setId,patch:card});validateEvent(e);draft.push(e);seen.add(key);
  }
  document.querySelector('#import-preview').innerHTML=`<p>${draft.length} ${t('cards')} \u00b7 ${skipped} duplicates skipped</p>${draft.slice(0,15).map(e=>`<p>${esc(e.data.patch.word)} \u2014 ${esc(e.data.patch.meaning)}</p>`).join('')}`;
  document.querySelector('[data-action="confirmImport"]').disabled=!draft.length;
}
export async function confirmImport(){await transact(draft);draft=[];app.model=model();closeModal();app.render();notify(t('saved'));}
