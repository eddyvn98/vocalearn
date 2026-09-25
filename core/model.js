import {DEFAULTS, scheduleFor} from './srs.js';
import {errorBook} from './errors.js';
export function replay(input) {
  const events = [...input].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER)
    || (a.localOrder ?? a.at) - (b.localOrder ?? b.at) || a.id.localeCompare(b.id));
  const state = {sets: {}, categories: {}, words: {}, links: {}, settings: {...DEFAULTS}, conflicts: [], events};
  for (const e of events) {
    const d = e.data;
    if (e.kind === 'set') state.sets[d.id] = {...state.sets[d.id], ...d};
    if (e.kind === 'category') state.categories[d.id] = {...state.categories[d.id], ...d};
    if (e.kind === 'deleteCategory') {
      const doomed = descendants(state.categories, d.id);
      for (const id of doomed) delete state.categories[id];
      for (const key of Object.keys(state.links)) if (doomed.has(state.links[key].categoryId)) delete state.links[key];
    }
    if (e.kind === 'settings') Object.assign(state.settings, d);
    if (e.kind === 'word') {
      const w = state.words[d.id] ?? {id: d.id, setId: d.setId, fields: {}, generation: d.id, deleted: false};
      if (w.deleted) continue;
      for (const [key, value] of Object.entries(d.patch)) {
        if (w.fields[key] && d.baseFields?.[key] !== w.fields[key] && w[key] !== value) {
          state.conflicts.push({wordId: w.id, field: key, before: w[key], after: value, eventId: e.id});
        }
        w[key] = value; w.fields[key] = e.id;
      }
      state.words[d.id] = w;
    }
    if (e.kind === 'deleteWord' && state.words[d.id]) state.words[d.id].deleted = true;
    if (e.kind === 'restoreWord' && state.words[d.id]) state.words[d.id].deleted = false;
    if (e.kind === 'resetWord' && state.words[d.id]) state.words[d.id].generation = `${d.id}-${e.id}`;
    if (e.kind === 'link' || e.kind === 'unlink') {
      const key = `${d.wordId}/${d.categoryId}`, old = state.links[key];
      if (e.kind === 'link' && old?.removed && d.base !== old.rev) continue;
      state.links[key] = {...d, removed: e.kind === 'unlink', rev: e.id};
    }
  }
  for (const w of Object.values(state.words)) {
    const related = events.filter(e => e.data.wordId === w.id);
    const resetIndex = events.findLastIndex(e => e.kind === 'resetWord' && e.data.id === w.id);
    const afterReset = resetIndex < 0 ? related : related.filter(e => events.indexOf(e) > resetIndex);
    const schedule = scheduleFor(w.generation, afterReset);
    w.review = schedule.state;
    w.accepted = schedule.accepted;
    w.practiceReclassified = related.filter(e=>e.kind==='answer'
      && !['free','errors'].includes(e.data.mode) && !schedule.accepted.has(e.id)).map(e=>e.id);
    const errorEvents=related.map(e=>w.practiceReclassified.includes(e.id)?{...e,scheduleEligible:false}:e);
    w.errors = errorBook(errorEvents);
    w.categoryIds = Object.values(state.links).filter(l => !l.removed && l.wordId === w.id && state.categories[l.categoryId]).map(l => l.categoryId);
    w.ready = !!(w.word?.trim() && (w.meaning?.trim() || w.ipa?.trim() || w.image));
  }
  return state;
}
export function descendants(categories, root) {
  const found = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of Object.values(categories)) if (found.has(c.parentId) && !found.has(c.id)) {
      found.add(c.id); changed = true;
    }
  }
  return found;
}
export function categoryPath(categories,id) {
  const names=[],seen=new Set();
  let current=categories[id];
  while(current&&!seen.has(current.id)){
    seen.add(current.id);names.unshift(current.name);current=current.parentId?categories[current.parentId]:null;
  }
  return names.join(' > ');
}
export function inScope(w, scope, categories) {
  if (!scope?.length) return true;
  if (scope.includes('uncategorized') && !w.categoryIds.length) return true;
  const ids = new Set(scope.flatMap(id => [...descendants(categories, id)]));
  return w.categoryIds.some(id => ids.has(id));
}
