import {descendants,categoryPath} from '/core/model.js';
import {app,current} from './state.js';
import {api,openStore,model,prepare,transact,setMeta,getMeta,refresh,sync,pendingCount,uuid,currentDeviceId} from './storage.js';
import {t,notify,closeModal,modal,esc,setModalTrigger,clearModalTrigger} from './ui.js';
import {authView,setView} from './views/shell.js';
import {homeView} from './views/home.js';
import {libraryView,rows,filtered} from './views/library.js';
import {studyView,resultsView} from './views/study.js';import {statisticsView} from './views/statistics.js';
import {setup,studyAction,submitInput,startClock,stopClock,applyStudySetup,saveStudySetup} from './study.js';
import {openEditor,saveWord,deleteWord,mediaFile,clearMedia,trash,makeSentenceBlank,updateSentencePreview,updateEditorReadiness,loadStrokeData} from './editor.js';
import {customFields,saveCustomField,deleteCustomField} from './card-schema.js';
import {settings,saveSettings,syncNow,syncInfo,scopeModal,topics,moveTopic,logoutAction,offlineResources,cleanupResources} from './settings.js';
import {samples,exportContent,importDialog,readImport,confirmImport,previewImport} from './content.js';
import {installAccessibility,isComposing} from './a11y.js';
import {pushHistory,replaceHistory,restoreHistory,historyMatchesApp} from './navigation.js';
import {hydrateMedia,migrateLegacyMedia} from './media-store.js';
import {reminderPlan} from '/core/reminders.js';
import {startAi,applyAi,applyAiField,applyAiMeaning,retryAi} from './ai-client.js';
import {updateSentenceStatus} from './sentence-pool.js';import {lookupEditorReading,autofillEditor,ensureAutoAutofill} from './lookups.js';
const studyActions=new Set(['startSession','resume','pause','finish','playAudio','slowAudio','flip','hint','unknown','remember','choose','toneChoice','checkTones','classifierChoice','formChoice','next','letter','clearLetters','checkLetters','matchLeft','matchRight','handwritingUndo','handwritingClear','speechStart']);
app.render=(focus)=>{
  document.querySelector('#app').innerHTML=!app.user?authView():!app.setId||app.page==='sets'?setView()
    :app.page==='study'?studyView():app.page==='results'?resultsView():app.page==='statistics'?statisticsView():['library','errors'].includes(app.page)?libraryView():homeView();
  hydrateMedia(document.querySelector('#app')).catch(()=>{});
  if(focus)requestAnimationFrame(()=>document.querySelector(focus)?.focus());
};
async function persistView(){await setMeta('view',{setId:app.setId,scope:app.scope,page:app.page,filter:app.filter,query:app.query});}
function showError(error){
  const message=t(error?.message||String(error)),el=document.querySelector('#form-error')||document.querySelector('#auth-error')||document.querySelector('#study-error');
  if(el)el.textContent=message;notify(message,true);
}
async function commit(events){await transact(events);app.model=model();}
async function navigate(page){
  app.selectedCards.clear();
  if(app.page==='study'){stopClock(true);await setMeta('session',app.session);}
  app.page=page;await persistView();app.render('h1');pushHistory();
}
async function authenticated(user){
  app.user=user;localStorage.setItem('vocalearn-user',JSON.stringify(user));await openStore(user);
  try{await migrateLegacyMedia();}catch(error){notify(t('mediaMigrationError')+': '+error.message,true);}
  try{await sync();}catch(error){if(navigator.onLine!==false)notify(t('syncError')+': '+error.message,true);}
  try{if(await migrateLegacyMedia())await sync();}catch(error){notify(t('mediaMigrationError')+': '+error.message,true);}
  app.model=model();
  const saved=await getMeta('view');
  if(saved)Object.assign(app,saved);
  if(!app.model.sets[app.setId])app.setId=Object.keys(app.model.sets)[0]||null;
  applyStudySetup(await getMeta('studySetup'));
  app.session=await getMeta('session')||null;
  if(app.session&&!app.session.finished){for(const q of app.session.queue)if(!q.result)q.interrupted=true;await setMeta('session',app.session);}
  const reopenResults=saved?.page==='results'&&app.session?.finished;
  app.page=reopenResults?'results':'home';app.render();replaceHistory();
}
function pruneSelection(){const ids=new Set(filtered().map(w=>w.id));for(const id of app.selectedCards)if(!ids.has(id))app.selectedCards.delete(id);}
async function click(action,el){
  if(studyActions.has(action))return studyAction(action,el);
  if(action==='toggleAuth'){app.register=!app.register;app.render();return;}
  if(action==='close'){if(app.dirty&&!confirm(t('unsaved')))return;app.dirty=false;closeModal(true);return;}
  if(['home','library','errors','statistics','sets'].includes(action)){
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
  if(action==='makeSentenceBlank')return makeSentenceBlank();
  if(action==='lookupReading')return lookupEditorReading(el.dataset.language||'en');if(action==='autofillWord')return autofillEditor(el.dataset.language||'en',el.dataset.meaningLanguage||'vi');if(action==='loadStrokeData')return loadStrokeData();
  if(action==='aiStart')return startAi(el.dataset.wordId);
  if(action==='aiApply'){const id=await applyAi(el.dataset.wordId,el.dataset.jobId);return openEditor(id);}
  if(action==='aiApplyField'){const id=await applyAiField(el.dataset.wordId,el.dataset.jobId,el.dataset.field);return openEditor(id);}
  if(action==='aiMeaning'){
    const value=await applyAiMeaning(el.dataset.wordId,el.dataset.jobId,el.dataset.index);
    const form=document.querySelector('#word-form');if(!form)throw new Error(t('aiWordMissing'));
    form.elements.meaning.value=value;app.dirty=true;return;
  }
  if(action==='aiRetry')return retryAi(el.dataset.wordId,el.dataset.jobId);
  if(action==='sentenceReport'||action==='sentenceDelete'){
    const id=await updateSentenceStatus(el.dataset.wordId,el.dataset.sentenceId,action==='sentenceReport'?'reported':'deleted');
    return openEditor(id);
  }
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
    if(!confirm('Xóa chủ đề này và các chủ đề con? Các thẻ vẫn được giữ lại.'))return;
    await commit([prepare('deleteCategory',{id:el.dataset.id})]);topics();return app.render();
  }
  if(action==='samples')return samples();
  if(action==='export')return exportContent();
  if(action==='import')return importDialog();
  if(action==='previewImport')return previewImport();
  if(action==='confirmImport')return confirmImport();
  if(action==='offlineResources')return offlineResources();
  if(action==='cleanupMediaLocal')return cleanupResources('local');
  if(action==='cleanupMediaServer')return cleanupResources('server');
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
  if(action==='moveCardTopic'){
    pruneSelection();
    const selected=Array.from(app.selectedCards).map(id=>app.model.words[id]).filter(Boolean);
    if(!selected.length)return app.render();
    const shared=selected.reduce((ids,w)=>ids.filter(id=>w.categoryIds.includes(id)),[...selected[0].categoryIds]);
    const cs=Object.values(app.model.categories).filter(c=>c.setId===app.setId);
    if(!shared.length)throw new Error('Các thẻ đã chọn không có chủ đề nguồn chung để chuyển.');
    const targets=cs.filter(c=>!shared.every(id=>id===c.id));
    if(!targets.length)throw new Error('Không có chủ đề đích khác.');
    return modal('Chuyển chủ đề',`<form id="move-card-topic-form" class="stack">
      <p class="muted small">Chuyển chỉ liên kết chủ đề nguồn. Các chủ đề khác và lịch học của thẻ được giữ nguyên.</p>
      <label>Chuyển khỏi chủ đề<select name="sourceCategoryId">${shared.map(id=>`<option value="${id}">${esc(categoryPath(app.model.categories,id))}</option>`).join('')}</select></label>
      <label>Sang chủ đề<select name="targetCategoryId">${cs.map(cat=>`<option value="${cat.id}">${esc(categoryPath(app.model.categories,cat.id))}</option>`).join('')}</select></label>
      <button type="submit" class="btn primary">Chuyển · ${selected.length} thẻ</button></form>`);
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
      await commit([prepare('set',{id,name:f.get('name').trim(),language:f.get('language'),meaningLanguage:f.get('meaningLanguage')})]);
      app.setId=id;await navigate('home');
    }
    if(form.id==='word-form'){try{await ensureAutoAutofill(form);}catch(error){showError(error);}await saveWord(form);}
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
    if(form.id==='move-card-topic-form'){
      pruneSelection();
      const data=new FormData(form),sourceCategoryId=data.get('sourceCategoryId'),targetCategoryId=data.get('targetCategoryId');
      if(!sourceCategoryId||!targetCategoryId||sourceCategoryId===targetCategoryId)throw new Error('Chọn hai chủ đề khác nhau.');
      const events=[];
      for(const wordId of app.selectedCards){
        const source=app.model.links[`${wordId}/${sourceCategoryId}`];
        if(!source||source.removed)throw new Error('Một thẻ đã chọn không còn thuộc chủ đề nguồn.');
        const target=app.model.links[`${wordId}/${targetCategoryId}`];
        if(!target||target.removed)events.push(prepare('link',{wordId,categoryId:targetCategoryId,base:target?.rev||null}));
        events.push(prepare('unlink',{wordId,categoryId:sourceCategoryId,base:source.rev}));
      }
      if(events.length)await commit(events);
      app.selectedCards.clear();closeModal();return app.render();
    }
  }catch(error){showError(error);}finally{app.busy=false;if(submit?.isConnected)submit.disabled=false;}
});
document.addEventListener('input',e=>{
  if(e.target.closest('#word-form')){app.dirty=true;updateEditorReadiness();if(['sentence','answers'].includes(e.target.name))updateSentencePreview();}
  if(e.target.id==='search'){const pos=e.target.selectionStart;app.selectedCards.clear();app.query=e.target.value;app.render();const search=document.querySelector('#search');search.focus();try{search.setSelectionRange(pos,pos);}catch{}}
  if(e.target.id==='answer'&&current()){current().input=e.target.value;current().inputError='';setMeta('session',app.session).catch(showError);}
});
document.addEventListener('change',async e=>{
  try{
    if(e.target.id==='setup-game'){app.game=e.target.value;await saveStudySetup();setup();}
    if(e.target.id==='setup-face'){app.face=e.target.value;await saveStudySetup();setup();}
    if(e.target.id==='setup-answer-face'){app.answerFace=e.target.value;await saveStudySetup();setup();}
    if(e.target.id==='setup-handwriting-level'){app.handwritingLevel=e.target.value;await saveStudySetup();setup();}if(e.target.name==='word'&&e.target.closest('#word-form'))setTimeout(()=>ensureAutoAutofill(e.target.closest('#word-form')).catch(showError),350);
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
      if(due&&clock>=s.reminderTime){
        const localShown=await getMeta('reminded')===day;
        const permission=typeof Notification==='undefined'?'unsupported':Notification.permission;
        const plan=reminderPlan(s,currentDeviceId(),day,permission,localShown);
        if(plan.action!=='none'){
          if(plan.action==='notification'){
            try{const reg=await navigator.serviceWorker.ready;await reg.showNotification('VocaLearn',{body:t('reviewHint'),tag:'vocalearn-review-'+day});}
            catch{notify(t('reviewHint'));}
          }else notify(t('reviewHint'));
          await setMeta('reminded',day);
          if(plan.primary){await transact([prepare('settings',{reminderLastDay:day})]);app.model=model();}
        }
      }
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
