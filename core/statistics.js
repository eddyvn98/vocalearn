import {inScope} from './model.js';

export function mastered(word,now=Date.now()){
  return !word.deleted&&word.review?.phase==='review'&&(word.review.interval||0)>=21
    && Number(word.review.due)>now&&!word.errors?.inBook;
}
export function scopeStats(model,scope=[],now=Date.now()){
  const words=Object.values(model.words||{}).filter(w=>!w.deleted&&inScope(w,scope,model.categories||{}));
  const masteredCount=words.filter(w=>mastered(w,now)).length;
  return {active:words.length,mastered:masteredCount,ratio:words.length?masteredCount/words.length:null,
    ratioLabel:words.length?masteredCount+'/'+words.length:'0/0',percentLabel:words.length?Math.round(masteredCount/words.length*100)+'%':'—'};
}
export function activitySeries(events,{from=-Infinity,to=Infinity,wordIds=null}={}){
  const allowed=wordIds?new Set(wordIds):null,buckets=new Map();
  for(const e of events||[]){
    if(e.kind!=='answer'||e.at<from||e.at>to||(allowed&&!allowed.has(e.data.wordId)))continue;
    const day=new Date(e.at).toISOString().slice(0,10),b=buckets.get(day)||{day,scheduled:0,practice:0,errors:0};
    if(['free','errors'].includes(e.data.mode))b.practice++;else b.scheduled++;
    if(e.data.grade==='forget'||e.data.hadError)b.errors++;buckets.set(day,b);
  }
  return [...buckets.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
export function statsDescription(stats,scopeLabel,fromLabel,toLabel){
  return scopeLabel+': '+stats.mastered+'/'+stats.active+' thẻ đã thuộc ('+stats.percentLabel+'), '+fromLabel+'–'+toLabel+'.';
}
