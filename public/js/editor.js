import {app} from './state.js';
import {t,esc,button,badge,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,uuid} from './storage.js';
import {normalize} from '/core/grading.js';
import {WORD_FIELDS} from '/core/validation.js';
let editing=null,media={};
const listText=value=>(value||[]).join(', ');
function customText(custom={}) {
  return Object.entries(custom).map(([name,value])=>`${name}: ${value}`).join('\n');
}
function parseCustom(value) {
  const out={};
  for(const raw of String(value||'').split(/\r?\n/)){
    if(!raw.trim())continue;
    const cut=raw.indexOf(':');
    if(cut<1)throw new Error(t('customFormat'));
    const name=raw.slice(0,cut).trim(),entry=raw.slice(cut+1).trim();
    if(!name||Object.hasOwn(out,name))throw new Error(t('customFormat'));
    out[name]=entry;
  }
  return out;
}
export function openEditor(id) {
  editing=id?app.model.words[id]:null;media={};app.dirty=false;
  const w=editing||{};
  const categories=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
  modal(t(editing?'edit':'add'),`<form id="word-form" class="stack">
  ${field('word','word',w.word,'required maxlength="100" autocomplete="off"')}${field('meaning','meaning',w.meaning,'maxlength="2000"')}
  ${field('pos','pos',w.pos,'maxlength="100"')}
  <fieldset><legend>${t('topics')}</legend>${categories.map(c=>`<label class="check-label"><input type="checkbox" name="category" value="${c.id}" ${w.categoryIds?.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||t('uncategorized')}</fieldset>
  <details><summary>${t('advanced')}</summary><div class="stack">${field('ipa','ipa',w.ipa)}${field('level','level',w.level,'maxlength="100"')}${field('variants','variants',listText(w.variants),'maxlength="2000"')}${field('tags','tags',listText(w.tags),'maxlength="2000"')}
  ${field('sentence','sentence',w.sentence,'placeholder="Yesterday, I ___ to school."')}${field('answers','answers',listText(w.answers))}
  <label>${t('note')}<textarea name="note" rows="3">${esc(w.note||'')}</textarea></label>
  <label>${t('customFields')}<textarea name="custom" rows="4" placeholder="${esc(t('customExample'))}">${esc(customText(w.custom))}</textarea></label>
  <small class="muted">${t('customHelp')}</small>
  <label>${t('imageFile')}<input type="file" id="image-upload" accept="image/png,image/jpeg,image/webp"></label><div id="media-image">${w.image?`<img class="editor-image" src="${esc(w.image)}" alt="${t('image')}">`:''}</div>${button(t('clear'),'clearImage','quiet')}
  <label>${t('audioFile')}<input type="file" id="audio-upload" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"></label><small id="audio-status">${w.audio?t('saved'):t('missingAudio')}</small>${button(t('clear'),'clearAudio','quiet')}
  <p class="muted small">${t('mediaHelp')}</p></div></details>
  ${editing?`<label>${t('changeMeaning')}<select name="identity"><option value="copy">${t('createCopy')}</option><option value="reset">${t('resetProgress')}</option></select></label>`:''}
  ${w.errors?.inBook?`<section class="info"><p>${w.errors.failures} ${t('mistakes')} \u00b7 ${w.errors.evidence.length}/2 ${t('evidence')}</p><p>${t('evidenceHelp')}</p>${w.errors.evidence.map(e=>`<p>${t(e.game)} \u00b7 ${new Date(e.at).toLocaleString('vi-VN')}</p>`).join('')}</section>`:''}
  <div class="row between wrap">${editing?button(t('delete'),'deleteWord','danger',`data-id="${editing.id}"`):button(t('cancel'),'close','quiet')}<button type="submit" class="btn primary">${t('save')}</button></div></form>`);
}
export async function saveWord(form) {
  const f=new FormData(form),patch={word:String(f.get('word')).trim(),meaning:String(f.get('meaning')).trim(),
    pos:String(f.get('pos')).trim(),ipa:String(f.get('ipa')).trim(),level:String(f.get('level')).trim(),
    variants:String(f.get('variants')).split(/[,;\n]/).map(s=>s.trim()).filter(Boolean),
    tags:String(f.get('tags')).split(/[,;\n]/).map(s=>s.trim()).filter(Boolean),
    sentence:String(f.get('sentence')).trim(),
    answers:String(f.get('answers')).split(/[,;\n]/).map(s=>s.trim()).filter(Boolean),
    note:String(f.get('note')).trim(),custom:parseCustom(f.get('custom')),...media};
  if(!patch.word)throw new Error(t('word'));
  if(patch.sentence&&(patch.sentence.split('___').length!==2||!patch.answers.length))throw new Error(t('missingSentence'));
  const identity=editing&&(normalize(editing.word)!==normalize(patch.word)||normalize(editing.meaning)!==normalize(patch.meaning));
  const copy=identity&&f.get('identity')!=='reset';
  const id=editing&&!copy?editing.id:uuid();
  if(Object.values(app.model.words).some(w=>!w.deleted&&w.id!==id&&w.setId===app.setId&&normalize(w.word)===normalize(patch.word)&&normalize(w.meaning)===normalize(patch.meaning)&&normalize(w.pos)===normalize(patch.pos)))throw new Error(t('duplicate'));
  const actual=copy?Object.fromEntries(Object.entries({...editing,...patch}).filter(([k])=>WORD_FIELDS.has(k))):patch;
  const changed=editing&&!copy?Object.fromEntries(Object.entries(actual).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(editing[k]??''))):actual;
  const events=[prepare('word',{id,setId:app.setId,patch:changed,baseFields:editing&&!copy?editing.fields:{}})];
  if(identity&&!copy)events.push(prepare('resetWord',{id}));
  const selected=f.getAll('category');
  const old=editing&&!copy?editing.categoryIds:[];
  for(const categoryId of new Set([...selected,...old])) {
    if(selected.includes(categoryId)===old.includes(categoryId))continue;
    events.push(prepare(selected.includes(categoryId)?'link':'unlink',{wordId:id,categoryId,
      base:app.model.links[`${id}/${categoryId}`]?.rev||null}));
  }
  await transact(events);app.model=model();app.dirty=false;closeModal();app.render();notify(t('saved'));
}
export async function mediaFile(file,type) {
  if(!file)return;
  if(file.size>1500000)throw new Error('Maximum upload: 1.5 MB');
  const uri=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
  if(type==='image'&&!/^data:image\/(png|jpeg|webp);base64,/.test(uri))throw new Error('PNG, JPEG or WebP only');
  if(type==='audio'&&!/^data:audio\/(mpeg|wav|ogg|webm|mp4);base64,/.test(uri))throw new Error('Unsupported audio type');
  media[type]=uri;app.dirty=true;
  if(type==='image')document.querySelector('#media-image').innerHTML=`<img class="editor-image" src="${esc(uri)}" alt="${t('image')}">`;
  else document.querySelector('#audio-status').textContent=file.name;
}
export function clearMedia(type) {
  media[type]='';app.dirty=true;
  document.querySelector(type==='image'?'#media-image':'#audio-status').textContent='';
}
export async function deleteWord(id) {
  if(!confirm(t('confirmDelete')))return;
  await transact([prepare('deleteWord',{id})]);app.model=model();app.dirty=false;closeModal();app.render();
}
export function trash() {
  const deleted=Object.values(app.model.words).filter(w=>w.deleted&&w.setId===app.setId);
  modal(t('deleted'),deleted.map(w=>`<div class="topic-row"><span>${esc(w.word)} \u00b7 ${esc(w.meaning)}</span>${button(t('restore'),'restoreWord','',`data-id="${w.id}"`)}</div>`).join('')||`<p>${t('noResults')}</p>`);
}
