import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,allEvents,synchronize} from '../server/database.js';
import {replay} from '../core/model.js';
import {advance,DEFAULTS,initialState} from '../core/srs.js';

const t0=Date.parse('2026-09-25T05:00:00Z');
const raw=(id,kind,data,deviceId='dev',at=t0)=>({id,kind,data,deviceId,at});
const batch=(events,deviceId='dev',clientNow=t0,cursor=0)=>({events,deviceId,clientNow,cursor});

function dbWithUser() {
  const db=openDatabase(':memory:');
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)').run('u','u@example.test','h','s');
  return db;
}
function flash(id,questionId,wordId,word,meaning,fieldEvent,deviceId='dev',at=t0) {
  return raw(id,'answer',{
    schemaVersion:2,wordId,questionId,opportunityId:`schedule:${wordId}:root-${wordId}`,
    baseRev:`root-${wordId}`,mode:'new',game:'flash',face:'meaning',
    grade:'hard',hadError:false,assisted:false,hint:false,unknown:false,
    activeMs:0,input:word,config:DEFAULTS,familiarize:true,
    question:{prompt:meaning,answers:[word],word,meaning,fields:{word:fieldEvent,meaning:fieldEvent}}
  },deviceId,at);
}

test('Initial unanchored records use received time instead of trusting an old client clock',()=>{
  const db=dbWithUser();
  try {
    const old=t0-30*86400000;
    const e=raw('settings-old','settings',{newLimit:9},'first-device',old);
    const out=synchronize(db,'u',batch([e],'first-device',old),t0);
    const saved=out.events.find(x=>x.id===e.id);
    assert.equal(saved.effectiveAt,t0);
    assert.equal(saved.receivedAt,t0);
  } finally {db.close();}
});

test('Anchored clock mapping clamps backward and future client timestamps',()=>{
  const db=dbWithUser();
  try {
    synchronize(db,'u',batch([],'clock',t0),t0);
    const past=raw('clock-past','settings',{newLimit:8},'clock',t0-60000);
    const a=synchronize(db,'u',batch([past],'clock',t0-60000),t0+1000);
    assert.equal(a.events.find(e=>e.id==='clock-past').effectiveAt,t0);
    const future=raw('clock-future','settings',{newLimit:7},'clock',t0+60000);
    const b=synchronize(db,'u',batch([future],'clock',t0+60000,a.cursor),t0+2000);
    assert.equal(b.events.find(e=>e.id==='clock-future').effectiveAt,t0+2000);
  } finally {db.close();}
});

