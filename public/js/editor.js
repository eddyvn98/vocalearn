import {app} from './state.js';
import {t,esc,button,badge,modal,closeModal,field,notify} from './ui.js';
import {prepare,transact,model,uuid} from './storage.js';
import {normalize} from '/core/grading.js';
import {categoryPath} from '/core/model.js';
import {WORD_FIELDS} from '/core/validation.js';
import {studySetProfile} from '/core/language-profiles.js';
import {parsePinyin} from '/core/chinese-games.js';
import {hydrateMedia,ingestFile,mediaMarkup} from './media-store.js';
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
function mediaImage(value) {
  const mark=mediaMarkup(value);
  return '<img class="editor-image" '+(mark.src?'src="'+esc(mark.src)+'" ':'')
    +(mark.ref?'data-media-ref="'+esc(mark.ref)+'" ':'')+'alt="'+t('image')+'">';
}

function sentencePreview(sentence,answers) {
  if(!sentence)return '<span class="muted">Nhập câu đầy đủ, bôi đen từ/cụm cần khuyết rồi tạo ô trống.</span>';
  const parts=sentence.split('___');
  if(parts.length!==2)return '<span class="error-text">Câu Điền câu cần đúng một ô trống ___.</span>';
  return `<span>${esc(parts[0])}<strong aria-label="ô trống">_____</strong>${esc(parts[1])}</span>
    <small class="muted">Đáp án chấp nhận: ${esc(answers.length?answers.join(', '):'chưa có')}</small>`;
}
export function updateSentencePreview() {
  const form=document.querySelector('#word-form'),out=document.querySelector('#sentence-preview');
  if(!form||!out)return;
  const sentence=String(form.elements.sentence?.value||''),answers=String(form.elements.answers?.value||'')
    .split(',').map(value=>value.trim()).filter(Boolean);
  out.innerHTML=sentencePreview(sentence,answers);
}
export function makeSentenceBlank() {
  const form=document.querySelector('#word-form'),input=form?.elements.sentence,answers=form?.elements.answers;
  if(!input||!answers)return;
  if(input.value.includes('___'))throw new Error('Câu đã có ô trống. Hãy sửa hoặc xóa ô trống cũ trước.');
  const start=input.selectionStart??0,end=input.selectionEnd??0,selected=input.value.slice(start,end).trim();
  if(start===end||!selected)throw new Error('Bôi đen từ hoặc cụm từ cần làm ô trống trong câu ví dụ.');
  input.value=input.value.slice(0,start)+'___'+input.value.slice(end);
  const accepted=String(answers.value||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!accepted.includes(selected))accepted.unshift(selected);
  answers.value=accepted.join(', ');
  app.dirty=true;updateSentencePreview();input.focus();input.setSelectionRange(start,start+3);
}

export function openEditor(id) {
  editing=id?app.model.words[id]:null;media={};app.dirty=false;
  const w=editing||{};
  const categories=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
  const profile=studySetProfile(app.model.sets[app.setId]);
  const languageFields=profile?.id==='zh'
    ?`${field('pinyin','pinyin',w.pinyin||w.ipa||'')}${field('hanViet','hanViet',w.hanViet||'')}${field('radical','radical',w.radical||'')}${field('strokeCount','strokeCount',w.strokeCount||0,'type="number" min="0"')}${field('classifier','classifier',listValue(w.classifiers))}`
    :field('ipa','ipa',w.ipa);
  const wordLabel=profile?.id==='zh'?'wordGeneric':'word';
  modal(t(editing?'edit':'add'),`<form id="word-form" class="stack">
  ${field(wordLabel,'word',w.word,'required maxlength="100" autocomplete="off"')}${field('meaning','meaning',w.meaning,'maxlength="2000"')}
  ${field('pos','pos',w.pos,'maxlength="100"')}
  <fieldset><legend>${t('topics')}</legend>${categories.map(c=>`<label class="check-label"><input type="checkbox" name="category" value="${c.id}" ${w.categoryIds?.includes(c.id)?'checked':''}>${esc(categoryPath(app.model.categories,c.id))}</label>`).join('')||t('uncategorized')}</fieldset>
  <details><summary>${t('advanced')}</summary><div class="stack">${languageFields}${field('sentence','sentence',w.sentence,'placeholder="Yesterday, I went to school."')}${field('answers','answers',listValue(w.answers))}
  <div class="row wrap">${button('Tạo ô trống từ phần bôi đen','makeSentenceBlank','quiet')}</div>
  <div id="sentence-preview" class="wait-panel stack" aria-live="polite"><strong>Xem thử câu hỏi</strong>${sentencePreview(w.sentence||'',w.answers||[])}</div>
  ${field('variants','variants',listValue(w.variants))}${field('synonyms','synonyms',listValue(w.synonyms))}${field('antonyms','antonyms',listValue(w.antonyms))}
  ${field('collocations','collocations',listValue(w.collocations))}${field('wordFamily','wordFamily',listValue(w.wordFamily))}
  ${field('register','register',w.register)}${field('level','level',w.level)}${field('translation','translation',w.translation)}
  ${field('mnemonic','mnemonic',w.mnemonic)}${field('source','source',w.source)}${field('tags','tags',listValue(w.tags))}
  ${customInputs(w)}
  <label>${t('note')}<textarea name="note" rows="3">${esc(w.note||'')}</textarea></label>
  <label>${t('imageFile')}<input type="file" id="image-upload" accept="image/png,image/jpeg,image/webp"></label><div id="media-image">${w.image?mediaImage(w.image):''}</div>${button(t('clear'),'clearImage','quiet')}
  <label>${t('audioFile')}<input type="file" id="audio-upload" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4"></label><small id="audio-status">${w.audio?t('saved'):t('missingAudio')}</small>${button(t('clear'),'clearAudio','quiet')}
  <p class="muted small">${t('mediaHelp')}</p></div></details>
  ${editing?`<label>${t('changeMeaning')}<select name="identity"><option value="copy">${t('createCopy')}</option><option value="reset">${t('resetProgress')}</option></select></label>`:''}
  ${w.errors?.inBook?`<section class="info"><p>${w.errors.failures} ${t('mistakes')} \u00b7 ${w.errors.evidence.length}/2 ${t('evidence')}</p><p>${t('evidenceHelp')}</p>${w.errors.evidence.map(e=>`<p>${t(e.game)} \u00b7 ${new Date(e.at).toLocaleString('vi-VN')}</p>`).join('')}</section>`:''}
  <div class="row between wrap">${editing?button(t('delete'),'deleteWord','danger',`data-id="${editing.id}"`):button(t('cancel'),'close','quiet')}<button type="submit" class="btn primary">${t('save')}</button></div></form>`);
  hydrateMedia(document.querySelector('#modal')).catch(()=>{});
  updateSentencePreview();
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
  const profile=studySetProfile(app.model.sets[app.setId]);
  if(profile?.id==='zh'){
    const pinyin=String(f.get('pinyin')||'').trim();
    Object.assign(patch,{ipa:pinyin,pinyin,pinyinSyllables:parsePinyin(pinyin),
      hanViet:String(f.get('hanViet')||'').trim(),radical:String(f.get('radical')||'').trim(),
      strokeCount:Number(f.get('strokeCount')||0),classifiers:list('classifier')});
  }
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
  const ref=await ingestFile(file,type);media[type]=ref;app.dirty=true;
  if(type==='image'){
    document.querySelector('#media-image').innerHTML=mediaImage(ref);
    await hydrateMedia(document.querySelector('#media-image'));
  } else document.querySelector('#audio-status').textContent=file.name+' · '+t('saved');
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
