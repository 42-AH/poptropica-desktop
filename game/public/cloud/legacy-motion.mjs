// Presentation only: mirror the service's Sky Dive trajectory between replies.
// Winners and accepted jump/chute intentions still come exclusively from PHP.
export function skyDiveFrame(flight, time) {
  if(!flight || !Number.isFinite(time) || !Number.isFinite(flight.fallAt) || !['fall','deployChute','float'].includes(flight.state))return flight;
  const fall=flight.fallAt,cap=1000/900;
  const distance=seconds=>{
    const t=Math.max(0,seconds);
    return t<cap?-300*t+450*t*t:-300*cap+450*cap*cap+700*(t-cap);
  };
  const crashAt=fall+cap+(1860-distance(cap))/700;
  const deployed=Number.isFinite(flight.deployAt)?flight.deployAt+0.2:null;
  const safe=deployed!==null&&deployed<crashAt;
  const landAt=safe?deployed+(1860-distance(deployed-fall))/200:crashAt;
  if(time>=landAt)return {...flight,y:2050,state:safe?'land':'crash'};
  if(safe&&time>=deployed)return {...flight,y:190+distance(deployed-fall)+200*(time-deployed),state:'float'};
  return {...flight,y:190+distance(time-fall)};
}

// A delayed reply must not rewind animated projectiles or race countdowns.
export function advanceMatchClock(previous, serverTime, elapsed) {
  const sample=Number.isFinite(serverTime)?serverTime:0;
  return previous===null?sample:Math.max(sample,previous+Math.max(0,elapsed));
}
