import {app} from './state.js';
import {t,esc,button,badge,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,uuid} from './storage.js';
import {normalize} from '/core/grading.js';
import {categoryPath} from '/core/model.js';
import {WORD_FIELDS} from '/core/validation.js';
let editing=null,media={};
const listValue=value=>(value||[]).join(', ');
function customInputs(w) {
  const defs=app.model.sets[app.setId]?.customFields||[],values=w.custom||{};
  return defs.map(def=>{
    const name=`custom:${def.id}`,value=values[def.id]??'';
    if(def.type==='select')return `<label>${esc(def.label)}<select name="${name}"><option value=""></option>${def.options.map(option=>`<option value="${esc(option)}" ${value===option?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
    return field(def.label,name,value,def.type==='number'?'type="number" step="any"':'maxlength="5000"');
  }).join('');
}

export function openEditor(id) {
  editing=id?app.model.words[id]:null;media={};app.dirty=false;
  const w=editing||{};
  const categories=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
  modal(t(editing?'edit':'add'),`<form id="word-form" class="stack">
  ${field('word','word',w.word,'required maxlength="100" autocomplete="off"')}${field('meaning','meaning',w.meaning,'maxlength="2000"')}
  ${field('pos','pos',w.pos,'maxlength="100"')}
  <fieldset><legend>${t('topics')}</legend>${categories.map(c=>`<label class="check-label"><input type="checkbox" name="category" value="${c.id}" ${w.categoryIds?.includes(c.id)?'checked':''}>${esc(categoryPath(app.model.categories,c.id))}</label>`).join('')||t('uncategorized')}</fieldset>
  <details><summary>${t('advanced')}</summary><div class="stack">${field('ipa','ipa',w.ipa)}${field('sentence','sentence',w.sentence,'placeholder="Yesterday, I ___ to school."')}${field('answers','answers',listValue(w.answers))}
  ${field('variants','variants',listValue(w.variants))}${field('synonyms','synonyms',listValue(w.synonyms))}${field('antonyms','antonyms',listValue(w.antonyms))}
  ${field('collocations','collocations',listValue(w.collocations))}${field('wordFamily','wordFamily',listValue(w.wordFamily))}
  ${field('register','register',w.register)}${field('level','level',w.level)}${field('translation','translation',w.translation)}
  ${field('mnemonic','mnemonic',w.mnemonic)}${field('source','source',w.source)}${field('tags','tags',listValue(w.tags))}
  ${customInputs(w)}
  <label>${t('note')}<textarea name="note" rows="3">${esc(w.note||'')}</textarea></label>
  <label>${t('imageFile')}<input type="file" id="image-upload" accept="image/png,image/jpeg,image/webp"></label><div id="media-image">${w.image?`<img class="editor-image" src="${esc(w.image)}" alt="${t('image')}">`:''}</div>${button(t('clear'),'clearImage','quiet')}
  <label>${t('audioFile')}<input type="file" id="audio-upload" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"></label><small id="audio-status">${w.audio?t('saved'):t('missingAudio')}</small>${button(t('clear'),'clearAudio','quiet')}
  <p class="muted small">${t('mediaHelp')}</p></div></details>
  ${editing?`<label>${t('changeMeaning')}<select name="identity"><option value="copy">${t('createCopy')}</option><option value="reset">${t('resetProgress')}</option></select></label>`:''}
  ${w.errors?.inBook?`<section class="info"><p>${w.errors.failures} ${t('mistakes')} \u00b7 ${w.errors.evidence.length}/2 ${t('evidence')}</p><p>${t('evidenceHelp')}</p>${w.errors.evidence.map(e=>`<p>${t(e.game)} \u00b7 ${new Date(e.at).toLocaleString('vi-VN')}</p>`).join('')}</section>`:''}
  <div class="row between wrap">${editing?button(t('delete'),'deleteWord','danger',`data-id="${editing.id}"`):button(t('cancel'),'close','quiet')}<button type="submit" class="btn primary">${t('save')}</button></div></form>`);
}
export async function saveWord(form) {
  const f=new FormData(form),list=name=>String(f.get(name)||'').split(',').map(s=>s.trim()).filter(Boolean);
  const custom={...(editing?.custom||{})};
  for(const def of app.model.sets[app.setId]?.customFields||[]){
    const raw=f.get(`custom:${def.id}`),value=raw==null?'':String(raw).trim();
    custom[def.id]=def.type==='number'?(value===''?null:Number(value)):value;
    if(def.type==='number'&&value!==''&&!Number.isFinite(custom[def.id]))throw new Error(def.label);
  }
  const patch={word:String(f.get('word')).trim(),meaning:String(f.get('meaning')).trim(),
    pos:String(f.get('pos')).trim(),ipa:String(f.get('ipa')).trim(),sentence:String(f.get('sentence')).trim(),
    answers:list('answers'),variants:list('variants'),synonyms:list('synonyms'),antonyms:list('antonyms'),
    collocations:list('collocations'),wordFamily:list('wordFamily'),tags:list('tags'),
    register:String(f.get('register')||'').trim(),level:String(f.get('level')||'').trim(),
    translation:String(f.get('translation')||'').trim(),mnemonic:String(f.get('mnemonic')||'').trim(),
    source:String(f.get('source')||'').trim(),custom,note:String(f.get('note')).trim(),...media};
  if(!patch.word)throw new Error(t('word'));
  if(patch.sentence&&(patch.sentence.split('___').length!==2||!patch.answers.length))throw new Error(t('missingSentence'));
  const identity=editing&&(normalize(editing.word)!==normalize(patch.word)||normalize(editing.meaning)!==normalize(patch.meaning));
  const copy=identity&&f.get('identity')!=='reset';
  const id=editing&&!copy?editing.id:uuid();
  if(Object.values(app.model.words).some(w=>!w.deleted&&w.id!==id&&w.setId===app.setId&&normalize(w.word)===normalize(patch.word)&&normalize(w.meaning)===normalize(patch.meaning)&&normalize(w.pos)===normalize(patch.pos)))throw new Error(t('duplicate'));
  let actual=copy?Object.fromEntries(Object.entries({...editing,...patch}).filter(([k])=>WORD_FIELDS.has(k))):patch;
  if(copy){
    const allowed=new Set((app.model.sets[app.setId]?.customFields||[]).map(def=>def.id));
    actual={...actual,custom:Object.fromEntries(Object.entries(actual.custom||{}).filter(([id])=>allowed.has(id)))};
  }
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
  modal(t('deleted'),`<div class="stack">${deleted.length?button(`${t('restoreAll')} (${deleted.length})`,'restoreAllWords','primary'):''}
    ${deleted.map(w=>`<div class="topic-row"><span>${esc(w.word)} · ${esc(w.meaning)}</span>${button(t('restore'),'restoreWord','',`data-id="${w.id}"`)}</div>`).join('')||`<p>${t('noResults')}</p>`}</div>`);
}
