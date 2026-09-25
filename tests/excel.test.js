import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardsToXlsx, xlsxToCards} from '../core/excel.js';

test('Excel export and import round-trip with embedded image', async () => {
  const dummyImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const originalCards = [
    {
      word: 'resilient',
      meaning: 'kiên cường',
      ipa: '/rɪˈzɪl.jənt/',
      pos: 'adj',
      level: 'B2',
      variants: ['resilience','resiliently'],
      tags: ['work','character'],
      custom: {Source:'Internal notes',Priority:'high'},
      sentence: 'She is ___ under pressure.',
      answers: ['resilient'],
      note: 'Tập trung học',
      category: 'Tính cách',
      image: dummyImg,
      audio: ''
    },
    {
      word: 'bank',
      meaning: 'ngân hàng',
      ipa: '/bæŋk/',
      pos: 'noun',
      sentence: 'I go to the ___ to deposit money.',
      answers: ['bank'],
      note: '',
      category: 'Kinh tế',
      image: '',
      audio: ''
    }
  ];

  const buffer = await cardsToXlsx(originalCards);
  assert.ok(buffer instanceof Uint8Array || Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 500);

  const result = await xlsxToCards(buffer);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].word, 'resilient');
  assert.equal(result.cards[0].meaning, 'kiên cường');
  assert.equal(result.cards[0].ipa, '/rɪˈzɪl.jənt/');
  assert.equal(result.cards[0].pos, 'adj');
  assert.equal(result.cards[0].level, 'B2');
  assert.deepEqual(result.cards[0].variants, ['resilience','resiliently']);
  assert.deepEqual(result.cards[0].tags, ['work','character']);
  assert.deepEqual(result.cards[0].custom, {Source:'Internal notes',Priority:'high'});
  assert.equal(result.cards[0].sentence, 'She is ___ under pressure.');
  assert.deepEqual(result.cards[0].answers, ['resilient']);
  assert.equal(result.cards[0].note, 'Tập trung học');
  assert.ok(result.cards[0].image.startsWith('data:image/png;base64,'));

  assert.equal(result.cards[1].word, 'bank');
  assert.equal(result.cards[1].meaning, 'ngân hàng');
});

test('Excel sense-aware duplicate handling: same word different meaning accepted, exact duplicate skipped', async () => {
  const existing = [
    {word: 'bank', meaning: 'ngân hàng'}
  ];
  const newCards = [
    {word: 'bank', meaning: 'bờ sông'}, // different sense -> keep
    {word: 'bank', meaning: 'ngân hàng'}, // identical sense -> skip
    {word: 'river', meaning: 'dòng sông'}
  ];
  const buffer = await cardsToXlsx(newCards);
  const result = await xlsxToCards(buffer, existing);

  assert.equal(result.cards.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.cards[0].meaning, 'bờ sông');
  assert.equal(result.cards[1].word, 'river');
});
