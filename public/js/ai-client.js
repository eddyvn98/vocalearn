import {app} from './state.js';
import {api,prepare,transact,model} from './storage.js';
import {t,esc,button,notify} from './ui.js';
import {WORD_FIELDS} from '/core/validation.js';

const active=()=>document.querySelector('#ai-panel')?.dataset.wordId||'';

function jobMarkup(job){
  const state=t('ai_'+job.status),candidates=job.result?.meaningCandidates||[];
  const safe=Object.entries(job.safePatch||{}).filter(([field,value])=>WORD_FIELDS.has(field)&&value!==''&&value!=null);
  const suggestions=Object.entries(job.suggestions||{}).filter(([field])=>WORD_FIELDS.has(field));
  return `<article class="info stack"><div class="row between wrap"><strong>${esc(state)}</strong><small>${new Date(job.updatedAt).toLocaleString('vi-VN')}</small></div>
    ${job.errorCode?`<p class="error-text">${esc(t(job.errorCode)||job.errorCode)}</p>`:''}
    ${candidates.length?`<div><strong>${t('aiMeaningCandidates')}</strong>${candidates.map((value,index)=>`<div class="row between"><span>${esc(value)}</span>${button(t('chooseMeaning'),'aiMeaning','quiet',`data-job-id="${job.id}" data-index="${index}" data-word-id="${job.wordId}"`)}</div>`).join('')}</div>`:''}
    ${safe.length?`<div><strong>${t('aiSafeFields')}</strong><p>${safe.map(([field,value])=>`${t(field)}: ${esc(value)}`).join(' · ')}</p>${button(t('apply'),'aiApply','primary',`data-job-id="${job.id}" data-word-id="${job.wordId}"`)}</div>`:''}
    ${suggestions.length?`<div><strong>${t('aiProtectedSuggestions')}</strong>${suggestions.map(([field,value])=>`<div class="row between"><span>${t(field)}: ${esc(value)}</span>${button(t('apply'),'aiApplyField','quiet',`data-job-id="${job.id}" data-field="${field}" data-word-id="${job.wordId}"`)}</div>`).join('')}</div>`:''}
    ${job.status==='failed'?button(t('tryAgain'),'aiRetry','quiet',`data-job-id="${job.id}" data-word-id="${job.wordId}"`):''}
  </article>`;
}

export async function refreshAiPanel(wordId){
  const panel=document.querySelector('#ai-panel');if(!panel||panel.dataset.wordId!==wordId)return;
  try{
    const data=await api('ai/jobs?wordId='+encodeURIComponent(wordId));
    if(!document.querySelector('#ai-panel')||active()!==wordId)return;
    panel.innerHTML=`<div class="row between wrap"><div><strong>${t('aiAssist')}</strong><p class="muted small">${t('aiHelp')}</p></div>
      ${button(t('aiGenerate'),'aiStart','primary',`data-word-id="${wordId}" ${!data.configured?'disabled':''}`)}</div>
      ${!data.configured?`<p class="info">${t('aiUnavailable')}</p>`:''}
      ${data.jobs.map(jobMarkup).join('')}`;
    if(data.jobs.some(job=>['queued','running'].includes(job.status)))
      setTimeout(()=>refreshAiPanel(wordId),1200);
  }catch(error){panel.innerHTML=`<p class="error-text">${esc(error.message)}</p>`;}
}

function assertClean(wordId){
  if(app.dirty)throw new Error(t('aiSaveFirst'));
  const word=app.model.words[wordId];if(!word||word.deleted)throw new Error(t('aiWordMissing'));
  return word;
}
export async function startAi(wordId){
  assertClean(wordId);await api('ai/jobs',{wordId,type:'fill'});await refreshAiPanel(wordId);return wordId;
}
async function findJob(wordId,jobId){
  const data=await api('ai/jobs?wordId='+encodeURIComponent(wordId));
  const job=data.jobs.find(item=>item.id===jobId);if(!job)throw new Error(t('aiJobMissing'));return job;
}
async function applyPatch(wordId,patch){
  const word=assertClean(wordId),clean=Object.fromEntries(Object.entries(patch).filter(([field])=>WORD_FIELDS.has(field)));
  if(!Object.keys(clean).length)return wordId;
  await transact([prepare('word',{id:word.id,setId:word.setId,patch:clean,baseFields:word.fields})]);
  app.model=model();notify(t('aiApplied'));return wordId;
}
export async function applyAi(wordId,jobId){
  const job=await findJob(wordId,jobId);return applyPatch(wordId,job.safePatch||{});
}
export async function applyAiField(wordId,jobId,field){
  const job=await findJob(wordId,jobId);return applyPatch(wordId,{[field]:job.suggestions?.[field]});
}
export async function applyAiMeaning(wordId,jobId,index){
  const job=await findJob(wordId,jobId),value=job.result?.meaningCandidates?.[Number(index)];
  if(!value)throw new Error(t('aiMeaningMissing'));return applyPatch(wordId,{meaning:value});
}
export async function retryAi(wordId,jobId){
  assertClean(wordId);await api('ai/jobs/'+encodeURIComponent(jobId)+'/retry',{});await refreshAiPanel(wordId);return wordId;
}
