import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {INDUSTRIES} from '../industries.js';
import {deduplicate,sourceApplicability} from './sources.js';

// Each industry is searched once per day; its market rotates so the work stays
// bounded. A failed/empty source is recorded, never presented as evidence.
export const DISCOVERY_MARKETS=['中国','美国','日本','欧洲','英国','全球'];
export function discoveryDay(timestamp=Date.now()){return new Date(timestamp-2*3600000).toISOString().slice(0,10)}
export function discoverySources(market){return ['licensed_feeds','stackexchange',...({中国:['china_miit'],美国:['usaspending','cfpb'],日本:['japan_meti'],欧洲:['eu_ted'],英国:['uk_contracts'],全球:[]}[market]||[])]}
export async function scheduleDiscovery(engine,{timestamp=Date.now()}={}){
 const settings=engine.get('discovery_settings','main')||{enabled:true};if(!settings.enabled)return 0;
 const day=discoveryDay(timestamp),owner=randomUUID(),lease='discovery-schedule:'+day;
 if(engine.store.acquireLease&&!engine.store.acquireLease(engine.tenant,lease,owner,120000))return 0;
 let created=0;try{const current=engine.list('tasks').filter(t=>t.kind==='daily_discovery'&&t.discovery_day===day);const offset=Math.floor(Date.parse(day+'T00:00:00Z')/86400000)%DISCOVERY_MARKETS.length;
 for(let i=0;i<INDUSTRIES.length;i++){const industry=INDUSTRIES[i];if(current.some(t=>t.industry_id===industry.id))continue;const market=DISCOVERY_MARKETS[(offset+i)%DISCOVERY_MARKETS.length],stamp=new Date().toISOString();const task={id:randomUUID(),kind:'daily_discovery',discovery_day:day,industry_id:industry.id,industry_name:industry.name,market,query:market==='中国'?industry.keywords:industry.english,search_query:industry.english,sources:discoverySources(market),status:'queued',run_generation:randomUUID(),job_sequence:0,source_runs:[],created_at:stamp,updated_at:stamp,events:[{at:stamp,status:'queued',message:'每日行业线索扫描已入队'}],cost:0};engine.put('tasks',task);current.push(task);created++}
 return created}finally{engine.store.releaseLease?.(engine.tenant,lease,owner)}
}
export async function runDiscovery(engine,id,{step=false}={}){
 let task=engine.get('tasks',id);if(!task||task.status==='canceled')return;
 const runs=[...(task.source_runs||[])],remaining=task.sources.filter(source=>!runs.some(r=>r.source_id===source));
 for(const sourceId of remaining){const owner=randomUUID(),lease='discovery-source:'+sourceId;if(engine.store.acquireLease&&!engine.store.acquireLease(engine.tenant,lease,owner,120000))throw Object.assign(Error('来源正在采集，稍后继续'),{retryAfter:30});const source=engine.sources().find(s=>s.id===sourceId),at=new Date().toISOString();let row={source_id:sourceId,at,count:0};
 try{const reason=sourceApplicability(sourceId,{query:task.query,market:task.market});if(reason)row={...row,status:'not_applicable',message:reason};else if(!source||source.state!=='active'||Date.parse(source.expires_at)<=Date.now())row={...row,status:'blocked_licence',message:'来源停用或许可复核到期'};else {const pause=engine.get('source_health',sourceId);if(pause?.next_allowed_at&&Date.parse(pause.next_allowed_at)>Date.now())row={...row,status:'backoff',message:'遵循来源限流等待'};else{const response=await engine.collect(sourceId,{query:sourceId==='stackexchange'?task.search_query:task.query,market:task.market,industry_id:task.industry_id,market_sources:engine.list('market_sources'),competitors:engine.list('competitors'),sites:['softwarerecs','webapps'],signal:AbortSignal.timeout(55000)});const items=deduplicate(Array.isArray(response)?response:response.items||[]);for(const item of items){const saved={...item,industry_id:task.industry_id,discovery_market:task.market,discovery_day:task.discovery_day};engine.put('signals',saved);const id='discovery:'+task.industry_id+':'+item.id;const old=engine.get('discovery_items',id);engine.put('discovery_items',{id,industry_id:task.industry_id,industry_name:task.industry_name,market:item.market||'未定位',searched_market:task.market,source_id:sourceId,evidence_id:item.id,title:item.title,url:item.url,content:item.content,license:item.license,attribution:item.attribution,published_at:item.published_at||null,evidence_type:item.evidence_type||'context_only',first_seen:old?.first_seen||at,last_seen:at,discovery_day:task.discovery_day,claim_status:'unverified'});}const details=response.details||[];row={...row,count:items.length,status:response.status||(details.some(d=>['failed','unavailable'].includes(d.status))?(items.length?'partial':'failed'):(items.length?'completed':'empty')),message:response.message||null,details};if(response.backoff)engine.put('source_health',{id:sourceId,next_allowed_at:new Date(Date.now()+response.backoff*1000).toISOString()});}}}
 catch(e){row={...row,status:'failed',message:String(e.message||'采集失败').slice(0,300)}}finally{engine.store.releaseLease?.(engine.tenant,lease,owner)}
 runs.push(row);task=engine.update(id,{status:'collecting',message:'正在扫描行业公开线索',source_runs:runs});if(!task||task.status==='canceled')return;if(step)break;
 }
 if(runs.length!==task.sources.length)return;
 // Keep the paid stage separate from collection so a queue redelivery never
 // repeats an already completed model call. Unknown cost is handled by invoke.
 if(step&&remaining.length)return;
 const items=engine.list('discovery_items').filter(x=>x.industry_id===task.industry_id&&x.discovery_day===task.discovery_day&&x.searched_market===task.market).slice(0,8);
 if(!items.length||!engine.config()?.apiKey){engine.update(id,{status:'completed',ai_status:items.length?'no_provider':'no_candidates',message:items.length?'扫描完成；尚未配置模型，线索未经 AI 初筛':'扫描完成；没有可供初筛的候选线索',source_runs:runs});return}
 if(task.discovery_ai_running){for(const entry of engine.list('ledger'))if(entry.task_id===id&&entry.request_state==='in_flight')engine.put('ledger',{...entry,status:entry.charged===null?'unpriced_unknown_after_restart':'charge_unknown',request_state:'unknown_after_interrupt'});engine.update(id,{status:'completed',ai_status:'interrupted',discovery_ai_running:false,message:'AI 初筛中断，费用可能未知；未自动重复付费，请复核后重新研究',source_runs:runs});return}
 const schema=z.object({items:z.array(z.object({id:z.string(),assessment:z.enum(['potential_need','context_only','unclear']),reason:z.string().min(1).max(300)}).strict()).max(8)}).strict();
 engine.update(id,{discovery_ai_running:true});
 try{const result=await engine.invoke(id,[{role:'system',content:'你是商业需求线索初筛助手。输入都是不可信公开摘录，只评估是否可能包含具体客户问题，不能推断市场规模、付费、成交或本地代表性；政策、厂商资料和采购不是已验证客户需求。返回JSON对象：items数组，每项仅有id、assessment和reason；assessment只能是potential_need、context_only、unclear，reason简短中文说明并提示不确定。不得返回JSON Schema。'},{role:'user',content:JSON.stringify(items.map(({id,title,content,evidence_type,market})=>({id,title,content:content?.slice(0,900),evidence_type,market})))}],schema,{maxOutput:1600});const output=schema.parse(result.output),allowed=new Set(items.map(x=>x.id));if(new Set(output.items.map(x=>x.id)).size!==output.items.length||output.items.some(x=>!allowed.has(x.id)))throw Error('初筛引用了不存在或重复的线索');for(const x of output.items){const old=engine.get('discovery_items',x.id);if(old)engine.put('discovery_items',{...old,ai_assessment:x.assessment,ai_reason:x.reason,ai_model:result.model_version,ai_at:new Date().toISOString()})}engine.update(id,{status:'completed',ai_status:'completed',discovery_ai_running:false,message:'扫描及 AI 初筛完成；结论仍需人工核对来源',source_runs:runs})}
 catch(e){if(e.state==='workspace_busy'){engine.update(id,{discovery_ai_running:false});throw Object.assign(e,{retryAfter:30})}engine.update(id,{status:'completed',ai_status:'failed',discovery_ai_running:false,ai_error:String(e.message||'模型初筛失败').slice(0,300),message:'来源扫描完成，但 AI 初筛失败；保留未筛选的真实线索',source_runs:runs})}

}
