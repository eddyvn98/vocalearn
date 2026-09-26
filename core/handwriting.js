/** Provider-independent handwriting attempt aggregation. Geometry scoring is supplied by a versioned stroke engine. */

export function handwritingState(characters){
  return {characters:[...characters].map(ch=>({ch,wrongStrokes:[],completed:false,assisted:false})),index:0,hadError:false,unknown:false};
}
export function recordStroke(state,{correct,strokeIndex,technical=false}){
  const next=structuredClone(state),ch=next.characters[next.index];
  if(technical)return next;
  if(correct)return next;
  next.hadError=true;ch.wrongStrokes.push(strokeIndex);
  if(ch.wrongStrokes.filter(x=>x===strokeIndex).length>=2)ch.assisted=true;
  return next;
}
export function completeCharacter(state,success=true){
  const next=structuredClone(state),ch=next.characters[next.index];
  if(!success){next.unknown=true;return next;}
  ch.completed=true;if(next.index<next.characters.length-1)next.index++;
  return next;
}
export function handwritingResult(state,{memory=false,activeMs=Infinity,easyMs=5000}={}){
  if(state.unknown||state.characters.some(c=>!c.completed))return {grade:'forget',hadError:true};
  const assisted=state.hadError||state.characters.some(c=>c.assisted);
  if(assisted)return {grade:'hard',hadError:true};
  return {grade:memory&&activeMs<=easyMs?'easy':'good',hadError:false};
}
export function strokeErrors(state){
  return state.characters.flatMap((c,charIndex)=>c.wrongStrokes.map(strokeIndex=>({charIndex,char:c.ch,strokeIndex})));
}
