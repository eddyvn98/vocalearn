import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePinyin} from '../core/chinese-games.js';
import {twoStepFor,readingMatches} from '../core/script-typing.js';

test('Phase 2 parses marked and numbered pinyin for tone questions',()=>{
  assert.deepEqual(parsePinyin('shū'),[{base:'shu',tone:1}]);
  assert.deepEqual(parsePinyin('xue2 sheng1'),[{base:'xue',tone:2},{base:'sheng',tone:1}]);
});

test('Phase 2 Chinese typing requires tone and selects whole-word homophones',()=>{
  const word={id:'a',setId:'s',word:'书',pinyin:'shū'};
  const pool=[word,{id:'b',setId:'s',word:'输',pinyin:'shū'}];
  assert.equal(readingMatches('zh','shu1','shū','书'),true);
  assert.equal(readingMatches('zh','shu','shū','书'),false);
  const flow=twoStepFor(word,pool,'typing','meaning','zh');
  assert.equal(flow.mode,'choose');
  assert.deepEqual(new Set(flow.choices),new Set(['书','输']));
});

test('Phase 2 Chinese typing degrades to confirmation without fake distractors',()=>{
  const word={id:'a',setId:'s',word:'书',pinyin:'shū'};
  const flow=twoStepFor(word,[word],'typing','meaning','zh');
  assert.equal(flow.mode,'confirm');
  assert.equal(flow.gradeCap,'hard');
});
