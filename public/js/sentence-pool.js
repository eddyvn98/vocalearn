import {app} from './state.js';
import {api,sync,prepare,transact,model} from './storage.js';
import {selectWordSentence,sentenceContentVersion,validateSentence} from '/core/sentences.js';

const running=new Map();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const jobsFor=async wordId=>api('ai/jobs?wordId='+encodeURIComponent(wordId));

async function applySentenceJob(wordId,job){
  const word=app.model.words[wordId],pool=job?.safePatch?.sentencePool;
  if(!word||word.deleted||!Array.isArray(pool)||!pool.length)return false;
  const version=sentenceContentVersion(word);
  if(!pool.some(sentence=>validateSentence(sentence,version).ok))return false;
  await transact([prepare('word',{id:word.id,setId:word.setId,patch:{sentencePool:pool},baseFields:word.fields})]);
  app.model=model();sync().catch(()=>{});return true;
}

async function ensure(wordId,force){
  let word=app.model.words[wordId];
  if(!word||word.deleted||!word.ready)return false;
  if(!force&&selectWordSentence(word).sentence)return false;
  if(typeof navigator!=='undefined'&&!navigator.onLine)return false;

  try{await sync();app.model=model();}catch{return false;}
  word=app.model.words[wordId];if(!word||word.deleted)return false;
  let data=await jobsFor(wordId);
  const jobs=(data.jobs||[]).filter(job=>job.type==='sentence-bank');

  if(!force){
    const ready=jobs.find(job=>job.status==='ready'&&job.safePatch?.sentencePool?.length);
    if(ready&&await applySentenceJob(wordId,ready))return true;
  }

  let active=jobs.find(job=>['queued','running'].includes(job.status));
  if(!active){
    if(data.configured===false)return false;
    const created=await api('ai/jobs',{wordId,type:'sentence-bank'});
    active=created.job;
  }

  for(let attempt=0;attempt<40;attempt++){
    await sleep(500);
    data=await jobsFor(wordId);
    const job=(data.jobs||[]).find(item=>item.id===active.id)
      ||(data.jobs||[]).find(item=>item.type==='sentence-bank');
    if(!job)continue;
    if(job.status==='ready')return applySentenceJob(wordId,job);
    if(['failed','stale','suggestion'].includes(job.status))return false;
  }
  return false;
}

export function ensureSentencePool(wordId,{force=false}={}){
  const key=wordId+':'+(force?'force':'normal');
  if(running.has(key))return running.get(key);
  const promise=ensure(wordId,force).finally(()=>running.delete(key));
  running.set(key,promise);return promise;
}

export async function updateSentenceStatus(wordId,sentenceId,status){
  if(!['reported','deleted'].includes(status))throw new Error('Invalid sentence status');
  const word=app.model.words[wordId];if(!word||word.deleted)throw new Error('Word not found');
  const pool=(word.sentencePool||[]).map(sentence=>sentence.id===sentenceId?{...sentence,status}:sentence);
  if(!pool.some(sentence=>sentence.id===sentenceId))throw new Error('Sentence not found');
  await transact([prepare('word',{id:word.id,setId:word.setId,patch:{sentencePool:pool},baseFields:word.fields})]);
  app.model=model();sync().catch(()=>{});ensureSentencePool(wordId,{force:true}).catch(()=>{});
  return wordId;
}
