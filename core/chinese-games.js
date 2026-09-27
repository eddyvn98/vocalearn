const TONE_MARKS={ā:['a',1],á:['a',2],ǎ:['a',3],à:['a',4],ē:['e',1],é:['e',2],ě:['e',3],è:['e',4],ī:['i',1],í:['i',2],ǐ:['i',3],ì:['i',4],ō:['o',1],ó:['o',2],ǒ:['o',3],ò:['o',4],ū:['u',1],ú:['u',2],ǔ:['u',3],ù:['u',4],ǖ:['ü',1],ǘ:['ü',2],ǚ:['ü',3],ǜ:['ü',4]};
export function parsePinyin(value){
  return String(value||'').normalize('NFC').trim().split(/[\s'’-]+/u).filter(Boolean).map(raw=>{
    let tone=0,base='';
    for(const ch of raw.toLocaleLowerCase('zh-CN')){
      if(TONE_MARKS[ch]){base+=TONE_MARKS[ch][0];tone=TONE_MARKS[ch][1];}
      else if(/[1-5]/.test(ch))tone=ch==='5'?0:Number(ch);
      else base+=ch;
    }
    return {base,tone};
  }).filter(x=>x.base);
}
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
