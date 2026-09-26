export function answerList(value) {
  const items=Array.isArray(value)?value:String(value||'').split(',');
  return items.map(item=>String(item).trim()).filter(Boolean);
}

export function blankSelection(sentence,start,end) {
  const text=String(sentence||'');
  if(text.includes('___')||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||start>=end)return null;
  const raw=text.slice(start,end),answer=raw.trim();
  if(!answer||answer==='___')return null;
  const leading=raw.match(/^\s*/)?.[0]||'',trailing=raw.match(/\s*$/)?.[0]||'';
  return {sentence:text.slice(0,start)+leading+'___'+trailing+text.slice(end),answer};
}

export function restoreBlank(sentence,answers) {
  const text=String(sentence||''),list=answerList(answers);
  if(text.split('___').length!==2||!list.length)return null;
  return text.replace('___',list[0]);
}

export function validCloze(sentence,answers) {
  return String(sentence||'').split('___').length===2&&answerList(answers).length>0;
}
