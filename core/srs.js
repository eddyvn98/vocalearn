import {addDays, dayAt, daysBetween, revision, isDue} from './time.js';
export const DEFAULTS = Object.freeze({zone: 'Asia/Ho_Chi_Minh', newLimit: 15,
  hardFactor: 1.2, easyFactor: 1.3, easyMs: 5000, maxInterval: 3650, reminder: false, reminderTime: '20:00'});
export function initialState(id) {
  return {phase: 'new', step: 0, ef: 2.5, interval: 0, dueDate: null, dueAt: null,
    lastDay: null, startedDay: null, rev: `root-${id}`};
}
export function advance(base, result, at, config = DEFAULTS) {
  const cfg = {...DEFAULTS, ...config}, day = dayAt(at, cfg.zone);
  const next = {...base};
  const graduate = () => Object.assign(next, {phase: 'review', step: 0, interval: 1,
    dueDate: addDays(day, 1), dueAt: null, lastDay: day});
  const forget = result.grade === 'forget';
  if (base.phase === 'new') {
    Object.assign(next, {phase: 'learning', step: 1, dueAt: at + 60000, startedDay: day});
  } else if (base.phase === 'learning') {
    if (!forget && base.step === 3) graduate();
    else Object.assign(next, {step: forget ? base.step : base.step + 1, dueAt: at + 600000});
  } else if (base.phase === 'relearn') {
    if (forget) next.dueAt = at + 600000;
    else graduate();
  } else if (forget) {
    Object.assign(next, {phase: 'relearn', dueDate: null, dueAt: at + 600000,
      ef: Math.max(1.3, base.ef - 0.20)});
  } else {
    const elapsed = daysBetween(base.lastDay, day);
    const b = Math.max(base.interval, elapsed);
    const factor = result.grade === 'hard' ? cfg.hardFactor
      : base.ef * (result.grade === 'easy' ? cfg.easyFactor : 1);
    const interval = Math.min(cfg.maxInterval, Math.max(base.interval + 1, Math.floor(b * factor + 0.5)));
    Object.assign(next, {interval, lastDay: day, dueDate: addDays(day, interval),
      ef: Math.max(1.3, base.ef + (result.grade === 'easy' ? 0.15 : result.assisted ? -0.15 : 0))});
  }
  next.rev = revision(JSON.stringify([base.rev, result.grade, result.assisted, at, next.phase, next.step]));
  return next;
}
const rank = {forget: 0, hard: 1, good: 2, easy: 3};
export function conservative(events) {
  return [...events].sort((a, b) => rank[a.data.grade] - rank[b.data.grade]
    || Number(b.data.assisted) - Number(a.data.assisted)
    || (a.effectiveAt ?? a.at) - (b.effectiveAt ?? b.at)
    || a.id.localeCompare(b.id))[0];
}
/** Server-derived facts permit deferred children only after their real parent exists. */
function allowedAtBase(event, base) {
  const gate=event.reviewGate,d=event.data;
  if(!gate)return true; // Historical records retain their original replay semantics.
  if(!gate.ready || (base.phase==='new' ? d.mode!=='new' : d.mode!=='review'))return false;
  if(base.phase!=='new' && !isDue(base,event.effectiveAt,d.config?.zone||DEFAULTS.zone))return false;
  if(base.phase==='review')return true;
  let expected=base.phase==='new'?'flash':base.phase==='relearn'?'typing':['flash','quiz','spell','typing'][base.step];
  let familiar=base.phase==='new';
  if(expected==='quiz'&&!gate.quizAvailable){expected='flash';familiar=true;}
  if(expected==='spell'&&!gate.hasAudio)expected='typing';
  return d.game===expected && !!d.familiarize===familiar && (!familiar || d.grade==='hard'&&!d.hadError&&!d.assisted);
}
/** Replay from root; late contradictory parents invalidate dependent descendants. */
export function scheduleFor(id, events) {
  let state = initialState(id);
  const eligible = events.filter(e => e.scheduleEligible !== false && e.kind === 'answer' && e.data.mode !== 'free' && e.data.mode !== 'errors');
  const accepted = new Set(), states = new Map([[state.rev,{...state}]]);
  for (let i = 0; i < eligible.length; i++) {
    const group = eligible.filter(e => e.data.baseRev === state.rev && allowedAtBase(e,state));
    if (!group.length) break;
    const winner = conservative(group);
    const at = Math.min(...group.map(e => e.effectiveAt ?? e.at));
    state = advance(state, winner.data, at, winner.data.config);
    states.set(state.rev,{...state});
    group.forEach(e => accepted.add(e.id));
  }
  return {state, accepted, states};
}
