// Public endpoints need no provider credentials. Markets describe the data, not the server location.
export const PUBLIC_SOURCE_CATALOG = [
 {id:'china_miit',name:'中国工信部行业公告',kind:'产业政策与标准线索',market_codes:['中国'],license:'官方公告标题、日期、链接等必要事实；不转载新闻正文',terms:'https://www.miit.gov.cn/RRSdy/index.html',scope:'读取官方订阅目录的公告元数据，遵守 robots；最近目录中的关键词候选，非全站搜索，不证明客户需求或付费。'},
 {id:'japan_meti',name:'日本 METI 产业信息',kind:'产业政策与行业动态',market_codes:['日本'],license:'METI 公共数据利用规约 PDL 1.0；保留署名，排除第三方内容',terms:'https://www.meti.go.jp/main/rules.html',scope:'读取经济产业省官方 Atom 的标题、摘要、日期和链接；近期订阅窗口，不证明企业采购或客户需求。'},
 {id:'eu_ted',name:'欧洲 TED 采购公告',kind:'公开采购需求与获授线索',market_codes:['欧洲'],license:'欧盟 TED 公开通知元数据；遵循 Publications Office reuse terms',terms:'https://ted.europa.eu/en/legal-notice',scope:'匿名 Search API 检索公开采购公告；保留公告类型和买方所在国，估算金额不等于成交或现金支付。覆盖 TED 刊登范围，不代表整个欧洲市场。'},
 {id:'uk_contracts',name:'英国 Find a Tender 采购',kind:'公开采购公告与获授',market_codes:['英国'],license:'Open Government Licence v3.0',terms:'https://www.gov.uk/government/publications/open-contracting',scope:'官方 OCDS API 最近14天更新窗口，最多100条公告中按关键词筛选；非全库搜索。区分招标、获授、取消与采购估值，均不等于已付款。'},
 {id:'federal_register',name:'美国 Federal Register',kind:'监管变化与政策窗口',market_codes:['美国'],license:'US government public-domain document metadata',terms:'https://www.federalregister.gov/developers/documentation/api/v1',scope:'按关键词检索联邦公报标题、机构、摘要、类型与日期；草案不等于生效规则，网站版本不代替正式法律文本，仅监管背景。'},
 {id:'fda_recalls',name:'美国 FDA 食品与药品召回',kind:'产品安全与运营风险',market_codes:['美国'],license:'openFDA CC0；只取食品／药品召回字段，不取 GMDN 内容',terms:'https://open.fda.gov/license/',scope:'官方食品／药品召回原因、产品、企业、分类与状态；召回不是用户购买需求或发生率统计，不提供诊疗结论。'}
].map(s=>({...s,markets:s.market_codes.join('／'),state:'active',terms_checked_at:'2026-11-09',expires_at:'2027-02-07T00:00:00Z',allowed_actions:['metadata_research','private_analysis'],retention_days:90}));

export function publicSourceApplicability(id,{query='',market='全球'}) {
 const source=PUBLIC_SOURCE_CATALOG.find(s=>s.id===id);
 if(!source)return null;
 if(market!=='全球'&&!source.market_codes.includes(market))return '该来源覆盖'+source.markets+'，不能用于'+market+'本地结论';
 if(id==='fda_recalls'&&query.trim()&&!/food|drug|pharma|medicine|recall|supplement|grocery|salmon|milk|dairy|meat|allergen|aspirin|ibuprofen|insulin|vaccine|食品|食物|药品|医药|召回|保健|餐饮|pet|宠物|牛奶|三文鱼|疫苗|过敏/i.test(query))return 'FDA 本适配器仅覆盖食品／药品召回，本题未匹配相关行业';
 return null;
}
