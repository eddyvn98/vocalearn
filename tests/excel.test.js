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
      sentence: 'She is ___ under pressure.',
      answers: ['resilient'],
      note: 'Tập trung học',
      level: 'B2',
      variants: ['resilience'],
      tags: ['work', 'hard'],
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

  const buffer = cardsToXlsx(originalCards);
  assert.ok(buffer instanceof Uint8Array);
  assert.ok(buffer.length > 500);

  const result = await xlsxToCards(buffer);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].word, 'resilient');
  assert.equal(result.cards[0].meaning, 'kiên cường');
  assert.equal(result.cards[0].ipa, '/rɪˈzɪl.jənt/');
  assert.equal(result.cards[0].pos, 'adj');
  assert.equal(result.cards[0].sentence, 'She is ___ under pressure.');
  assert.deepEqual(result.cards[0].answers, ['resilient']);
  assert.equal(result.cards[0].note, 'Tập trung học');
  assert.equal(result.cards[0].level, 'B2');
  assert.deepEqual(result.cards[0].variants, ['resilience']);
  assert.deepEqual(result.cards[0].tags, ['work', 'hard']);
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
  const buffer = cardsToXlsx(newCards);
  const result = await xlsxToCards(buffer, existing);

  assert.equal(result.cards.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.cards[0].meaning, 'bờ sông');
  assert.equal(result.cards[1].word, 'river');
});


test('Excel custom fields round-trip with text number and select types', async () => {
  const fields=[
    {id:'source',name:'Nguồn',type:'text',options:[]},
    {id:'priority',name:'Ưu tiên',type:'number',options:[]},
    {id:'register',name:'Ngữ vực',type:'select',options:['formal','casual']}
  ];
  const buffer=cardsToXlsx([{
    word:'deploy',meaning:'triển khai',custom:{source:'meeting',priority:2,register:'formal'}
  }],{},fields);
  const result=await xlsxToCards(buffer,[],undefined,fields);
  assert.equal(result.cards.length,1);
  assert.deepEqual(result.cards[0].custom,{source:'meeting',priority:2,register:'formal'});
});