test('Child arriving before its scheduled parent is replayed only after the real parent exists',()=>{
  const db=dbWithUser();
  try {
    synchronize(db,'u',batch([]),t0);
    const setup=[
      raw('set','set',{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'}),
      raw('w1','word',{id:'word1',setId:'set',patch:{word:'apple',meaning:'fruit'}}),
      raw('w2','word',{id:'word2',setId:'set',patch:{word:'book',meaning:'object'}})
    ];
    synchronize(db,'u',batch(setup),t0);
    const parent=flash('parent','q-parent','word1','apple','fruit','w1');
    const afterParent=advance(initialState('word1'),{grade:'hard',assisted:false},t0,DEFAULTS);
    const child=raw('child','answer',{
      schemaVersion:2,wordId:'word1',questionId:'q-child',
      opportunityId:`schedule:word1:${afterParent.rev}`,baseRev:afterParent.rev,
      mode:'review',game:'quiz',face:'meaning',grade:'hard',hadError:false,
      assisted:false,hint:false,unknown:false,activeMs:1000,input:'apple',
      config:DEFAULTS,familiarize:false,
      question:{prompt:'fruit',answers:['apple'],word:'apple',meaning:'fruit',fields:{word:'w1',meaning:'w1'}}
    },'dev',t0+60000);
    synchronize(db,'u',batch([child,parent],'dev',t0+60000),t0+60000);
    const events=allEvents(db,'u');
    const storedChild=events.find(e=>e.id==='child');
    assert.equal(storedChild.deferredReview,true);
    const state=replay(events);
    assert.equal(state.words.word1.review.phase,'learning');
    assert.equal(state.words.word1.review.step,2);
    assert.equal(state.words.word1.review.rev!==afterParent.rev,true);
  } finally {db.close();}
});

test('Same scheduled opportunity from two devices keeps both logs but advances once',()=>{
  const db=dbWithUser();
  try {
    synchronize(db,'u',batch([],'a',t0),t0);
    synchronize(db,'u',batch([],'b',t0),t0);
    const setup=[
      raw('set','set',{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'},'a'),
      raw('w1','word',{id:'word1',setId:'set',patch:{word:'apple',meaning:'fruit'}},'a')
    ];
    synchronize(db,'u',batch(setup,'a',t0),t0);
    synchronize(db,'u',batch([flash('a1','qa','word1','apple','fruit','w1','a')],'a',t0),t0);
    synchronize(db,'u',batch([flash('b1','qb','word1','apple','fruit','w1','b')],'b',t0),t0);
    const events=allEvents(db,'u');
    assert.equal(events.filter(e=>e.data.opportunityId==='schedule:word1:root-word1').length,2);
    const state=replay(events);
    assert.equal(state.words.word1.review.step,1);
    assert.equal(state.words.word1.errors.total,0);
  } finally {db.close();}
});


function reviewAnswer(id,questionId,baseRev,grade,game,deviceId,at,hadError=false) {
  const input=grade==='forget'?'wrong':'apple';
  return raw(id,'answer',{
    schemaVersion:2,wordId:'word1',questionId,opportunityId:`schedule:word1:${baseRev}`,
    baseRev,mode:'review',game,face:'meaning',grade,hadError,assisted:false,hint:false,
    unknown:grade==='forget',activeMs:game==='typing'?6000:1000,input,config:DEFAULTS,familiarize:false,
    question:{prompt:'fruit',answers:['apple'],word:'apple',meaning:'fruit',fields:{word:'w1',meaning:'w1'}}
  },deviceId,at);
}

test('Late conservative parent keeps invalid child log but removes its schedule effect',()=>{
  const db=dbWithUser();
  try {
    synchronize(db,'u',batch([],'a',t0),t0);
    const setup=[
      raw('set','set',{id:'set',name:'Deck',language:'en',meaningLanguage:'vi'},'a'),
      raw('w1','word',{id:'word1',setId:'set',patch:{word:'apple',meaning:'fruit'}},'a'),
      raw('w2','word',{id:'word2',setId:'set',patch:{word:'book',meaning:'object'}},'a')
    ];
    synchronize(db,'u',batch(setup,'a',t0),t0);
    synchronize(db,'u',batch([flash('root','q-root','word1','apple','fruit','w1','a',t0)],'a',t0),t0);
    let state=replay(allEvents(db,'u')),rev1=state.words.word1.review.rev;

    const parent=reviewAnswer('parent-hard','q-parent-hard',rev1,'hard','quiz','a',t0+60000);
    synchronize(db,'u',batch([parent],'a',t0+60000),t0+60000);
    state=replay(allEvents(db,'u'));const hardRev=state.words.word1.review.rev;
    assert.equal(state.words.word1.review.step,2);

    const child=reviewAnswer('child-good','q-child-good',hardRev,'good','typing','a',t0+660000);
    synchronize(db,'u',batch([child],'a',t0+660000),t0+660000);
    state=replay(allEvents(db,'u'));
    assert.equal(state.words.word1.review.step,3);
    assert.equal(state.words.word1.accepted.has('child-good'),true);

    const late=reviewAnswer('late-forget','q-late-forget',rev1,'forget','quiz','b',t0+660000,true);
    synchronize(db,'u',batch([late],'b',t0+660000),t0+660000);
    const events=allEvents(db,'u'),final=replay(events),word=final.words.word1;
    assert.equal(events.some(e=>e.id==='child-good'),true);
    assert.equal(word.review.step,1);
    assert.equal(word.accepted.has('child-good'),false);
    assert.deepEqual(word.practiceReclassified,['child-good']);
    assert.equal(word.errors.failures,1);
    assert.equal(word.errors.total,1);
  } finally {db.close();}
});
