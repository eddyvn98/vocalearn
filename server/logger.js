const clean=value=>{
  if(value===undefined)return undefined;
  if(value===null||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='string')return value.length>500?`${value.slice(0,500)}...`:value;
  return String(value);
};
export function createLogger({sink=console.log,clock=()=>new Date().toISOString()}={}){
  const write=(level,event,fields={})=>{
    const record={time:clock(),level,event};
    for(const [key,value] of Object.entries(fields)){
      const sanitized=clean(value);
      if(sanitized!==undefined)record[key]=sanitized;
    }
    sink(JSON.stringify(record));
  };
  return {
    info:(event,fields)=>write('info',event,fields),
    warn:(event,fields)=>write('warn',event,fields),
    error:(event,fields)=>write('error',event,fields)
  };
}
export const noopLogger=Object.freeze({info(){},warn(){},error(){}});
