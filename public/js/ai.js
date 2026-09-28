import {app} from './state.js';
import {api,sync,model,prepare,transact,uuid} from './storage.js';
import {modal,button,t,esc,notify} from './ui.js';
import {contentVersion,sentencePrompt} from '/core/sentences.js';
import {parsePinyin} from '/core/chinese-games.js';
let jobs=new Map();
const terminal=new Set(['success','failed','stale']);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function statusLabel(status){return ({waiting:'Đang chờ',running:'Đang chạy',success:'Hoàn tất',failed:'Thất bại',stale:'Đã lỗi thời'})[status]||status;}
function resultButtons(job,word){
  if(job.status!=='success'||job.kind!=='autofill'||!job.result)return '';
  const parts=[];
  for(let i=0;i<(job.result.meanings||[]).length;i++)parts.push('<div class="conflict"><strong>'+t('meaning')+' · AI</strong><p>'+esc(job.result.meanings[i])+'</p>'+button('Dùng nghĩa này','aiAccept','primary','data-job="'+job.id+'" data-word="'+word.id+'" data-field="meaning" data-index="'+i+'"')+'</div>');
  const set=app.model.sets[word.setId],mapping=[];
  if(set?.language===set?.meaningLanguage&&job.result.definition)mapping.push(['definition','meaning','Định nghĩa']);
  if(job.result.note)mapping.push(['note','note','Mẹo nhớ']);
  if(job.result.transcription)mapping.push(['transcription',set?.language==='zh'?'pinyin':set?.language==='ja'?'kana':'ipa','Phiên âm']);
  if(job.result.hanViet)mapping.push(['hanViet','hanViet','Hán-Việt']);
  for(const [source,field,label] of mapping)parts.push('<div class="conflict"><strong>'+esc(label)+' · AI</strong><p>'+esc(job.result[source])+'</p>'+button('Chấp nhận','aiAccept','','data-job="'+job.id+'" data-word="'+word.id+'" data-field="'+field+'" data-source="'+source+'"')+'</div>');
  return parts.join('');
}
function renderPanel(wordId,enabled,list){
  const word=app.model.words[wordId];if(!word)return;
  jobs=new Map(list.map(job=>[job.id,job]));
  const version=contentVersion(word),sentences=Object.values(app.model.sentences||{}).filter(s=>s.wordId===wordId&&!s.deleted&&s.wordContentVersion===version);
  const jobHtml=list.map(job=>'<section class="info"><div class="row between wrap"><strong>'+(job.kind==='sentences'?'Kho câu':'Điền nội dung')+' · '+statusLabel(job.status)+'</strong>'+(job.status==='failed'?button('Thử lại','aiRetry','quiet','data-id="'+job.id+'" data-word="'+wordId+'"'):'')+'</div>'+(job.errorCode?'<p class="error-text">'+esc(job.errorCode)+'</p>':'')+resultButtons(job,word)+'</section>').join('');
  const sentenceHtml=sentences.map(s=>'<div class="conflict"><p>'+esc(sentencePrompt(s))+'</p><small class="muted">'+(s.usageCount||0)+' lần dùng · '+esc(s.level||'')+'</small>'+button('Xóa câu','deleteSentence','quiet','data-id="'+s.id+'" data-word="'+wordId+'"')+'</div>').join('');
  modal('AI · '+word.word,'<div class="stack"><p class="muted small">AI chỉ đưa đề xuất; nội dung sửa tay không bị ghi đè. Nghĩa luôn cần bạn chọn.</p>'+
    (enabled?'<div class="row wrap">'+button('Gợi ý nội dung','aiGenerate','primary','data-kind="autofill" data-word="'+wordId+'"')+button(sentences.length?'Tạo thêm 5 câu':'Tạo 5 câu','aiGenerate','','data-kind="sentences" data-word="'+wordId+'"')+button('Làm mới','aiRefresh','quiet','data-word="'+wordId+'"')+'</div>':'<p class="info">Máy chủ AI chưa được cấu hình. Các game lõi vẫn dùng bình thường.</p>')+
    (jobHtml||'<p class="muted">Chưa có job AI.</p>')+'<section><h3>Kho câu</h3>'+(sentenceHtml||'<p class="muted">Chưa có câu AI hợp lệ.</p>')+'</section></div>');
}
export async function aiPanel(wordId){
  if(!navigator.onLine)throw new Error('AI cần mạng để tạo hoặc kiểm tra đề xuất. Kho câu đã tải vẫn dùng offline.');
  try{await sync();app.model=model();}catch{}
  const cap=await api('ai/capabilities'),data=cap.enabled?await api('ai/jobs?wordId='+encodeURIComponent(wordId)):{jobs:[]};
  renderPanel(wordId,cap.enabled,data.jobs||[]);
}
async function waitJob(wordId,id){
  for(let i=0;i<20;i++){
    await sleep(250);const data=await api('ai/jobs?wordId='+encodeURIComponent(wordId)),job=(data.jobs||[]).find(item=>item.id===id);
    if(job&&terminal.has(job.status))break;
  }
  try{await sync();app.model=model();}catch{}
}
export async function generateAi(wordId,kind){
  await sync();app.model=model();
  const {job}=await api('ai/jobs',{wordId,kind});notify(kind==='sentences'?'Đã xếp việc tạo kho câu.':'Đã xếp việc gợi ý nội dung.');
  await waitJob(wordId,job.id);return aiPanel(wordId);
}
export async function retryAi(wordId,id){
  const {job}=await api('ai/retry',{id});await waitJob(wordId,job.id);return aiPanel(wordId);
}
export async function acceptAi(wordId,jobId,field,index,source){
  const job=jobs.get(jobId),word=app.model.words[wordId];if(!job||job.status!=='success'||!word)throw new Error('Đề xuất AI không còn khả dụng');
  let value=field==='meaning'&&Number.isInteger(index)?job.result.meanings?.[index]:job.result?.[source||field];
  value=String(value||'').trim();if(!value)throw new Error('Đề xuất trống');
  if(field==='meaning'&&word.meaning&&word.meaning!==value){
    const patch={word:word.word,meaning:value,pos:word.pos||''};
    for(const key of ['ipa','pinyin','kana','hanViet','level'])if(word[key])patch[key]=word[key];
    await transact([prepare('word',{id:uuid(),setId:word.setId,patch,baseFields:{}})]);
  }else{
    const patch={[field]:value};
    if(field==='pinyin')patch.pinyinSyllables=parsePinyin(value);
    await transact([prepare('word',{id:word.id,setId:word.setId,patch,baseFields:word.fields})]);
  }
  app.model=model();app.render();notify('Đã chấp nhận đề xuất AI.');return aiPanel(wordId);
}
export async function removeSentence(wordId,id){
  await transact([prepare('deleteSentence',{id,wordId})]);app.model=model();notify('Đã loại câu khỏi kho.');return aiPanel(wordId);
}
export function maybeQueueForWord(wordId){
  if(!navigator.onLine)return;
  const word=app.model.words[wordId];if(!word||word.deleted)return;
  const version=contentVersion(word),pool=Object.values(app.model.sentences||{}).filter(s=>s.wordId===wordId&&!s.deleted&&s.status==='ready'&&s.wordContentVersion===version);
  const kind=word.meaning?(pool.length?'':'sentences'):'autofill';
  if(kind)api('ai/jobs',{wordId,kind}).catch(()=>{});
}
export function maybeReplenish(wordId){
  if(!navigator.onLine)return;
  const word=app.model.words[wordId];if(!word)return;
  const version=contentVersion(word),pool=Object.values(app.model.sentences||{}).filter(s=>s.wordId===wordId&&!s.deleted&&s.status==='ready'&&s.wordContentVersion===version);
  if(pool.length>=5&&pool.every(s=>(s.usageCount||0)>0))api('ai/jobs',{wordId,kind:'sentences'}).catch(()=>{});
}
