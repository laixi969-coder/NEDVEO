import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectPublicSource,matchesPublicQuery} from '../server/research/public-sources.js';
import {SOURCE_CATALOG,defaultSourcesForMarket,deduplicate} from '../server/research/sources.js';
import {countEvidenceMix,normalizeReport} from '../server/research/contracts.js';
import {checkResearchSources} from '../server/research/source-check.js';
import {COMPETITOR_SEEDS,selectCompetitors,collectOfficialCompetitors} from '../server/research/competitors.js';

const response=(data,status=200)=>({status,text:typeof data==='string'?data:JSON.stringify(data),headers:new Headers(),url:'https://example.com'});
test('六个市场的默认路由隔离地区来源，新增信源可独立停用',()=>{
 assert.ok(defaultSourcesForMarket('中国').includes('china_miit'));assert.ok(!defaultSourcesForMarket('中国').includes('eu_ted'));
 assert.ok(defaultSourcesForMarket('日本').includes('japan_meti'));assert.ok(defaultSourcesForMarket('欧洲').includes('eu_ted'));assert.ok(!defaultSourcesForMarket('欧洲').includes('uk_contracts'));
 assert.ok(defaultSourcesForMarket('英国').includes('uk_contracts'));assert.ok(defaultSourcesForMarket('美国').includes('federal_register'));
 assert.equal(new Set(SOURCE_CATALOG.map(s=>s.id)).size,SOURCE_CATALOG.length);
});
test('中文产业查询使用受控同义词，不把retail匹配为AI',()=>{
 assert.ok(matchesPublicQuery('人工智能推动电子商务发展','电商及ai落地'));
 assert.ok(matchesPublicQuery('製造業のロボット導入','robot manufacturing'));
 assert.equal(matchesPublicQuery('retail sales','AI'),false);
});
test('中国公告只保留本域元数据，拒绝robots或模板变更',async()=>{
 const opts={query:'robot',market:'中国',fetcher:async url=>url.endsWith('/robots.txt')?response('',404):response('<a href="/jgsj/a/art/2026/art_1.html">机器人标准公开征求意见</a><a href="https://evil.example/art/a">机器人</a><p>Do not collect this body.</p>')};
 const r=await collectPublicSource('china_miit',opts);assert.equal(r.items.length,1);assert.equal(r.items[0].market,'中国');assert.equal(r.items[0].metadata_only,true);assert.equal(r.items[0].content,'机器人标准公开征求意见');assert.equal(r.items[0].published_at,null);
 await assert.rejects(()=>collectPublicSource('china_miit',{...opts,fetcher:async()=>response('User-agent: *\nDisallow: /')}),/robots/);
 await assert.rejects(()=>collectPublicSource('china_miit',{...opts,fetcher:async u=>u.endsWith('/robots.txt')?response('',404):response('<html>Verification challenge</html>')}),/结构未识别/);
});
test('日本Atom保留许可、原始日期、摘要，阻断实体与noai',async()=>{
 const xml='<feed><entry><title>生成AIの産業活用</title><link rel="alternate" href="https://www.meti.go.jp/press/one.html"/><summary>人工知能の活用を支援</summary><updated>2026-11-01T09:00:00+09:00</updated></entry></feed>';
 const r=await collectPublicSource('japan_meti',{query:'AI',market:'日本',fetcher:async u=>u.endsWith('/robots.txt')?response('',404):response(xml)});
 assert.equal(r.items.length,1);assert.equal(r.items[0].evidence_type,'policy_context');assert.match(r.items[0].license,/PDL/);assert.equal(r.items[0].published_at,'2026-11-01T09:00:00+09:00');
 await assert.rejects(()=>collectPublicSource('japan_meti',{query:'AI',market:'日本',fetcher:async u=>u.endsWith('/robots.txt')?response('',404):response('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml)}),/实体/);
 await assert.rejects(()=>collectPublicSource('japan_meti',{query:'AI',market:'日本',fetcher:async u=>u.endsWith('/robots.txt')?response('',404):{...response(xml),headers:new Headers({'x-robots-tag':'noai'})}}),/禁止 AI/);
});
test('TED采用匿名固定端点，查询操作符作为文字处理，估值不升级为成交',async()=>{
 let body;
 const r=await collectPublicSource('eu_ted',{query:'software" OR buyer-country=USA',market:'欧洲',fetcher:async(url,options)=>{assert.equal(url,'https://api.ted.europa.eu/v3/notices/search');body=options.body;return response({notices:[{'publication-number':'123456-2026','title-proc':{eng:['Inventory software']},'buyer-name':{deu:['Hospital']},'buyer-country':['DEU'],'notice-type':'cn-standard','estimated-value-proc':125000,'estimated-value-cur-proc':'EUR','publication-date':'2026-11-01'}]})}});
 assert.equal(body.limit,8);assert.equal((body.query.match(/"/g)||[]).length,2);assert.ok(!body.query.includes('='));assert.equal(r.items[0].buyer_country,'DEU');assert.equal(r.items[0].transaction.basis,'estimated procurement value');assert.equal(r.items[0].transaction.cash_payment_verified,false);assert.equal(r.items[0].evidence_type,'procurement_notice');
 let called=false;const blocked=await collectPublicSource('eu_ted',{query:'software',market:'中国',fetcher:async()=>{called=true}});assert.equal(called,false);assert.equal(blocked.status,'not_applicable');
});
test('英国OCDS明确扫描窗口与截断，取消获授不作为有效合同',async()=>{
 const r=await collectPublicSource('uk_contracts',{query:'software',market:'英国',clock:()=>new Date('2026-11-09T00:00:00Z'),fetcher:async url=>{const u=new URL(url);assert.equal(u.searchParams.get('updatedFrom'),'2026-10-26T00:00:00');assert.equal(u.searchParams.get('limit'),'100');return response({releases:[{id:'098765-2026',ocid:'ocds-test-1',date:'2026-11-08',tag:['awardCancellation'],buyer:{name:'Test Council'},tender:{title:'Inventory software',status:'cancelled',value:{amount:100,currency:'GBP'}},awards:[{status:'active',value:{amount:90,currency:'GBP'}}]}],links:{next:'https://evil.example/should-not-fetch'}})}});
 assert.equal(r.items.length,1);assert.equal(r.items[0].evidence_type,'procurement_notice');assert.equal(r.items[0].transaction.basis,'tender estimate');assert.equal(r.items[0].transaction.cash_payment_verified,false);assert.equal(r.details[0].truncated,true);assert.match(r.details[0].coverage_note,/非全库/);
});
test('联邦公报保留草案类型，FDA零结果404与网络错误分开，不采集个人/GMDN字段',async()=>{
 const federal=await collectPublicSource('federal_register',{query:'software',market:'美国',fetcher:async url=>{assert.equal(new URL(url).searchParams.get('conditions[term]'),'software');return response({results:[{document_number:'2026-1111',title:'Software proposed rule',type:'Proposed Rule',html_url:'https://www.federalregister.gov/documents/test',publication_date:'2026-11-01',abstract:'Proposal for software',agencies:[{name:'Agency'}]}]})}});
 assert.equal(federal.items[0].notice_type,'Proposed Rule');assert.match(federal.items[0].content,/草案不等于/);
 const source=federal.items[0],normalized=normalizeReport({claims:[{id:'C1',statement:'草案不等于已生效规则',kind:'observation',evidence_ids:[source.id],quotes:[{evidence_id:source.id,text:'草案不等于已生效规则'}]},{id:'C2',statement:'Proposal for software',kind:'observation',evidence_ids:[source.id],quotes:[{evidence_id:source.id,text:'Proposal for software'}]}]},[source]);assert.equal(normalized.report.claims[0].quotes.length,0);assert.equal(normalized.report.claims[1].quotes.length,1);
 const fda=await collectPublicSource('fda_recalls',{query:'salmon',market:'美国',fetcher:async url=>{assert.match(url,/food\/enforcement/);return response({results:[{recall_number:'F-100-2026',product_description:'Salmon',recalling_firm:'Test Foods',reason_for_recall:'Potential contamination',classification:'Class II',status:'Ongoing',report_date:'20261108',address_1:'Sensitive address',gmdn_terms:['do not include']}]})}});
 assert.equal(fda.items[0].evidence_type,'safety_recall');assert.equal(fda.items[0].published_at,'2026-11-08');assert.ok(!JSON.stringify(fda.items).includes('Sensitive address'));assert.ok(!JSON.stringify(fda.items).includes('gmdn'));assert.match(fda.items[0].url,/recall_number/);
 const empty=await collectPublicSource('fda_recalls',{query:'salmon',market:'美国',fetcher:async()=>response({error:{code:'NOT_FOUND'}},404)});assert.equal(empty.status,'empty');
 await assert.rejects(()=>collectPublicSource('fda_recalls',{query:'salmon',market:'美国',fetcher:async()=>response({},429)}),e=>e.http_status===429&&e.retry_after>=30);
 const mix=countEvidenceMix([...federal.items,...fda.items]);assert.equal(mix.policy_context,1);assert.equal(mix.safety_recalls,1);assert.equal(mix.problem_reports,0);assert.equal(mix.procurement,0);
});
test('探测不调用模型、不写报告或材料，尊重停用、backoff、缓存与独立失败',async()=>{
 const store=new Map(),calls=[];const engine={sources:()=>SOURCE_CATALOG.map(s=>s.id==='china_miit'?{...s,state:'disabled'}:s),list:kind=>kind==='competitors'?COMPETITOR_SEEDS:[],get:(kind,id)=>store.get(kind+id),put:(kind,row)=>{assert.ok(['source_health','source_checks'].includes(kind));store.set(kind+row.id,row);return row}};
 store.set('source_healthstackexchange',{id:'stackexchange',next_allowed_at:new Date(Date.now()+60000).toISOString()});
 const input={query:'财务 software',market:'中国',sources:['licensed_feeds','china_miit','eu_ted','stackexchange','competitor_pages']};
 const r=await checkResearchSources(engine,input,{collector:async(id)=>{calls.push(id);throw Error('network unavailable')}});
 assert.deepEqual(calls,['competitor_pages']);assert.equal(r.provider_calls,0);assert.equal(r.sources.find(s=>s.id==='china_miit').status,'disabled');assert.equal(r.sources.find(s=>s.id==='stackexchange').status,'backoff');assert.equal(r.sources.find(s=>s.id==='competitor_pages').status,'failed');
 const cached=await checkResearchSources(engine,input,{collector:()=>{throw Error('should not call')}});assert.equal(cached.reused,true);
});
test('多行业本地官网优先且全球候选只作替代，不引入第三国官网',()=>{
 for(const[query,market,expected]of [['农业','中国','dji-agriculture'],['财务','日本','freee'],['hr','欧洲','personio'],['制造','中国','kingdee']]){const selected=selectCompetitors(COMPETITOR_SEEDS,query,[],{market});assert.ok(selected.some(s=>s.id===expected));assert.equal(selected[0].market,market);assert.ok(selected.every(s=>[market,'全球'].includes(s.market)))}
});
test('官网失败继续尝试后续本地及全球候选，逐站点保留失败与市场',async()=>{
 const visited=[],registry=[{id:'local1',name:'Local 1',market:'中国',state:'active',tags:['inventory']},{id:'local2',name:'Local 2',market:'中国',state:'active',tags:['inventory']},{id:'global',name:'Global alternative',market:'全球',state:'active',tags:['inventory']},{id:'us',name:'US only',market:'美国',state:'active',tags:['inventory']}];
 const r=await collectOfficialCompetitors(registry,{query:'inventory',market:'中国',inspect:async c=>{visited.push(c.id);if(c.id==='local1')throw Error('robots denied');return{id:c.id,market:c.market}}});
 assert.deepEqual(visited,['local1','local2','global']);assert.equal(r.items.length,2);assert.equal(r.details[0].status,'unavailable');assert.equal(r.details[2].market,'全球');
});
test('同一采购流程不重复使用旧获授，同一FDA事件不放大为独立事件',async()=>{
 const releases=[{id:'old',ocid:'same',date:'2026-11-01',tag:['award'],tender:{title:'Inventory software'},awards:[{status:'active',value:{amount:5,currency:'GBP'}}]},{id:'new',ocid:'same',date:'2026-11-08',tag:['awardCancellation'],tender:{title:'Inventory software',status:'cancelled'}}];
 const r=await collectPublicSource('uk_contracts',{query:'software',market:'英国',fetcher:async()=>response({releases})});assert.equal(r.items.length,1);assert.equal(r.items[0].origin,'new');assert.equal(r.items[0].evidence_type,'procurement_notice');
 const fda=await collectPublicSource('fda_recalls',{query:'salmon',market:'美国',fetcher:async()=>response({results:[{recall_number:'F-1',event_id:'same-event',product_description:'Salmon A'},{recall_number:'F-2',event_id:'same-event',product_description:'Salmon B'}]})});assert.equal(fda.items.length,2);assert.equal(deduplicate(fda.items).length,1);
});
