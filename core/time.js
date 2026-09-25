/** Calendar days use the account zone, never the browser's implicit timezone. */
export function dayAt(ms, zone = 'Asia/Ho_Chi_Minh') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = name => parts.find(p => p.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(day, count) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00Z`) - Date.parse(`${a}T12:00Z`)) / 86400000);
}
export function isDue(state, now, zone) {
  if (!state || state.phase === 'new') return false;
  return state.phase === 'review'
    ? state.dueDate <= dayAt(now, zone) : state.dueAt <= now;
}
/** Deterministic revision key; not a password hash or security primitive. */
export function revision(text) {
  let hash = 14695981039346656037n;
  for (const ch of text) {
    hash ^= BigInt(ch.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16);
}
