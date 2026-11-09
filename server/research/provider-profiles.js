import {z} from 'zod';
import {publicProvider} from './provider.js';
export const profileIds=['domestic','overseas'];
export const profileSchema=z.enum(profileIds);
export const routingSchema=z.object({defaultProfile:profileSchema.default('domestic'),automaticFailover:z.boolean().default(true),allowTimeoutFailover:z.boolean().default(false)});
export function providerBundle(saved){
 if(saved?.version===2&&saved.profiles)return{version:2,profiles:{domestic:saved.profiles.domestic||null,overseas:saved.profiles.overseas||null},routing:routingSchema.parse(saved.routing||{})};
 return{version:2,profiles:{domestic:saved||null,overseas:null},routing:routingSchema.parse({})};
}
export function otherProfile(id){return id==='domestic'?'overseas':'domestic'}
export function fallbackReady(bundle){const a=bundle.profiles.domestic,b=bundle.profiles.overseas;return !!(a?.apiKey&&b?.apiKey&&!(a.baseURL===b.baseURL&&a.model===b.model&&a.apiKey===b.apiKey))}
export function publicProviders(bundle){return{profiles:Object.fromEntries(profileIds.map(id=>[id,publicProvider(bundle.profiles[id])])),routing:{...bundle.routing,ready:fallbackReady(bundle)}}}
export function saveProfile(vault,id,config){const bundle=providerBundle(vault.read());bundle.profiles[id]=config;if(!bundle.profiles[bundle.routing.defaultProfile]?.apiKey&&config?.apiKey)bundle.routing.defaultProfile=id;if(!config&&bundle.routing.defaultProfile===id)bundle.routing.defaultProfile=bundle.profiles[otherProfile(id)]?.apiKey?otherProfile(id):'domestic';vault.write(bundle);return bundle}
export function failoverReason(error,{allowTimeoutFailover=false}={}){
 if(error?.category==='timeout')return allowTimeoutFailover?'timeout':null;
 return ['network','rate_limit','unavailable'].includes(error?.category)?error.category:null;
}
export const reasonLabels={network:'模型服务网络连接失败',rate_limit:'模型服务限流',unavailable:'模型服务暂时不可用',timeout:'模型请求超时，原请求费用可能未知',cooldown:'主服务仍在供应商要求的等待期'};
