import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,synchronize,allEvents} from '../server/database.js';
import {replay} from '../core/model.js';
import {DEFAULTS,initialState,advance} from '../core/srs.js';

const event=(id,kind,data,deviceId,at)=>({id,kind,data,deviceId,at});
const snapshot=(revision)=>({
  prompt:'qua tao',answers:['apple'],word:'apple',meaning:'qua tao',
  fields:{word:revision,meaning:revision}
});
function answer({id,deviceId,at,baseRev,mode,game,grade,revision,familiarize=false}) {
  return event(id,'answer',{
    schemaVersion:2,wordId:'late-word',questionId:'q-'+id,baseRev,mode,game,grade,
    hadError:grade==='forget',assisted:false,activeMs:1000,config:DEFAULTS,face:'meaning',
    input:grade==='forget'?'wrong':'apple',unknown:grade==='forget',familiarize,
    question:snapshot(revision)
  },deviceId,at);
}
function fixture() {
  const db=openDatabase(':memory:'),userId='late-user',deviceId='late-parent-device';
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)')
    .run(userId,'late@test.invalid','hash','salt');
  const revision='late-word-event';
  const events=[
    event('late-set-event','set',{id:'late-set',name:'Late parent',language:'en',meaningLanguage:'vi'},deviceId,1000),
    event(revision,'word',{id:'late-word',setId:'late-set',patch:{word:'apple',meaning:'qua tao'}},deviceId,1001),
    event('d2','word',{id:'d2w',setId:'late-set',patch:{word:'pear',meaning:'qua le'}},deviceId,1002),
    event('d3','word',{id:'d3w',setId:'late-set',patch:{word:'plum',meaning:'qua man'}},deviceId,1003),
    event('d4','word',{id:'d4w',setId:'late-set',patch:{word:'peach',meaning:'qua dao'}},deviceId,1004)
  ];
  synchronize(db,userId,{events,deviceId,cursor:0,clientNow:1004},100000);
  return {db,userId,revision,deviceId};
}

test('late parent activates an already-received due descendant once',()=>{
  const {db,userId,revision,deviceId}=fixture();
  const parentAt=200000;
  const parent=answer({id:'parent',deviceId,at:101004,baseRev:'root-late-word',
    mode:'new',game:'flash',grade:'hard',revision,familiarize:true});
  const predicted=advance(initialState('late-word'),parent.data,parentAt,DEFAULTS);
  const child=answer({id:'child',deviceId:'child-device',at:300000,baseRev:predicted.rev,
    mode:'review',game:'quiz',grade:'hard',revision});
  synchronize(db,userId,{events:[child],deviceId:'child-device',cursor:0,clientNow:300000},300000);
  assert.equal(replay(allEvents(db,userId)).words['late-word'].accepted.has(child.id),false);
  synchronize(db,userId,{events:[parent],deviceId,cursor:0,clientNow:101004},300000);
  const final=replay(allEvents(db,userId)).words['late-word'];
  assert.equal(final.accepted.has(parent.id),true);
  assert.equal(final.accepted.has(child.id),true);
  assert.equal(final.review.phase,'learning');
  assert.equal(final.review.step,2);
  assert.equal(allEvents(db,userId).filter(e=>e.kind==='answer'&&e.data.wordId==='late-word').length,2);
  db.close();
});

test('late competing parent preserves a valid descendant when the conservative transition is unchanged',()=>{
  const {db,userId,revision,deviceId}=fixture();
  const root=initialState('late-word'),parentAt=200000;
  const goodParentData=answer({id:'shape',deviceId,at:101004,baseRev:root.rev,
    mode:'new',game:'flash',grade:'hard',revision,familiarize:true}).data;
  const childBase=advance(root,goodParentData,parentAt,DEFAULTS);
  const child=answer({id:'descendant',deviceId:'child-device',at:300000,baseRev:childBase.rev,
    mode:'review',game:'quiz',grade:'hard',revision});
  synchronize(db,userId,{events:[child],deviceId:'child-device',cursor:0,clientNow:300000},300000);

  const parentA=answer({id:'parent-a',deviceId,at:101004,baseRev:root.rev,
    mode:'new',game:'flash',grade:'hard',revision,familiarize:true});
  synchronize(db,userId,{events:[parentA],deviceId,cursor:0,clientNow:101004},300000);
  assert.equal(replay(allEvents(db,userId)).words['late-word'].accepted.has(child.id),true);

  const parentB=answer({id:'parent-b',deviceId:'late-device-b',at:400000,baseRev:root.rev,
    mode:'new',game:'flash',grade:'hard',revision,familiarize:true});
  synchronize(db,userId,{events:[parentB],deviceId:'late-device-b',cursor:0,clientNow:400000},400000);
  const final=replay(allEvents(db,userId)).words['late-word'];
  assert.equal(final.accepted.has(parentA.id),true);
  assert.equal(final.accepted.has(parentB.id),true);
  assert.equal(final.accepted.has(child.id),true);
  assert.equal(final.review.phase,'learning');
  assert.equal(final.review.step,2);
  db.close();
});
