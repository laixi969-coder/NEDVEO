# ADR-006：市场信号、竞品官网事实与分阶段商业研究

日期：2026-11-08（America/Los_Angeles）\
状态：已实现本地单用户范围；不代表完整 PRD 的云端／多租户阶段门已通过。

## 背景与范围

用户要求优先补充真实市场来源、竞品及商业判断。原有研究主要依赖论文书目和宏观数据，无法回答谁有预算、现有方案是否足够、应该先验证什么。本轮扩展 FR-01/02/03/05/06/07/10/13/16 的本地实现；不改变原 PRD 的完整生产验收要求。

## 决策

1. 默认市场研究选择 Stack Exchange 问题正文、登记的竞品官网、CFPB 消费投诉、USAspending 合同记录。Crossref / World Bank 仍可手动选择，默认不选。按目标市场限制美国来源，并在源记录和报告保留覆盖边界。
2. Stack Exchange 通过官方 API 获取 `withbody`，按问题规划选择至多两个社区；只处理明确 CC BY-SA 的正文，保留来源、署名、许可、日期和修改说明，移除 HTML、邮箱及长标识符并截断。回答数／求助不代表购买；历史帖子不证明当前仍未解决。被采纳回答仅由 `accepted_answer_id` 判断。
3. CFPB 只保存问题分类、公司、日期和企业回复，不保存邮编、个人叙述。投诉不是裁决、总体发生率或 B2B 需求验证。USAspending 保存合同的采购方、供应商、描述与原始 Award Amount 口径；获授、义务金额不等于现金支付、利润或本产品可得收入。
4. 竞品登记支持官方 HTTPS URL、比较关系、市场与标签。仅提取必要产品事实和少量标价摘录，最多 140 个英文空白分词；不归档整页。先检查 robots，拒绝 noai、需登录／付费、跨域重定向及非 HTML。robots 允许并不授予全文转载许可。动态计算器的零值保守排除，币种／周期／税费未明确则 UNKNOWN，收入和份额为 null。
5. 官网提取器使用独立无凭据客户端，HTTPS、DNS 公网地址校验及连接时固定解析结果；每次重定向重新检查，限制域名、字节和时间。用户的模型密钥不会发给信源网站。
6. 竞品事实变化保留独立快照，产生关联研究的重查事件；历史报告仍固定原有事实。停用竞品或来源清理相关材料并撤回派生研究。每日跟踪保留短问题词和显式竞品选择；本地进程需运行。
7. 真实模型一次性生成更长报告触发 6000 输出额度截断，因此改为两阶段：核心研究及逐字引用校验 → 基于已编号有效主张的商业判断。两阶段都记录用量；任一阶段失败不发布新版本，不自动重试付费请求。同一任务、相同证据摘要、相同方法版本可复用已核验核心，减少重试成本。
8. 商业输出包含五类必要买方角色、切入口、现有方案不足的证据缺口、第一渠道、收入路径、成本变量、指标与停止条件。引用无依据／未知主张会阻断新报告。角色遗漏／重复仅补 UNKNOWN，不发明主体；过程留痕。无效事实原输出隐藏，策略在界面和导出明确标为待验证假设／建议。自动检查仅验证结构和引用完整性，不能替代语义人审。

## 数据与费用

沿用 SQLite records 表，无破坏性迁移。新增 `competitors`、`competitor_snapshots`；既有 signals、analysis_drafts、reports、opportunities 增加可选字段。旧报告可读，重研递增版本。加密配置不变；费用字段全部选填，未填费率时费用 null／未知，真实 token 用量和失败请求保留。

回退：停止服务，备份完整 `.data/`（含需保护的加密配置和本机密钥），恢复旧代码及 lockfile，`npm ci && npm run build`。旧版不提供新商业字段和竞品操作；历史新报告数据保留，不删除数据库。未自动联系客户、发广告、购买第三方数据或确认市场付款。

## 来源依据

- [Stack Exchange advanced search](https://api.stackexchange.com/docs/advanced-search)、[内容许可](https://stackoverflow.com/help/licensing)：官方检索参数及按内容日期的 CC BY-SA 许可。
- [CFPB Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/)：允许使用已发布数据，明确不是统计抽样或全部消费者经历的代表。
- [USAspending 官方 API](https://api.usaspending.gov/docs/endpoints)：公开端点及 spending_by_award；采集时无 API 鉴权。
- [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309)：robots 协议；不是版权许可凭证。
- 实测官网：[A2X](https://www.a2xaccounting.com/shopify/pricing)、[Link My Books](https://linkmybooks.com/pricing)、[Zoho Books 美国页](https://www.zoho.com/us/books/pricing/)。初始档案仅覆盖这一类场景，支持用户继续登记其他行业官网；不宣称扫描全网。

## 验证与限制

测试命令、真实任务和结果见 progress.md。测试覆盖动态零报价、robots/noai、内网 URL、正文脱敏、市场范围、竞品快照、未知主张、角色遗漏、阶段重试缓存及每日跟踪参数。浏览器测试验证竞品登记、未知价格、商业报告和手机无横向溢出。

真实研究使用当前已配置兼容模型；采集成功不等于语义相关。当前英文问答有样本和年代偏差，美国政府合同／消费者投诉不能替代电商小商家的访谈。官网摘录不是完整功能审计，不能由未提及某功能推出竞品做不到。商业判断维持未评级／低可信／R0／L0，下一步仍需有采购权的买方验证。商业许可不明确的平台与付费库不接入。
