import test from 'node:test';
import assert from 'node:assert/strict';
import {contentVersion,normalizeGeneratedSentence,pickSentence,sentencePrompt,sentenceSource} from '../core/sentences.js';
import {question} from '../core/questions.js';
import {replay} from '../core/model.js';
import {DEFAULTS} from '../core/srs.js';
const word={id:'w1',setId:'s1',word:'went',meaning:'đã đi',fields:{word:'ev-word',meaning:'ev-meaning'},generation:'w1',
  ready:true,deleted:false,review:{phase:'review',step:3,rev:'r1',dueAt:0,dueDate:'2026-09-27'}};
test('AI sentence validation preserves an explicit gap and content version',()=>{
  const sentence=normalizeGeneratedSentence({text:'Yesterday, I went to school.',targetForm:'went',acceptedAnswers:['went']},word,'en');
  assert.equal(sentencePrompt(sentence),'Yesterday, I ___ to school.');
  assert.equal(sentence.wordContentVersion,contentVersion(word));
});
test('sentence selection prefers unused then least-recently used content',()=>{
  const version=contentVersion(word),base={wordId:'w1',text:'I went.',gapStart:2,gapEnd:6,targetForm:'went',acceptedAnswers:['went'],status:'ready',wordContentVersion:version};
  const selected=pickSentence([{...base,id:'b',usageCount:3,lastUsedAt:100},{...base,id:'a',usageCount:0,lastUsedAt:0},{...base,id:'c',usageCount:1,lastUsedAt:50}],version);
  assert.equal(selected.id,'a');
});
test('cloze uses the AI sentence pool before the fixed fallback sentence',()=>{
  const generated={id:'s-ai',wordId:'w1',text:'Yesterday, I went to school.',gapStart:13,gapEnd:17,targetForm:'went',acceptedAnswers:['went'],
    acceptedReadings:[],status:'ready',wordContentVersion:contentVersion(word),source:'ai',usageCount:0,lastUsedAt:0};
  const card={...word,sentence:'I ___ home.',answers:['went'],sentencePool:[generated]};
  assert.equal(sentenceSource(card).id,'s-ai');
  const q=question(card,[card],'cloze','sentence','free',DEFAULTS,()=> 'q1','en');
  assert.equal(q.sentenceId,'s-ai');assert.equal(q.prompt,'Yesterday, I ___ to school.');
});
test('replay keeps sentence tombstones and usage history without mutating review state',()=>{
  const version=JSON.stringify({generation:'word-event',fields:{word:'word-event',meaning:'word-event',pos:'',variants:'',level:'',ipa:'',pinyin:'',kana:''}});
  const events=[
    {id:'set-event',deviceId:'d',kind:'set',at:1,data:{id:'s1',name:'English',language:'en',meaningLanguage:'vi'}},
    {id:'word-event',deviceId:'d',kind:'word',at:2,data:{id:'w1',setId:'s1',patch:{word:'go',meaning:'đi'}}},
    {id:'sentence-event',deviceId:'d',kind:'sentence',at:3,data:{id:'sent1',wordId:'w1',text:'I go home.',gapStart:2,gapEnd:4,targetForm:'go',acceptedAnswers:['go'],acceptedReadings:[],level:'A1',status:'ready',wordContentVersion:version,source:'ai'}},
    {id:'usage-event',deviceId:'d',kind:'sentenceUsage',at:4,effectiveAt:4,data:{sentenceId:'sent1',wordId:'w1',questionId:'q1'}},
    {id:'delete-sentence',deviceId:'d',kind:'deleteSentence',at:5,data:{id:'sent1',wordId:'w1'}}
  ];
  const state=replay(events);assert.equal(state.sentences.sent1.usageCount,1);assert.equal(state.sentences.sent1.deleted,true);
  assert.equal(state.words.w1.review.phase,'new');
});
