import {api} from './storage.js';
import {t,esc} from './ui.js';

let draft={};

export function beginLookupDraft(word){
  draft=structuredClone(word?.lookupMeta||{});
}
const userMeta=()=>({source:'user',version:'manual-v1',license:'user-provided',status:'user',needsCheck:false,confirmed:true});

export async function lookupEditorReading(language){
  const form=document.querySelector('#word-form');if(!form)throw new Error(t('lookupNoEditor'));
  const word=String(form.elements.word?.value||'').trim();if(!word)throw new Error(t('lookupWordFirst'));
  const data=await api('lookups?language='+encodeURIComponent(language)+'&word='+encodeURIComponent(word));
  const result=data.result||{},status=document.querySelector('#lookup-status');
  for(const [field,value] of Object.entries(result.fields||{})){
    const input=form.elements[field];if(!input||!value)continue;
    input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));draft[field]={...result.meta?.[field],value,word};
  }
  const messages=[];
  for(const field of language==='zh'?['pinyin','hanViet']:['ipa']){
    const meta=result.meta?.[field];if(!meta)continue;
    if(meta.status==='unsupported')messages.push(t('lookupMissing')+': '+t(field));
    else messages.push(t(field)+': '+t(meta.needsCheck?'lookupNeedsCheck':'lookupFound'));
  }
  if(status)status.innerHTML=messages.length?messages.map(esc).join(' · '):esc(t('lookupMissing'));
  return result;
}

const setIfEmpty=(form,name,value)=>{
  const input=form.elements[name];if(!input||value==null||value==='')return false;
  if(String(input.value||'').trim())return false;
  input.value=Array.isArray(value)?value.join(', '):String(value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
};

export async function autofillEditor(language,meaningLanguage='vi'){
  const form=document.querySelector('#word-form');if(!form)throw new Error(t('lookupNoEditor'));
  const word=String(form.elements.word?.value||'').trim();if(!word)throw new Error(t('lookupWordFirst'));
  const status=document.querySelector('#autofill-status');if(status)status.textContent=t('autofillWorking');
  const data=await api('autofill?language='+encodeURIComponent(language)+'&meaningLanguage='+encodeURIComponent(meaningLanguage)+'&word='+encodeURIComponent(word));
  const result=data.result||{};
  if(result.status!=='found'){
    if(status)status.textContent=t('autofillMissing');
    return result;
  }
  const details=form.querySelector('details');if(details)details.open=true;
  const fields=result.fields||{};
  const changed=[
    ['meaning',fields.meaning],['pos',fields.pos],['ipa',fields.ipa],['sentence',fields.sentence],
    ['answers',fields.answers],['synonyms',fields.synonyms],['antonyms',fields.antonyms],
    ['collocations',fields.collocations],['register',fields.register],['level',fields.level],
    ['mnemonic',fields.mnemonic],['source',fields.source]
  ].filter(([name,value])=>setIfEmpty(form,name,value)).map(([name])=>name);
  if(fields.ipa){
    draft.ipa={source:'dictionaryapi.dev',version:String(result.fetchedAt||'shared-cache-v1'),
      license:String(result.dictionary?.license?.name||result.dictionary?.license||'source metadata'),
      status:'lookup',needsCheck:false,confirmed:false,value:fields.ipa,word};
  }
  const parts=[t('autofillFound')];
  parts.push(t(result.cacheHit?'autofillCached':'autofillFetched'));
  if(result.aiCacheHit)parts.push(t('autofillAiCached'));
  else if(!result.aiConfigured)parts.push(t('autofillAiMissing'));
  if(status)status.textContent=parts.join(' · ');
  return {...result,changed};
}

export function lookupMetaForSave(form,editing,language){
  const fields=language==='zh'?['pinyin','hanViet']:['ipa'],base=structuredClone(editing?.lookupMeta||{}),next={...base};
  const currentWord=String(form.elements.word?.value||'').trim();
  for(const field of fields){
    const value=String(form.elements[field]?.value||'').trim();
    if(!value){delete next[field];continue;}
    const pending=draft[field];
    if(pending?.value===value&&pending.word===currentWord){
      const {value:ignored,word:ignoredWord,...meta}=pending;next[field]={...meta,confirmed:true};continue;
    }
    if(editing&&String(editing[field]||'').trim()===value&&base[field])continue;
    next[field]=userMeta();
  }
  return next;
}
