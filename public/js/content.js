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
import {cardsToXlsx, xlsxToCards} from '/core/excel.js';

export function exportContent() {
  const content = words().map(w => ({
    word: w.word, meaning: w.meaning, ipa: w.ipa, pos: w.pos,
    sentence: w.sentence, answers: w.answers, image: w.image, audio: w.audio,
    note: w.note, categoryIds: w.categoryIds
  }));
  const xlsxBuf = cardsToXlsx(content, app.model.categories);
  const blob = new Blob([xlsxBuf], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url;
  link.download = `${app.model.sets[app.setId]?.name || 'vocalearn'}.xlsx`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let draft = [];
export function importDialog() {
  draft = [];
  modal(t('import'), `<div class="stack"><p>${t('importHelp') || 'Chọn tệp Excel (.xlsx) hoặc JSON để nhập thẻ từ vựng kèm ảnh:'}</p><input id="import-file" type="file" accept=".xlsx,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json"><div id="import-preview"></div>${button(t('import'), 'confirmImport', 'primary', 'disabled')}</div>`);
}

export async function readImport(file) {
  if (!file || file.size > 10000000) throw new Error('Maximum file size: 10 MB');
  draft = []; let skipped = 0;
  if (file.name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    const result = xlsxToCards(buffer, words());
    skipped = result.skipped;
    for (const card of result.cards) {
      const e = prepare('word', {id: uuid(), setId: app.setId, patch: card});
      validateEvent(e); draft.push(e);
    }
  } else {
    const data = JSON.parse(await file.text());
    const cards = data.cards || data;
    if (!Array.isArray(cards)) throw new Error('Invalid format');
    const seen = new Set(words().map(w => normalize(w.word) + '|' + normalize(w.meaning || '')));
    for (const card of cards) {
      const key = normalize(card.word) + '|' + normalize(card.meaning || '');
      if (seen.has(key)) {skipped++; continue;}
      const e = prepare('word', {id: uuid(), setId: app.setId, patch: card});
      validateEvent(e); draft.push(e); seen.add(key);
    }
  }
  const preview = document.querySelector('#import-preview');
  if (preview) {
    preview.innerHTML = `<p><strong>${draft.length}</strong> ${t('cards')} \u00b7 ${skipped} trùng lặp đã bỏ qua</p>${draft.slice(0, 10).map(e => `<p>${esc(e.data.patch.word)} \u2014 ${esc(e.data.patch.meaning || '')} ${e.data.patch.image ? '📷' : ''}</p>`).join('')}`;
  }
  const btn = document.querySelector('[data-action="confirmImport"]');
  if (btn) btn.disabled = !draft.length;
}
export async function confirmImport(){await transact(draft);draft=[];app.model=model();closeModal();app.render();notify(t('saved'));}
