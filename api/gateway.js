import handler from './[...path].js';

// Vercel's file-based functions do not treat [...path] as a multi-segment route.
// The rewrite passes the original path separately so Express can route it.
export default function gateway(req,res){
 const url=new URL(req.url,'http://localhost');
 const path=url.searchParams.get('__nedveo_path')??req.query?.__nedveo_path;
 if(typeof path!=='string'||!path||path.startsWith('/')||path.includes('..')||/[\u0000-\u001f\\]/.test(path))return res.status(400).json({error:'无效的请求路径'});
 url.searchParams.delete('__nedveo_path');
 req.url='/api/'+path+(url.searchParams.size?'?'+url.searchParams.toString():'');
 return handler(req,res);
}
