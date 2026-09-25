import {app} from './state.js';

const PAGES=new Set(['home','library','errors','sets','study','results']);
let restoring=false;

function snapshot() {
  return {
    voca:true,
    page:app.page,
    setId:app.setId,
    scope:[...(app.scope||[])],
    filter:app.filter,
    query:app.query,
    sessionId:app.session?.id||null
  };
}
function same(a,b) {
  return !!a&&!!b&&a.voca&&b.voca&&a.page===b.page&&a.setId===b.setId
    &&a.filter===b.filter&&a.query===b.query&&a.sessionId===b.sessionId
    &&JSON.stringify(a.scope||[])===JSON.stringify(b.scope||[]);
}
export function replaceHistory() {
  if(typeof history==='undefined')return;
  history.replaceState(snapshot(),'');
}
export function pushHistory() {
  if(restoring||typeof history==='undefined')return;
  const next=snapshot();
  if(same(history.state,next))history.replaceState(next,'');
  else history.pushState(next,'');
}
export function restoreHistory(state) {
  if(!state?.voca)return false;
  restoring=true;
  try {
    if(state.setId&&app.model?.sets?.[state.setId])app.setId=state.setId;
    app.scope=Array.isArray(state.scope)?state.scope:[];
    app.filter=state.filter||'all';
    app.query=state.query||'';
    let page=PAGES.has(state.page)?state.page:'home';
    if(['study','results'].includes(page)&&state.sessionId!==app.session?.id)page='home';
    if(page==='study'&&(!app.session||app.session.finished))page=app.session?.finished?'results':'home';
    if(page==='results'&&!app.session)page='home';
    app.page=page;
    return true;
  } finally {
    restoring=false;
  }
}
export function historyMatchesApp(state){return !!state?.voca&&same(snapshot(),state);}
export function isRestoringHistory(){return restoring;}
