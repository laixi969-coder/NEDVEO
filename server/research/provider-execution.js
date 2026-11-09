import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {fingerprint} from '../domain.js';
import {fallbackReady,otherProfile,failoverReason,reasonLabels} from './provider-profiles.js';
const now=()=>new Date().toISOString();
function minBudget(...values){const finite=values.filter(Number.isFinite);return finite.length?Math.min(...finite):null}
function healthId(profile,config){return fingerprint(profile+'|'+config.baseURL+'|'+config.model+'|'+config.apiKey)}

export async function invokeWithFailover(engine,taskId,messages,schema,options={}){
 const owner=randomUUID(),store=engine.store,lease='paid-model-call';
 if(store.acquireLease&&!store.acquireLease(engine.tenant,lease,owner))throw Object.assign(Error('本工作空间有其他模型请求正在执行，请稍后再试'),{state:'workspace_busy',status:409});
 const assertLease=()=>{if(store.ownsLease&&!store.ownsLease(engine.tenant,lease,owner))throw Error('模型执行租约已失效，停止继续请求；请复核费用后重试')};
 try{return await invokeRouted(engine,taskId,messages,schema,{...options,assertLease})}finally{store.releaseLease?.(engine.tenant,lease,owner)}
}

async function invokeRouted(engine,taskId,messages,schema,options={}){
 options.assertLease?.();
 const {signal,config:override}=options,bundle=engine.providers(),task=engine.get('tasks',taskId);
 const selected=options.preferredProfile||task?.provider_profile||bundle.routing.defaultProfile,primary=override||bundle.profiles[selected];
 if(!primary?.apiKey)throw Object.assign(Error('请先配置所选模型服务和密钥'),{state:'awaiting_provider'});
 const routeKey=fingerprint(JSON.stringify(bundle)),sticky=task?.provider_route_key===routeKey&&task.active_provider;
 const start=!override&&sticky?sticky:selected,config=override||bundle.profiles[start],group=randomUUID();
 const attempt=(profile,candidate,attemptNumber)=>invokeAttempt(engine,taskId,messages,schema,{...options,config:candidate,profile,attemptNumber,group,budgetPolicy:primary,assertLease:options.assertLease});
 try{
  const health=!override&&engine.get('provider_health',healthId(start,config));
  if(health?.next_allowed_at&&Date.parse(health.next_allowed_at)>Date.now())throw Object.assign(Error('模型服务仍处于供应商要求的等待期，请稍后再试'),{category:health.category,cooldown:true});
  return await attempt(override?(options.profileId||selected):start,config,1);
 }catch(error){
  if(signal?.aborted)throw error;
  const reason=failoverReason(error,bundle.routing),backupId=otherProfile(start),backup=bundle.profiles[backupId];
  // A task stays on its backup after switching; it never bounces back in the same run.
  const privateMaterial=options.privateMaterial||(task?.evidence_ids?.some(id=>engine.get('evidence',id))||false);
  if(override||sticky||!bundle.routing.automaticFailover||!fallbackReady(bundle)||!reason)throw error;
  if(privateMaterial&&!task?.private_fallback_consent)throw Object.assign(Error(error.message+'；本次包含私人材料，未获准发送至备用服务，未自动切换。'),{category:error.category});
  const health=engine.get('provider_health',healthId(backupId,backup));
  if(health?.next_allowed_at&&Date.parse(health.next_allowed_at)>Date.now())throw Error('主服务调用失败，备用服务也仍在供应商要求的等待期；未发出备用请求');
  const event={at:now(),from_profile:start,to_profile:backupId,reason:error.cooldown?'cooldown':reason,call_group:group};
  if(task){const current=engine.get('tasks',taskId);engine.put('tasks',{...current,provider_switches:[...(current.provider_switches||[]),event],events:[...(current.events||[]),{at:event.at,status:current.status,message:reasonLabels[event.reason]+'，尝试备用模型服务'}]})}
  try{const result=await attempt(backupId,backup,error.cooldown?1:2);if(task){const current=engine.get('tasks',taskId);engine.put('tasks',{...current,active_provider:backupId,provider_route_key:routeKey})}return result}
  catch(backupError){if(signal?.aborted)throw backupError;throw Object.assign(Error('主服务失败后，备用服务也未完成：'+backupError.message),{state:backupError.state,category:backupError.category})}
 }
}

