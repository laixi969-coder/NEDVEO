# Vercel 部署与搜索验收

此仓库可由 Vercel 从 GitHub 导入。公开网站在构建时预渲染；工作台为 `/app/`，API 需要持久 PostgreSQL。研究步骤通过 Vercel Queues 执行，定时任务通过 Vercel Cron 派发。Queues 当前为 Vercel 的 Beta 功能，必须先在目标项目确认可用。部署者自行创建和付费管理所选服务。

在 Vercel 项目选择 Node.js 24、Production 分支 `main`，构建命令和输出目录已写入 `vercel.json`。在 Production 环境变量中配置：

| 变量 | 用途 |
| --- | --- |
| `PUBLIC_URL` | 正式站点根地址，例如 `https://nedveo.vercel.app`；必须与实际访问域名一致，不能含路径 |
| `DATABASE_URL` | 托管 PostgreSQL 的连接地址；应用角色需要建表权限，不能为 SUPERUSER 或 BYPASSRLS |
| `VAULT_MASTER_KEY` | 32 字节随机数据的 Base64 编码，用于加密各工作空间模型密钥 |
| `ADMIN_EMAIL` | 首次初始化管理员邮箱 |
| `ADMIN_PASSWORD` | 首次初始化管理员密码，至少 12 字符 |
| `CRON_SECRET` | 至少 32 字符的随机值，用于验证 Vercel Cron 调用 |
| `INVITE_CODE` | 可选；留空不开放邀请码注册 |

可在自己的终端分别使用 `openssl rand -base64 32`、`openssl rand -hex 32` 生成加密密钥和 Cron 密钥，直接填入 Vercel，不要提交仓库或发送到聊天。请独立备份主加密密钥：丢失后无法解密已保存的模型凭据。新部署不会自动继承本机 `.data` 中的账户、报告或模型密钥，需在新工作空间重新配置模型；数据迁移另需安全的迁移流程。

连接数据库时确认允许 TLS、支持持久连接池和应用角色建表。预览环境默认输出 `noindex`，允许爬虫读取公开页面以识别该标记；不要将生产数据库及密钥无意共享到预览环境。若使用其他正式域名，更新 `PUBLIC_URL` 并重新构建，否则 canonical、Host 校验和登录会不匹配。`SEO_INDEXABLE=0` 可关闭正式环境索引。

部署后访问 `/api/health` 检查 API；进入 `/app/?view=integrations` 配置模型并测试连接。建立一次真实研究，确认任务跨采集、核心分析、商业分析阶段完成，核对引用和账本；检查 Cron、队列投递与 Vercel 日志。中断阶段会保守标为失败，避免自动重复可能已计费的请求，复核后再手动重试。Google Search Console 和 Bing Webmaster Tools 验证正式域名后提交 `/sitemap.xml`，检查 canonical、robots、页面抓取及手机布局；收录和 AI 引用不能保证。

当前代码只完成本地模拟及本地 PostgreSQL 验证，实际 Vercel 队列投递、平台构建和真实域名归属必须在部署后验证。
