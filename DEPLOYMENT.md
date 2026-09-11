# TCMP 用例管理与执行平台 · 服务器部署说明书

本文面向**在一台 Linux 服务器上部署 TCMP**，给出推荐的 Docker Compose 方式与传统 Node 进程方式两套方案，并涵盖配置、数据持久化、备份恢复、升级与排障。

---

## 1. 架构与端口

| 组件 | 说明 | 容器端口 | 默认对外端口 |
|---|---|---|---|
| backend | NestJS API + WebSocket（Socket.IO 协同编辑） | 3000 | 3000 |
| frontend | Vue 3 静态站，Nginx 托管并反向代理后端 | 80 | 5173 |

- 数据库：**SQLite（sql.js，纯 JS 无原生依赖）**，文件位于 `backend/data/tcmp.db`。
- 文件上传：`backend/uploads/`。
- 备份：`backend/data/backups/`（每 30 分钟 + 优雅退出自动滚动备份，保留最近 24 份，启动自检损坏可自动恢复）。

前端 Nginx 已将 `/api/`、`/uploads/`、`/socket.io/`（含 WebSocket 升级）反代到 `backend:3000`，因此**对外只需暴露前端端口即可**。

---

## 2. 环境要求

- Linux 服务器（x86_64），2 vCPU / 2GB 内存起步。
- 方案 A（推荐）：Docker 20.10+ 与 Docker Compose v2。
- 方案 B（裸机）：Node.js 20.x（**注意：勿用 Node 24，vue-tsc 构建工具链与其不兼容**）。

---

## 3. 方案 A：Docker Compose 部署（推荐）

### 3.1 获取代码

```bash
# 将项目上传/克隆到服务器，例如：
cd /opt
# git clone <repo> 用例管理平台   或   scp -r 本地目录 server:/opt/用例管理平台
cd /opt/用例管理平台
```

### 3.2 配置环境变量

编辑根目录 `docker-compose.yml` 中 `backend.environment`，**至少修改以下两项**：

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  - DB_PATH=/app/data/tcmp.db
  - JWT_SECRET=<改成 32 位以上强随机串>      # 生产必须改，否则后端拒绝启动
  - EMAIL_DOMAIN_WHITELIST=yourcompany.com   # 允许注册的邮箱域名（逗号分隔）
```

生成强随机密钥：

```bash
openssl rand -hex 32
```

> Teambition / 钉钉默认为 Mock 模式，无需配置即可运行。若要接真实 Teambition，见第 6 节。

### 3.3 构建并启动

```bash
docker compose up -d --build
```

首次启动会自动执行 seed（写入默认账号与示例数据）。

### 3.4 验证

```bash
docker compose ps
curl -I http://localhost:3000/api/docs        # 后端：应返回 200
curl -I http://localhost:5173                  # 前端：应返回 200
```

浏览器访问 `http://<服务器IP>:5173`，用默认账号登录：

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 系统管理员 | `admin@mech-mind.net` | `Admin@123` |
| 测试员 | `tester@mech-mind.net` | `Tester@123` |

> **登录后请立即修改默认密码。**

### 3.5 数据卷

`docker-compose.yml` 已挂载：

```yaml
volumes:
  - ./backend/data:/app/data        # 数据库 + 备份
  - ./backend/uploads:/app/uploads  # 上传附件
```

这两个目录在宿主机持久化，容器重建不丢数据。**备份策略只需定期归档 `backend/data/` 即可。**

---

## 4. 方案 B：裸机 Node 部署（不使用 Docker）

### 4.1 后端

```bash
cd backend
cp .env.example .env
# 编辑 .env：设置 NODE_ENV=production、强随机 JWT_SECRET、EMAIL_DOMAIN_WHITELIST、DB_PATH
npm ci
npm run build
node dist/seed.js        # 首次：写入默认账号与示例数据
node dist/main.js        # 启动（建议用 pm2/systemd 守护）
```

用 pm2 守护示例：

```bash
npm i -g pm2
pm2 start dist/main.js --name tcmp-backend
pm2 save && pm2 startup
```

### 4.2 前端

```bash
cd frontend
npm ci
npm run build            # 产物在 frontend/dist
```

