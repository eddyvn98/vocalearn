export function recoveryStatus(state,now=Date.now()){
  const evidence=state&&Array.isArray(state.evidence)?state.evidence:[];
  if(!state||!state.inBook)return {remaining:0,needsRecall:false,nextAfter:null,waitMs:0,usedGames:[]};
  const first=evidence[0]||null;
  return {
    remaining:Math.max(0,2-evidence.length),
    needsRecall:!evidence.some(item=>item.recall),
    nextAfter:first?first.at+600000:null,
    waitMs:first?Math.max(0,first.at+600000-now):0,
    usedGames:evidence.map(item=>item.game)
  };
}
