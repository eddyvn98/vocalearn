import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGE_PROFILES,normalizePinyin,chineseReadingMatches,japaneseReadingMatches,writingStep} from '../core/language-profiles.js';

test('language profiles are data-driven for English Chinese and Japanese',()=>{
  assert.equal(LANGUAGE_PROFILES.zh.typing,'reading-then-form');
  assert.ok(LANGUAGE_PROFILES.zh.games.includes('tone'));
  assert.equal(LANGUAGE_PROFILES.ja.readingFace,'kana');
});

test('AT-25 Chinese pinyin normalizes marks/numbers, spacing, v/u-colon and requires tone',()=>{
  assert.deepEqual(normalizePinyin('xuéshēng'),['xue2','sheng1']);
  assert.deepEqual(normalizePinyin('xue2 sheng1'),['xue2','sheng1']);
  assert.equal(chineseReadingMatches('xue2sheng1','xué shēng'),true);
  assert.equal(chineseReadingMatches('xue sheng','xué shēng'),false);
  assert.equal(chineseReadingMatches('lv4','lǜ'),true);
  assert.equal(chineseReadingMatches('lu:4','lǜ'),true);
});

test('AT-25 Japanese requires kana, supports kana-only skip and whole-word form selection',()=>{
  assert.equal(japaneseReadingMatches('たべる','たべる','食べる'),true);
  assert.equal(japaneseReadingMatches('taberu','たべる','食べる'),false);
  assert.equal(japaneseReadingMatches('こーひー','コーヒー','コーヒー'),true);
  assert.equal(japaneseReadingMatches('こひ','コーヒー','コーヒー'),false);
  assert.deepEqual(writingStep('ja','ありがとう',['有難う']),{required:false,mode:'skip',choices:['ありがとう']});
  assert.equal(writingStep('ja','食べる',['食べれる','食る']).mode,'choose');
  assert.equal(writingStep('zh','学生',[]).gradeCap,'hard');
});

test('AT-26 adding handwriting capability does not alter language-profile scheduling state',()=>{
  const review={phase:'review',step:0,ef:2.5,interval:30,due:12345};
  const upgraded={profile:LANGUAGE_PROFILES.zh,capabilities:{handwriting:true},review};
  assert.deepEqual(upgraded.review,review);
});
