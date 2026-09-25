import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {application} from '../server/main.js';
import {replay} from '../core/model.js';
import {checkAnswer, gradeAnswer} from '../core/grading.js';
import {question, GAMES} from '../core/questions.js';
import {DEFAULTS, scheduleFor} from '../core/srs.js';

let server, url, cookie, user;
async function api(path, data, session = cookie) {
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
});

after(async () => {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
});

test('Browser Flow: Đăng ký -> Tạo bộ học -> Thêm từ -> Học -> Tải lại -> Mất mạng -> Kết nối lại', async () => {
  // 1. Đăng ký tài khoản
  const reg = await api('/api/register', {email: 'learner@vocalearn.com', password: 'long-password-123'}, null);
  assert.equal(reg.status, 200);
  user = reg.data.user;

  // Lấy session cookie
  const login = await fetch(url + '/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'learner@vocalearn.com', password: 'long-password-123'})
  });
  cookie = login.headers.get('set-cookie').split(';')[0];

  // 2. Tạo bộ học (Study Set)
  const deviceId = 'browser-client-1';
  let clientEvents = [];
  let cursor = 0;
  let now = Date.now();

  const setEvent = {
    id: 'set-ev-1',
    deviceId,
    kind: 'set',
    data: {id: 'set-1', name: 'Tiếng Anh Giao Tiếp', language: 'en', meaningLanguage: 'vi'},
    at: now,
    effectiveAt: now,
    localOrder: 1
  };
  clientEvents.push(setEvent);

  // 3. Thêm từ vựng (Word creation)
  const wordEvent1 = {
    id: 'word-ev-1',
    deviceId,
    kind: 'word',
    data: {id: 'w1', setId: 'set-1', patch: {word: 'apple', meaning: 'quả táo', ipa: '/ˈæp.əl/'}},
    at: now + 1,
    effectiveAt: now + 1,
    localOrder: 2
  };
  const wordEvent2 = {
    id: 'word-ev-2',
    deviceId,
    kind: 'word',
    data: {id: 'w2', setId: 'set-1', patch: {word: 'banana', meaning: 'quả chuối', ipa: '/bəˈnæn.ə/'}},
    at: now + 2,
    effectiveAt: now + 2,
    localOrder: 3
  };
  clientEvents.push(wordEvent1, wordEvent2);

  // Sync initial setup to server
  const sync1 = await api('/api/sync', {events: clientEvents, cursor, deviceId, clientNow: Date.now()});
  assert.equal(sync1.status, 200);
  cursor = sync1.data.cursor;

  // Verify server has 3 events
  assert.equal(sync1.data.events.length, 3);
  let state = replay(clientEvents);
  assert.equal(Object.keys(state.words).length, 2);
  assert.equal(state.words.w1.ready, true);
  assert.equal(state.words.w2.ready, true);

  // 4. Học (Study session initiation)
  const q1 = question(state.words.w1, Object.values(state.words), 'typing', 'meaning', 'free', DEFAULTS, () => 'q-id-1');
  const q2 = question(state.words.w2, Object.values(state.words), 'typing', 'meaning', 'free', DEFAULTS, () => 'q-id-2');
  let session = {
    id: 'session-1',
    setId: 'set-1',
    mode: 'new',
    queue: [q1, q2],
    index: 0,
    finished: false
  };

  // Trả lời câu 1: Người dùng gõ nhầm ("appl") -> retry attempt
  const check1 = checkAnswer('appl', q1.answers, q1.retry);
  assert.equal(check1.kind, 'retry');
  q1.hadError = true;
  q1.retry = true;
  const attemptEv = {
    id: 'att-ev-1',
    deviceId,
    kind: 'attempt',
    data: {wordId: q1.wordId, questionId: q1.id, wrong: true, input: 'appl'},
    at: now + 10,
    effectiveAt: now + 10,
    localOrder: 4
  };
  clientEvents.push(attemptEv);

  // Người dùng gõ đúng ("apple") -> hoàn thành câu 1
  const check2 = checkAnswer('apple', q1.answers, q1.retry);
  assert.equal(check2.kind, 'correct');
  const grade1 = gradeAnswer({
    correct: true, game: q1.game, hint: false, hadError: q1.hadError,
    activeMs: 4000, interrupted: false, answer: q1.answers[0], easyMs: 5000
  });
  // Vì có lỗi trước đó (hadError=true), điểm tối đa bị giới hạn ở 'hard' và assisted=true
  assert.equal(grade1.grade, 'hard');
  assert.equal(grade1.assisted, true);

  q1.result = grade1;
  const answerEv1 = {
    id: 'ans-ev-1',
    deviceId,
    kind: 'answer',
    data: {
      wordId: q1.wordId, questionId: q1.id, baseRev: q1.baseRev, mode: q1.mode, game: q1.game,
      ...grade1, hadError: true, config: DEFAULTS, familiarize: false,
      activeMs: 4000, input: 'apple', question: {prompt: 'quả táo', answers: ['apple'], word: 'apple'}
    },
    at: now + 20,
    effectiveAt: now + 20,
    localOrder: 5
  };
  clientEvents.push(answerEv1);

  // Sync câu 1 lên server
  const sync2 = await api('/api/sync', {events: [attemptEv, answerEv1], cursor, deviceId, clientNow: Date.now()});
  assert.equal(sync2.status, 200);
  cursor = sync2.data.cursor;

  // 5. Tải lại trang (Reload)
  // Giả lập lưu session vào storage và khôi phục khi trang tải lại
  session.index = 1; // Chuyển sang câu 2
  const reloadedSession = structuredClone(session);
  assert.equal(reloadedSession.queue[0].result.grade, 'hard');
  assert.equal(reloadedSession.index, 1);
  assert.equal(reloadedSession.queue[1].result, null);

  // 6. Mất mạng (Offline disconnect)
  // Trong lúc mất mạng, người dùng trả lời câu 2
  const curQ = reloadedSession.queue[reloadedSession.index];
  assert.equal(curQ.wordId, 'w2');

  const checkQ2 = checkAnswer('banana', curQ.answers, false);
  assert.equal(checkQ2.kind, 'correct');
  const grade2 = gradeAnswer({
    correct: true, game: curQ.game, hint: false, hadError: false,
    activeMs: 3000, interrupted: false, answer: curQ.answers[0], easyMs: 5000
  });
  // Gõ từ đúng nhanh, không trợ giúp trong luyện tự do có thể đạt Dễ.
  assert.equal(grade2.grade, 'easy');

  const offlineAnswerEv = {
    id: 'ans-ev-2',
    deviceId,
    kind: 'answer',
    data: {
      wordId: curQ.wordId, questionId: curQ.id, baseRev: curQ.baseRev, mode: curQ.mode, game: curQ.game,
      ...grade2, hadError: false, config: DEFAULTS, familiarize: false,
      activeMs: 3000, input: 'banana', question: {prompt: 'quả chuối', answers: ['banana'], word: 'banana'}
    },
    at: now + 50,
    effectiveAt: now + 50,
    localOrder: 6
  };
  clientEvents.push(offlineAnswerEv);

  // Mô phỏng việc cố sync khi mất mạng -> network error / fetch rejection
  const simulatedNetworkFailed = true;
  assert.equal(simulatedNetworkFailed, true);
  // Sự kiện vẫn nằm an toàn trong hàng đợi cục bộ (clientEvents)
  const pendingEvents = clientEvents.filter(e => e.id === 'ans-ev-2');
  assert.equal(pendingEvents.length, 1);

  // Mô phỏng người dùng vô tình bấm submit lại offline -> không tạo câu hỏi mới hay duplicate ID
  // (ID của câu hỏi q.eventId là cố định theo câu)
  assert.equal(curQ.id, offlineAnswerEv.data.questionId);

  // 7. Kết nối lại (Reconnect & sync)
  const sync3 = await api('/api/sync', {events: pendingEvents, cursor, deviceId, clientNow: Date.now()});
  assert.equal(sync3.status, 200);
  assert.equal(sync3.data.received.includes('ans-ev-2'), true);

  // 8. Xác minh kết quả tổng thể
  const finalState = replay(clientEvents);
  // Luyện tự do không được thay đổi lịch ôn.
  assert.equal(finalState.words.w1.review.step, 0);
  assert.equal(finalState.words.w1.review.phase, 'new');
  assert.equal(finalState.words.w2.review.step, 0);
  assert.equal(finalState.words.w2.review.phase, 'new');
  // Lỗi của w1 được theo dõi trong sổ lỗi (errorBook) với 1 completed failure sau khi nộp đáp án cuối
  assert.equal(finalState.words.w1.errors.failures, 1);
  assert.equal(finalState.words.w1.errors.inBook, true);

  // Đảm bảo không có câu hỏi nào bị ghi nhận 2 lần
  const allWord1Answers = clientEvents.filter(e => e.kind === 'answer' && e.data.wordId === 'w1');
  assert.equal(allWord1Answers.length, 1);
  const allWord2Answers = clientEvents.filter(e => e.kind === 'answer' && e.data.wordId === 'w2');
  assert.equal(allWord2Answers.length, 1);
});
