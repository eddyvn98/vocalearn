import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {application} from '../server/main.js';
import {DEFAULTS} from '../core/srs.js';

let server, url, cookie;
async function request(path, data, session = cookie) {
  const res = await fetch(url + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {'Content-Type': 'application/json', ...(session ? {Cookie: session} : {})},
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  return {status: res.status, data: await res.json()};
}

before(async () => {
  server = application({dbPath: ':memory:'});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
  const r = await request('/api/register', {email: 'sync@example.com', password: 'secure-sync-password'}, null);
  cookie = r.data.user ? r.data.user && 'token' : null;
  // Retrieve session cookie properly
  const loginRes = await fetch(url + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'sync@example.com', password: 'secure-sync-password'})
  });
  cookie = loginRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

const event = (id, kind, data, deviceId = 'dev1', at = Date.now()) => ({id, kind, data, deviceId, at});
const batch = (events, deviceId = 'dev1', cursor = 0) => ({events, deviceId, cursor, clientNow: Date.now()});
const snapshot=(word,meaning,eventId)=>({prompt:meaning,answers:[word],word,meaning,fields:{word:eventId,meaning:eventId}});
const freeTyping=(id,questionId,wordId,word,meaning,eventId,grade='good',deviceId='dev1',at=Date.now())=>event(id,'answer',{
  schemaVersion:2,wordId,questionId,opportunityId:`question:${questionId}`,baseRev:`root-${wordId}`,mode:'free',game:'typing',face:'meaning',
  grade,hadError:grade==='forget',assisted:false,hint:false,unknown:grade==='forget',
  activeMs:grade==='easy'?1000:6000,input:grade==='forget'?'wrong':word,config:DEFAULTS,
  question:snapshot(word,meaning,eventId)
},deviceId,at);

test('Server rejects recognition game claiming good or easy grade', async () => {
  const set = event('s1', 'set', {id: 'set1', name: 'Vocab', language: 'en', meaningLanguage: 'vi'});
  const word = event('w1', 'word', {id: 'word1', setId: 'set1', patch: {word: 'cat', meaning: 'con meo'}});
  await request('/api/sync', batch([set, word]));

  const fakeAnswer = event('a1', 'answer', {
    wordId: 'word1', questionId: 'q1', baseRev: 'root-word1', mode: 'new',
    game: 'quiz', grade: 'easy', hadError: false, assisted: false, activeMs: 1000,
    config: DEFAULTS, question: {prompt: 'cat', answers: ['cat'], word: 'cat'}
  });
  const r = await request('/api/sync', batch([fakeAnswer]));
  assert.equal(r.status, 400);
});

test('Server rejects assisted answer claiming good or easy grade', async () => {
  const fakeAssisted = event('a2', 'answer', {
    wordId: 'word1', questionId: 'q2', baseRev: 'root-word1', mode: 'new',
    game: 'typing', grade: 'good', hadError: true, assisted: true, activeMs: 2000,
    config: DEFAULTS, question: {prompt: 'con meo', answers: ['cat'], word: 'cat'}
  });
  const r = await request('/api/sync', batch([fakeAssisted]));
  assert.equal(r.status, 400);
});

test('Server rejects question snapshot with mismatched word', async () => {
  const fakeSnapshot = event('a3', 'answer', {
    wordId: 'word1', questionId: 'q3', baseRev: 'root-word1', mode: 'new',
    game: 'typing', grade: 'hard', hadError: false, assisted: false, activeMs: 2000,
    config: DEFAULTS, question: {prompt: 'different', answers: ['different'], word: 'mismatch'}
  });
  const r = await request('/api/sync', batch([fakeSnapshot]));
  assert.equal(r.status, 400);
});

test('Server rejects duplicate final answers for same question ID', async () => {
  const ans1=freeTyping('a4-1','q-unique','word1','cat','con meo','w1');
  const ok = await request('/api/sync', batch([ans1]));
  assert.equal(ok.status, 200);

  const ans2=freeTyping('a4-2','q-unique','word1','cat','con meo','w1');
  const dup = await request('/api/sync', batch([ans2]));
  assert.equal(dup.status, 400);
});

test('Server rejects attempt added after question already answered', async () => {
  const lateAttempt = event('att-late', 'attempt', {
    wordId: 'word1', questionId: 'q-unique', wrong: true
  });
  const r = await request('/api/sync', batch([lateAttempt]));
  assert.equal(r.status, 400);
});

