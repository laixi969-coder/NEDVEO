import{mkdirSync,readFileSync,writeFileSync}from'node:fs';
import{pages,pathFor}from'../site/content.js';import{renderPage,siteConfig,sitemap,robots,llms}from'../site/render.js';
const config=siteConfig(),app=readFileSync('dist/index.html','utf8').replace(/<title>[^<]*<\/title>/,'<title>NEDVEO 苗头 · 私人研究工作台</title>');
mkdirSync('dist/app',{recursive:true});writeFileSync('dist/app/index.html',app);
for(const page of pages)for(const lang of ['zh','en']){const path='dist'+pathFor(page.slug,lang);mkdirSync(path,{recursive:true});writeFileSync(path+'index.html',renderPage(page,lang,config))}
for(const[name,data]of [['sitemap.xml',sitemap(config)],['robots.txt',robots(config)],['llms.txt',llms(config)]])writeFileSync('dist/'+name,data);
writeFileSync('dist/404.html','<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在 · NEDVEO 苗头</title><link rel="stylesheet" href="/site.css"></head><body><main><h1>页面不存在。</h1><p>这个地址没有公开页面。</p><a href="/">返回 NEDVEO 首页 →</a></main></body></html>');
console.log('Public site: '+pages.length*2+' prerendered pages; indexing '+(config.indexable?'enabled':'disabled')+'; canonical '+config.origin);
