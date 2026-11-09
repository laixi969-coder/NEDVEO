# ADR-002 — 接入真实 API 与可切换模型研究

状态：已实施本地单用户研究链路；生产多租户架构不变更。

用户明确要求继续接入真实信源与 AI 研究，不停留在演示版，并选择 OpenAI／兼容 API。

## 数据源

默认移除预置演示机会（仅 SHOW_DEMO=1 用于回归测试）。登记 Crossref 书目元数据、Stack Exchange 标题／标签／许可／必要署名、World Bank WDI 3 类背景指标。只通过官方 API，限制字段和数量，不抓取论文摘要或付费正文。许可依据、复核日期、到期日、保存期限、采样偏差可查询。许可到期阻断并撤回相关材料；90 天 TTL 清理及撤回派生内容。原文与出处保留，不把题目、社交热度或宏观数据当成交证据。

来源条款：
- Crossref：https://www.crossref.org/documentation/retrieve-metadata/ （元数据可复用，摘要不在本次接入范围）
- Stack Exchange：https://stackoverflow.com/help/licensing （每条保留 API 的 content_license、署名和原文链接；CC BY-SA 引用材料按原许可使用，分析不冒充原作者观点）
- World Bank：https://data.worldbank.org/summary-terms-of-use （WDI，CC BY 4.0 及附加条件，保留归属）

## 任务与模型

持久化任务：queued → planning → collecting → analyzing → verifying → completed；支持 awaiting_provider / paused_budget / insufficient_evidence / failed / canceled。各来源故障独立记录。公开材料在没有模型时也实际采集保存。私人材料必须明确选择并授权本次发送给配置的供应商。

支持 OpenAI Responses 与 Chat Completions 兼容协议，JSON Schema／JSON object／仅提示三种格式；结构由 Zod 验证。模型版本、请求 ID、usage、提示词摘要、方法版本和来源截止时间保留。所有引用必须有现存 evidence_id 与可逐字匹配的摘录；事实观察只能是源文引用。语义支撑没有被自动证明；商业结论标记为推断／假设，并保留人工复核边界。

所有当前自动研究保守设为未评级、低可信、R0、L0；不会从元数据假造付款。研究仍继续输出下一步实验，缺付费不作硬否决。

按 query+market 稳定机会 ID，追加版本化研究快照；来源撤销时清理相关旧快照及派生分析，保留撤回状态。每日跟踪是本地持久化计划，应用运行时执行；不声称离线云端持续运行。

## 密钥、费用与恢复

AES-256-GCM 加密配置，单独 0600 本机密钥文件，API 从不回显密钥。两文件同机并非外部 KMS，不抵御已取得当前用户文件权限的攻击者。API 仅回环监听，Host/Origin 校验，模型 HTTPS 端点拒绝内网与重定向。不提供远程多人权限。

用户配置费率与任务／每日 USD 硬上限。调用前按输入 UTF-8 字节上界与输出 token 额度保守预留；返回 usage 后按配置费率结算。失败或缺失 usage 的调用保留预留成本，不能将失败等同免费。计费请求不自动重试。进程中断后的研究标记失败，须用户明确重试，避免隐性重复付费。

SQLite 保留当前架构，新增业务种类而非替代生产 PostgreSQL/RLS。后续生产认证、RLS、分布式调度及跨市场质量校准仍按原始 PRD 验收。
