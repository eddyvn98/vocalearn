import {app} from './state.js';
import {t,esc,button,badge,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,uuid,storeMediaUri,mediaSrc} from './storage.js';
import {normalize} from '/core/grading.js';
import {WORD_FIELDS} from '/core/validation.js';
import {studySetProfile} from '/core/language-profiles.js';
let editing=null,media={};
function editorDirty(){
  const form=document.querySelector('#word-form');
  return app.dirty||!!(form&&editing&&['word','meaning','pos','ipa','sentence','note'].some(name=>
    String(new FormData(form).get(name)??'')!==String(editing[name]??'')));
}
export function canCloseEditor(){
  return !editorDirty()||confirm(t('discardChanges'));
}
export function openEditor(id) {
  editing=id?app.model.words[id]:null;media={};app.dirty=false;
  const w=editing||{};
  const categories=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
  const set=app.model.sets[app.setId],customFields=set?.customFields||[],profile=studySetProfile(set);
  const languageFields=profile?.id==='zh'?`${field('pinyin','pinyin',w.pinyin||w.ipa||'')}${field('hanViet','hanViet',w.hanViet||'')}${field('radical','radical',w.radical||'')}${field('strokeCount','strokeCount',w.strokeCount||'','type="number" min="0"')}${field('classifier','classifier',(w.classifiers||[]).join(', '))}`:profile?.id==='ja'?`${field('kana','kana',w.kana||w.ipa||'')}${field('onReading','onReading',w.onReading||'')}${field('kunReading','kunReading',w.kunReading||'')}`:field('ipa','ipa',w.ipa);
  modal(t(editing?'edit':'add'),`<form id="word-form" class="stack">
  ${field('word','word',w.word,'required maxlength="100" autocomplete="off"')}${field('meaning','meaning',w.meaning,'maxlength="2000"')}
  ${field('pos','pos',w.pos,'maxlength="100"')}
  <fieldset><legend>${t('topics')}</legend>${categories.map(c=>`<label class="check-label"><input type="checkbox" name="category" value="${c.id}" ${w.categoryIds?.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||t('uncategorized')}</fieldset>
  <details><summary>${t('advanced')}</summary><div class="stack">${languageFields}${field('sentence','sentence',w.sentence,'placeholder="Yesterday, I ___ to school."')}${field('answers','answers',w.answers?.join(', '))}
  ${field('level','level',w.level||'','placeholder="A1, HSK 2, JLPT N4..."')}${field('variants','variants',w.variants?.join(', ')||'','placeholder="went, gone"')}${field('tags','tags',w.tags?.join(', ')||'','placeholder="hay-nhầm, công-việc"')}
  ${customFields.map(cf=>cf.type==='select'?`<label>${esc(cf.name)}<select name="custom:${cf.id}"><option value="">—</option>${(cf.options||[]).map(o=>`<option value="${esc(o)}" ${String(w.custom?.[cf.id]??'')===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`:`<label>${esc(cf.name)}<input name="custom:${cf.id}" type="${cf.type==='number'?'number':'text'}" value="${esc(w.custom?.[cf.id]??'')}"></label>`).join('')}
  <label>${t('note')}<textarea name="note" rows="3">${esc(w.note||'')}</textarea></label>
  <label>${t('imageFile')}<input type="file" id="image-upload" accept="image/png,image/jpeg,image/webp"></label><div id="media-image">${w.image&&mediaSrc(w.image)?`<img class="editor-image" src="${esc(mediaSrc(w.image))}" alt="${t('image')}">`:''}</div>${button(t('clear'),'clearImage','quiet')}
  <label>${t('audioFile')}<input type="file" id="audio-upload" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"></label><small id="audio-status">${w.audio?t('saved'):t('missingAudio')}</small>${button(t('clear'),'clearAudio','quiet')}
  <p class="muted small">${t('mediaHelp')}</p></div></details>
  ${editing?`<label>${t('changeMeaning')}<select name="identity"><option value="copy">${t('createCopy')}</option><option value="reset">${t('resetProgress')}</option></select></label>`:''}
  ${w.errors?.inBook?`<section class="info"><p>${w.errors.failures} ${t('mistakes')} \u00b7 ${w.errors.evidence.length}/2 ${t('evidence')}</p><p>${t('evidenceHelp')}</p>${w.errors.evidence.map(e=>`<p>${t(e.game)} \u00b7 ${new Date(e.at).toLocaleString('vi-VN')}</p>`).join('')}</section>`:''}
  <div class="row between wrap">${editing?button(t('delete'),'deleteWord','danger',`data-id="${editing.id}"`):button(t('cancel'),'close','quiet')}<button type="submit" class="btn primary">${t('save')}</button></div></form>`);
}
export async function saveWord(form) {
  const f=new FormData(form),list=name=>String(f.get(name)||'').split(',').map(s=>s.trim()).filter(Boolean),
    defs=app.model.sets[app.setId]?.customFields||[],custom={...(editing?.custom||{})};
  for(const cf of defs){
    const raw=String(f.get(`custom:${cf.id}`)??'').trim();
    if(!raw)delete custom[cf.id];else custom[cf.id]=cf.type==='number'?Number(raw):raw;
  }
  const patch={word:String(f.get('word')).trim(),meaning:String(f.get('meaning')).trim(),
    pos:String(f.get('pos')).trim(),ipa:String(f.get('ipa')||f.get('pinyin')||f.get('kana')||'').trim(),sentence:String(f.get('sentence')).trim(),
    answers:list('answers'),level:String(f.get('level')||'').trim(),variants:list('variants'),tags:list('tags'),
    custom,note:String(f.get('note')).trim(),...media};
  const profile=studySetProfile(app.model.sets[app.setId]);
  if(profile?.id==='zh')Object.assign(patch,{pinyin:String(f.get('pinyin')||'').trim(),hanViet:String(f.get('hanViet')||'').trim(),radical:String(f.get('radical')||'').trim(),strokeCount:Number(f.get('strokeCount')||0),classifiers:list('classifier')});
  if(profile?.id==='ja')Object.assign(patch,{kana:String(f.get('kana')||'').trim(),onReading:String(f.get('onReading')||'').trim(),kunReading:String(f.get('kunReading')||'').trim()});
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
  media[type]=await storeMediaUri(uri);app.dirty=true;
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
