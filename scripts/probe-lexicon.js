import {createLocalLexicon} from '../server/local-lexicon.js';

const path=process.env.LEXICAL_DB_PATH||'./data/dictionary.db';
const lexicon=createLocalLexicon(path);
console.log(JSON.stringify({path,available:lexicon.available,source:lexicon.source,error:lexicon.error||''}));
for(const word of ['test','deploy','meeting','apple','run','confirm','progress']){
  const result=lexicon.lookup('en',word,'vi');
  console.log(JSON.stringify({
    word,
    found:Boolean(result),
    source:result?.source||'',
    meaning:result?.fields?.meaning||'',
    ipa:result?.fields?.ipa||'',
    pos:result?.fields?.pos||'',
    sentence:result?.fields?.sentence||'',
    synonyms:result?.fields?.synonyms||[],
    antonyms:result?.fields?.antonyms||[],
    wordFamily:result?.fields?.wordFamily||[],
    definitions:result?.dictionary?.definitions||[],
    meaningCandidates:result?.meaningCandidates||[]
  }));
}
lexicon.close();