async function invokeAttempt(engine,taskId,messages,schema,{signal,maxOutput,config,profile,group,attemptNumber,budgetPolicy,assertLease}){
 assertLease?.();
 if(signal?.aborted)throw Object.assign(Error('模型调用已取消'),{category:'canceled'});
 const outputLimit=Math.min(maxOutput||config.maxOutput,config.maxOutput),dailyBudget=minBudget(config.dailyBudget,budgetPolicy.dailyBudget),taskBudget=minBudget(config.taskBudget,budgetPolicy.taskBudget);
 const priced=Number.isFinite(config.inputPrice)&&Number.isFinite(config.outputPrice),limited=Number.isFinite(dailyBudget)||Number.isFinite(taskBudget);
 if(limited&&!priced)throw Object.assign(Error('金额上限已设置，但当前服务费率未填写。补齐费率或清空选填金额上限后再试。'),{state:'paused_budget'});
 if(Number.isFinite(dailyBudget)&&engine.usage().unpricedCalls||Number.isFinite(taskBudget)&&engine.taskCost(taskId)===null)throw Object.assign(Error('相关预算内存在费用未知的调用，无法确认预算余额；未继续请求模型。'),{state:'paused_budget'});
 const inputTokens=Buffer.byteLength(JSON.stringify(messages),'utf8')+4096,reserved=priced?(inputTokens*config.inputPrice+outputLimit*config.outputPrice)/1e6:null,taskSpend=engine.taskCost(taskId);
 if(priced&&(Number.isFinite(dailyBudget)&&engine.usage().today+reserved>dailyBudget||Number.isFinite(taskBudget)&&(taskSpend||0)+reserved>taskBudget))throw Object.assign(Error('达到任务或每日预算上限，已暂停外部调用'),{state:'paused_budget'});
 const entry={id:randomUUID(),task_id:taskId,created_at:now(),reserved,charged:reserved,status:priced?'reserved':'unpriced',request_state:'in_flight',model:config.model,provider_profile:profile,provider_endpoint:config.baseURL,call_group:group,attempt:attemptNumber,stage:engine.get('tasks',taskId)?.status||'request',input_price:config.inputPrice??null,output_price:config.outputPrice??null,thinking_mode:config.thinkingMode||'auto'};
 engine.put('ledger',entry);const pending=engine.get('tasks',taskId);if(pending)engine.put('tasks',{...pending,cost:engine.taskCost(taskId)});
 try{
  const result=await engine.model(config,messages,z.toJSONSchema(schema),{signal,maxOutput:outputLimit}),usage=result.usage,known=Number.isFinite(usage?.input_tokens)&&Number.isFinite(usage?.output_tokens),charged=priced?(known?(usage.input_tokens*config.inputPrice+usage.output_tokens*config.outputPrice)/1e6:reserved):null;
  engine.put('ledger',{...entry,charged,request_state:'completed',status:priced?(known?'settled':'usage_unknown'):'unpriced',usage:usage||null,model_version:result.model_version,request_id:result.request_id,diagnostics:result.diagnostics||null});
  engine.put('provider_health',{id:healthId(profile,config),profile,status:'ok',last_at:now()});
  return {...result,provider_profile:profile,provider_endpoint:config.baseURL,call_group:group};
 }catch(error){
  const known=Number.isFinite(error.usage?.input_tokens)&&Number.isFinite(error.usage?.output_tokens);
  engine.put('ledger',{...entry,request_state:'failed',charged:priced&&known?(error.usage.input_tokens*config.inputPrice+error.usage.output_tokens*config.outputPrice)/1e6:reserved,status:known?(priced?'failed_settled':'unpriced_failure'):(priced?'charge_unknown':'unpriced_failure'),usage:error.usage||null,diagnostics:error.diagnostics||null,model_version:error.model_version||config.model,request_id:error.request_id||null,error_category:error.category||'output_or_unknown'});
  if(['rate_limit','unavailable'].includes(error.category)&&error.retry_after>0)engine.put('provider_health',{id:healthId(profile,config),profile,status:'backoff',category:error.category,last_at:now(),next_allowed_at:new Date(Date.now()+error.retry_after*1000).toISOString()});
  throw error;
 }finally{const task=engine.get('tasks',taskId);if(task)engine.put('tasks',{...task,cost:engine.taskCost(taskId)})}
}

export function modelCallHistory(engine,taskId){return engine.list('ledger').filter(l=>l.task_id===taskId).map(l=>({id:l.id,provider_profile:l.provider_profile||null,provider_endpoint:l.provider_endpoint||null,model:l.model_version||l.model,stage:l.stage||null,attempt:l.attempt||1,call_group:l.call_group||null,status:l.request_state,created_at:l.created_at,charged:l.charged,error_category:l.error_category||null}))}
