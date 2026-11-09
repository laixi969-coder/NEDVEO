import{randomUUID}from'node:crypto';
import{z}from'zod';
const messageSchema=z.object({workspace:z.string().min(1).max(120),task_id:z.string().uuid(),generation:z.string().uuid(),sequence:z.number().int().nonnegative()}).strict();
const stopped=new Set(['completed','failed','canceled','insufficient_evidence','awaiting_provider','paused_budget','awaiting_evidence']);
export function researchMessage(workspace,task){return messageSchema.parse({workspace,task_id:task.id,generation:task.run_generation,sequence:task.job_sequence||0})}
export async function processResearchMessage(runtime,input,{publish}={}){
 const msg=messageSchema.parse(input),engine=runtime.getEngine(msg.workspace),task=engine.get('tasks',msg.task_id);if(!task||task.run_generation!==msg.generation||stopped.has(task.status))return{ignored:true};
 if(msg.sequence<(task.job_sequence||0)){await publish(researchMessage(msg.workspace,task));return{resumed:true}}
 if(msg.sequence!==(task.job_sequence||0))return{ignored:true};
 const owner=randomUUID(),lease='research:'+task.id;
 if(!engine.store.acquireLease(engine.tenant,lease,owner))throw Object.assign(Error('研究阶段仍由另一个执行实例处理'),{retryAfter:30});
 try{
  const current=engine.get('tasks',task.id);if(current.run_generation!==msg.generation||stopped.has(current.status))return{ignored:true};if(msg.sequence<(current.job_sequence||0)){await publish(researchMessage(msg.workspace,current));return{resumed:true}}if(msg.sequence!==(current.job_sequence||0))return{ignored:true};if(current.phase_execution?.state==='running'){
   for(const l of engine.list('ledger'))if(l.task_id===task.id&&l.request_state==='in_flight')engine.put('ledger',{...l,status:l.charged===null?'unpriced_unknown_after_restart':'charge_unknown',request_state:'unknown_after_interrupt'});
   engine.update(task.id,{status:'failed',message:'上次阶段执行中断；为避免重复付费，已停止自动重试，请复核费用后手动重试',phase_execution:{...current.phase_execution,state:'interrupted'},cost:engine.taskCost(task.id)});return{interrupted:true};
  }
  engine.put('tasks',{...current,phase_execution:{state:'running',owner,sequence:msg.sequence,started_at:new Date().toISOString()}});
  await engine.run(task.id,{step:true});
  if(!engine.store.ownsLease(engine.tenant,lease,owner))throw Error('研究阶段租约失效，未继续发布下一阶段');
  const done=engine.get('tasks',task.id),next={...done,job_sequence:msg.sequence+1,phase_execution:{state:'finished',sequence:msg.sequence,finished_at:new Date().toISOString()}};
  engine.put('tasks',next);
  if(!stopped.has(next.status))await publish(researchMessage(msg.workspace,next));
  return{status:next.status,sequence:next.job_sequence};
 }finally{engine.store.releaseLease(engine.tenant,lease,owner)}
}
