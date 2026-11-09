import {test} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {openDatabase} from '../server/db.js';
import {ResearchEngine} from '../server/research/engine.js';
import {providerBundle,publicProviders,saveProfile} from '../server/research/provider-profiles.js';
import {providerHttpError,modelTransportError,callModel,publicProvider} from '../server/research/provider.js';
const domestic={baseURL:'https://domestic.example/v1',apiKey:'domestic-private-key',model:'domestic-model',maxOutput:6000,inputPrice:null,outputPrice:null,dailyBudget:null,taskBudget:null};
const overseas={...domestic,baseURL:'https://overseas.example/v1',apiKey:'overseas-private-key',model:'overseas-model',maxOutput:3000};
const schema=z.object({ok:z.boolean()});
const answer=config=>({output:{ok:true},usage:{input_tokens:10,output_tokens:5},model_version:config.model});
function make({model,routing={},primary=domestic,backup=overseas}={}){
 const store=openDatabase(':memory:');let value={version:2,profiles:{domestic:primary,overseas:backup},routing:{defaultProfile:'domestic',automaticFailover:true,allowTimeoutFailover:false,...routing}};
 const engine=new ResearchEngine(store,{read:()=>value,write:v=>value=v},{autoStart:false,model:model|| (async c=>answer(c))});
 const task=engine.create({query:'公开研究',market:'中国',sources:[]});return{engine,store,task};
}
test('旧配置无损迁移、两套密钥隔离且公共响应不回显，删除一套保留另一套',()=>{
 let saved=domestic;const vault={read:()=>saved,write:v=>saved=v};const legacy=providerBundle(saved);assert.equal(legacy.profiles.domestic.apiKey,domestic.apiKey);assert.equal(legacy.routing.allowTimeoutFailover,false);
 saveProfile(vault,'overseas',overseas);assert.equal(saved.profiles.domestic.apiKey,domestic.apiKey);assert.equal(saved.profiles.overseas.apiKey,overseas.apiKey);assert.equal(publicProviders(saved).routing.ready,true);assert.ok(!JSON.stringify(publicProviders(saved)).includes('private-key'));assert.ok(!JSON.stringify(publicProvider(saved)).includes('private-key'));
 saveProfile(vault,'domestic',null);assert.equal(saved.routing.defaultProfile,'overseas');assert.equal(saved.profiles.overseas.apiKey,overseas.apiKey);assert.equal(publicProviders(saved).routing.ready,false);
});
test('网络失败只切换一次；同任务继续备用，新任务重新先默认；输出额度按备用配置限制',async()=>{
 const calls=[],ctx=make({model:async(c,m,s,o)=>{calls.push([c.model,o.maxOutput]);if(c.model===domestic.model)throw modelTransportError({code:'ECONNRESET'});return answer(c)}});const{engine,store,task}=ctx;
 const result=await engine.invoke(task.id,[],schema,{maxOutput:5000});assert.equal(result.provider_profile,'overseas');await engine.invoke(task.id,[],schema);assert.deepEqual(calls,[[domestic.model,5000],[overseas.model,3000],[overseas.model,3000]]);
 const row=engine.get('tasks',task.id);assert.equal(row.provider_switches.length,1);assert.equal(row.active_provider,'overseas');assert.equal(engine.callHistory(task.id).length,3);assert.equal(engine.list('ledger')[0].charged,null);assert.equal(engine.list('ledger')[1].provider_endpoint,overseas.baseURL);
 const next=engine.create({query:'另一项研究',market:'中国',sources:[]});await engine.invoke(next.id,[],schema);assert.equal(calls[3][0],domestic.model);store.db.close();
});
test('关闭切换、密钥错误、余额不足、未知429和输出错误均不会调用备用',async()=>{
 for(const error of [providerHttpError(401),providerHttpError(403),providerHttpError(404),providerHttpError(429,{code:'insufficient_quota'}),providerHttpError(429),Error('模型输出不是合法 JSON')]){let calls=0;const{engine,store,task}=make({model:async()=>{calls++;throw error}});await assert.rejects(()=>engine.invoke(task.id,[],schema));assert.equal(calls,1);store.db.close()}
 let calls=0;const{engine,store,task}=make({routing:{automaticFailover:false},model:async()=>{calls++;throw modelTransportError({code:'ECONNRESET'})}});await assert.rejects(()=>engine.invoke(task.id,[],schema));assert.equal(calls,1);store.db.close();
});
test('超时只有明确开启后才切换，取消始终不切换',async()=>{
 for(const enabled of [false,true]){let calls=0;const{engine,store,task}=make({routing:{allowTimeoutFailover:enabled},model:async c=>{calls++;if(c.model===domestic.model)throw modelTransportError({name:'TimeoutError'});return answer(c)}});if(enabled)await engine.invoke(task.id,[],schema);else await assert.rejects(()=>engine.invoke(task.id,[],schema));assert.equal(calls,enabled?2:1);store.db.close()}
 const controller=new AbortController();let calls=0;const{engine,store,task}=make({model:async()=>{calls++;controller.abort();throw modelTransportError({code:'ECONNRESET'},controller.signal)}});await assert.rejects(()=>engine.invoke(task.id,[],schema,{signal:controller.signal}));assert.equal(calls,1);store.db.close();
});
test('限流与503按Retry-After冷却，后续任务不再请求冷却中的主服务',async()=>{
 const calls=[];const{engine,store,task}=make({model:async c=>{calls.push(c.model);if(c.model===domestic.model)throw providerHttpError(429,{code:'rate_limit_exceeded',retryAfter:'60'});return answer(c)}});await engine.invoke(task.id,[],schema);const next=engine.create({query:'冷却期间的新任务',sources:[]});await engine.invoke(next.id,[],schema);assert.deepEqual(calls,[domestic.model,overseas.model,overseas.model]);assert.equal(engine.get('tasks',next.id).provider_switches[0].reason,'cooldown');store.db.close();
});
test('私人材料需本次备用服务授权，单独测试或指定模型不会偷偷切换',async()=>{
 for(const consent of [false,true]){let calls=0;const{engine,store,task}=make({model:async c=>{calls++;if(c.model===domestic.model)throw modelTransportError({code:'ECONNRESET'});return answer(c)}});engine.put('evidence',{id:'private',content:'private material'});engine.put('tasks',{...task,evidence_ids:['private'],private_fallback_consent:consent});if(consent)await engine.invoke(task.id,[],schema);else await assert.rejects(()=>engine.invoke(task.id,[],schema),/私人材料/);assert.equal(calls,consent?2:1);store.db.close()}
 let calls=0;const{engine,store,task}=make({model:async()=>{calls++;throw modelTransportError({code:'ECONNRESET'})}});await assert.rejects(()=>engine.invoke(task.id,[],schema,{config:domestic}));assert.equal(calls,1);store.db.close();
});
test('两次调用独立按实际服务费率记账，不能利用备用绕过默认预算',async()=>{
 const p={...domestic,inputPrice:1,outputPrice:2,taskBudget:.02},b={...overseas,inputPrice:3,outputPrice:4,taskBudget:1};let calls=0;
 const{engine,store,task}=make({primary:p,backup:b,model:async c=>{calls++;if(c.model===domestic.model)throw modelTransportError({code:'ECONNRESET'});return answer(c)}});await assert.rejects(()=>engine.invoke(task.id,[],schema),e=>e.state==='paused_budget');assert.equal(calls,1);assert.equal(engine.list('ledger').length,1);assert.equal(engine.list('ledger')[0].status,'charge_unknown');store.db.close();
 const c=make({primary:{...p,taskBudget:1},backup:b,model:async config=>{if(config.model===domestic.model)throw providerHttpError(503);return answer(config)}});await c.engine.invoke(c.task.id,[],schema);assert.equal(c.engine.list('ledger')[1].charged,(10*3+5*4)/1e6);assert.equal(c.engine.list('ledger')[1].input_price,3);c.store.db.close();
});
test('API错误分类不泄露原始供应商文本，识别OpenAI及兼容限流/余额码',async()=>{
 for(const[code,category]of [['rate_limit_exceeded','rate_limit'],['Throttling.RateQuota','rate_limit'],['Throttling.AllocationQuota','rate_limit'],['insufficient_quota','billing'],['organization_usage_limit_exceeded','billing']])await assert.rejects(()=>callModel(domestic,[],{},{endpointValidator:async x=>x,fetcher:async()=>new Response(JSON.stringify({error:{code,message:'do not leak private-key'}}),{status:429})}),e=>e.category===category&&!e.message.includes('private-key'));
 await assert.rejects(()=>callModel(domestic,[],{},{endpointValidator:async x=>x,fetcher:async()=>{throw Object.assign(Error('sensitive'),{cause:{code:'ECONNRESET'}})}}),e=>e.category==='network'&&!e.message.includes('sensitive'));
 assert.equal(providerHttpError(503,{retryAfter:new Date(Date.now()+120000).toUTCString()}).retry_after>=118,true);
});
test('显式选择与报告后续生成保留服务，默认配置变化不能静默改变私人材料接收方',async()=>{
 const seen=[],{engine,store}=make({model:async c=>{seen.push(c.model);return answer(c)}});const task=engine.create({query:'手动海外服务研究',provider_profile:'overseas',sources:[]});await engine.invoke(task.id,[],schema);await engine.invoke('report-followup',[],schema,{preferredProfile:'overseas',privateMaterial:true});assert.deepEqual(seen,[overseas.model,overseas.model]);store.db.close();
});
