import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupWord,LOOKUP_SOURCES} from '../server/lookups.js';

test('English IPA lookup is deterministic, versioned and exposes ambiguity',()=>{
  const deploy=lookupWord('en','deploy');
  assert.equal(deploy.status,'found');
  assert.equal(deploy.fields.ipa,'dɪˈpɫɔɪ');
  assert.equal(deploy.meta.ipa.license,'MIT');
  assert.match(deploy.meta.ipa.version,/^[0-9a-f]{40}$/);
  const record=lookupWord('en','record');
  assert.equal(record.meta.ipa.needsCheck,true);
  assert.ok(record.candidates.ipa.length>1);
});

test('Chinese lookup returns pinyin and Han-Viet with simplified/traditional fallback',()=>{
  const result=lookupWord('zh','中国');
  assert.equal(result.fields.pinyin,'zhōng guó');
  assert.equal(result.fields.hanViet,'trung quốc');
  assert.equal(result.meta.pinyin.confirmed,false);
  assert.match(result.meta.hanViet.version,/Unicode-17\.0\.0/);
  assert.equal(LOOKUP_SOURCES.unihan.license,'Unicode-3.0 (data), MIT (adapter snapshot)');
});

test('unsupported lookup data remains missing rather than fabricated',()=>{
  const en=lookupWord('en','vocalearn-not-a-real-dictionary-word');
  assert.equal(en.status,'missing');
  assert.deepEqual(en.fields,{});
  const zh=lookupWord('zh','🙂');
  assert.equal(zh.status,'missing');
  assert.deepEqual(zh.fields,{});
});
