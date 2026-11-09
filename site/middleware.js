import{pages,pathFor}from'./content.js';import{renderPage,siteConfig,robots,sitemap,llms}from'./render.js';
export function siteMiddleware(config=siteConfig()){
 const routes=new Map(pages.flatMap(p=>['zh','en'].map(lang=>[pathFor(p.slug,lang),{page:p,lang}])));
 return(req,res,next)=>{if(!['GET','HEAD'].includes(req.method))return next();const u=new URL(req.url,'http://localhost');if(u.pathname==='/'&&u.searchParams.has('view')){res.statusCode=308;res.setHeader('Location','/app/'+u.search);res.setHeader('X-Robots-Tag','noindex, nofollow');return res.end()}
  if(u.pathname.startsWith('/app')||u.pathname.startsWith('/api/')){res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','no-store');return next()}
  const normalized=u.pathname.endsWith('/')?u.pathname:u.pathname+'/';if(routes.has(normalized)&&normalized!==u.pathname){res.statusCode=308;res.setHeader('Location',normalized+u.search);return res.end()}
  const route=routes.get(u.pathname),plain={'/robots.txt':[robots,'text/plain; charset=utf-8'],'/sitemap.xml':[sitemap,'application/xml; charset=utf-8'],'/llms.txt':[llms,'text/plain; charset=utf-8']}[u.pathname];if(!route&&!plain)return next();
  res.setHeader('Content-Type',plain?plain[1]:'text/html; charset=utf-8');res.setHeader('Cache-Control','public, max-age=300');if(!config.indexable)res.setHeader('X-Robots-Tag','noindex, nofollow');res.statusCode=200;return res.end(req.method==='HEAD'?'':plain?plain[0](config):renderPage(route.page,route.lang,config));
 }
}
