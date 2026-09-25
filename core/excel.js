import {normalize} from './grading.js';
import {writeWorkbook} from './xlsx/write.js';
import {readWorkbook} from './xlsx/read.js';
export {readWorkbook};
export const COLUMNS = [
  {key:'word_id',headers:['word_id','id']},
  {key:'word',headers:['T\u1eeb','word','tu']},
  {key:'meaning',headers:['Ngh\u0129a','meaning','nghia']},
  {key:'ipa',headers:['Phi\u00ean \u00e2m','ipa','phien am']},
  {key:'pos',headers:['Lo\u1ea1i t\u1eeb','T\u1eeb lo\u1ea1i','pos','part of speech','tu loai']},
  {key:'sentence',headers:['C\u00e2u v\u00ed d\u1ee5','sentence','cau vi du']},
  {key:'answers',headers:['\u0110\u00e1p \u00e1n','answers','dap an']},
  {key:'note',headers:['Ghi ch\u00fa','note','ghi chu']},
  {key:'category',headers:['Ch\u1ee7 \u0111\u1ec1','category','topics','topic','chu de']},
  {key:'image',headers:['H\u00ecnh','\u1ea2nh','image','picture','anh']},
  {key:'audio',headers:['\u00c2m thanh','audio','sound','am thanh']},
];
export const cardsToXlsx = (cards,categories={}) => writeWorkbook(cards,categories,COLUMNS);
export function detectMapping(header) {
  const map = {};
  for(const [col,label] of Object.entries(header)) {
    const field = COLUMNS.find(c=>c.headers.some(h=>normalize(h)===normalize(label)));
    if(field)map[field.key]=col;
  }
  return map;
}
export function workbookToCards(book, mapping = detectMapping(book.rows[0]?.cells || {})) {
  if(!mapping.word)throw new Error('Map a column to Word before importing');
  const cards = [], errors = [];
  for(const {row,cells} of book.rows.slice(1)) {
    if(!Object.values(cells).some(v=>v.trim())&&!book.imageRows.has(row))continue;
    const card = Object.fromEntries(COLUMNS.filter(c=>mapping[c.key]).map(c=>[c.key,(cells[mapping[c.key]] || '').trim()]));
    if(!card.word){errors.push({row,message:'Missing Word'});continue;}
    const parseList=(value,label)=>{
      if(!value)return [];
      try {
        const list=value.startsWith('[')?JSON.parse(value):value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
        if(!Array.isArray(list)||list.some(item=>typeof item!=='string'))throw new Error();
        return list;
      } catch {throw new Error(`Invalid ${label} list`);}
    };
    let answers=[],variants=[],tags=[],custom={};
    try {
      answers=parseList(card.answers,'answers');
      variants=parseList(card.variants,'variants');
      tags=parseList(card.tags,'tags');
      if(card.custom){
        custom=JSON.parse(card.custom);
        if(!custom||typeof custom!=='object'||Array.isArray(custom)
          ||Object.values(custom).some(value=>typeof value!=='string'))throw new Error();
      }
    } catch(error){errors.push({row,message:error.message||'Invalid custom fields'});continue;}
    cards.push({...card,answers,variants,tags,custom,image:book.imageRows.get(row)||card.image||'',row});
  }
  return {cards,errors,warnings:book.warnings,skipped:0,mapping};
}
/** Async because browser ZIP inflation is a stream. Callers must await this. */
export async function xlsxToCards(input, existingWords = [], mapping) {
  const result = workbookToCards(await readWorkbook(input),mapping);
  const seen = new Set(existingWords.map(identity));
  result.cards=result.cards.filter(card=>{const key=identity(card);if(seen.has(key)){result.skipped++;return false;}seen.add(key);return true;});
  return result;
}
export const identity = c => [c.word,c.meaning,c.pos,c.ipa].map(v=>normalize(v || '')).join('\u0000');
