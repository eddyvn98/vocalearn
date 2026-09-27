import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {application} from '../server/main.js';
import {DEFAULTS, initialState, advance} from '../core/srs.js';
import {openDatabase,synchronize,allEvents} from '../server/database.js';
import {replay} from '../core/model.js';

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
const questionSnapshot = (word, meaning, revision) => ({
  prompt: meaning, answers: [word], word, meaning, fields: {word: revision, meaning: revision}
});
const typingAnswer = ({wordId, questionId, word, meaning, revision, baseRev = '', mode = 'free',
  grade = 'good', hadError = false, input = word, activeMs = 6000}) => ({
  schemaVersion: 2, wordId, questionId, baseRev, mode, game: 'typing', grade, hadError,
  assisted: false, activeMs, config: DEFAULTS, face: 'meaning', input,
  unknown: grade === 'forget', question: questionSnapshot(word, meaning, revision)
});

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
  const ans1 = event('a4-1', 'answer', typingAnswer({
    wordId: 'word1', questionId: 'q-unique', word: 'cat', meaning: 'con meo', revision: 'w1'
  }));
  const ok = await request('/api/sync', batch([ans1]));
  assert.equal(ok.status, 200);

  const ans2 = event('a4-2', 'answer', typingAnswer({
    wordId: 'word1', questionId: 'q-unique', word: 'cat', meaning: 'con meo', revision: 'w1'
  }));
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

test('Two devices preserve competing deferred reviews for conservative replay', async () => {
  const newWord = event('w2', 'word', {id: 'word2', setId: 'set1', patch: {word: 'dog', meaning: 'con cho'}});
  await request('/api/sync', batch([newWord]));

  const dev1Answer = event('d1-ans', 'answer', typingAnswer({
    wordId: 'word2', questionId: 'q-dev1', word: 'dog', meaning: 'con cho', revision: 'w2',
    baseRev: 'future-word2-rev', mode: 'review', grade: 'good', input: 'dog', activeMs: 6000
  }), 'dev1', 1000);

  const dev2Answer = event('d2-ans', 'answer', typingAnswer({
    wordId: 'word2', questionId: 'q-dev2', word: 'dog', meaning: 'con cho', revision: 'w2',
    baseRev: 'future-word2-rev', mode: 'review', grade: 'forget', hadError: true, input: 'wrong', activeMs: 2000
  }), 'dev2', 1005);

  const r1 = await request('/api/sync', batch([dev1Answer], 'dev1'));
  assert.equal(r1.status, 200);

  const r2 = await request('/api/sync', batch([dev2Answer], 'dev2'));
  assert.equal(r2.status, 200);

  const syncState = await request('/api/sync', batch([], 'dev1'));
  const word2Events = syncState.data.events.filter(e => e.data.wordId === 'word2');
  assert.equal(word2Events.filter(e => e.kind === 'answer').length, 2);
});


test('Server rejects attempts and answers for a tombstoned word', async () => {
  const doomed = event('w-deleted', 'word', {
    id: 'word-deleted', setId: 'set1', patch: {word: 'gone', meaning: 'da xoa'}
  });
  const removed = event('w-deleted-rm', 'deleteWord', {id: 'word-deleted'});
  assert.equal((await request('/api/sync', batch([doomed, removed]))).status, 200);

  const attempt = event('deleted-attempt', 'attempt', {
    wordId: 'word-deleted', questionId: 'q-deleted', wrong: true
  });
  assert.equal((await request('/api/sync', batch([attempt]))).status, 400);

  const answer = event('deleted-answer', 'answer', typingAnswer({
    wordId: 'word-deleted', questionId: 'q-deleted-answer',
    word: 'gone', meaning: 'da xoa', revision: 'w-deleted'
  }));
  assert.equal((await request('/api/sync', batch([answer]))).status, 400);
});


