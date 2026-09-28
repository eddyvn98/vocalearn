import test from 'node:test';
import assert from 'node:assert/strict';
import {application} from '../server/main.js';
import {testAiProvider} from '../server/ai-provider.js';
import {replay} from '../core/model.js';
import {question} from '../core/questions.js';
import {DEFAULTS} from '../core/srs.js';
async function start(provider=testAiProvider()){
  const server=application({dbPath:':memory:',aiProvider:provider});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const auth=await fetch(url+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ai-'+Date.now()+'@example.test',password:'disposable-password-123'})});
  const cookie=auth.headers.get('set-cookie').split(';')[0];
  const api=async(path,body)=>{const res=await fetch(url+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
  return {server,api};
}
const event=(id,kind,data,order)=>({id,deviceId:'dev',kind,data,at:1000+order,localOrder:1000+order});
const batch=events=>({events,deviceId:'dev',cursor:0,clientNow:2000});
async function waitJob(api,wordId,id){
  for(let i=0;i<100;i++){const r=await api('ai/jobs?wordId='+wordId),job=r.data.jobs.find(x=>x.id===id);if(['success','failed','stale'].includes(job?.status))return job;await new Promise(resolve=>setTimeout(resolve,10));}
  throw new Error('AI job timeout');
}
test('AI autofill stays a suggestion and sentence jobs append offline-syncable pool events',async()=>{
  const {server,api}=await start();
  try{
    const set=event('set1','set',{id:'s1',name:'Work',language:'en',meaningLanguage:'vi'},1);
    const word=event('word1','word',{id:'w1',setId:'s1',patch:{word:'deploy',meaning:'triển khai',level:'A2'}},2);
    assert.equal((await api('sync',batch([set,word]))).status,200);
    const auto=await api('ai/jobs',{wordId:'w1',kind:'autofill'}),autoDone=await waitJob(api,'w1',auto.data.job.id);
    assert.equal(autoDone.status,'success');
    let synced=await api('sync',{events:[],deviceId:'dev',cursor:0,clientNow:3000});
    assert.equal(synced.data.events.filter(e=>e.kind==='word').length,1);
    const sj=await api('ai/jobs',{wordId:'w1',kind:'sentences'}),done=await waitJob(api,'w1',sj.data.job.id);
    assert.equal(done.result.count,5);
    synced=await api('sync',{events:[],deviceId:'dev',cursor:0,clientNow:4000});
    let state=replay(synced.data.events);assert.equal(state.words.w1.sentencePool.filter(s=>!s.deleted).length,5);
    const q=question(state.words.w1,[state.words.w1],'cloze','sentence','free',DEFAULTS,()=> 'q-pool','en');
    const answer=event('answer-pool','answer',{schemaVersion:2,wordId:'w1',questionId:q.id,baseRev:'',mode:'free',game:'cloze',grade:'good',hadError:false,
      assisted:false,activeMs:12000,config:DEFAULTS,face:'sentence',input:'deploy',unknown:false,hint:false,interrupted:false,
      question:{prompt:q.prompt,answers:q.answers,sentenceId:q.sentenceId,word:q.snapshot.word,meaning:q.snapshot.meaning,fields:q.snapshot.fields,twoStep:null}},10);
    const usage=event('usage-pool','sentenceUsage',{sentenceId:q.sentenceId,wordId:'w1',questionId:q.id},11);
    assert.equal((await api('sync',batch([answer,usage]))).status,200);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('AI result becomes stale when the word changes while a job is running',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const provider=async()=>{await gate;return {meanings:['old meaning']};};
  const {server,api}=await start(provider);
  try{
    await api('sync',batch([event('set2','set',{id:'s2',name:'Work',language:'en',meaningLanguage:'vi'},1),event('word2','word',{id:'w2',setId:'s2',patch:{word:'ship',meaning:'gửi'}},2)]));
    const queued=await api('ai/jobs',{wordId:'w2',kind:'autofill'});
    await api('sync',batch([event('word3','word',{id:'w2',setId:'s2',patch:{meaning:'vận chuyển'},baseFields:{}},3)]));
    release();const job=await waitJob(api,'w2',queued.data.job.id);assert.equal(job.status,'stale');assert.equal(job.result,null);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
