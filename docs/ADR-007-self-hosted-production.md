# ADR-007 自托管认证、工作空间隔离、PostgreSQL 与行业连接器

日期：2026-11-08（America/Los_Angeles）

用户明确要求生产能力、跨行业覆盖，并自行部署。本轮交付自托管运行路径，不代部署或注册云服务。

- 保留默认仅回环的 SQLite 兼容路径。公开监听必须 AUTH_REQUIRED=1、HTTPS PUBLIC_URL，精确校验 Host/Origin。密码 scrypt 随机盐慢哈希，登录按来源限流，7天 HttpOnly/Secure/SameSite=Strict 随机会话仅存哈希。注册需邀请码，首位管理员继承 local-owner，后续账号独立空间。
- AsyncLocalStorage 只从服务端会话取得 workspace；请求不可提交 tenant 覆盖。普通记录、任务引擎、provider vault、报告、prompt 与导出均按空间隔离。系统身份记录独立命名空间。当前每账户一个空间，尚不包含团队成员协作／SSO／完整 RBAC。
- PostgreSQL 使用参数化查询和每事务 `set_config(..., true)`；records 强制 RLS，缺上下文默认不可见。应用拒绝超级用户/BYPASSRLS。保留现有同步记录契约，由专用 Worker 执行 pg 连接事务，主线程等待确认，不写后缓存。16MB单响应／30秒上限会明确失败，写入超时不自动重试。该同步桥接有吞吐限制，不能当成分布式异步数据库层。
- 同库 PostgreSQL advisory lock 限定单应用实例，以避免多进程重复执行付费研究。重启恢复仍等待用户确认重试未知费用任务；不是分布式租约。
- 20个行业目录与许可 RSS/Atom 摘要连接器，按行业／市场／到期日过滤。只有实际材料才标已采集，缺口可见；不是购买了全行业数据。跨语言候选不因英文标题规则静默丢弃。来源撤回／到期传播清理。
- 新增研究追问、人工复核、孵化逐级关卡、实际结果检查和六类草稿；不执行外部行动。追问固定用户打开的报告版本，输出只能引用该版本 claim ID。文档导出 MD/PDF/DOCX/PPTX 共用同版 Markdown 渲染；PDF嵌入中文字体。
- PWA只缓存应用外壳和哈希静态资产，API、会话和私有研究不缓存。离线不伪造研究成功。
- 密钥配置原子写文件；数据迁移为一个事务，拒绝覆盖重复键；备份必须保护数据库和全部 vault。

官方技术依据：[Node AsyncLocalStorage](https://nodejs.org/api/async_context.html)、[scrypt](https://nodejs.org/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options)、[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)、[node-postgres事务](https://node-postgres.com/features/transactions)。RLS超级用户绕过问题已通过启动拒绝和真实 SQL 默认拒绝／跨空间写入测试覆盖。

未通过的完整 PRD 项目必须继续标注，不以本 ADR 代替生产安全审查、14日运行、试点或全行业数据授权。见 PRD_STATUS.md、DEPLOYMENT.md 与 progress.md。
