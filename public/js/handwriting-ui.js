import {app,current} from './state.js';
import {setMeta} from './storage.js';
import {t,esc,button} from './ui.js';
import {handwritingState,recordStroke,completeCharacter,strokeErrors} from '/core/handwriting.js';

let resultHandler=async()=>{};
export const setHandwritingResultHandler=handler=>{resultHandler=handler;};
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function sampleSvg(pathData,count=9){
  const ns='http://www.w3.org/2000/svg',path=document.createElementNS(ns,'path');path.setAttribute('d',pathData);
  const length=path.getTotalLength(),points=[];
  for(let i=0;i<count;i++){const p=path.getPointAtLength(length*i/(count-1));points.push([p.x/1.09,p.y/1.09]);}
  return points;
}
function resample(points,count=9){
  if(points.length<2)return points;
  const seg=[],total=points.slice(1).reduce((sum,p,i)=>{const d=dist(points[i],p);seg.push(d);return sum+d;},0);
  if(!total)return [points[0]];
  const out=[points[0]];let walked=0,index=0;
  for(let n=1;n<count-1;n++){
    const wanted=total*n/(count-1);
    while(index<seg.length-1&&walked+seg[index]<wanted){walked+=seg[index];index++;}
    const ratio=Math.max(0,Math.min(1,(wanted-walked)/(seg[index]||1))),a=points[index],b=points[index+1];
    out.push([a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio]);
  }
  out.push(points.at(-1));return out;
}
function stateFor(q){
  const count=q.handwriting.strokeData.characters.length;
  q.handwritingState??={charIndex:0,strokeIndex:0,wrong:0,completed:Array(count).fill(0),lastError:'',grading:handwritingState(q.handwriting.strokeData.characters.map(item=>item.char))};
  q.handwritingState.grading??=handwritingState(q.handwriting.strokeData.characters.map(item=>item.char));
  return q.handwritingState;
}
function expectedPoints(q){
  const s=stateFor(q),record=q.handwriting.strokeData.characters[s.charIndex],stroke=record?.strokes?.[s.strokeIndex];
  if(!stroke)return [];
  return record.format==='points'?resample(stroke):sampleSvg(stroke);
}
function strokeScore(q,points){
  const expected=expectedPoints(q),actual=resample(points);
  if(expected.length<2||actual.length<2)return {technical:true};
  const start=dist(actual[0],expected[0]),end=dist(actual.at(-1),expected.at(-1));
  const revStart=dist(actual[0],expected.at(-1)),revEnd=dist(actual.at(-1),expected[0]);
  if(revStart+revEnd+8<start+end)return {correct:false,reason:'direction'};
  const n=Math.min(expected.length,actual.length);
  const avg=Array.from({length:n},(_,i)=>dist(actual[Math.round(i*(actual.length-1)/(n-1))],expected[Math.round(i*(expected.length-1)/(n-1))]))
    .reduce((a,b)=>a+b,0)/n;
  return {correct:start<=22&&end<=22&&avg<=20,reason:start>22||end>22?'position':'shape'};
}
function refs(record,state,index,level){
  const show=level!=='memory'||index<state.charIndex;if(!show&&index!==state.charIndex)return '';
  return record.strokes.map((stroke,i)=>{
    const done=index<state.charIndex||index===state.charIndex&&i<state.strokeIndex,next=index===state.charIndex&&i===state.strokeIndex;
    if(level==='memory'&&!done)return '';
    const cls='handwriting-ref '+(done?'done':next?'next':'');
    if(record.format==='points')return `<polyline class="${cls}" points="${stroke.map(p=>p.join(',')).join(' ')}"/>`;
    return `<path class="${cls}" d="${esc(stroke)}" transform="scale(.917431)"/>`;
  }).join('');
}
export function handwritingMarkup(q){
  const s=stateFor(q),data=q.handwriting.strokeData,level=q.handwriting.level,done=s.charIndex>=data.characters.length;
  const activeIndex=Math.min(s.charIndex,data.characters.length-1),record=data.characters[activeIndex];
  const chars=data.characters.map((item,index)=>`<span class="${!done&&index===s.charIndex?'badge good':'badge'}">${esc(item.char)}${index<s.charIndex?' ✓':''}</span>`).join(' ');
  if(done)return `<div class="stack handwriting-meta"><div>${chars}</div><p class="muted small handwriting-source">${esc(data.source)} · ${esc(data.version)} · ${esc(data.license)}</p></div>`;
  const allRefs=data.characters.map((item,index)=>refs(item,s,index,level)).join('');
  const status=s.lastError?t('handwritingWrong')+' · '+t('handwriting_'+s.lastError):t('handwritingDraw');
  return `<div class="stack handwriting-meta"><div>${chars}</div><p>${t('handwritingLevel')}: <strong>${t('handwriting_'+level)}</strong> · ${t('stroke')} ${s.strokeIndex+1}/${record.strokes.length}</p>
    <div class="handwriting-stage"><svg viewBox="0 0 100 100" aria-hidden="true"><path class="handwriting-grid" d="M50 0V100M0 50H100M0 0L100 100M100 0L0 100"/>${allRefs}</svg><canvas data-handwriting-canvas width="500" height="500" aria-label="${t('handwritingCanvas')}"></canvas></div>
    <p class="${s.lastError?'error-text':'muted'}" role="status">${status}</p>
    <div class="row center wrap">${button(t('undo'),'handwritingUndo','quiet')}${button(t('clear'),'handwritingClear','quiet')}${button(t('dontKnow'),'unknown','quiet')}</div>
    <p class="muted small handwriting-source">${esc(data.source)} · ${esc(data.version)} · ${esc(data.license)}</p></div>`;
}
function canvasPoint(canvas,event){
  const box=canvas.getBoundingClientRect();
  return [(event.clientX-box.left)/box.width*100,(event.clientY-box.top)/box.height*100];
}
let drawing=null;
document.addEventListener('pointerdown',event=>{
  const canvas=event.target.closest?.('[data-handwriting-canvas]');if(!canvas)return;
  canvas.setPointerCapture?.(event.pointerId);drawing={canvas,points:[canvasPoint(canvas,event)]};
});
document.addEventListener('pointermove',event=>{
  if(!drawing)return;
  const point=canvasPoint(drawing.canvas,event),ctx=drawing.canvas.getContext('2d'),prev=drawing.points.at(-1);
  drawing.points.push(point);ctx.beginPath();ctx.moveTo(prev[0]*5,prev[1]*5);ctx.lineTo(point[0]*5,point[1]*5);ctx.lineWidth=9;ctx.lineCap='round';ctx.stroke();
});
document.addEventListener('pointerup',async event=>{
  if(!drawing)return;const {canvas,points}=drawing;drawing=null;
  const q=current();if(!q?.handwriting||q.result)return;
  const s=stateFor(q),score=strokeScore(q,points);
  if(score.technical){s.grading=recordStroke(s.grading,{correct:false,strokeIndex:s.strokeIndex,technical:true});s.lastError='technical';await setMeta('session',app.session);app.render();return;}
  if(!score.correct){s.grading=recordStroke(s.grading,{correct:false,strokeIndex:s.strokeIndex});s.wrong++;s.lastError=score.reason;q.hadError=s.grading.hadError;if(s.wrong>=2)q.hint=true;await setMeta('session',app.session);app.render();return;}
  s.lastError='';s.wrong=0;s.strokeIndex++;const record=q.handwriting.strokeData.characters[s.charIndex];
  if(s.strokeIndex>=record.strokes.length){s.completed[s.charIndex]=record.strokes.length;s.grading=completeCharacter(s.grading,true);s.charIndex++;s.strokeIndex=0;}
  if(s.charIndex>=q.handwriting.strokeData.characters.length){
    q.handwritingErrors=strokeErrors(s.grading);
    await setMeta('session',app.session);await resultHandler();return;
  }
  await setMeta('session',app.session);app.render();
});
export async function handwritingAction(action,q){
  if(!q?.handwriting||q.result)return;
  const s=stateFor(q);
  if(action==='handwritingClear'){s.strokeIndex=0;s.wrong=0;s.lastError='';}
  if(action==='handwritingUndo'){
    if(s.strokeIndex>0)s.strokeIndex--;
    else if(s.charIndex>0){s.charIndex--;s.strokeIndex=Math.max(0,q.handwriting.strokeData.characters[s.charIndex].strokes.length-1);s.grading.characters[s.charIndex].completed=false;s.grading.index=s.charIndex;}
    s.lastError='';
  }
  await setMeta('session',app.session);app.render();
}
