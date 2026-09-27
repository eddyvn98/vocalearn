import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHanziData,parseKanjiSvg,strokesFor,STROKE_SOURCES} from '../server/strokes.js';

test('Phase 3 stroke parsers preserve geometry and provenance',async()=>{
  const hanzi=parseHanziData({medians:[[[0,1024],[1024,0]]]},'十');
  assert.deepEqual(hanzi.strokes[0],[[0,0],[100,100]]);
  const kanji=parseKanjiSvg('<path id="kvg:03042-s1" d="M10,20 L30,40"/>','あ');
  assert.equal(kanji.strokes[0],'M10,20 L30,40');
  assert.match(STROKE_SOURCES.zh.version,/^[a-f0-9]{40}$/);
  assert.match(STROKE_SOURCES.ja.license,/CC BY-SA/);
  const fetchImpl=async url=>({
    ok:true,
    json:async()=>({medians:[[[100,900],[800,300]]]}),
    text:async()=>'<path id="kvg:05b66-s1" d="M1,2 L3,4"/>'
  });
  const loaded=await strokesFor('zh','十',fetchImpl);
  assert.equal(loaded.complete,true);assert.equal(loaded.characters[0].char,'十');
  assert.match(loaded.source,/Hanzi Writer Data/);
});
