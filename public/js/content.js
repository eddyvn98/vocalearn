import {app,words} from './state.js';
import {prepare,transact,model,uuid} from './storage.js';
import {esc,t,button,modal,closeModal,notify} from './ui.js';
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
import {cardsToXlsx,readWorkbook,workbookToCards,detectMapping,COLUMNS} from '/core/excel.js';
import {inspectCards,createImportEvents} from '/core/import-plan.js';
import {getMeta,setMeta} from './storage.js';
import {filtered} from './views/library.js';
let draft=null,workbook=null;
export function exportContent() {
  const visible=filtered(), selected=visible.filter(w=>app.selectedCards.has(w.id));
  const content=selected.length?selected:visible;
  if(!content.length)throw new Error('Kh\u00f4ng c\u00f3 th\u1ebb \u0111\u1ec3 xu\u1ea5t.');
  if(!confirm(`Xu\u1ea5t n\u1ed9i dung ${content.length} th\u1ebb? Kh\u00f4ng bao g\u1ed3m l\u1ecbch \u00f4n v\u00e0 log.`))return;
  const blob=new Blob([cardsToXlsx(content,app.model.categories)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
  link.download=`${app.model.sets[app.setId]?.name || 'vocalearn'}.xlsx`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function importDialog() {
  workbook=null;draft=await getMeta('importDraft');
  if(draft?.setId!==app.setId)draft=null;
  modal(t('import'),`<div class="stack"><p>Nh\u1eadp .xlsx (\u1ea3nh n\u1ed5i) ho\u1eb7c JSON. Ch\u1ec9 l\u01b0u sau khi x\u00e1c nh\u1eadn b\u1ea3n xem tr\u01b0\u1edbc.</p>
  <input id="import-file" type="file" accept=".xlsx,.json"><div id="import-mapping"></div><div id="import-preview"></div>
  ${button('Xem tr\u01b0\u1edbc','previewImport','', 'id="preview-import" hidden')}
  ${button(t('import'),'confirmImport','primary','disabled')}</div>`);
  if(draft)renderPreview();
}
export async function readImport(file) {
  if(!file||file.size>20000000)throw new Error('Maximum file size: 20 MB');
  // Immediately invalidate the old preview so a failed new file cannot import old rows.
  draft=null;workbook=null;await setMeta('importDraft',null);
  document.querySelector('#import-preview').textContent='';
  document.querySelector('[data-action="confirmImport"]').disabled=true;
  document.querySelector('#import-mapping').textContent='';
  document.querySelector('#preview-import').hidden=true;
  if(/\.xlsx$/i.test(file.name)) {
    workbook=await readWorkbook(await file.arrayBuffer());
    const headers=workbook.rows[0]?.cells||{},mapping=detectMapping(headers);
    document.querySelector('#import-mapping').innerHTML=`<p>Sheet: ${esc(workbook.sheets[0])}</p>${COLUMNS.map(c=>
      `<label>${esc(c.headers[0])}<select data-map="${c.key}"><option value="">B\u1ecf qua</option>${Object.entries(headers).map(([col,label])=>
      `<option value="${col}" ${mapping[c.key]===col?'selected':''}>${col}: ${esc(label)}</option>`).join('')}</select></label>`).join('')}`;
    document.querySelector('#preview-import').hidden=false;
  } else {
    const parsed=JSON.parse(await file.text()),cards=parsed.cards||parsed;
    if(!Array.isArray(cards)||cards.length>2000)throw new Error('Invalid JSON card list (maximum 2000 rows)');
    await setDraft({cards,errors:[],warnings:[]});
  }
}
export async function previewImport() {
  if(!workbook)return;
  const mapping=Object.fromEntries([...document.querySelectorAll('[data-map]')].filter(e=>e.value).map(e=>[e.dataset.map,e.value]));
  if(new Set(Object.values(mapping)).size!==Object.keys(mapping).length)throw new Error('One column cannot map to two fields');
  await setDraft(workbookToCards(workbook,mapping));
}
async function setDraft(result) {
  draft={id:uuid(),setId:app.setId,rows:inspectCards(result.cards,model(),app.setId),errors:result.errors,warnings:result.warnings,events:null};
  await setMeta('importDraft',draft);renderPreview();
}
function renderPreview() {
  const body=document.querySelector('#import-preview');
  body.innerHTML=`<p>${draft.rows.length} th\u1ebb \u00b7 ${draft.errors.length+draft.rows.filter(r=>r.error).length} l\u1ed7i. M\u00e3 nh\u1eadp: ${esc(draft.id)}</p>
  ${[...draft.errors,...draft.warnings].map(e=>`<p class="error-text">D\u00f2ng ${e.row}: ${esc(e.message)}</p>`).join('')}
  ${draft.rows.map((r,i)=>`<div class="conflict"><strong>D\u00f2ng ${r.row}: ${esc(r.patch.word)}</strong> \u2014 ${esc(r.patch.meaning)}
  ${!r.error&&r.patch.image?`<img class="editor-image" src="${esc(r.patch.image)}" alt="\u1ea2nh nh\u1eadp">`:''}
  ${r.error?`<p class="error-text">${esc(r.error)}</p>`:`<label>Thao t\u00e1c<select data-import-row="${i}">${[['skip','B\u1ecf qua'],['add','Th\u1ebb ri\u00eang'],...(r.targetId&&!r.identityConflict?[['merge','G\u1ed9p, gi\u1eef ti\u1ebfn \u0111\u1ed9']]:[])].map(([v,label])=>`<option value="${v}" ${r.action===v?'selected':''}>${label}</option>`).join('')}</select></label>`}
  ${r.reason?`<p>${esc(r.reason)}</p>`:''}
  ${!r.identityConflict?r.conflicts.map(c=>`<label class="check-label"><input type="checkbox" data-import-field="${c.key}" data-row="${i}" ${r.take[c.key]?'checked':''}>Thay ${esc(c.key)}: ${esc(String(c.before).slice(0,100))} \u2192 ${esc(String(c.after).slice(0,100))}</label>`).join(''):''}</div>`).join('')}`;
  document.querySelector('[data-action="confirmImport"]').disabled=!draft.rows.some(r=>!r.error&&r.action!=='skip');
  body.onchange=async e=>{
    const row=e.target.dataset.importRow,field=e.target.dataset.importField;
    if(row!==undefined)draft.rows[Number(row)].action=e.target.value;
    if(field)draft.rows[Number(e.target.dataset.row)].take[field]=e.target.checked;
    draft.events=null;
    try{await setMeta('importDraft',draft);renderPreview();}catch(error){notify(error.message,true);}
  };
}
export async function confirmImport() {
  if(!draft||draft.setId!==app.setId)throw new Error('Reopen the import preview');
  if(draft.warnings.length&&!confirm('T\u1ec7p c\u00f3 c\u1ea3nh b\u00e1o \u1ea3nh/c\u00f4ng th\u1ee9c. Nh\u1eadp ph\u1ea7n \u0111\u1ecdc \u0111\u01b0\u1ee3c?'))return;
  if(!draft.events){draft.events=createImportEvents(draft.rows,model(),draft.setId,prepare,uuid,draft.id);await setMeta('importDraft',draft);}
  await transact(draft.events,undefined,{importDraft:null});
  draft=null;app.model=model();closeModal();app.render();notify(t('saved'));
}
