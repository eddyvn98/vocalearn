import test from 'node:test';
import assert from 'node:assert/strict';
import {handwritingState,recordStroke,completeCharacter,handwritingResult,strokeErrors} from '../core/handwriting.js';

test('AT-09 multi-character handwriting aggregates corrections into one Hard result with detailed stroke evidence',()=>{
 let s=handwritingState('学生');
 s=recordStroke(s,{correct:false,strokeIndex:2});s=recordStroke(s,{correct:true,strokeIndex:2});s=completeCharacter(s,true);
 s=recordStroke(s,{correct:false,strokeIndex:1});s=recordStroke(s,{correct:true,strokeIndex:1});s=completeCharacter(s,true);
 assert.deepEqual(handwritingResult(s,{memory:true,activeMs:1000}),{grade:'hard',hadError:true});
 assert.deepEqual(strokeErrors(s),[{charIndex:0,char:'学',strokeIndex:2},{charIndex:1,char:'生',strokeIndex:1}]);
});
test('AT-09 an unfinished character makes the whole word Forget',()=>{
 let s=handwritingState('学生');s=completeCharacter(s,true);s=completeCharacter(s,false);
 assert.deepEqual(handwritingResult(s),{grade:'forget',hadError:true});
});
test('clean memory writing may earn Easy while guided clean writing is Good',()=>{
 let s=handwritingState('学');s=completeCharacter(s,true);
 assert.equal(handwritingResult(s,{memory:true,activeMs:1000,easyMs:5000}).grade,'easy');
 assert.equal(handwritingResult(s,{memory:false,activeMs:1000,easyMs:5000}).grade,'good');
});