test('Clock anchors refresh and clamped event time is explicitly flagged', () => {
  const db = openDatabase(':memory:');
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)')
    .run('clock-user', 'clock@test.invalid', 'hash', 'salt');

  const first = {
    id: 'clock-set', kind: 'set', deviceId: 'clock-device', at: 1000,
    data: {id: 'clock-set-id', name: 'Clock', language: 'en', meaningLanguage: 'vi'}
  };
  const one = synchronize(db, 'clock-user',
    {events: [first], deviceId: 'clock-device', cursor: 0, clientNow: 1000}, 100000);
  assert.equal(one.events[0].effectiveAt, 100000);
  assert.equal(one.events[0].clockAdjusted, false);

  const second = {
    id: 'clock-settings', kind: 'settings', deviceId: 'clock-device', at: 500,
    data: {newLimit: 10}
  };
  const two = synchronize(db, 'clock-user',
    {events: [second], deviceId: 'clock-device', cursor: one.cursor, clientNow: 2000}, 101000);
  const acceptedSecond = two.events.find(e => e.id === second.id);
  assert.equal(acceptedSecond.effectiveAt, 100000);
  assert.equal(acceptedSecond.clockAdjusted, true);

  const third = {
    id: 'clock-settings-2', kind: 'settings', deviceId: 'clock-device', at: 2050,
    data: {newLimit: 11}
  };
  const three = synchronize(db, 'clock-user',
    {events: [third], deviceId: 'clock-device', cursor: two.cursor, clientNow: 2100}, 101100);
  const acceptedThird = three.events.find(e => e.id === third.id);
  assert.equal(acceptedThird.effectiveAt, 101050);
  assert.equal(acceptedThird.clockAdjusted, false);
  db.close();
});


test('Two devices competing on the same due review produce one conservative transition', () => {
  const db = openDatabase(':memory:');
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)')
    .run('multi-user', 'multi@test.invalid', 'hash', 'salt');
  const userId = 'multi-user';
  const wordRevision = 'multi-word-event';
  const setEvent = event('multi-set-event', 'set', {
    id: 'multi-set', name: 'Multi', language: 'en', meaningLanguage: 'vi'
  }, 'dev-a', 1000);
  const wordEvent = event(wordRevision, 'word', {
    id: 'multi-word', setId: 'multi-set', patch: {word: 'apple', meaning: 'qua tao'}
  }, 'dev-a', 1001);
  synchronize(db, userId, {
    events: [setEvent, wordEvent], deviceId: 'dev-a', cursor: 0, clientNow: 1001
  }, 100000);

  const snapshot = {
    prompt: 'qua tao', answers: ['apple'], word: 'apple', meaning: 'qua tao',
    fields: {word: wordRevision, meaning: wordRevision}
  };
  const answer = (id, deviceId, baseRev, game, grade, now, extra = {}) => event(id, 'answer', {
    schemaVersion: 2, wordId: 'multi-word', questionId: 'q-' + id, baseRev,
    mode: baseRev.startsWith('root-') ? 'new' : extra.mode || 'review',
    game, grade, hadError: grade === 'forget', assisted: false, activeMs: 6000,
    config: DEFAULTS, face: 'meaning', input: grade === 'forget' ? 'wrong' : 'apple',
    unknown: grade === 'forget', familiarize: !!extra.familiarize, question: snapshot
  }, deviceId, now);

  let state = replay(allEvents(db, userId)).words['multi-word'].review;
  synchronize(db, userId, {
    events: [answer('learn-1', 'dev-a', state.rev, 'flash', 'hard', 1100, {familiarize: true})],
    deviceId: 'dev-a', cursor: 0, clientNow: 1100
  }, 100100);

  state = replay(allEvents(db, userId)).words['multi-word'].review;
  synchronize(db, userId, {
    events: [answer('learn-2', 'dev-a', state.rev, 'flash', 'hard', 61100, {familiarize: true, mode: 'review'})],
    deviceId: 'dev-a', cursor: 0, clientNow: 61100
  }, 160100);

  state = replay(allEvents(db, userId)).words['multi-word'].review;
  synchronize(db, userId, {
    events: [answer('learn-3', 'dev-a', state.rev, 'typing', 'good', 661100, {mode: 'review'})],
    deviceId: 'dev-a', cursor: 0, clientNow: 661100
  }, 760100);

  state = replay(allEvents(db, userId)).words['multi-word'].review;
  synchronize(db, userId, {
    events: [answer('learn-4', 'dev-a', state.rev, 'typing', 'good', 1261100, {mode: 'review'})],
    deviceId: 'dev-a', cursor: 0, clientNow: 1261100
  }, 1360100);
  const dueState = replay(allEvents(db, userId)).words['multi-word'].review;
  assert.equal(dueState.phase, 'review');
  const dueNow = 864000000;
  const good = answer('review-good', 'dev-a', dueState.rev, 'typing', 'good', dueNow, {mode: 'review'});
  const forget = answer('review-forget', 'dev-b', dueState.rev, 'typing', 'forget', dueNow, {mode: 'review'});

  synchronize(db, userId, {
    events: [good], deviceId: 'dev-a', cursor: 0, clientNow: dueNow
  }, dueNow);
  synchronize(db, userId, {
    events: [forget], deviceId: 'dev-b', cursor: 0, clientNow: dueNow
  }, dueNow);

  const final = replay(allEvents(db, userId)).words['multi-word'];
  assert.equal(final.review.phase, 'relearn');
  assert.equal(final.accepted.has('review-good'), true);
  assert.equal(final.accepted.has('review-forget'), true);
  db.close();
});


