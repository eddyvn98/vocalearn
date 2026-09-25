import {DEFAULTS} from './srs.js';
export const WORD_FIELDS = new Set(['word','meaning','pos','ipa','sentence','answers','image','audio','note','level','variants','tags']);
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v) && !Object.hasOwn(Object.prototype, v);
const text = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const fail = message => {throw new Error(message);};
export function validateEvent(e) {
  if (!e || !id(e.id) || !id(e.deviceId) || !Number.isFinite(e.at) || !e.data || typeof e.data !== 'object' || Array.isArray(e.data)) fail('Invalid event');
  const d = e.data;
  switch (e.kind) {
    case 'set':
      if (!id(d.id) || !text(d.name, 100) || !d.name.trim() || d.language !== 'en' || !['en','vi'].includes(d.meaningLanguage)) fail('Invalid study set');
      break;
    case 'category':
      if (!id(d.id) || !id(d.setId) || !text(d.name, 100) || !d.name.trim() || (d.parentId && !id(d.parentId))) fail('Invalid category');
      break;
    case 'word':
      if (!id(d.id) || !id(d.setId) || !d.patch || typeof d.patch !== 'object' || Array.isArray(d.patch)) fail('Invalid word');
      for (const [key, v] of Object.entries(d.patch)) {
        if (!WORD_FIELDS.has(key)) fail('Unexpected word field');
        if (['answers','variants','tags'].includes(key)) {
          if (!Array.isArray(v) || v.length > 100 || v.some(x => !text(x, 500))) fail('Invalid list');
        } else if (['image','audio'].includes(key)) {
          if (!text(v, 2200000) || (v && !/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|ogg|webm|mp4));base64,[A-Za-z0-9+/=]+$/.test(v))) fail('Invalid media');
        } else if (!text(v, key === 'word' ? 100 : 5000)) fail('Invalid word text');
      }
      if ('word' in d.patch && !d.patch.word.trim()) fail('A word is required');
      break;
    case 'deleteWord': case 'restoreWord': case 'resetWord': case 'deleteCategory':
      if (!id(d.id)) fail('Invalid entity ID');
      break;
    case 'link': case 'unlink':
      if (!id(d.wordId) || !id(d.categoryId)) fail('Invalid membership');
      break;
    case 'settings':
      if (Object.keys(d).some(k => !Object.hasOwn(DEFAULTS,k))) fail('Invalid setting');
      if ('zone' in d) {try {new Intl.DateTimeFormat('en', {timeZone: d.zone});} catch {fail('Invalid timezone');}}
      for (const [key, min, max] of [['newLimit',0,200],['hardFactor',1,3],['easyFactor',1,3],['easyMs',1000,120000],['maxInterval',1,3650]]) {
        if (key in d && (!Number.isFinite(d[key]) || d[key] < min || d[key] > max)) fail(`Invalid ${key}`);
      }
      if ('maxInterval' in d && !Number.isInteger(d.maxInterval)) fail('Invalid interval');
      if ('newLimit' in d && !Number.isInteger(d.newLimit)) fail('Invalid daily limit');
      if ('reminder' in d && typeof d.reminder !== 'boolean') fail('Invalid reminder');
      if (d.reminderTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.reminderTime)) fail('Invalid reminder time');
      break;
    case 'answer':
      if (!id(d.wordId) || !id(d.questionId) || !text(d.baseRev, 200)
        || !['review','new','free','errors'].includes(d.mode)
        || !['flash','quiz','match','typing','spell','dictation','cloze','clozeChoice'].includes(d.game)
        || !['forget','hard','good','easy'].includes(d.grade)
        || typeof d.hadError !== 'boolean' || typeof d.assisted !== 'boolean') fail('Invalid answer');
      if (d.schemaVersion === 2 && (!text(d.opportunityId, 500) || !d.opportunityId)) fail('Invalid opportunity');
      if (d.config) validateEvent({...e, kind: 'settings', data: d.config});
      break;
    case 'attempt':
      if (!id(d.wordId) || !id(d.questionId) || typeof d.wrong !== 'boolean') fail('Invalid attempt');
      break;
    default: fail('Unknown event kind');
  }
  return e;
}
