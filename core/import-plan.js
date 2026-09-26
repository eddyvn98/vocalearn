import {WORD_FIELDS, validateEvent} from './validation.js';
import {identity} from './excel.js';
import {normalize} from './grading.js';
const empty = v => v == null || v === '' || Array.isArray(v) && !v.length;
function hashPart(value) {
  let hash=2166136261;
  for(const ch of String(value ?? '')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}
const stableId=(prefix,importId,...parts)=>[prefix,hashPart(importId),...parts.map(hashPart)].join('-');
export function inspectCards(cards, model, setId) {
  const existing = Object.values(model.words).filter(w=>!w.deleted&&w.setId===setId);
  const seen = new Set();
  return cards.map((card,index)=>{
    const patch = Object.fromEntries(Object.entries(card).filter(([k])=>WORD_FIELDS.has(k)));
    const row = {row:card.row || index+2, patch, category:card.category || '', conflicts:[], action:'add', take:{},
      imageCandidates:Array.isArray(card.imageCandidates)?card.imageCandidates:[]};
    try {
      validateEvent({id:'preview',deviceId:'preview',at:0,kind:'word',data:{id:'preview',setId,patch}});
      if(!patch.word?.trim())throw new Error('Missing Word');
      if(patch.sentence && (patch.sentence.split('___').length!==2 || !patch.answers?.length))throw new Error('Sentence needs one ___ and explicit accepted answers');
      const target = existing.find(w=>w.id===(card.word_id || card.id)) || existing.find(w=>identity(w)===identity(patch));
      const key = identity(patch);
      if(seen.has(key)){row.action='skip';row.reason='Duplicate row in this file';}
      else if(target) {
        row.targetId=target.id; row.baseFields={...target.fields}; row.action='merge';
        for(const [key,v] of Object.entries(patch)) {
          if(!empty(target[key]) && !empty(v) && JSON.stringify(v)!==JSON.stringify(target[key]))row.conflicts.push({key,before:target[key],after:v});
        }
        // Changing identity must create a new card, never silently replace its learning history.
        row.identityConflict=['word','meaning','pos','ipa'].some(k=>!empty(patch[k])&&!empty(target[k])&&normalize(patch[k])!==normalize(target[k]));
        if(row.identityConflict){row.action='skip';row.reason='Identity differs: choose a separate card or skip';}
      }
      if(!target && !patch.meaning && existing.some(w=>normalize(w.word)===normalize(patch.word))){row.action='skip';row.reason='Meaning missing: review this spelling before adding a separate card';}
      seen.add(key);
    }catch(error){row.error=error.message;row.action='skip';}
    return row;
  });
}
export function createImportEvents(rows, model, setId, prepare, _uuid, importId='import') {
  const events = [], categories = {...model.categories};
  for(const row of rows) {
    if(row.error||row.action==='skip')continue;
    if(!['add','merge'].includes(row.action))throw new Error('Invalid import action');
    const target = row.action==='merge' ? model.words[row.targetId] : null;
    if(row.action==='merge'&&(!target||target.deleted||target.setId!==setId||row.identityConflict))throw new Error('Reopen preview: merge target has changed');
    if(target && JSON.stringify(target.fields)!==JSON.stringify(row.baseFields))throw new Error('Card edited since preview. Reopen preview before merging.');
    const patch = target ? Object.fromEntries(Object.entries(row.patch).filter(([k,v])=>!empty(v)&&(empty(target[k])||row.take[k]))) : row.patch;
    const id = target?.id || stableId('iw',importId,row.row,identity(row.patch));
    if(Object.keys(patch).length)events.push(prepare('word',{id,setId,patch,baseFields:target?.fields || {},importId,row:row.row},stableId('ie',importId,row.row,'word',id)));
    for(const path of row.category.split('|').map(s=>s.trim()).filter(Boolean)) {
      let parentId=null;
      for(const name of path.split('>').map(s=>s.trim()).filter(Boolean)) {
        let cat=Object.values(categories).find(c=>c.setId===setId&&(c.parentId||null)===parentId&&c.name===name);
        if(!cat){cat={id:stableId('ic',importId,setId,parentId||'root',name),setId,name,parentId};categories[cat.id]=cat;events.push(prepare('category',cat,stableId('ie',importId,'category',cat.id)));}
        parentId=cat.id;
      }
      if(parentId&&!target?.categoryIds.includes(parentId))events.push(prepare('link',{
        wordId:id,categoryId:parentId,base:model.links[`${id}/${parentId}`]?.rev || null},stableId('ie',importId,row.row,'link',id,parentId)));
    }
  }
  return events;
}
