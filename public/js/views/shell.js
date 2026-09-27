import {app} from '../state.js';
import {brand,button,icon,t,esc,badge} from '../ui.js';
import {pendingCount} from '../storage.js';
import {studySetProfile,releasedProfiles,languageProfile} from '/core/language-profiles.js';
export function shell(content) {
  const set=app.model.sets[app.setId],profile=studySetProfile(set);
  return `<a class="skip" href="#main">Skip to content</a><div class="layout">
  <aside class="sidebar">${brand()}<nav aria-label="Main navigation">${['home','library','errors'].map(key=>button(`${icon(key==='library'?'list':key==='errors'?'flag':'home')}${t(key)}`,key,app.page===key?'nav active':'nav')).join('')}</nav>
  <div class="sidebar-bottom"><p class="muted small">${t('phaseNotice')}</p>${button(`${icon('gear')}${t('settings')}`,'settings','quiet')}</div></aside>
  <div><header class="topbar row between wrap"><button class="btn quiet" data-action="sets" aria-label="${t('switchSet')}: ${esc(set?.name || t('sets'))}">${icon('book')} ${esc(set?.name || t('sets'))} <small>${set?(profile?.label||set.language.toUpperCase())+' \u2192 '+set.meaningLanguage.toUpperCase():''}</small></button>
  <div class="row">${button(`${navigator.onLine?'':t('offline')+' \u00b7 '}${pendingCount()?pendingCount()+' '+t('pending'):t('saved')}`,'syncInfo','status-button',`aria-label="${t('openSync')}: ${navigator.onLine?'':t('offline')+' · '}${pendingCount()?pendingCount()+' '+t('pending'):t('saved')}"`)}${button(icon('gear'),'settings','icon-button',`aria-label="${t('accountSettings')}"`)}</div></header>
  <main id="main">${content}</main></div></div>`;
}
export function authView() {
  return `<main class="auth"><div class="auth-art">${brand()}<span class="eyebrow">YOUR WORDS, YOUR PACE</span><h1>${t('loginIntro')}</h1><p>${t('loginHelp')}</p><div class="letter-card">Aa<span>learn \u00b7 remember \u00b7 grow</span></div></div>
  <section class="panel"><h2>${t(app.register?'register':'login')}</h2><form id="auth-form" class="stack"><label>Email<input type="email" name="email" autocomplete="username" required></label><label>${t('password')}<input type="password" name="password" minlength="12" maxlength="200" autocomplete="${app.register?'new-password':'current-password'}" required></label>
  <p class="error-text" id="auth-error" role="alert"></p><button class="btn primary" type="submit">${t(app.register?'register':'login')}</button></form>${button(t(app.register?'haveAccount':'newAccount'),'toggleAuth','quiet')}<p class="muted small">${t('onlyLocal')}</p></section></main>`;
}
export function setView() {
  const profiles=releasedProfiles(3);
  return shell(`<header class="page-heading"><span class="eyebrow">${t('sets')}</span><h1 tabindex="-1">${t('emptySets')}</h1></header><div class="columns">${Object.values(app.model.sets).map(s=>`<button class="panel set-card" data-action="selectSet" data-id="${s.id}" aria-label="${t('chooseSet')}: ${esc(s.name)}"><h2>${esc(s.name)}</h2><p>${esc(languageProfile(s.language)?.label||s.language.toUpperCase())} → ${s.meaningLanguage.toUpperCase()} · ${t(studySetProfile(s)?.meaningMode||'bilingual')}</p>${icon('arrow')}</button>`).join('')}
  <section class="panel"><h2>${t('createSet')}</h2><form id="set-form" class="stack"><label>${t('setName')}<input name="name" required maxlength="100" placeholder="Chinese for work"></label><label>${t('studyLanguage')}<select name="language" id="set-language">${profiles.map(p=>`<option value="${p.id}">${esc(p.label)}</option>`).join('')}</select></label><label>${t('meaningLanguage')}<select name="meaningLanguage" id="set-meaning-language"><option value="vi">Tiếng Việt</option><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option></select></label><p class="muted small">${t('releasedProfilesOnly')}</p><button class="btn primary" type="submit">${t('createSet')}</button></form></section></div>`);
}
