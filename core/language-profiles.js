const escapeRegExp=value=>String(value||'').replace(/[.*+?^(){}|[\]\\$]/g,'\\$&');

export const LANGUAGE_PROFILES=Object.freeze({
  en:Object.freeze({
    id:'en',
    label:'English',
    transcription:'ipa',
    typing:'direct',
    releasedPhase:1,
    supportedMeaningLanguages:['vi','en']
  })
});

export function languageProfile(code){
  return LANGUAGE_PROFILES[code]||null;
}

export function studySetProfile(set){
  if(!set)return null;
  const language=languageProfile(set.language);
  if(!language)return null;
  const monolingual=set.language===set.meaningLanguage;
  return {...language,meaningLanguage:set.meaningLanguage,meaningMode:monolingual?'monolingual':'bilingual'};
}

export function maskMonolingualDefinition(value,word,variants=[]){
  let output=String(value||'');
  const forms=[word,...(variants||[])].map(x=>String(x||'').trim()).filter(Boolean)
    .sort((a,b)=>b.length-a.length);
  for(const form of forms){
    const pattern=new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(form)})(?=$|[^\\p{L}\\p{N}])`,'giu');
    output=output.replace(pattern,(match,prefix)=>prefix+'____');
  }
  return output;
}