将 `frontend/dist` 交给 Nginx 托管，并参考仓库 `frontend/nginx.conf` 配置反向代理（务必包含 `/socket.io/` 的 WebSocket 升级块，否则协同编辑会一直“连接中”）。把其中 `http://backend:3000` 改为后端实际地址（如 `http://127.0.0.1:3000`）。

---

## 5. HTTPS（生产建议）

在前端 Nginx 之前再加一层反向代理（如宿主 Nginx / Caddy / Traefik）终止 TLS，并把 WebSocket 升级头透传：

```nginx
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

申请证书可用 `certbot`（Let’s Encrypt）。

---

## 6. 接入真实 Teambition（可选）

默认 `TB_MODE=MOCK`。如需真实提交缺陷到 Teambition，在后端环境变量中设置：

```
TB_MODE=REAL
TB_API_BASE=https://open.teambition.com
TB_OAUTH_REDIRECT_URI=https://<你的域名>/api/v1/auth/tb/callback
# 三选一鉴权（优先级：用户 OAuth > PAT > client_credentials）
TB_ACCESS_TOKEN=...
# 或
TB_APP_ID=...
TB_APP_SECRET=...
TB_ORG_ID=...
```

回调地址需与 Teambition 开放平台控制台中配置一致。

---

## 7. 备份与恢复

应用层已内置滚动备份（`backend/data/backups/tcmp-*.db`，保留 24 份，启动时校验主库损坏会自动从最近有效备份恢复）。

**额外的离线备份建议**（防整机故障）：

```bash
# 每日 02:00 归档 data 目录到异机/对象存储
0 2 * * * tar czf /backup/tcmp-$(date +\%F).tgz -C /opt/用例管理平台/backend data
```

**手工恢复**：停服 → 用某个 `backups/tcmp-*.db` 覆盖 `data/tcmp.db` → 重启。

```bash
docker compose stop backend
cp backend/data/backups/tcmp-2026-06-10_06-30-00.db backend/data/tcmp.db
docker compose start backend
```

---

## 8. 升级

```bash
cd /opt/用例管理平台
# 升级前先备份
tar czf /backup/tcmp-before-upgrade-$(date +%F).tgz -C backend data
git pull            # 或重新上传新代码
docker compose up -d --build
```

数据库 `synchronize: true` 会自动适配实体结构变更；重大版本升级前务必先备份 `data/`。

---

## 9. 常见问题排障

| 现象 | 排查 |
|---|---|
| 协同编辑一直“连接中” | Nginx/反代缺少 `/socket.io/` WebSocket 升级配置（Upgrade/Connection 头） |
| 后端启动即退出 | 生产环境未设置 `JWT_SECRET`，按提示配置强随机密钥 |
| 无法注册 | 邮箱域名不在 `EMAIL_DOMAIN_WHITELIST` 中 |
| 前端构建报 vue-tsc 错误 | Node 版本过高，请用 Node 20.x；`npm run build` 已仅执行 `vite build` |
| 上传失败 | 检查 `backend/uploads` 卷权限；导入文件上限 10MB，Nginx `client_max_body_size` 为 50MB |

查看日志：

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## 10. 安全清单（上线前）

- [ ] 修改 `JWT_SECRET` 为强随机串
- [ ] 修改默认管理员/测试员密码
- [ ] 配置 `EMAIL_DOMAIN_WHITELIST`
- [ ] 启用 HTTPS
- [ ] 配置 `data/` 目录的异机定期备份
- [ ] 服务器防火墙仅放行必要端口（前端端口 / 443）

---

## 11. Windows 双机部署（151 / 127）

内网生产环境使用 `deploy/windows/` 脚本在 Windows 裸机部署，增量发布执行：

```bash
python deploy/windows/deploy_dist_patch.py
```

- **151**：后端 NSSM 服务 `TCMP-Backend`，崩溃自动重启。
- **127**：后端计划任务托管；已部署 `TCMP-Backend-Watchdog`（每 3 分钟检测 3000 端口）。详见 [deploy/windows/部署操作说明.md](deploy/windows/部署操作说明.md) 与 `apply-resilience-127.py`。
- 用户手册、更新点等文档可通过 `deploy/windows/upload-manual.py` 同步到 Nginx 静态目录（若已配置）。
