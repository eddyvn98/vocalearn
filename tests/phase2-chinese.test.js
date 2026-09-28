import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePinyin} from '../core/chinese-games.js';
import {twoStepFor,readingMatches} from '../core/script-typing.js';
import {LANGUAGE_PROFILES} from '../core/language-profiles.js';
import {reasons} from '../core/questions.js';
import {advance,initialState} from '../core/srs.js';

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

test('AT-26 Phase-2 Chinese progress survives Phase-3 handwriting release without reset',()=>{
  const cfg={zone:'Asia/Ho_Chi_Minh'};
  const hard={grade:'hard',assisted:false};
  let review=initialState('legacy-zh');
  review=advance(review,hard,1_000,cfg);
  review=advance(review,hard,61_000,cfg);
  review=advance(review,hard,661_000,cfg);
  review=advance(review,{grade:'good',assisted:false},1_261_000,cfg);
  assert.equal(review.phase,'review');
  assert.equal(review.interval,1);

  const legacy={id:'legacy-zh',setId:'s',word:'学生',meaning:'học sinh',pinyin:'xuéshēng',
    ipa:'xuéshēng',ready:true,deleted:false,review:structuredClone(review)};
  assert.deepEqual(reasons(legacy,'typing','meaning',[legacy],undefined,LANGUAGE_PROFILES.zh),[]);
  assert.deepEqual(reasons(legacy,'handwriting','meaning',[legacy],undefined,LANGUAGE_PROFILES.zh),['missingStrokeData']);

  const afterPhase3={...legacy,strokeData:{complete:true,language:'zh',
    characters:[{char:'学',strokes:[1]},{char:'生',strokes:[1]}]}};
  assert.deepEqual(afterPhase3.review,review);
  assert.deepEqual(reasons(afterPhase3,'typing','meaning',[afterPhase3],undefined,LANGUAGE_PROFILES.zh),[]);
  assert.deepEqual(reasons(afterPhase3,'handwriting','meaning',[afterPhase3],undefined,LANGUAGE_PROFILES.zh),[]);
});
