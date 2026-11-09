import {fingerprint} from '../domain.js';
import {researchPreflight} from './preflight.js';
import {collectSource,defaultSourcesForMarket} from './sources.js';

// No provider call and no evidence/report mutation. Repeat probes reuse summaries for 60 seconds.
export async function checkResearchSources(engine,input,{collector=collectSource,signal}={}) {
 const revision={sources:engine.sources().map(s=>[s.id,s.state,s.expires_at]),registries:['competitors','market_sources'].flatMap(kind=>engine.list(kind).map(s=>[s.id,s.state,s.url,s.expires_at,s.market,s.industries,s.tags]))};
 const key=fingerprint(JSON.stringify({input,revision})),prior=engine.get('source_checks',key);
 if(prior&&Date.now()-Date.parse(prior.checked_at)<60000)return {...prior,reused:true};
 const preflight=researchPreflight(engine,input),selected=new Set(input.sources||defaultSourcesForMarket(input.market)),queue=preflight.sources.filter(s=>selected.has(s.id)),results=new Array(queue.length);
 let cursor=0;
 async function worker(){while(cursor<queue.length){const i=cursor++,source=queue[i],start=Date.now();if(signal?.aborted)throw signal.reason;
  if(['disabled','not_applicable','not_configured','not_matched'].includes(source.status)){results[i]={...source,count:0};continue}
  const pause=engine.get('source_health',source.id);if(pause?.next_allowed_at&&Date.parse(pause.next_allowed_at)>Date.now()){results[i]={...source,status:'backoff',count:0,message:'遵守 API Retry-After，稍后检测',next_allowed_at:pause.next_allowed_at};continue}
  try{const r=await collector(source.id,{...input,signal,competitors:engine.list('competitors'),market_sources:engine.list('market_sources')});const items=Array.isArray(r)?r:r.items,details=r.details||[],failed=details.some(d=>['failed','unavailable'].includes(d.status));results[i]={id:source.id,name:source.name,status:failed?(items.length?'partial':'failed'):r.status||(items.length?'completed':'empty'),count:items.length,details,message:r.message||null,elapsed_ms:Date.now()-start};engine.put('source_health',{id:source.id,status:failed?(items.length?'partial':'failed'):items.length?'ok':r.status||'empty',last_at:new Date().toISOString(),count:items.length,...(r.backoff?{next_allowed_at:new Date(Date.now()+r.backoff*1000).toISOString()}:{})});
  }catch(e){if(signal?.aborted)throw e;const reason=e.cause?.code||e.code||'';results[i]={id:source.id,name:source.name,status:'failed',count:0,error:e.message+(reason?' ('+reason+')':''),elapsed_ms:Date.now()-start};engine.put('source_health',{id:source.id,status:'failed',last_at:new Date().toISOString(),error:results[i].error,...(e.http_status===429||e.http_status===503?{next_allowed_at:new Date(Date.now()+(e.retry_after||60)*1000).toISOString()}:{})})}
 }}
 await Promise.all(Array.from({length:Math.min(3,queue.length)},worker));
 const result={id:key,market:input.market,industry_id:input.industry_id||'',query:input.query,checked_at:new Date().toISOString(),sources:results,provider_calls:0,boundary:'仅检测本次关键词与当前网络可读性；未生成报告，数量不是相关性或需求强度，官网档案不保证每次可读'};engine.put('source_checks',result);return result;
}
