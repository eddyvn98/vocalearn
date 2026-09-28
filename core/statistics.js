import {addDays,dayAt,isDue} from './time.js';
import {inScope} from './model.js';

const GRADES=['forget','hard','good','easy'];
const eventTime=event=>Number(event.effectiveAt??event.at??0);

export function masteredWord(word,now,zone){
  const review=word?.review;
  const today=dayAt(now,zone);
  return !!word&&!word.deleted&&review?.phase==='review'&&Number(review.interval)>=21&&
    !!review.dueDate&&review.dueDate>=today&&!word.errors?.inBook;
}

export function statisticsSnapshot(model,{setId,scope=[],includeChildren=true,now=Date.now(),days=30}={}){
  const zone=model.settings?.zone||'Asia/Ho_Chi_Minh';
  const active=Object.values(model.words||{}).filter(word=>!word.deleted&&word.setId===setId&&
    inScope(word,scope,model.categories||{},includeChildren));
  const ids=new Set(active.map(word=>word.id)),endDay=dayAt(now,zone);
  const span=days==='all'?null:Math.max(1,Number(days)||30);
  const startDay=span?addDays(endDay,1-span):null;
  const answers=(model.events||[]).filter(event=>{
    if(event.kind!=='answer'||!ids.has(event.data?.wordId))return false;
    const at=eventTime(event);if(!Number.isFinite(at)||at<=0||at>now)return false;
    const day=dayAt(at,zone);return (!startDay||day>=startDay)&&day<=endDay;
  });
  const clean=answers.filter(event=>{
    const data=event.data||{};
    return data.grade!=='forget'&&!data.hadError&&!data.assisted&&!data.hint;
  });
  const games=new Map(),daysMap=new Map();
  for(const event of answers){
    const data=event.data||{},game=data.game||'unknown';
    if(!games.has(game))games.set(game,{game,total:0,forget:0,hard:0,good:0,easy:0});
    const row=games.get(game);row.total++;if(GRADES.includes(data.grade))row[data.grade]++;
    const day=dayAt(eventTime(event),zone);
    if(!daysMap.has(day))daysMap.set(day,{day,total:0,clean:0});
    const daily=daysMap.get(day);daily.total++;
    if(data.grade!=='forget'&&!data.hadError&&!data.assisted&&!data.hint)daily.clean++;
  }
  const mastered=active.filter(word=>masteredWord(word,now,zone)).length;
  return {
    activeCount:active.length,masteredCount:mastered,masteredRate:active.length?mastered/active.length:null,
    dueCount:active.filter(word=>word.ready&&isDue(word.review,now,zone)).length,
    errorCount:active.filter(word=>word.errors?.inBook).length,
    waitingCount:active.filter(word=>!word.ready).length,
    answerCount:answers.length,cleanCount:clean.length,cleanRate:answers.length?clean.length/answers.length:null,
    gameRows:[...games.values()].sort((a,b)=>b.total-a.total||a.game.localeCompare(b.game)),
    dayRows:[...daysMap.values()].sort((a,b)=>b.day.localeCompare(a.day)),
    startDay,endDay,span
  };
}
