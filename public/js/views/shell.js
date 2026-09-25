import {app} from '../state.js';
import {brand,button,icon,t,esc,badge} from '../ui.js';
import {pendingCount} from '../storage.js';
export function shell(content) {
  const set=app.model.sets[app.setId];
  return `<a class="skip" href="#main">Skip to content</a><div class="layout">
  <aside class="sidebar">${brand()}<nav aria-label="Main navigation">${['home','library','errors'].map(key=>button(`${icon(key==='library'?'list':key==='errors'?'flag':'home')}${t(key)}`,key,app.page===key?'nav active':'nav')).join('')}</nav>
  <div class="sidebar-bottom"><p class="muted small">${t('phaseNotice')}</p>${button(`${icon('gear')}${t('settings')}`,'settings','quiet')}</div></aside>
  <div><header class="topbar row between wrap"><button class="btn quiet" data-action="sets">${icon('book')} ${esc(set?.name || t('sets'))} <small>${set?'EN \u2192 '+set.meaningLanguage.toUpperCase():''}</small></button>
  <div class="row">${button(`${navigator.onLine?'':t('offline')+' \u00b7 '}${pendingCount()?pendingCount()+' '+t('pending'):t('saved')}`,'syncInfo','status-button')}${button(icon('gear'),'settings','icon-button',`aria-label="${t('settings')}"`)}</div></header>
  <main id="main">${content}</main></div></div>`;
}
export function authView() {
  return `<main class="auth"><div class="auth-art">${brand()}<span class="eyebrow">YOUR WORDS, YOUR PACE</span><h1>${t('loginIntro')}</h1><p>${t('loginHelp')}</p><div class="letter-card">Aa<span>learn \u00b7 remember \u00b7 grow</span></div></div>
  <section class="panel"><h2>${t(app.register?'register':'login')}</h2><form id="auth-form" class="stack"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>${t('password')}<input type="password" name="password" minlength="12" maxlength="200" autocomplete="${app.register?'new-password':'current-password'}" required></label>
  <p class="error-text" id="auth-error" role="alert"></p><button class="btn primary" type="submit">${t(app.register?'register':'login')}</button></form>${button(t(app.register?'haveAccount':'newAccount'),'toggleAuth','quiet')}<p class="muted small">${t('onlyLocal')}</p></section></main>`;
}
export function setView() {
  return shell(`<header class="page-heading"><span class="eyebrow">${t('sets')}</span><h1 tabindex="-1">${t('emptySets')}</h1></header><div class="columns">${Object.values(app.model.sets).map(s=>`<button class="panel set-card" data-action="selectSet" data-id="${s.id}"><h2>${esc(s.name)}</h2><p>EN \u2192 ${s.meaningLanguage.toUpperCase()}</p>${icon('arrow')}</button>`).join('')}
  <section class="panel"><h2>${t('createSet')}</h2><form id="set-form" class="stack"><label>${t('setName')}<input name="name" required maxlength="100" placeholder="English for work"></label><label>${t('meaningLanguage')}<select name="meaningLanguage"><option value="vi">Ti\u1ebfng Vi\u1ec7t</option><option value="en">English</option></select></label><button class="btn primary" type="submit">${t('createSet')}</button></form></section></div>`);
}
