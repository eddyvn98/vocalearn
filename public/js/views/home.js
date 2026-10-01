import {app,words} from '../state.js';
import {button,icon,t,esc,badge} from '../ui.js';
import {inScope} from '/core/model.js';
import {isDue} from '/core/time.js';
import {dailyNewUsage} from '/core/questions.js';
import {shell} from './shell.js';
export const scoped=()=>words().filter(w=>inScope(w,app.scope,app.model.categories));
const waitText=(at,now,zone)=>`${new Date(at).toLocaleString('vi-VN',{timeZone:zone})} · còn ${Math.max(1,Math.ceil((at-now)/60000))} phút`;
export function homeView() {
  const list=scoped(),now=Date.now(),zone=app.model.settings.zone,newUsage=dailyNewUsage(app.model,now);
  const due=list.filter(w=>w.ready&&isDue(w.review,now,zone));
  const blocked=list.filter(w=>!w.ready&&isDue(w.review,now,zone));
  const waiting=list.filter(w=>!w.ready),fresh=list.filter(w=>w.review.phase==='new'&&w.ready);
  const learning=list.filter(w=>['learning','relearn'].includes(w.review.phase));
  const waitingLearning=learning.filter(w=>w.review.dueAt>now);
  const resume=app.session&&!app.session.finished;
  const nextLearningAt=waitingLearning.length?Math.min(...waitingLearning.map(w=>w.review.dueAt)):null;
  const hero=resume
    ?{kind:'resume',eyebrow:t('paused'),title:'Tiếp tục buổi học đang dở',detail:`${app.session.queue.filter(q=>q.result).length}/${app.session.queue.length} ${t('answered')}`,action:'resume',label:t('continue')}
    :due.length
      ?{kind:'due',eyebrow:t('due'),title:`${due.length} ${t('dueIntro')}`,detail:t('reviewHint'),action:'setupReview',label:t('reviewStart')}
      :fresh.length
        ?{kind:'new',eyebrow:t('new'),title:`${fresh.length} từ mới sẵn sàng`,detail:'Học một nhóm nhỏ trước, sau đó VocaLearn sẽ tự đưa chúng vào lịch ôn.',action:'setupNew',label:t('newStart')}
        :nextLearningAt
          ?{kind:'waiting',eyebrow:t('learning'),title:'Đang chờ lượt ôn tiếp theo',detail:waitText(nextLearningAt,now,zone),action:'setupFree',label:t('free')}
          :list.length
            ?{kind:'done',eyebrow:'✓ Hôm nay',title:'Bạn đã hoàn thành phần cần học',detail:'Không còn thẻ đến hạn. Bạn có thể luyện tự do hoặc xem lại chủ đề mình muốn.',action:'setupFree',label:t('free')}
            :{kind:'empty',eyebrow:t('todayTitle'),title:t('noData'),detail:'Thêm từ đầu tiên để bắt đầu xây lịch học cá nhân.',action:'add',label:t('add')};
  const games=[
    ['mix','shuffle'],['flash','cards'],['quiz','help'],['match','swap'],['typing','keyboard'],['spell','volume'],['cloze','type']
  ];
  return shell(`<header class="page-heading row between wrap"><div><div class="eyebrow">${t('intro')}</div><h1 tabindex="-1">${t('todayTitle')}</h1><p class="muted">${t('todaySub')}</p></div><div class="row wrap page-actions">${button(t('statistics'),'statistics','quiet')}${button(t('chooseScope'),'scope')}</div></header>
  <p class="muted small scope-line">${t('scope')}: ${app.scope.length?app.scope.map(id=>esc(app.model.categories[id]?.name||t(id))).join(' / '):t('all')}</p>
  <section class="hero hero-${hero.kind} ${resume?'resume':''}"><div><span class="eyebrow hero-eyebrow">${hero.eyebrow}</span><h2>${hero.title}</h2><p class="muted">${hero.detail}</p><div class="row wrap actions">${button(hero.label,hero.action,'primary')}${hero.action!=='setupFree'?button(t('free'),'setupFree'):''}${resume?button(t('finish'),'finish','quiet'):''}</div>${blocked.length?`<p class="small hero-note">${blocked.length} ${t('blocked')}</p>`:''}</div>${due.length?`<div class="hero-count">${due.length}<small>${t('cards').toUpperCase()}</small></div>`:''}</section>
  <div class="metrics compact-metrics">${[[fresh.length,'new'],[learning.length,'learning'],[waiting.length,'waiting'],[list.filter(w=>w.errors.inBook).length,'errors']].map(([n,key])=>`<button class="metric" data-action="filter" data-filter="${key}"><strong>${n}</strong><span>${t(key)}</span></button>`).join('')}</div>
  <p class="muted small" data-new-usage>${t('newToday')}: <strong>${newUsage.started}/${newUsage.limit}</strong>${newUsage.overflow?` · ${t('newOverflow')} ${newUsage.overflow}`:` · ${t('newRemaining')} ${newUsage.remaining}`}</p>
  <div class="columns home-secondary"><section class="panel"><div class="section-heading"><h2>${t('free')}</h2><p class="muted small">${t('freeHint')}</p></div><div class="game-grid">${games.map(([g,i])=>`<button class="game-tile" data-action="practice" data-game="${g}"><span class="tile-icon">${icon(i)}</span><span>${t(g)}</span></button>`).join('')}</div></section>
  <section class="panel"><div class="row between"><div><h2>${t('topics')}</h2><p class="muted small">Chọn một chủ đề để thu hẹp nội dung học.</p></div>${button('+','topics','icon-button',`aria-label="${t('topics')}"`)}</div>${Object.values(app.model.categories).filter(c=>c.setId===app.setId).map(c=>`<button class="topic-row" data-action="topicScope" data-id="${c.id}"><span>${esc(c.name)}</span>${badge(words().filter(w=>inScope(w,[c.id],app.model.categories)).length+' '+t('cards'),'neutral')}</button>`).join('')||`<p class="muted empty-topic">${t('noTopics')}</p>`}${!words().length?button(t('loadSamples'),'samples','quiet'):''}</section></div>`);
}
