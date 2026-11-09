import{createHash,timingSafeEqual}from'node:crypto';
import{createApplication}from'./app.js';
import{researchMessage}from'./queue-jobs.js';
let singleton;
export function validateVercelEnvironment(env=process.env){
 const missing=['DATABASE_URL','VAULT_MASTER_KEY','ADMIN_EMAIL','ADMIN_PASSWORD','CRON_SECRET'].filter(k=>!env[k]);if(missing.length)throw Error('缺少部署环境变量：'+missing.join(', '));
 const key=Buffer.from(env.VAULT_MASTER_KEY,'base64');if(key.length!==32)throw Error('VAULT_MASTER_KEY 必须是32字节Base64密钥');
 if(env.CRON_SECRET.length<32)throw Error('CRON_SECRET 至少32字符');
 if(!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))throw Error('Vercel 部署必须使用 PostgreSQL 持久存储');
 if(!env.PUBLIC_URL||!env.PUBLIC_URL.startsWith('https://'))throw Error('请设置正式 HTTPS PUBLIC_URL');
}
export async function publishResearch(message){const{send}=await import('@vercel/queue');return send('nedveo-research',message,{idempotencyKey:message.task_id+':'+message.generation+':'+message.sequence,retentionSeconds:86400})}
export function getVercelRuntime(){if(!singleton){validateVercelEnvironment();singleton=createApplication({serverless:true,enqueueResearch:(workspace,task)=>publishResearch(researchMessage(workspace,task))}).catch(e=>{singleton=null;throw e})}return singleton}
export function cronAuthorized(header,secret=process.env.CRON_SECRET){if(!secret||secret.length<32||typeof header!=='string')return false;const hash=v=>createHash('sha256').update(v).digest();return timingSafeEqual(hash(header),hash('Bearer '+secret))}
export async function dispatchScheduled(runtime){let count=0;const workspaces=[...new Set(['local-owner',...runtime.auth.listWorkspaces()])];for(const workspace of workspaces){const e=runtime.getEngine(workspace);await e.schedule();for(const task of e.list('tasks'))if(task.status==='queued'&&task.run_generation){await e.enqueue(task);count++}}return count}
