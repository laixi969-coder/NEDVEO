import{lookup}from'node:dns/promises';
import{Agent,fetch as publicFetch}from'undici';
import{isPrivate}from'./provider.js';
const agentName='NEDVEO';
export async function validatePublicUrl(input){const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('只允许无凭据的 HTTPS 公开页面');if([...u.searchParams.keys()].some(k=>/token|api.?key|password|secret|auth/i.test(k)))throw Error('公开页面地址不能包含凭据');u.hash='';const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>isPrivate(a.address)))throw Error('禁止访问内网、回环或云元数据地址');return{url:u,addresses};}
export async function fetchPublic(input,{signal,maxBytes=1200000,allowedDomain}={}){
 let current=input;
 for(let redirects=0;redirects<4;redirects++){
  const{url,addresses}=await validatePublicUrl(current);if(allowedDomain&&url.hostname.replace(/^www\./,'')!==allowedDomain)throw Error('页面跳转到了未登记的其他域名，请登记最终官方链接');
  const dispatcher=new Agent({connect:{lookup(host,options,callback){if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family)}}});
  try{const response=await publicFetch(url,{dispatcher,redirect:'manual',headers:{'User-Agent':agentName+'/0.3 (+local commercial research; minimal factual extracts)','Accept':'text/html,text/plain,application/json'},signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(20000)])});
   if([301,302,303,307,308].includes(response.status)){const destination=response.headers.get('location');await response.body?.cancel();if(!destination)throw Error('重定向缺少目标地址');current=new URL(destination,url).toString();continue}
   let bytes=0;const chunks=[];for await(const chunk of response.body||[]){bytes+=chunk.length;if(bytes>maxBytes)throw Error('公开页面超过提取大小上限');chunks.push(chunk)}
   return{status:response.status,url:url.toString(),text:Buffer.concat(chunks).toString('utf8'),headers:response.headers};
  }finally{await dispatcher.close()}
 }
 throw Error('公开页面重定向次数超过上限');
}
