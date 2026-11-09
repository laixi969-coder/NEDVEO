import{randomUUID}from'node:crypto';
import{z}from'zod';
export function createProject(store,tenant,opportunityId,version,demos=[]){
 const current=demos.find(o=>o.id===opportunityId)||store.get(tenant,'opportunities',opportunityId);
 if(!current)throw Object.assign(Error('机会不存在'),{status:404});
 const source=version?store.get(tenant,'reports',opportunityId+':v'+version):current;
 if(!source)throw Object.assign(Error('研究版本不存在'),{status:404});
 if(current.unavailable||source.unavailable)throw Object.assign(Error('研究来源已撤回，请补充证据后重新研究'),{status:409});
 const existing=store.list(tenant,'projects').find(p=>p.opportunity_id===opportunityId);if(existing)return{project:existing,created:false};
 const project={id:randomUUID(),opportunity_id:opportunityId,title:source.title,demo:source.demo,stage:'待验证',hypothesis:source.value,experiment:source.test,result:'',source_version:source.version||null,source_report_id:source.version?opportunityId+':v'+source.version:null,source_as_of:source.as_of||source.date,source_evidence_ids:(source.evidence||[]).map(e=>e.id),created_at:new Date().toISOString()};
 store.put(tenant,'projects',project.id,project);return{project,created:true};
}
export const projectUpdateSchema=z.object({stage:z.enum(['待验证','实验中','已复盘','已归档']).optional(),result:z.string().max(10000).optional()});
export function updateProject(previous,input){const data=projectUpdateSchema.parse(input),next={...previous,...data};if(next.stage==='已复盘'&&!next.result?.trim())throw Object.assign(Error('请先记录实验结果再完成复盘'),{status:422});return{...next,updated_at:new Date().toISOString()};}
