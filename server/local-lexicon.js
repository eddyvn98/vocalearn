import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';

export const LOCAL_LEXICON_SOURCE=Object.freeze({
  id:'minhqnd/dictionary:v2.0.0',
  name:'MinhQND Dictionary',
  version:'v2.0.0',
  license:'CC BY-SA 4.0',
  url:'https://dict.minhqnd.com',
  sha256:'9259403f0675b2991a1bd0ef6d0dbc5933afdb135632af095a60662f09bbf1d3'
});

const clean=value=>String(value||'').normalize('NFC').trim();
const normalizedWord=value=>clean(value).toLocaleLowerCase('en-US');
const unique=(values,limit=12)=>[...new Set(values.map(clean).filter(Boolean))].slice(0,limit);
const POS=Object.freeze({
  A:'adjective',C:'conjunction',D:'adverb',E:'preposition',I:'interjection',M:'numeral',
  N:'noun',O:'particle',P:'pronoun',R:'adverb',S:'other',V:'verb',X:'other',Z:'suffix'
});

function posName(value){
  const raw=clean(value);if(!raw)return '';
  if(POS[raw])return POS[raw];
  const lower=raw.toLocaleLowerCase('en-US');
  if(['noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection'].includes(lower))return lower;
  return raw;
}
function clozeExample(example,word){
  const text=clean(example),target=clean(word);if(!text||!target)return {sentence:'',answers:[]};
  const escaped=target.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
  const match=text.match(new RegExp('(^|\\b)'+escaped+'(?=\\b|$)','i'));
  if(!match)return {sentence:'',answers:[]};
  const start=(match.index||0)+match[1].length,matched=text.slice(start,start+target.length);
  return {sentence:text.slice(0,start)+'___'+text.slice(start+matched.length),answers:[matched]};
}
function row(db,word){
  const value=normalizedWord(word);
  return db.prepare('SELECT id,word,lang_code FROM words WHERE word=? AND lang_code=? LIMIT 1').get(value,'en')
    ||db.prepare('SELECT id,word,lang_code FROM words WHERE word=? AND lang_code=? LIMIT 1').get(clean(word),'en');
}
function meanings(db,id){
  return db.prepare(`SELECT d.definition,COALESCE(d.definition_lang,'vi') definition_lang,
    wd.example,d.pos,d.sub_pos,s.name source
    FROM word_definitions wd JOIN definitions d ON wd.definition_id=d.id
    LEFT JOIN sources s ON wd.source_id=s.id WHERE wd.word_id=?`).all(id);
}
function translations(db,id,language){
  return db.prepare('SELECT translation FROM translations WHERE word_id=? AND lang_code=?').all(id,language)
    .map(item=>item.translation);
}
function relations(db,id){
  return db.prepare('SELECT related_word,relation_type FROM word_relations WHERE word_id=?').all(id);
}
function pronunciations(db,id){
  return db.prepare('SELECT ipa,region FROM pronunciations WHERE word_id=?').all(id);
}

export function lookupLocalEnglish(db,word,meaningLanguage='vi'){
  const item=row(db,word);if(!item)return null;
  const defs=meanings(db,item.id),rels=relations(db,item.id),sounds=pronunciations(db,item.id);
  const translated=translations(db,item.id,meaningLanguage);
  const sameLanguage=defs.filter(def=>clean(def.definition_lang)===meaningLanguage).map(def=>def.definition);
  const meaningCandidates=unique([...translated,...sameLanguage],5);
  const primary=defs[0]||{},example=defs.find(def=>clean(def.example))?.example||'';
  const cloze=clozeExample(example,item.word);
  const relationList=type=>unique(rels.filter(rel=>clean(rel.relation_type)===type).map(rel=>rel.related_word),20);
  const ipa=clean(sounds.find(sound=>clean(sound.ipa))?.ipa).replace(/^[/\[]/,'').replace(/[\/\]]$/,'');
  const synonyms=relationList('s'),antonyms=relationList('a'),wordFamily=relationList('d');
  const fields={
    meaning:meaningCandidates[0]||'',translation:meaningCandidates.slice(1).join(', '),ipa,pos:posName(primary.pos),
    sentence:cloze.sentence,answers:cloze.answers,synonyms,antonyms,wordFamily,
    source:'MinhQND Dictionary · CC BY-SA 4.0'
  };
  return {
    status:'found',word:item.word,meaningCandidates,fields,
    dictionary:{word:item.word,ipa,pos:fields.pos,example,definitions:unique(defs.map(def=>def.definition),8),
      synonyms,antonyms,translations:meaningCandidates,audioUrl:'',sourceUrls:[LOCAL_LEXICON_SOURCE.url],
      license:{name:LOCAL_LEXICON_SOURCE.license,url:'https://creativecommons.org/licenses/by-sa/4.0/'}},
    lookupMeta:{ipa:{source:LOCAL_LEXICON_SOURCE.id,version:LOCAL_LEXICON_SOURCE.version,
      license:LOCAL_LEXICON_SOURCE.license,status:ipa?'lookup':'unsupported',needsCheck:sounds.length>1,confirmed:false}},
    source:LOCAL_LEXICON_SOURCE.id
  };
}

export function createLocalLexicon(path){
  const location=clean(path);
  if(!location||!existsSync(location))return {available:false,source:LOCAL_LEXICON_SOURCE,lookup:()=>null,close(){}};
  try{
    const db=new DatabaseSync(location);
    db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-16000; PRAGMA temp_store=MEMORY;');
    db.prepare('SELECT id FROM words LIMIT 1').get();
    return {
      available:true,source:LOCAL_LEXICON_SOURCE,
      lookup(language,word,meaningLanguage){return language==='en'?lookupLocalEnglish(db,word,meaningLanguage):null;},
      close(){db.close();}
    };
  }catch(error){
    return {available:false,source:LOCAL_LEXICON_SOURCE,error:error.message,lookup:()=>null,close(){}};
  }
}
