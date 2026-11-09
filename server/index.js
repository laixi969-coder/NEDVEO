import express from 'express';
import{allowed}from'./permissions.js';
import{AsyncLocalStorage}from'node:async_hooks';
import{createAuth}from'./auth.js';
import{registerIntelligenceRoutes}from'./intelligence/routes.js';
import{registerWorkspaceRoutes}from'./workspace-routes.js';
import{INDUSTRIES}from'./industries.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { openDatabase } from './db.js';
import { opportunities } from './seed.js';
import { fingerprint } from './domain.js';
import { createVault } from './research/vault.js';
import { ResearchEngine } from './research/engine.js';
import { registerResearchRoutes,invalidateEvidence } from './research/routes.js';
import { publicProvider } from './research/provider.js';
import{publicProviders}from'./research/provider-profiles.js';
import { dirname } from 'node:path';
import{createProject,updateProject}from'./projects.js';
import{renderFormat}from'./research/formats.js';
import{renderReportMarkdown}from'./research/export.js';
const app=express(),tenant='local-owner',context=new AsyncLocalStorage();
const remote=process.env.AUTH_REQUIRED==='1',publicOrigin=process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL).origin:null;
if(remote&&(!publicOrigin||!publicOrigin.startsWith('https://')))throw Error('生产登录模式需要 HTTPS PUBLIC_URL');
if(process.env.HOST&&process.env.HOST!=='127.0.0.1'&&!remote)throw Error('非本机监听必须启用 AUTH_REQUIRED=1');
// Bind before opening the database or recovering jobs. Express 5 passes listen
// errors to the callback; ignoring that error would leave a second worker alive.
const port=Number(process.env.PORT||4311);
await new Promise((resolve,reject)=>{app.listen(port,process.env.HOST||'127.0.0.1',error=>error?reject(error):resolve());});
const rawStore=openDatabase(process.env.DB_PATH),engines=new Map();
const activeTenant=()=>context.getStore()?.workspace||'local-owner';
const store=new Proxy(rawStore,{get(target,key){if(['get','put','list','remove'].includes(key))return(t,...args)=>target[key](t==='local-owner'?activeTenant():t,...args);return target[key]}});
function getEngine(workspace=activeTenant()){if(!engines.has(workspace)){const dir=workspace==='local-owner'?(process.env.VAULT_DIR||'.data'):resolve(process.env.VAULT_DIR||'.data','workspaces',fingerprint(workspace));engines.set(workspace,new ResearchEngine(rawStore,createVault(dir),{tenant:workspace}))}return engines.get(workspace)}
const engine=new Proxy({},{get(_,key){const e=getEngine();return typeof e[key]==='function'?e[key].bind(e):e[key]}});
const auth=createAuth(rawStore,{enabled:remote,secure:true,adminEmail:process.env.ADMIN_EMAIL,adminPassword:process.env.ADMIN_PASSWORD,inviteCode:process.env.INVITE_CODE});
for(const workspace of new Set(['local-owner',...auth.listWorkspaces()]))getEngine(workspace);
const demoOpportunities=process.env.SHOW_DEMO==='1'?opportunities:[];
if(remote)app.set('trust proxy',1);
app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');res.set('X-Frame-Options','DENY');next()});
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');const host=req.get('host')||'',origin=req.get('origin');if(remote){if(host!==new URL(publicOrigin).host)return res.status(403).json({error:'Host 不匹配 PUBLIC_URL'});if(origin&&origin!==publicOrigin)return res.status(403).json({error:'请求来源不匹配'});}else{if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host))return res.status(403).json({error:'本地接口不允许该 Host'});if(origin&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))return res.status(403).json({error:'不允许的请求来源'});}next()});
auth.routes(app);
app.use('/api',(req,res,next)=>{if(req.path==='/health')return next();const user=remote?auth.user(req):{workspace:'local-owner',role:'admin'};if(!user)return res.status(401).json({error:'请登录'});if(remote&&!allowed(user.workspace_role,req.method,req.path))return res.status(403).json({error:'当前工作空间角色无权执行此操作'});context.run(user,next)});
function audit(action,id){store.put(tenant,'audit',randomUUID(),{action,resource:id,at:new Date().toISOString()});}
app.get('/api/health',(_,res)=>res.json({status:'ok',storage:rawStore.storage||'sqlite',mode:remote?'authenticated':'local-only',version:'0.3.0'}));
app.get('/api/state',(_,res)=>res.json({industries:INDUSTRIES,workspace:activeTenant(),deployment:{authenticated:remote},opportunities:[...demoOpportunities,...store.list(tenant,'opportunities')],provider:publicProvider(engine.config()),providers:publicProviders(engine.providers()),sources:engine.sources(),usage:engine.usage(),monitors:engine.list('monitors'),alerts:engine.list('alerts'),demoMode:process.env.SHOW_DEMO==='1',bookmarks:store.list(tenant,'bookmarks').map(x=>x.id),projects:store.list(tenant,'projects'),tasks:store.list(tenant,'tasks'),settings:store.get(tenant,'settings','main')||{role:'独立创业者',locale:'zh',budget:0},evidence:store.list(tenant,'evidence')}));
app.post('/api/bookmarks/:id',(req,res)=>{const id=req.params.id;if(!demoOpportunities.some(o=>o.id===id)&&!store.get(tenant,'opportunities',id))return res.status(404).json({error:'机会不存在'});if(store.get(tenant,'bookmarks',id))store.remove(tenant,'bookmarks',id);else store.put(tenant,'bookmarks',id,{id});audit('toggle_watch',id);res.json({bookmarks:store.list(tenant,'bookmarks').map(x=>x.id)});});
registerResearchRoutes(app,engine,audit);
registerWorkspaceRoutes(app,engine,audit);
registerIntelligenceRoutes(app,engine,audit);
app.post('/api/projects',(req,res)=>{const {opportunity_id,report_version}=z.object({opportunity_id:z.string(),report_version:z.number().int().positive().optional()}).parse(req.body);const {project,created}=createProject(store,tenant,opportunity_id,report_version,demoOpportunities);if(created)audit('project_created',project.id);res.status(created?201:200).json(project)});
app.patch('/api/projects/:id',(req,res)=>{const old=store.get(tenant,'projects',req.params.id);if(!old)return res.status(404).json({error:'项目不存在'});const p=updateProject(old,req.body);store.put(tenant,'projects',p.id,p);audit('project_updated',p.id);res.json(p)});
app.get('/api/reports/:id/export',async(req,res)=>{const version=req.query.version?z.coerce.number().int().positive().parse(req.query.version):null;const o=version?store.get(tenant,'reports',req.params.id+':v'+version):store.get(tenant,'opportunities',req.params.id)||demoOpportunities.find(o=>o.id===req.params.id);if(!o)return res.status(404).json({error:'研究不存在'});const format=z.enum(['md','pdf','docx','pptx']).parse(req.query.format||'md'),result=await renderFormat(o,format);res.type(result.mime).attachment('NEDVEO-'+encodeURIComponent(o.title)+'.'+format).send(result.body)});
app.post('/api/evidence',(req,res)=>{const data=z.object({title:z.string().trim().min(2).max(150),content:z.string().trim().min(20).max(50000),url:z.union([z.literal(''),z.url().refine(v=>/^https?:/.test(v))]).default(''),rights:z.literal(true)}).parse(req.body);const id=fingerprint(data.content);const existing=store.get(tenant,'evidence',id);if(existing)return res.json({...existing,duplicate:true});const evidence={...data,id,claim_type:'unverified',scope:'tenant_private',created_at:new Date().toISOString(),license:'user-authorized'};store.put(tenant,'evidence',id,evidence);audit('evidence_imported',id);res.status(201).json(evidence);});
app.delete('/api/evidence/:id',(req,res)=>{store.remove(tenant,'evidence',req.params.id);invalidateEvidence(engine,req.params.id);audit('evidence_deleted',req.params.id);res.json({ok:true});});
app.patch('/api/settings',(req,res)=>{const data=z.object({role:z.enum(['独立创业者','企业创新团队','投资人']).optional(),locale:z.enum(['zh','en']).optional(),budget:z.number().min(0).max(100000).optional()}).parse(req.body);const updated={...store.get(tenant,'settings','main'),...data};store.put(tenant,'settings','main',updated);res.json(updated);});
app.get('/api/audit',(_,res)=>res.json(store.list(tenant,'audit').reverse().slice(0,50)));
app.use('/api',(_,res)=>res.status(404).json({error:'接口不存在'}));
if(process.env.NODE_ENV==='production'){app.use(express.static(resolve('dist')));app.get('/{*path}',(_,res)=>res.sendFile(resolve('dist/index.html')));}
app.use((err,req,res,next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'输入格式不正确，请检查必填字段与长度',details:err.issues.map(i=>i.path.join('.'))});res.status(err.status||400).json({error:err instanceof SyntaxError?'输入不是有效 JSON':err.message||'操作失败，请稍后重试'});});
console.log('NEDVEO API http://127.0.0.1:'+port);

let closing=false;async function shutdown(){if(closing)return;closing=true;for(const e of engines.values()){clearInterval(e.timer);for(const c of e.controllers.values())c.abort()}setTimeout(()=>{rawStore.db.close();process.exit(0)},1500).unref()}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
