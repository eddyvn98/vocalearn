const integer=(value,fallback,min,max,name)=>{
  if(value===undefined||value==='')return fallback;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return parsed;
};
const bool=(value,fallback,name)=>{
  if(value===undefined||value==='')return fallback;
  if(value==='true')return true;
  if(value==='false')return false;
  throw new Error(`${name} must be true or false`);
};
const mode=value=>{
  const selected=value||'disabled';
  if(!['disabled','return-token','webhook','resend'].includes(selected))throw new Error('PASSWORD_RESET_MODE must be disabled, return-token, webhook, or resend');
  return selected;
};
function appOrigin(value,production){
  const raw=String(value||'').trim().replace(/\/$/,'');
  if(!raw)return '';
  let parsed;try{parsed=new URL(raw);}catch{throw new Error('APP_ORIGIN must be a valid origin');}
  if(parsed.origin!==raw||parsed.username||parsed.password)throw new Error('APP_ORIGIN must contain only scheme and host');
  if(production&&parsed.protocol!=='https:')throw new Error('Production requires HTTPS APP_ORIGIN');
  return raw;
}
export const DEFAULT_LIMITS=Object.freeze({
  maxRequestBytes:8*1024*1024,
  maxSyncEvents:200,
  maxAccountEvents:50000,
  maxActiveSessions:20,
  authAttempts:20,
  authWindowMs:10*60*1000,
  resetAttempts:6,
  resetWindowMs:30*60*1000
});
export function loadConfig(env=process.env){
  const production=env.NODE_ENV==='production';
  const allowSignup=bool(env.ALLOW_SIGNUP,!production,'ALLOW_SIGNUP');
  const resetMode=mode(env.PASSWORD_RESET_MODE);
  const origin=appOrigin(env.APP_ORIGIN,production);
  const providerUrl=String(env.PASSWORD_RESET_PROVIDER_URL||'').trim();
  const providerToken=String(env.PASSWORD_RESET_PROVIDER_TOKEN||'');
  const resendApiKey=String(env.RESEND_API_KEY||'').trim();
  const resendFrom=String(env.RESEND_FROM||'').trim();
  const aiBaseUrl=String(env.AI_BASE_URL||'').trim().replace(/\/$/,'');
  const aiModel=String(env.AI_MODEL||'').trim();
  const aiApiKey=String(env.AI_API_KEY||'');
  const config={
    production,host:String(env.HOST||'127.0.0.1'),port:integer(env.PORT,3000,1,65535,'PORT'),
    dbPath:String(env.DB_PATH||'./data/vocalearn.sqlite'),appOrigin:origin,allowSignup,
    ai:{baseUrl:aiBaseUrl,model:aiModel,apiKey:aiApiKey,timeoutMs:integer(env.AI_TIMEOUT_SECONDS,30,5,180,'AI_TIMEOUT_SECONDS')*1000},
    reset:{mode:resetMode,appOrigin:origin,providerUrl,providerToken,resendApiKey,resendFrom,
      ttlMs:integer(env.PASSWORD_RESET_TTL_MINUTES,30,10,1440,'PASSWORD_RESET_TTL_MINUTES')*60000},
    limits:{
      maxRequestBytes:integer(env.MAX_REQUEST_BYTES,DEFAULT_LIMITS.maxRequestBytes,1024,32*1024*1024,'MAX_REQUEST_BYTES'),
      maxSyncEvents:integer(env.MAX_SYNC_EVENTS,DEFAULT_LIMITS.maxSyncEvents,1,1000,'MAX_SYNC_EVENTS'),
      maxAccountEvents:integer(env.MAX_ACCOUNT_EVENTS,DEFAULT_LIMITS.maxAccountEvents,1000,1000000,'MAX_ACCOUNT_EVENTS'),
      maxActiveSessions:integer(env.MAX_ACTIVE_SESSIONS,DEFAULT_LIMITS.maxActiveSessions,1,200,'MAX_ACTIVE_SESSIONS'),
      authAttempts:integer(env.AUTH_ATTEMPTS,DEFAULT_LIMITS.authAttempts,1,200,'AUTH_ATTEMPTS'),
      authWindowMs:integer(env.AUTH_WINDOW_SECONDS,DEFAULT_LIMITS.authWindowMs/1000,10,86400,'AUTH_WINDOW_SECONDS')*1000,
      resetAttempts:integer(env.RESET_ATTEMPTS,DEFAULT_LIMITS.resetAttempts,1,100,'RESET_ATTEMPTS'),
      resetWindowMs:integer(env.RESET_WINDOW_SECONDS,DEFAULT_LIMITS.resetWindowMs/1000,60,86400,'RESET_WINDOW_SECONDS')*1000
    }
  };
  if(production){
    if(!origin)throw new Error('Production requires HTTPS APP_ORIGIN');
    if(config.dbPath===':memory:')throw new Error('Production cannot use an in-memory database');
    if(resetMode==='return-token')throw new Error('return-token password recovery is development-only');
    if(allowSignup&&!['webhook','resend'].includes(resetMode))throw new Error('Production signup requires webhook or Resend password recovery');
  }
  if((aiBaseUrl&&!aiModel)||(!aiBaseUrl&&aiModel))throw new Error('AI_BASE_URL and AI_MODEL must be configured together');
  if(aiBaseUrl){let parsed;try{parsed=new URL(aiBaseUrl);}catch{throw new Error('AI_BASE_URL must be a valid URL');}if(!['http:','https:'].includes(parsed.protocol))throw new Error('AI_BASE_URL must use HTTP or HTTPS');}
  if(resetMode==='resend'){
    if(!resendApiKey)throw new Error('Resend password recovery requires RESEND_API_KEY');
    if(!resendFrom)throw new Error('Resend password recovery requires RESEND_FROM');
    if(production&&resendApiKey.length<20)throw new Error('Production Resend API key is invalid');
    if(!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(resendFrom.replace(/^.*<|>.*$/g,'')))
      throw new Error('RESEND_FROM must contain a valid email address');
  }
  if(resetMode==='webhook'){
    if(!providerUrl)throw new Error('Webhook password recovery requires PASSWORD_RESET_PROVIDER_URL');
    let provider;try{provider=new URL(providerUrl);}catch{throw new Error('PASSWORD_RESET_PROVIDER_URL must be a valid URL');}
    if(!['http:','https:'].includes(provider.protocol))throw new Error('Password reset provider must use HTTP or HTTPS');
    if(production&&provider.protocol!=='https:')throw new Error('Production password reset provider must use HTTPS');
    if(production&&providerToken.length<24)throw new Error('Production password reset provider token must be at least 24 characters');
  }
  return config;
}
