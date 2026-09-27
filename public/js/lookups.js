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
    input.value=value;draft[field]={...result.meta?.[field],value,word};
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