test('Late parent replay activates an already-received due descendant without double transition', () => {
  const db = openDatabase(':memory:');
  db.prepare('INSERT INTO users(id,email,hash,salt) VALUES(?,?,?,?)')
    .run('late-user', 'late@test.invalid', 'hash', 'salt');
  const userId = 'late-user';
  const deviceParent = 'late-parent-device';
  const deviceChild = 'late-child-device';
  const setId = 'late-set';
  const wordId = 'late-word';
  const wordRevision = 'late-word-event';

  const setEvent = event('late-set-event', 'set', {
    id: setId, name: 'Late parent', language: 'en', meaningLanguage: 'vi'
  }, deviceParent, 1000);
  const words = [
    event(wordRevision, 'word', {id: wordId, setId, patch: {word: 'apple', meaning: 'qua tao'}}, deviceParent, 1001),
    event('late-d2', 'word', {id: 'late-d2-word', setId, patch: {word: 'pear', meaning: 'qua le'}}, deviceParent, 1002),
    event('late-d3', 'word', {id: 'late-d3-word', setId, patch: {word: 'plum', meaning: 'qua man'}}, deviceParent, 1003),
    event('late-d4', 'word', {id: 'late-d4-word', setId, patch: {word: 'peach', meaning: 'qua dao'}}, deviceParent, 1004)
  ];
  synchronize(db, userId, {
    events: [setEvent, ...words], deviceId: deviceParent, cursor: 0, clientNow: 1004
  }, 100000);

  const snapshot = {
    prompt: 'qua tao', answers: ['apple'], word: 'apple', meaning: 'qua tao',
    fields: {word: wordRevision, meaning: wordRevision}
  };
  const parentAt = 200000;
  const parentData = {
    schemaVersion: 2, wordId, questionId: 'late-parent-q', baseRev: 'root-' + wordId,
    mode: 'new', game: 'flash', grade: 'hard', hadError: false, assisted: false,
    activeMs: 1000, config: DEFAULTS, face: 'meaning', input: 'apple',
    unknown: false, familiarize: true, question: snapshot
  };
  const predicted = advance(initialState(wordId), parentData, parentAt, DEFAULTS);
  assert.equal(predicted.phase, 'learning');
  assert.equal(predicted.step, 1);

  const child = event('late-child-answer', 'answer', {
    schemaVersion: 2, wordId, questionId: 'late-child-q', baseRev: predicted.rev,
    mode: 'review', game: 'quiz', grade: 'hard', hadError: false, assisted: false,
    activeMs: 1000, config: DEFAULTS, face: 'meaning', input: 'apple',
    unknown: false, familiarize: false, question: snapshot
  }, deviceChild, 300000);
  synchronize(db, userId, {
    events: [child], deviceId: deviceChild, cursor: 0, clientNow: 300000
  }, 300000);

  let beforeParent = replay(allEvents(db, userId)).words[wordId];
  assert.equal(beforeParent.review.rev, 'root-' + wordId);
  assert.equal(beforeParent.accepted.has(child.id), false);

  const parent = event('late-parent-answer', 'answer', parentData, deviceParent, 101004);
  synchronize(db, userId, {
    events: [parent], deviceId: deviceParent, cursor: 0, clientNow: 101004
  }, 300000);

  const afterParent = replay(allEvents(db, userId)).words[wordId];
  assert.equal(afterParent.accepted.has(parent.id), true);
  assert.equal(afterParent.accepted.has(child.id), true);
  assert.equal(afterParent.review.phase, 'learning');
  assert.equal(afterParent.review.step, 2);
  const answerEvents = allEvents(db, userId).filter(e => e.kind === 'answer' && e.data.wordId === wordId);
  assert.equal(answerEvents.length, 2);
  db.close();
});
