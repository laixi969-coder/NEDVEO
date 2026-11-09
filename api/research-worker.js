import{QueueClient}from'@vercel/queue';
import{getVercelRuntime,publishResearch}from'../server/vercel-runtime.js';
import{processResearchMessage}from'../server/queue-jobs.js';
const queue=new QueueClient();
export default queue.handleNodeCallback(async message=>processResearchMessage(await getVercelRuntime(),message,{publish:publishResearch}),{visibilityTimeoutSeconds:390,retry:error=>error.name==='ZodError'?{acknowledge:true}:{afterSeconds:error.retryAfter||60}});
