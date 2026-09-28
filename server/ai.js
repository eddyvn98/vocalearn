import {randomUUID} from 'node:crypto';
import {allEvents,appendServerEvents} from './database.js';
import {replay} from '../core/model.js';
import {contentVersion,normalizeGeneratedSentence} from '../core/sentences.js';
const RETRY_DELAYS=[5000,30000,120000];
const parse=row=>({...row,result:row.result_json?JSON.parse(row.result_json):null,input:row.input_json?JSON.parse(row.input_json):null});
function stateFor(db,userId){return replay(allEvents(db,userId));}
function wordSnapshot(state,wordId){
  const word=state.words[wordId],set=word&&state.sets[word.setId];
  if(!word||word.deleted||!set)throw new Error('Word is unavailable');
  return {id:word.id,setId:word.setId,word:word.word,meaning:word.meaning||'',pos:word.pos||'',variants:word.variants||[],level:word.level||'',
    ipa:word.ipa||'',pinyin:word.pinyin||'',kana:word.kana||'',hanViet:word.hanViet||'',language:set.language,meaningLanguage:set.meaningLanguage,
    contentVersion:contentVersion(word),fieldRevisions:{...word.fields}};
}
function cleanList(value,max=3,limit=500){
  if(!Array.isArray(value))return [];
  return [...new Set(value.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,max).map(x=>x.slice(0,limit));
}
function cleanAutofill(result){
  if(!result||typeof result!=='object')throw new Error('Invalid AI autofill result');
  const clean={meanings:cleanList(result.meanings,3,1000)};
  for(const key of ['definition','note','transcription','hanViet'])if(result[key]!=null)clean[key]=String(result[key]).trim().slice(0,key==='note'?5000:1000);
  if(!clean.meanings.length&&!clean.definition&&!clean.note&&!clean.transcription&&!clean.hanViet)throw new Error('AI returned no usable suggestion');
  return clean;
}
function currentSentenceCount(state,wordId,version){
  return Object.values(state.sentences||{}).filter(s=>s.wordId===wordId&&!s.deleted&&s.status==='ready'&&s.wordContentVersion===version).length;
}
function publicJob(db,userId,row){
  const job=parse(row),state=stateFor(db,userId),word=state.words[job.word_id];
  const stale=!word||word.deleted||contentVersion(word)!==job.input_version;
  return {id:job.id,kind:job.kind,wordId:job.word_id,status:stale?'stale':job.status,retryCount:job.retry_count,
    nextAttempt:job.next_attempt,result:stale?null:job.result,errorCode:job.error_code,created:job.created,updated:job.updated};
}
export function createAiQueue(db,provider,{now=Date.now,intervalMs=1000}={}){
  const running=new Set();
  async function run(row){
    if(!provider||running.has(row.id))return;
    running.add(row.id);
    try{
      const current=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND id=?').get(row.user_id,row.id);
      if(!current||!['waiting','running'].includes(current.status))return;
      const state=stateFor(db,row.user_id),word=state.words[row.word_id];
      if(!word||word.deleted||contentVersion(word)!==row.input_version){
        db.prepare('UPDATE ai_jobs SET status=?,updated=? WHERE user_id=? AND id=?').run('stale',now(),row.user_id,row.id);return;
      }
      db.prepare('UPDATE ai_jobs SET status=?,error_code=NULL,updated=? WHERE user_id=? AND id=?').run('running',now(),row.user_id,row.id);
      const input=JSON.parse(row.input_json),result=await provider({kind:row.kind,snapshot:input,count:5});
      const latest=stateFor(db,row.user_id),latestWord=latest.words[row.word_id];
      if(!latestWord||latestWord.deleted||contentVersion(latestWord)!==row.input_version){
        db.prepare('UPDATE ai_jobs SET status=?,updated=? WHERE user_id=? AND id=?').run('stale',now(),row.user_id,row.id);return;
      }
      let stored;
      if(row.kind==='autofill')stored=cleanAutofill(result);
      else if(row.kind==='sentences'){
        const raw=Array.isArray(result?.sentences)?result.sentences.slice(0,5):[];
        if(!raw.length)throw new Error('AI returned no sentences');
        const existingTexts=new Set(Object.values(latest.sentences||{}).filter(s=>s.wordId===row.word_id&&!s.deleted&&s.wordContentVersion===row.input_version).map(s=>s.text));
        const seen=new Set(),events=[];
        for(const item of raw){
          const sentence=normalizeGeneratedSentence(item,latestWord,input.language),key=sentence.text+'\n'+sentence.targetForm;
          if(seen.has(key)||existingTexts.has(sentence.text))continue;seen.add(key);
          const id=randomUUID();events.push({id:randomUUID(),kind:'sentence',data:{id,wordId:row.word_id,...sentence}});
        }
        if(!events.length)throw new Error('AI returned no unique valid sentences');
        appendServerEvents(db,row.user_id,events,now());stored={sentenceIds:events.map(e=>e.data.id),count:events.length};
      }else throw new Error('Unsupported AI job type');
      db.prepare('UPDATE ai_jobs SET status=?,result_json=?,error_code=NULL,next_attempt=NULL,updated=? WHERE user_id=? AND id=?')
        .run('success',JSON.stringify(stored),now(),row.user_id,row.id);
    }catch(error){
      const current=db.prepare('SELECT retry_count FROM ai_jobs WHERE user_id=? AND id=?').get(row.user_id,row.id),retry=(current?.retry_count||0)+1;
      const retrying=retry<=RETRY_DELAYS.length,next=retrying?now()+RETRY_DELAYS[retry-1]:null;
      db.prepare('UPDATE ai_jobs SET status=?,retry_count=?,next_attempt=?,error_code=?,updated=? WHERE user_id=? AND id=?')
        .run(retrying?'waiting':'failed',retry,next,String(error.message||'AI_ERROR').slice(0,500),now(),row.user_id,row.id);
    }finally{running.delete(row.id);}
  }
  function tick(){
    if(!provider)return;
    const due=db.prepare("SELECT * FROM ai_jobs WHERE status='waiting' AND (next_attempt IS NULL OR next_attempt<=?) ORDER BY created LIMIT 10").all(now());
    for(const row of due)void run(row);
  }
  const timer=setInterval(tick,intervalMs);timer.unref?.();
  function createJob(userId,{wordId,kind}){
    if(!provider)throw new Error('AI provider is not configured');
    if(!['autofill','sentences'].includes(kind)||typeof wordId!=='string')throw new Error('Invalid AI job');
    const state=stateFor(db,userId),snapshot=wordSnapshot(state,wordId);
    if(kind==='sentences'&&!snapshot.meaning)throw new Error('Choose a meaning before generating sentences');
    const count=kind==='sentences'?currentSentenceCount(state,wordId,snapshot.contentVersion):0;
    const requestKey=kind==='sentences'?snapshot.contentVersion+':pool:'+count:snapshot.contentVersion+':autofill';
    let row=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND kind=? AND word_id=? AND request_key=?').get(userId,kind,wordId,requestKey);
    if(!row){
      const id=randomUUID(),time=now();
      db.prepare('INSERT INTO ai_jobs(user_id,id,kind,word_id,input_version,request_key,input_json,status,retry_count,next_attempt,result_json,error_code,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(userId,id,kind,wordId,snapshot.contentVersion,requestKey,JSON.stringify(snapshot),'waiting',0,time,null,null,time,time);
      row=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND id=?').get(userId,id);
    }
    void run(row);return publicJob(db,userId,row);
  }
  function listJobs(userId,wordId){
    if(typeof wordId!=='string'||!wordId)return [];
    const rows=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND word_id=? ORDER BY created DESC LIMIT 20').all(userId,wordId);
    return rows.map(row=>publicJob(db,userId,row));
  }
  function retryJob(userId,id){
    const row=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND id=?').get(userId,id);
    if(!row)throw new Error('AI job not found');
    const job=publicJob(db,userId,row);if(job.status==='stale')throw new Error('Create a new job for the updated word');
    db.prepare('UPDATE ai_jobs SET status=?,retry_count=0,next_attempt=?,error_code=NULL,updated=? WHERE user_id=? AND id=?')
      .run('waiting',now(),now(),userId,id);
    const fresh=db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND id=?').get(userId,id);void run(fresh);return publicJob(db,userId,fresh);
  }
  return {enabled:!!provider,createJob,listJobs,retryJob,tick,close:()=>clearInterval(timer)};
}
