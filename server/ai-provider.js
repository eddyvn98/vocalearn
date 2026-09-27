const stripFence=value=>String(value||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');

function instruction(word,type){
  const language=word.language||'unknown',meaningLanguage=word.meaningLanguage||'vi';
  if(type==='fill')return [
    'Return JSON only.',
    'You assist a vocabulary learning app.',
    `Target language: ${language}. Meaning language: ${meaningLanguage}.`,
    `Word: ${word.word}. Existing meaning: ${word.meaning||'(none)'}.`,
    'Return {"meaningCandidates":[1 to 3 short strings],"mnemonic":"short optional memory aid"}.',
    'Do not invent pronunciation. Do not include markdown.'
  ].join('\n');
  throw new Error('Unsupported AI job type');
}

export function createAiProvider(config={}){
  const baseUrl=String(config.baseUrl||'').replace(/\/$/,'');
  const model=String(config.model||'');
  const apiKey=String(config.apiKey||'');
  const timeoutMs=Number(config.timeoutMs||30000);
  return {
    configured:Boolean(baseUrl&&model),
    async generate({word,type}){
      if(!baseUrl||!model){const error=new Error('AI provider is not configured');error.code='AI_PROVIDER_UNAVAILABLE';throw error;}
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetch(baseUrl+'/chat/completions',{
          method:'POST',signal:controller.signal,
          headers:{'Content-Type':'application/json',...(apiKey?{Authorization:'Bearer '+apiKey}:{})},
          body:JSON.stringify({model,temperature:0.2,response_format:{type:'json_object'},
            messages:[{role:'user',content:instruction(word,type)}]})
        });
        if(!response.ok){const error=new Error('AI provider returned '+response.status);error.code=response.status>=500?'AI_PROVIDER_TEMPORARY':'AI_PROVIDER_REJECTED';throw error;}
        const data=await response.json(),raw=data?.choices?.[0]?.message?.content;
        let parsed;try{parsed=JSON.parse(stripFence(raw));}catch{const error=new Error('AI provider returned invalid JSON');error.code='AI_INVALID_JSON';throw error;}
        const meanings=Array.isArray(parsed.meaningCandidates)?parsed.meaningCandidates.map(x=>String(x||'').trim()).filter(Boolean).slice(0,3):[];
        const mnemonic=String(parsed.mnemonic||'').trim();
        if(!meanings.length&&!mnemonic){const error=new Error('AI provider returned no usable fields');error.code='AI_EMPTY_RESULT';throw error;}
        return {meaningCandidates:meanings,mnemonic};
      }catch(error){
        if(error.name==='AbortError'){error.code='AI_TIMEOUT';error.message='AI provider timed out';}
        throw error;
      }finally{clearTimeout(timer);}
    }
  };
}
