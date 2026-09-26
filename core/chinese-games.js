export function toneQuestion(pinyinSyllables,audio=null){
  if(!Array.isArray(pinyinSyllables)||!pinyinSyllables.length)return null;
  return {syllables:pinyinSyllables.map((x,i)=>({index:i,base:x.base,tone:x.tone,label:x.tone===0?'nhẹ':String(x.tone)})),audio};
}
export function gradeTones(question,answers){
  if(!question||answers.length!==question.syllables.length)return false;
  return question.syllables.every((s,i)=>Number(answers[i])===Number(s.tone));
}
export function classifierQuestion(word){
  const values=(word.classifiers||[]).filter(Boolean);
  if(!values.length)return null;
  return {prompt:word.classifierSentence||('一 ___ '+word.word),answers:values,completed:value=>(word.classifierSentence||('一 ___ '+word.word)).replace('___',value)};
}
export function gradeClassifier(question,value){return !!question&&question.answers.includes(value);}
