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
  const ans1 = event('a4-1', 'answer', {
    wordId: 'word1', questionId: 'q-unique', baseRev: 'root-word1', mode: 'new',
    game: 'typing', grade: 'good', hadError: false, assisted: false, activeMs: 6000,
    config: DEFAULTS
  });
  const ok = await request('/api/sync', batch([ans1]));
  assert.equal(ok.status, 200);

  const ans2 = event('a4-2', 'answer', {
    wordId: 'word1', questionId: 'q-unique', baseRev: 'root-word1', mode: 'new',
    game: 'typing', grade: 'hard', hadError: false, assisted: false, activeMs: 2000,
    config: DEFAULTS
  });
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

test('Two devices study concurrently on same opportunity: conservative merge', async () => {
  const newWord = event('w2', 'word', {id: 'word2', setId: 'set1', patch: {word: 'dog', meaning: 'con cho'}});
  await request('/api/sync', batch([newWord]));

  // Device 1 answers hard on root-word2
  const dev1Answer = event('d1-ans', 'answer', {
    wordId: 'word2', questionId: 'q-dev1', baseRev: 'root-word2', mode: 'new',
    game: 'typing', grade: 'hard', hadError: false, assisted: false, activeMs: 2000,
    config: DEFAULTS
  }, 'dev1', 1000);

  // Device 2 answers forget on root-word2
  const dev2Answer = event('d2-ans', 'answer', {
    wordId: 'word2', questionId: 'q-dev2', baseRev: 'root-word2', mode: 'new',
    game: 'typing', grade: 'forget', hadError: true, assisted: false, activeMs: 2000,
    config: DEFAULTS
  }, 'dev2', 1005);

  const r1 = await request('/api/sync', batch([dev1Answer], 'dev1'));
  assert.equal(r1.status, 200);

  const r2 = await request('/api/sync', batch([dev2Answer], 'dev2'));
  assert.equal(r2.status, 200);

  // Both events accepted into server log
  const syncState = await request('/api/sync', batch([], 'dev1'));
  const word2Events = syncState.data.events.filter(e => e.data.wordId === 'word2');
  assert.equal(word2Events.filter(e => e.kind === 'answer').length, 2);
});
