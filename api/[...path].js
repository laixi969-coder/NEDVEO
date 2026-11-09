import{getVercelRuntime}from'../server/vercel-runtime.js';
export default async function handler(req,res){try{const runtime=await getVercelRuntime();return runtime.app(req,res)}catch{res.status(503).json({error:'后台尚未完成部署配置，请检查数据库、加密密钥与管理员环境变量',setup_required:true})}}
