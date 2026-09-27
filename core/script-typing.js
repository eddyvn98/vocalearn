import {normalize} from './grading.js';
import {chineseReadingMatches,japaneseReadingMatches,writingStep} from './language-profiles.js';

const readingOf=(word,profileId)=>profileId==='zh'?(word.pinyin||word.ipa||''):
  profileId==='ja'?(word.kana||word.ipa||''):'';

export function readingMatches(profileId,input,expected,written='') {
  if(profileId==='zh')return chineseReadingMatches(input,expected);
  if(profileId==='ja')return japaneseReadingMatches(input,expected,written);
  return normalize(input)===normalize(expected);
}

export function twoStepFor(word,pool,game,face,profileId) {
  if(game!=='typing'||!['zh','ja'].includes(profileId))return null;
  const reading=readingOf(word,profileId);
  if(!reading)return {blocked:'missingReading'};
  const readingFace=profileId==='zh'?'pinyin':'kana';
  const distractors=pool.filter(item=>item.id!==word.id&&!item.deleted&&item.setId===word.setId)
    .filter(item=>readingMatches(profileId,readingOf(item,profileId),reading,item.word))
    .map(item=>item.word).filter(Boolean);
  const step=writingStep(profileId,word.word,distractors);
  let choices=[...step.choices];
  if(step.mode==='choose'&&choices.length>1){
    const rotation=[...String(word.word)].reduce((sum,ch)=>sum+ch.codePointAt(0),0)%choices.length;
    choices=[...choices.slice(rotation),...choices.slice(0,rotation)];
  }
  return {profileId,reading,readingRequired:face!==readingFace,mode:step.mode,choices,
    gradeCap:face===readingFace||step.gradeCap==='hard'?'hard':null};
}

export function twoStepSnapshot(flow) {
  if(!flow||flow.blocked)return null;
  const {profileId,reading,readingRequired,mode,choices,gradeCap}=flow;
  return {profileId,reading,readingRequired,mode,choices,gradeCap};
}
