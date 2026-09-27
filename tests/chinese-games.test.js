import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePinyin,toneQuestion,gradeTones,classifierQuestion,gradeClassifier} from '../core/chinese-games.js';
test('G-09 tone game labels the neutral tone and grades each explicit syllable',()=>{
 const q=toneQuestion([{base:'xue',tone:2},{base:'sheng',tone:1},{base:'ma',tone:0}]);
 assert.equal(q.syllables[2].label,'nhẹ');assert.equal(gradeTones(q,[2,1,0]),true);assert.equal(gradeTones(q,[2,1,5]),false);
});
test('G-10 classifier game is unavailable without classifier data and returns completed sentence',()=>{
 assert.equal(classifierQuestion({word:'书'}),null);
 const q=classifierQuestion({word:'书',classifiers:['本'],classifierSentence:'一 ___ 书'});
 assert.equal(gradeClassifier(q,'本'),true);assert.equal(q.completed('本'),'一 本 书');
});

// Integration CI checkpoint.

test('Pinyin parser accepts tone marks and numeric tones',()=>{
  assert.deepEqual(parsePinyin('nǐ hǎo ma'),[{base:'ni',tone:3},{base:'hao',tone:3},{base:'ma',tone:0}]);
  assert.deepEqual(parsePinyin('zhong1 guo2 ren5'),[{base:'zhong',tone:1},{base:'guo',tone:2},{base:'ren',tone:0}]);
  assert.deepEqual(parsePinyin("Xi'an"),[{base:'xi',tone:0},{base:'an',tone:0}]);
});
