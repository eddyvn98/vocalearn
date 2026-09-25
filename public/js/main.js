import {descendants,categoryPath} from '/core/model.js';
import {app,current} from './state.js';
import {api,openStore,model,prepare,transact,setMeta,getMeta,refresh,sync,pendingCount,uuid} from './storage.js';
import {t,notify,closeModal,modal,esc,setModalTrigger,clearModalTrigger} from './ui.js';
import {authView,setView} from './views/shell.js';
import {homeView} from './views/home.js';
import {libraryView,rows,filtered} from './views/library.js';
import {studyView,resultsView} from './views/study.js';
import {setup,studyAction,submitInput,startClock,stopClock,applyStudySetup,saveStudySetup} from './study.js';
import {openEditor,saveWord,deleteWord,mediaFile,clearMedia,trash} from './editor.js';
import {customFields,saveCustomField,deleteCustomField} from './card-schema.js';
import {settings,saveSettings,syncNow,syncInfo,scopeModal,topics,moveTopic,logoutAction,offlineResources} from './settings.js';
import {samples,exportContent,importDialog,readImport,confirmImport,previewImport} from './content.js';
import {installAccessibility,isComposing} from './a11y.js';
import {pushHistory,replaceHistory,restoreHistory,historyMatchesApp} from './navigation.js';
import {hydrateMedia,migrateLegacyMedia} from './media-store.js';
const studyActions=new Set(['startSession','resume','pause','finish','playAudio','slowAudio','flip','hint','unknown','remember','choose','next','letter','clearLetters','checkLetters','matchLeft','matchRight']);
app.render=(focus)=>{
  document.querySelector('#app').innerHTML=!app.user?authView():!app.setId||app.page==='sets'?setView()
    :app.page==='study'?studyView():app.page==='results'?resultsView():['library','errors'].includes(app.page)?libraryView():homeView();
  hydrateMedia(document.querySelector('#app')).catch(()=>{});
  if(focus)requestAnimationFrame(()=>document.querySelector(focus)?.focus());
};
async function persistView(){await setMeta('view',{setId:app.setId,scope:app.scope,page:app.page,filter:app.filter,query:app.query});}
function showError(error){
  const el=document.querySelector('#form-error')||document.querySelector('#auth-error')||document.querySelector('#study-error');
  if(el)el.textContent=error.message;notify(error.message,true);
}
async function commit(events){await transact(events);app.model=model();}
async function navigate(page){
  app.selectedCards.clear();
  if(app.page==='study'){stopClock(true);await setMeta('session',app.session);}
  app.page=page;app.render('h1');await persistView();pushHistory();
}
async function authenticated(user){
  app.user=user;localStorage.setItem('vocalearn-user',JSON.stringify(user));await openStore(user);
  try{await sync();}catch(error){notify(t('syncError')+': '+error.message,true);}
  app.model=model();
  try{if(await migrateLegacyMedia()){app.model=model();if(navigator.onLine)sync().catch(()=>{});}}catch(error){notify(t('mediaMigrationError')+': '+error.message,true);}
  const saved=await getMeta('view');
  if(saved)Object.assign(app,saved);
  if(!app.model.sets[app.setId])app.setId=Object.keys(app.model.sets)[0]||null;
  applyStudySetup(await getMeta('studySetup'));
  app.session=await getMeta('session')||null;
  if(app.session&&!app.session.finished){for(const q of app.session.queue)if(!q.result)q.interrupted=true;await setMeta('session',app.session);}
  app.page='home';app.render();replaceHistory();
}
function pruneSelection(){const ids=new Set(filtered().map(w=>w.id));for(const id of app.selectedCards)if(!ids.has(id))app.selectedCards.delete(id);}
async function click(action,el){
  if(studyActions.has(action))return studyAction(action,el);
  if(action==='toggleAuth'){app.register=!app.register;app.render();return;}
  if(action==='close'){if(app.dirty&&!confirm(t('unsaved')))return;app.dirty=false;closeModal(true);return;}
  if(['home','library','errors','sets'].includes(action)){
    if(action==='errors')app.filter='errors';if(action==='library')app.filter='all';return navigate(action);
  }
  if(action==='filter'){app.filter=el.dataset.filter;return navigate(app.filter==='errors'?'errors':'library');}
  if(action==='clearFilter'){app.filter='all';app.query='';app.scope=[];return navigate('library');}
  if(action==='selectSet'){app.setId=el.dataset.id;app.scope=[];return navigate('home');}
  if(action==='setupReview')return setup('review','mix');
  if(action==='setupNew')return setup('new','mix');
  if(action==='setupFree')return setup('free','typing');
  if(action==='setupErrors')return setup('errors','mix');
  if(action==='practice')return setup('free',el.dataset.game);
  if(action==='add'||action==='edit')return openEditor(el.dataset.id);
  if(action==='deleteWord')return deleteWord(el.dataset.id);
  if(action==='clearImage'||action==='clearAudio')return clearMedia(action==='clearImage'?'image':'audio');
  if(action==='settings')return settings();
  if(action==='syncInfo')return syncInfo();
  if(action==='sync'){await syncNow();return syncInfo();}
  if(action==='logout')return logoutAction();
  if(action==='scope')return scopeModal();
  if(action==='clearScope'){app.selectedCards.clear();app.scope=[];closeModal();app.render();return persistView();}
  if(action==='topicScope'){app.selectedCards.clear();app.scope=[el.dataset.id];app.render();return persistView();}
  if(action==='topics'||action==='editTopic')return topics(el.dataset.id);
  if(action==='addSubtopic')return topics(null,el.dataset.id);
  if(action==='moveTopicUp')return moveTopic(el.dataset.id,-1);
  if(action==='moveTopicDown')return moveTopic(el.dataset.id,1);
  if(action==='customFields'||action==='editCustomField')return customFields(el.dataset.id);
  if(action==='deleteCustomField')return deleteCustomField(el.dataset.id);
  if(action==='deleteTopic'){
    if(!confirm('Delete this topic and its subtopics? Cards will be kept.'))return;
    await commit([prepare('deleteCategory',{id:el.dataset.id})]);topics();return app.render();
  }
  if(action==='samples')return samples();
  if(action==='export')return exportContent();
  if(action==='import')return importDialog();
  if(action==='previewImport')return previewImport();
  if(action==='confirmImport')return confirmImport();
  if(action==='offlineResources')return offlineResources();
  if(action==='toggleSelect'){
    const id=el.dataset.id;if(app.selectedCards.has(id))app.selectedCards.delete(id);else app.selectedCards.add(id);
    return app.render();
  }
  if(action==='toggleSelectAll'){
    const list=filtered();if(list.every(w=>app.selectedCards.has(w.id)))list.forEach(w=>app.selectedCards.delete(w.id));else list.forEach(w=>app.selectedCards.add(w.id));
    return app.render();
  }
  if(action==='clearSelect'){app.selectedCards.clear();return app.render();}
  if(action==='bulkDelete'){
    pruneSelection();
    if(!confirm(`Xóa ${app.selectedCards.size} thẻ đã chọn?`))return;
    await commit(Array.from(app.selectedCards).map(id=>prepare('deleteWord',{id})));app.selectedCards.clear();return app.render();
  }
  if(action==='bulkReset'){
    pruneSelection();
    if(!confirm(`Đặt lại lịch ôn cho ${app.selectedCards.size} thẻ đã chọn?`))return;
    await commit(Array.from(app.selectedCards).map(id=>prepare('resetWord',{id})));app.selectedCards.clear();return app.render();
  }
  if(action==='bulkTopic'){
    pruneSelection();
    const cs=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
    if(!cs.length)throw new Error(t('noTopics'));
    return modal(t('topics'),`<form id="bulk-topic-form" class="stack">
      <label>${t('topics')}<select name="categoryId">${cs.map(c=>`<option value="${c.id}">${esc(categoryPath(app.model.categories,c.id))}</option>`).join('')}</select></label>
      <label>${t('mode')}<select name="operation"><option value="assign">${t('assignTopic')}</option><option value="remove">${t('removeTopic')}</option></select></label>
      <button type="submit" class="btn primary">${t('save')} · ${app.selectedCards.size} thẻ</button></form>`);
  }
  if(action==='trash')return trash();
  if(action==='restoreWord'){await commit([prepare('restoreWord',{id:el.dataset.id})]);trash();app.render();}
  if(action==='restoreAllWords'){
    const deleted=Object.values(app.model.words).filter(w=>w.deleted&&w.setId===app.setId);
    if(!deleted.length||!confirm(`${t('restoreAll')} ${deleted.length} thẻ?`))return;
    await commit(deleted.map(w=>prepare('restoreWord',{id:w.id})));trash();app.render();return;
  }
  if(action==='restoreField'){
    const conflict=app.model.conflicts.find(c=>c.eventId===el.dataset.id&&c.field===el.dataset.field);
    const word=app.model.words[conflict.wordId];
    if(['word','meaning'].includes(conflict.field)){closeModal();return openEditor(word.id);}
    await commit([prepare('word',{id:word.id,setId:word.setId,patch:{[conflict.field]:conflict.before},baseFields:word.fields})]);return syncInfo();
  }
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el||el.disabled||app.busy)return;
  setModalTrigger(el);app.busy=true;
  try{await click(el.dataset.action,el);}catch(error){showError(error);}finally{clearModalTrigger();app.busy=false;}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();if(e.target.id==='answer-form'&&isComposing())return;if(app.busy)return;app.busy=true;
  const form=e.target,submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  try{
    if(form.id==='auth-form'){
      const f=new FormData(form);const data=await api(app.register?'register':'login',{email:f.get('email'),password:f.get('password')});
      await authenticated(data.user);
    }
    if(form.id==='set-form'){
      const f=new FormData(form),id=uuid();
      await commit([prepare('set',{id,name:f.get('name').trim(),language:'en',meaningLanguage:f.get('meaningLanguage')})]);
      app.setId=id;await navigate('home');
    }
    if(form.id==='word-form')await saveWord(form);
    if(form.id==='custom-field-form')await saveCustomField(form);
    if(form.id==='answer-form')await submitInput(new FormData(form).get('answer'));
    if(form.id==='settings-form')await saveSettings(form);
    if(form.id==='scope-form'){app.selectedCards.clear();app.scope=new FormData(form).getAll('scope');closeModal();app.render();await persistView();}
    if(form.id==='topic-form'){
      const f=new FormData(form),id=form.dataset.id||uuid(),parentId=f.get('parentId')||null;
      if(parentId&&descendants(app.model.categories,id).has(parentId))throw new Error('Chủ đề không thể tạo vòng lặp');
      await commit([prepare('category',{id,setId:app.setId,name:f.get('name').trim(),parentId})]);
      closeModal();app.render();
    }
    if(form.id==='bulk-topic-form'){
      pruneSelection();
      const data=new FormData(form),catId=data.get('categoryId'),operation=data.get('operation');
      const events=[];
      for(const wordId of app.selectedCards){
        const link=app.model.links[`${wordId}/${catId}`],linked=link&&!link.removed;
        if(operation==='assign'&&!linked)events.push(prepare('link',{wordId,categoryId:catId,base:link?.rev||null}));
        if(operation==='remove'&&linked)events.push(prepare('unlink',{wordId,categoryId:catId,base:link.rev}));
      }
      if(events.length)await commit(events);
      app.selectedCards.clear();closeModal();return app.render();
    }
  }catch(error){showError(error);}finally{app.busy=false;if(submit?.isConnected)submit.disabled=false;}
});
document.addEventListener('input',e=>{
  if(e.target.closest('#word-form'))app.dirty=true;
  if(e.target.id==='search'){const pos=e.target.selectionStart;app.selectedCards.clear();app.query=e.target.value;app.render();const search=document.querySelector('#search');search.focus();try{search.setSelectionRange(pos,pos);}catch{}}
  if(e.target.id==='answer'&&current()){current().input=e.target.value;current().inputError='';setMeta('session',app.session).catch(showError);}
});
document.addEventListener('change',async e=>{
  try{
    if(e.target.id==='setup-game'){app.game=e.target.value;await saveStudySetup();setup();}
    if(e.target.id==='setup-face'){app.face=e.target.value;await saveStudySetup();setup();}
    if(e.target.id==='setup-answer-face'){app.answerFace=e.target.value;await saveStudySetup();setup();}
    if(e.target.dataset.mixGame){
      const game=e.target.dataset.mixGame;
      app.mixGames=e.target.checked?[...new Set([...app.mixGames,game])]:app.mixGames.filter(value=>value!==game);
      await saveStudySetup();setup();
    }
    if(e.target.id==='image-upload'||e.target.id==='audio-upload')await mediaFile(e.target.files[0],e.target.id==='image-upload'?'image':'audio');
    if(e.target.id==='json-file'||e.target.id==='import-file')await readImport(e.target.files[0]);
  }catch(error){showError(error);}
});
document.querySelector('#modal').addEventListener('cancel',e=>{
  e.preventDefault();
  if(app.dirty&&!confirm(t('unsaved')))return;
  app.dirty=false;closeModal(true);
});
document.addEventListener('visibilitychange',()=>{
  if(app.page==='study'&&app.session){stopClock(document.hidden);setMeta('session',app.session).catch(showError);if(!document.hidden)startClock();}
});
window.addEventListener('voca-external',async()=>{
  await refresh();app.model=model();if(app.page!=='study'&&!document.querySelector('#modal').open)app.render();
});
window.addEventListener('online',()=>{if(app.user)syncNow().catch(error=>notify(t('syncError')+': '+error.message,true));});
window.addEventListener('popstate',async event=>{
  if(!app.user||!event.state?.voca||historyMatchesApp(event.state))return;
  try {
    if(app.page==='study'&&app.session){stopClock(true);await setMeta('session',app.session);}
    if(!restoreHistory(event.state))return;
    app.selectedCards.clear();app.render('h1');await persistView();
    if(app.page==='study'&&app.session&&!app.session.finished)startClock();
  } catch(error){showError(error);}
});
setInterval(async()=>{
  if(!app.user||app.busy||app.page==='study'||document.querySelector('#modal').open)return;
  try{
    if(navigator.onLine)await syncNow();
    const m=app.model,s=m.settings,now=new Date();
    if(s.reminder){
      const day=(await import('/core/time.js')).dayAt(now.valueOf(),s.zone);
      const clock=new Intl.DateTimeFormat('en-GB',{timeZone:s.zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
      const due=Object.values(m.words).some(w=>!w.deleted&&w.ready&&(w.review.dueDate<=day&&w.review.dueDate||w.review.dueAt&&w.review.dueAt<=now.valueOf()));
      if(due&&clock>=s.reminderTime&&await getMeta('reminded')!==day){notify(t('reviewHint'));await setMeta('reminded',day);}
    }
  }catch{}
},30000);
installAccessibility();
try{
  const cached=JSON.parse(localStorage.getItem('vocalearn-user')||'null');
  let user;try{user=(await api('me')).user;}catch{user=cached;}
  if(user)await authenticated(user);else app.render();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
}catch(error){document.querySelector('#app').textContent=t('loadError');showError(error);}
