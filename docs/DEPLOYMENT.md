# NEDVEO 自托管部署与恢复

本手册只准备部署资料，不会替你发布。默认本机模式兼容原 SQLite 和模型配置；生产模式启用登录、独立工作空间、PostgreSQL RLS 和 HTTPS 入口。推荐 Node 24 LTS，单应用实例。当前并非所有 PRD 的长期和试点验收已完成，见 PRD_STATUS.md。

## Docker Compose

需要你自己的域名、服务器、Docker Engine/Compose，域名解析到服务器，80/443 端口可用。

1. 复制 `.env.production.example` 为 `.env.production`，复制 `.env.database.example` 为 `.env.database`。
2. 设置 PUBLIC_URL 为真实 HTTPS 域名。设置 ADMIN_EMAIL 和新的至少12位随机 ADMIN_PASSWORD。首次启动创建管理员及原 `local-owner` 工作空间；以后环境变量不会重置已有密码。
3. 分别生成数据库超级用户密码与应用密码。应用密码建议32位以上十六进制，避免 URL 转义问题。`.env.database` 的 DB_APP_PASSWORD 与 `.env.production` DATABASE_URL 中应用密码必须一致。应用只能用 `nedveo_app`，不能使用 postgres 超级用户。
4. 留空 INVITE_CODE 禁止注册；设置长随机码后，持码者可注册自己的独立私人空间。邀请码不是共享工作空间邀请，不授予管理员权限。当前没有组织协作或 OIDC SSO。
5. 创建 `.env`，仅填 `NEDVEO_DOMAIN=你的域名`。保护三个环境文件权限：`chmod 600 .env .env.production .env.database`。
6. 执行 `docker compose build`，然后 `docker compose up -d`。Caddy 自动申请证书，应用和数据库端口不公开。查看 `docker compose logs --tail=100 app proxy db`。
7. 用浏览器访问 PUBLIC_URL，登录并在账户配置页设置每个空间自己的模型密钥。不要把密钥放进前端构建变量。

首次数据库初始化脚本创建非超级用户角色并允许其在 public schema 创建应用表。应用启动设置 FORCE ROW LEVEL SECURITY，拒绝 SUPERUSER/BYPASSRLS。数据库卷已初始化后更改 `.env.database` 不会自动更改数据库密码，须由数据库管理员处理。

### 可用性检查

- PUBLIC_URL 下 `/api/health` 应返回 authenticated / postgresql-rls。
- 未登录 `/api/state` 应返回401。
- 测试两个独立注册账号，私人材料、模型配置、任务、报告和导出互不可见。
- 登录后检查「行业与运行」、上传材料、研究、同版导出及重启后记录保留。
- PDF 依赖中文字体；容器包含 Noto CJK。非容器环境可设置 PDF_FONT_PATH，TTC 集合同时指定 PDF_FONT_NAME。

当前同一 PostgreSQL 数据库只允许一个任务应用实例，使用会话级 advisory lock 阻止重复工作进程；不要配置 replicas>1 或再开独立 worker。同步记录 API 经专用 I/O Worker 执行 PostgreSQL 事务，每次事务 SET LOCAL 工作空间，写入无异步缓存。该适配适合当前单实例部署；大规模并发需后续异步数据层和任务租约改造。超过16MB的单次记录查询会明确失败，当前没有完整分页。

## 本机运行

`npm ci && npm run build && npm start` 默认只监听127.0.0.1:4311，仍可使用 `.data/nedveo.sqlite` 和已有加密模型配置。公开监听强制 AUTH_REQUIRED=1 和 HTTPS PUBLIC_URL。不要把本机无登录模式经代理暴露公网。

## 数据迁移

先停旧服务并备份完整 `.data/`。保留 SQLite、vault.key、provider.enc、workspaces 子目录；只迁移数据库会丢失模型解密能力。

先启动新数据库，停止新 app，以应用账户的 DATABASE_URL 运行：

```sh
node scripts/migrate-sqlite-postgres.mjs /安全路径/nedveo.sqlite
```

脚本创建受 RLS 保护的记录表，在一个事务内按原插入顺序迁移。目标存在同一键即回滚，不覆盖。原数据库只读。将 vault 文件安全复制到新应用持久卷对应路径（0600），启动服务后验证历史研究版本和模型测试。不要把源数据提交到仓库。

## 备份与恢复

SQLite 本机：先停服务，运行 `node scripts/backup.mjs /安全备份目录`，再启动。脚本使用 VACUUM INTO 产生一致数据库快照，同时复制所有空间 vault 文件。备份同时包含解密密钥，必须加密离线存储。

PostgreSQL：先停止 app，保持 db 运行：

```sh
docker compose exec -T db pg_dump -U postgres -Fc nedveo > nedveo.dump
docker compose run --rm --no-deps -u root -v "$PWD/backups:/backup" app tar czf /backup/vault-data.tar.gz -C /app .data
```

先创建并保护 backups 目录，保存数据库角色配置及环境文件的加密备份。恢复到独立空数据库，先创建相同应用角色，再用 pg_restore 恢复；恢复同一 vault 目录和权限，最后启动 app，检查租户隔离、来源和旧报告。恢复演练在自己的隔离环境完成后再替换生产服务。

升级前做上述备份，固定代码和镜像版本，运行测试及构建。回退须恢复匹配的数据库和 vault 快照；不要直接删除生产卷。镜像标签当前示例是主版本，正式运维可固定镜像摘要。

## 行业来源

行业入口覆盖20大类，并支持继续登记各地区 RSS/Atom。每个来源必须填写许可依据、市场、行业与复核到期时间，明确允许摘要及模型分析；采集只读取摘要、保留署名/日期/许可，不抓全文。到期和撤回来源不会继续采集。来源不足时显示覆盖缺口。

这意味着产品可用于所有行业的研究流程，**不是所有行业所有国家的数据都已接入或取得商用许可**。商业数据库、平台评论、社交网站仍须你取得相应接口或材料授权。不能以“全行业覆盖”掩盖缺少真实材料。

## 验证状态

本机已验证 SQLite、真实临时 PostgreSQL 16 读写与 RLS、两个登录账户的 HTTP 隔离、模型／资料私有边界、同版多格式导出。Docker CLI 可用但本机 Docker daemon 未运行，因此没有宣称镜像构建或公网证书流程已实测通过。请在你的部署环境完成上面的可用性检查。

应用按一个受信任反向代理读取客户端IP用于登录限流；必须保持 app 不直接暴露公网，且由 Caddy 覆盖 X-Forwarded-For。若更改网络拓扑，应同步审查 trust proxy 设置。
