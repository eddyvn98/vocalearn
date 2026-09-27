import {randomUUID} from 'node:crypto';
import {startAiJob,completeAiJob} from '../core/ai.js';

const retryDelay=[5000,30000,120000];
const parse=value=>{try{return JSON.parse(value||'{}')}catch{return {}}};
const rowJob=row=>row?{
  id:row.id,type:row.type,wordId:row.word_id,status:row.status,retryCount:row.retry_count,
  inputContentVersion:row.input_content_version,inputFieldRevisions:parse(row.input_field_revisions),inputSnapshot:parse(row.input_snapshot),
  result:parse(row.result),safePatch:parse(row.safe_patch),suggestions:parse(row.suggestions),
  errorCode:row.error_code,notBefore:row.not_before,createdAt:row.created,updatedAt:row.updated
}:null;

export function createJob(db,userId,word,type='fill',now=Date.now(),id=randomUUID()){
  const job=startAiJob(word,type,id,now);
  db.prepare(`INSERT INTO ai_jobs(user_id,id,word_id,type,status,retry_count,input_content_version,
    input_field_revisions,input_snapshot,result,safe_patch,suggestions,error_code,not_before,created,updated)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(userId,job.id,word.id,type,'queued',0,
      job.inputContentVersion,JSON.stringify(job.inputFieldRevisions),JSON.stringify(word),null,'{}','{}',null,now,now,now);
  return job;
}
export function listJobs(db,userId,wordId){
  return db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND word_id=? ORDER BY created DESC LIMIT 20')
    .all(userId,wordId).map(rowJob);
}
export function getJob(db,userId,id){
  return rowJob(db.prepare('SELECT * FROM ai_jobs WHERE user_id=? AND id=?').get(userId,id));
}
export function retryJob(db,userId,id,now=Date.now()){
  const job=getJob(db,userId,id);if(!job)throw new Error('AI job not found');
  db.prepare(`UPDATE ai_jobs SET status='queued',error_code=NULL,not_before=?,updated=? WHERE user_id=? AND id=?`)
    .run(now,now,userId,id);
  return getJob(db,userId,id);
}
export async function runJob(db,userId,id,word,provider,now=Date.now(),loadCurrent=null){
  const job=getJob(db,userId,id);if(!job||job.status!=='queued'||job.notBefore>now)return job;
  if(!word||word.deleted){
    db.prepare(`UPDATE ai_jobs SET status='stale',error_code='WORD_MISSING',updated=? WHERE user_id=? AND id=?`).run(now,userId,id);
    return getJob(db,userId,id);
  }
  db.prepare(`UPDATE ai_jobs SET status='running',updated=? WHERE user_id=? AND id=?`).run(now,userId,id);
  try{
    const result=await provider.generate({word:job.inputSnapshot||word,type:job.type});
    const candidate={mnemonic:result.mnemonic||''};
    const currentWord=loadCurrent?loadCurrent():word;
    const done=completeAiJob(job,currentWord,candidate,Date.now());
    db.prepare(`UPDATE ai_jobs SET status=?,result=?,safe_patch=?,suggestions=?,error_code=NULL,updated=? WHERE user_id=? AND id=?`)
      .run(done.status,JSON.stringify(result),JSON.stringify(done.safePatch||{}),JSON.stringify(done.suggestions||{}),Date.now(),userId,id);
  }catch(error){
    const tries=(job.retryCount||0)+1,temporary=['AI_TIMEOUT','AI_PROVIDER_TEMPORARY'].includes(error.code);
    const canRetry=temporary&&tries<=retryDelay.length;
    db.prepare(`UPDATE ai_jobs SET status=?,retry_count=?,error_code=?,not_before=?,updated=? WHERE user_id=? AND id=?`)
      .run(canRetry?'queued':'failed',tries,String(error.code||'AI_ERROR'),canRetry?Date.now()+retryDelay[tries-1]:Date.now(),Date.now(),userId,id);
  }
  return getJob(db,userId,id);
}
export async function runDueJobs(db,provider,loadWord,limit=5){
  const rows=db.prepare(`SELECT user_id,id,word_id FROM ai_jobs WHERE status='queued' AND not_before<=? ORDER BY created LIMIT ?`).all(Date.now(),limit);
  for(const row of rows){const current=()=>loadWord(row.user_id,row.word_id);await runJob(db,row.user_id,row.id,current(),provider,Date.now(),current);}
  return rows.length;
}