test('Two devices can submit independent answers without dropping either log', async () => {
  const newWord = event('w2', 'word', {id: 'word2', setId: 'set1', patch: {word: 'dog', meaning: 'con cho'}});
  await request('/api/sync', batch([newWord]));

  const dev1Answer=freeTyping('d1-ans','q-dev1','word2','dog','con cho','w2','good','dev1',1000);
  const dev2Answer=freeTyping('d2-ans','q-dev2','word2','dog','con cho','w2','forget','dev2',1005);

  const r1 = await request('/api/sync', batch([dev1Answer], 'dev1'));
  assert.equal(r1.status, 200);
  const r2 = await request('/api/sync', batch([dev2Answer], 'dev2'));
  assert.equal(r2.status, 200);

  const syncState = await request('/api/sync', batch([], 'dev1'));
  const word2Events = syncState.data.events.filter(e => e.data.wordId === 'word2');
  assert.equal(word2Events.filter(e => e.kind === 'answer').length, 2);
});


test('Server rejects forged deterministic opportunity identity', async () => {
  const forged=freeTyping('forged-op','q-forged','word1','cat','con meo','w1');
  forged.data.opportunityId='question:not-the-same-question';
  const r=await request('/api/sync',batch([forged]));
  assert.equal(r.status,400);
});

test('Same device cannot create a second final log for one scheduled opportunity', async () => {
  const makeFlash=(id,questionId,deviceId='dev1')=>event(id,'answer',{
    schemaVersion:2,wordId:'word1',questionId,opportunityId:'schedule:word1:root-word1',
    baseRev:'root-word1',mode:'new',game:'flash',face:'meaning',grade:'hard',
    hadError:false,assisted:false,hint:false,unknown:false,activeMs:0,input:'cat',
    config:DEFAULTS,familiarize:true,
    question:{prompt:'con meo',answers:['cat'],word:'cat',meaning:'con meo',fields:{word:'w1',meaning:'w1'}}
  },deviceId);
  const first=await request('/api/sync',batch([makeFlash('sched-a','q-sched-a')]));
  assert.equal(first.status,200);
  const second=await request('/api/sync',batch([makeFlash('sched-b','q-sched-b')]));
  assert.equal(second.status,400);
});

test('Different devices may report the same scheduled opportunity for conservative merge', async () => {
  const makeFlash=(id,questionId,deviceId)=>event(id,'answer',{
    schemaVersion:2,wordId:'word2',questionId,opportunityId:'schedule:word2:root-word2',
    baseRev:'root-word2',mode:'new',game:'flash',face:'meaning',grade:'hard',
    hadError:false,assisted:false,hint:false,unknown:false,activeMs:0,input:'dog',
    config:DEFAULTS,familiarize:true,
    question:{prompt:'con cho',answers:['dog'],word:'dog',meaning:'con cho',fields:{word:'w2',meaning:'w2'}}
  },deviceId);
  const a=await request('/api/sync',batch([makeFlash('merge-a','q-merge-a','dev1')],'dev1'));
  assert.equal(a.status,200);
  const b=await request('/api/sync',batch([makeFlash('merge-b','q-merge-b','dev2')],'dev2'));
  assert.equal(b.status,200);
  const all=await request('/api/sync',batch([], 'dev1'));
  assert.equal(all.data.events.filter(e=>e.data.opportunityId==='schedule:word2:root-word2').length,2);
});


test('Server accepts an explicit quiz answer face frozen in the question snapshot', async () => {
  const answer=event('face-answer','answer',{
    schemaVersion:2,wordId:'word1',questionId:'q-face',opportunityId:'question:q-face',
    baseRev:'root-word1',mode:'free',game:'quiz',face:'word',answerFace:'meaning',
    grade:'hard',hadError:false,assisted:false,hint:false,unknown:false,activeMs:1200,
    input:'con meo',config:DEFAULTS,familiarize:false,
    question:{prompt:'cat',answers:['con meo'],word:'cat',meaning:'con meo',fields:{word:'w1',meaning:'w1'}}
  });
  const r=await request('/api/sync',batch([answer]));
  assert.equal(r.status,200);
});

test('Server rejects a quiz whose explicit answer face equals its prompt face', async () => {
  const answer=event('bad-face-answer','answer',{
    schemaVersion:2,wordId:'word1',questionId:'q-bad-face',opportunityId:'question:q-bad-face',
    baseRev:'root-word1',mode:'free',game:'quiz',face:'word',answerFace:'word',
    grade:'hard',hadError:false,assisted:false,hint:false,unknown:false,activeMs:1200,
    input:'cat',config:DEFAULTS,familiarize:false,
    question:{prompt:'cat',answers:['cat'],word:'cat',meaning:'con meo',fields:{word:'w1',meaning:'w1'}}
  });
  const r=await request('/api/sync',batch([answer]));
  assert.equal(r.status,400);
});
