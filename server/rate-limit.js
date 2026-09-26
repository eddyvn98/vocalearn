export function createRateLimiter({limit,windowMs,maxKeys=10000}){
  if(!Number.isInteger(limit)||limit<1||!Number.isFinite(windowMs)||windowMs<1)throw new Error('Invalid rate-limit configuration');
  const buckets=new Map();
  const trim=now=>{
    if(buckets.size<=maxKeys)return;
    for(const [key,value] of buckets){
      if(now-value.startedAt>=windowMs)buckets.delete(key);
      if(buckets.size<=maxKeys)return;
    }
    while(buckets.size>maxKeys)buckets.delete(buckets.keys().next().value);
  };
  return {
    consume(key,now=Date.now()){
      trim(now);
      const prior=buckets.get(key);
      const bucket=!prior||now-prior.startedAt>=windowMs?{startedAt:now,count:0}:prior;
      if(bucket.count>=limit){
        const retryAfterMs=Math.max(1,windowMs-(now-bucket.startedAt));
        return {allowed:false,retryAfterMs};
      }
      bucket.count+=1;buckets.set(key,bucket);
      return {allowed:true,retryAfterMs:0,remaining:Math.max(0,limit-bucket.count)};
    },
    reset(key){buckets.delete(key);},
    size(){return buckets.size;}
  };
}
