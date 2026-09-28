export function httpAiProvider(url,token='',fetchImpl=fetch){
  if(!url)return null;
  return async input=>{
    const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'Authorization':'Bearer '+token}:{})},
      body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});
    let payload;try{payload=await response.json();}catch{throw new Error('AI provider returned invalid JSON ('+response.status+')');}
    if(!response.ok)throw new Error(payload?.error||('AI provider HTTP '+response.status));
    return payload;
  };
}
export function testAiProvider(){
  return async ({kind,snapshot,count=5})=>{
    const word=snapshot.word;
    if(kind==='autofill')return {meanings:['AI meaning: '+word],note:'AI memory hint for '+word};
    if(kind==='sentences')return {sentences:Array.from({length:count},(_,index)=>{
      const i=index+1,text=snapshot.language==='zh'?'今天练习'+word+'，这是例句'+i+'。':'We use '+word+' in practice example '+i+'.';
      const gapStart=text.indexOf(word);
      return {text,gapStart,gapEnd:gapStart+word.length,targetForm:word,acceptedAnswers:[word],level:snapshot.level||''};
    })};
    throw new Error('Unsupported AI task');
  };
}
