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
  {key:'level',headers:['Tr\u00ecnh \u0111\u1ed9','level','cefr','hsk','jlpt','trinh do']},
  {key:'variants',headers:['Bi\u1ebfn th\u1ec3','variants','forms','bien the']},
  {key:'tags',headers:['Tag','Tags','tag t\u1ef1 do','tag tu do']},
  {key:'category',headers:['Ch\u1ee7 \u0111\u1ec1','category','topics','topic','chu de']},
  {key:'image',headers:['H\u00ecnh','\u1ea2nh','image','picture','anh']},
  {key:'audio',headers:['\u00c2m thanh','audio','sound','am thanh']},
];
export const columnsFor = (customFields=[]) => [...COLUMNS,...customFields.map(f=>({key:`custom:${f.id}`,headers:[f.name]}))];
export const cardsToXlsx = (cards,categories={},customFields=[]) => {
  const expanded=cards.map(card=>({...card,...Object.fromEntries(customFields.map(f=>[`custom:${f.id}`,card.custom?.[f.id]??'']))}));
  return writeWorkbook(expanded,categories,columnsFor(customFields));
};
export function detectMapping(header, customFields=[]) {
  const map = {}, columns=columnsFor(customFields);
  for(const [col,label] of Object.entries(header)) {
    const field = columns.find(c=>c.headers.some(h=>normalize(h)===normalize(label)));
    if(field)map[field.key]=col;
  }
  return map;
}
export function workbookToCards(book, mapping, customFields=[]) {
  mapping ||= detectMapping(book.rows[0]?.cells || {},customFields);
  if(!mapping.word)throw new Error('Map a column to Word before importing');
  const cards = [], errors = [], columns=columnsFor(customFields);
  for(const {row,cells} of book.rows.slice(1)) {
    if(!Object.values(cells).some(v=>v.trim())&&!book.imageRows.has(row))continue;
    const raw = Object.fromEntries(columns.filter(c=>mapping[c.key]).map(c=>[c.key,(cells[mapping[c.key]] || '').trim()]));
    const custom={};let customError='';
    for(const field of customFields){
      const value=raw[`custom:${field.id}`];delete raw[`custom:${field.id}`];
      if(value===undefined||value==='')continue;
      if(field.type==='number'){
        const number=Number(value);if(!Number.isFinite(number)){customError=`Invalid number for ${field.name}`;break;}custom[field.id]=number;
      }else if(field.type==='select'&&!field.options.includes(value)){customError=`Invalid option for ${field.name}`;break;}
      else custom[field.id]=value;
    }
    if(customError){errors.push({row,message:customError});continue;}
    const card = {...raw,custom};
    if(!card.word){errors.push({row,message:'Missing Word'});continue;}
    const parseList = (value, label) => {
      if(!value)return [];
      try {
        const parsed=value.startsWith('[')?JSON.parse(value):value.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean);
        if(!Array.isArray(parsed)||parsed.some(a=>typeof a!=='string'))throw new Error();
        return parsed;
      } catch {throw new Error(`Invalid ${label} list`);}
    };
    let answers=[],variants=[],tags=[];
    try {
      answers=parseList(card.answers,'answers');
      variants=parseList(card.variants,'variants');
      tags=parseList(card.tags,'tags');
    } catch(error) {errors.push({row,message:error.message});continue;}
    cards.push({...card,answers,variants,tags,image:book.imageRows.get(row)||card.image||'',row});
  }
  return {cards,errors,warnings:book.warnings,skipped:0,mapping};
}
/** Async because browser ZIP inflation is a stream. Callers must await this. */
export async function xlsxToCards(input, existingWords = [], mapping, customFields=[]) {
  const result = workbookToCards(await readWorkbook(input),mapping,customFields);
  const seen = new Set(existingWords.map(identity));
  result.cards=result.cards.filter(card=>{const key=identity(card);if(seen.has(key)){result.skipped++;return false;}seen.add(key);return true;});
  return result;
}
export const identity = c => [c.word,c.meaning,c.pos,c.ipa].map(v=>normalize(v || '')).join('\u0000');
