import test from 'node:test';
import assert from 'node:assert/strict';
import {releasedProfiles} from '../core/language-profiles.js';
import {gradeAnswer} from '../core/grading.js';
import {readingMatches,twoStepFor,twoStepSnapshot} from '../core/script-typing.js';

test('phase 2 only advertises released English and Chinese study profiles',()=>{
  assert.deepEqual(releasedProfiles().map(x=>x.id),['en','zh']);
});

test('AT-25 Chinese typing requires whole-word reading then whole-word form choice',()=>{
  const book={id:'book',setId:'zh-set',word:'书',meaning:'sach',pinyin:'shū',ipa:'shū',deleted:false};
  const lose={id:'lose',setId:'zh-set',word:'输',meaning:'thua',pinyin:'shū',ipa:'shū',deleted:false};
  const flow=twoStepFor(book,[book,lose],'typing','meaning','zh');
  assert.equal(flow.readingRequired,true);
  assert.equal(flow.mode,'choose');
  assert.equal(readingMatches('zh','shu1',flow.reading,book.word),true);
  assert.deepEqual(new Set(flow.choices),new Set(['书','输']));
  assert.deepEqual(twoStepSnapshot(flow),{
    profileId:'zh',reading:'shū',readingRequired:true,mode:'choose',choices:flow.choices,gradeCap:null
  });
});

test('Chinese typing degrades to confirmation without a valid homophone distractor',()=>{
  const book={id:'book',setId:'zh-set',word:'书',meaning:'sach',pinyin:'shū',ipa:'shū',deleted:false};
  const flow=twoStepFor(book,[book],'typing','meaning','zh');
  assert.equal(flow.mode,'confirm');
  assert.equal(flow.gradeCap,'hard');
  assert.deepEqual(flow.choices,['书']);
});

test('showing Pinyin as the question face skips reading entry and caps the result at Hard',()=>{
  const book={id:'book',setId:'zh-set',word:'书',meaning:'sach',pinyin:'shū',ipa:'shū',deleted:false};
  const lose={id:'lose',setId:'zh-set',word:'输',meaning:'thua',pinyin:'shū',ipa:'shū',deleted:false};
  const flow=twoStepFor(book,[book,lose],'typing','pinyin','zh');
  assert.equal(flow.readingRequired,false);
  assert.equal(flow.gradeCap,'hard');
  assert.equal(gradeAnswer({correct:true,game:'typing',gradeCap:flow.gradeCap,activeMs:1000,answer:book.word}).grade,'hard');
});
