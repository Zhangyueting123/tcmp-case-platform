# TCMP · 用例管理与执行平台

基于 [用例管理和执行系统需求规格书.md](用例管理和执行系统需求规格书.md) 的 MVP 实现，覆盖 FR-1 ～ FR-11 主流程。

## 技术栈

- 后端：**NestJS 10 + TypeORM + SQLite**，Swagger 文档，JWT 鉴权
- 前端：**Vue 3 + TypeScript + Vite + Element Plus + Pinia + ECharts**
- 第三方集成：**钉钉 / Teambition / SMTP 均为 Mock 适配器**（接口固定，可替换）

## 一键启动（推荐）

```powershell
docker compose up --build
```

- 前端：http://localhost:5173
- 后端 Swagger：http://localhost:3000/api/docs

默认账号（首次启动会自动 Seed）：

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 系统管理员 | `admin@mech-mind.net` | `Admin@123` |
| 测试员 | `tester@mech-mind.net` | `Tester@123` |

## 本地开发

后端：

```powershell
cd backend
npm install
copy .env.example .env
npm run seed           # 首次：插入默认账号与示例数据
npm run start:dev
```

前端：

```powershell
cd frontend
npm install
npm run dev
```

> 前端默认通过 `vite proxy` 将 `/api` 代理到 `http://localhost:3000`。

## 端到端冒烟流程

1. 用 `admin@mech-mind.net / Admin@123` 登录 → 进入**工作台**
2. 顶部导航进入「项目」→ 打开示例项目「示例项目」
3. "用例池" Tab 已有 3 个示例用例
4. "测试轮次" Tab → "新建轮次"：
   - 基本信息：名 `R1`，版本 `1.0.0`
   - 筛选策略：留空（匹配全部）
   - 分配：勾选两个用户
   - 确认发布 → 后端控制台可看到 Mock 钉钉推送日志
5. 进入"执行"页：左侧选用例，右侧填实际结果，按 `P/F/B/N/T` 快捷打结果
   - 选 **F (Fail)** 会弹出"提交缺陷"对话框 → 提交后联动 Mock Teambition 生成假 `tbTaskId`
6. 返回轮次详情，点"关闭轮次"
7. 点"查看报告"：模块充分性表 + 缺陷汇总，点"导出 Excel"下载带配色的报告
8. 项目 Tab"缺陷看板"：查看 ECharts 图表

## 用例 Excel 导入 / 导出

- 在"用例集"列表点"下载导入模板"获取空白模板
- 在用例集详情页点"导入 Excel"
- 模板字段与 PRD §FR-3 对齐：用例编号 / 子模块 / 子功能 / 测试项 / 用例名称 / 用例等级 / 前置条件 / 测试步骤 / 测试数据 / 预期结果 / 执行方式 / 用例类型 / 标签1-5 / 测试阶段
- 一个 Sheet 对应一个**顶层模块**

## 报告导出配色（与 PRD §FR-10 对齐）

| 区间 | 颜色 | ARGB |
|---|---|---|
| ≥ 90% | 绿 | `FF92D050` |
| 30% – 90% | 黄 | `FFFFFF00` |
| < 30% | 红 | `FFFF0000` |
| 表头 | 浅灰 | `FFD9D9D9` |

## 替换 Mock 适配器为真实集成

适配器在 [`backend/src/integrations/`](backend/src/integrations/)，仅需新增一个实现类并在 [integrations.module.ts](backend/src/integrations/integrations.module.ts) 中替换 `useClass`：

- 钉钉：[`DingtalkAdapter`](backend/src/integrations/dingtalk.adapter.ts) → 实现真实钉钉企业内部应用 `topapi/message/corpconversation/asyncsend_v2`
- Teambition：[`TeambitionAdapter`](backend/src/integrations/teambition.adapter.ts) → 按 PRD §6.5 实现 OAuth2 + `POST /api/projects/{projectId}/tasks`
- 邮件：[`MailAdapter`](backend/src/integrations/mail.adapter.ts) → 接入公司 SMTP（如 `nodemailer`）

## 主要 API（节选，全量见 Swagger）

| 模块 | 端点 |
|---|---|
| 认证 | `POST /api/v1/auth/send-code`、`/login`、`/register`、`GET /auth/me` |
| 工作台 | `GET /api/v1/me/tasks`（待执行轮次 + 待办评审，含 `createdAt`） |
| 用例集 | `GET/POST /api/v1/case-sets`（`keyword` 模糊搜名称）、`/case-sets/:id/import`、`/case-sets/:id/export` |
| 评审 | `GET/POST /api/v1/reviews`、`GET /reviews/:id/export`（导出评审意见 Excel） |
| 项目 | `GET/POST /api/v1/projects`、`DELETE /projects/:id`、`/projects/:id/cases`、`/projects/:id/members` |
| 轮次 | `POST /api/v1/projects/:id/rounds`、`PATCH /rounds/:id`（含重命名）、`/rounds/:id/preview\|publish\|close\|assign` |
| 执行 | `PATCH /api/v1/round-cases/:id/result`、`PATCH /round-cases/:id/case`（修订） |
| 缺陷 | `POST /api/v1/round-cases/:id/defects`、`GET /projects/:id/defects/dashboard` |
| 报告 | `GET /api/v1/rounds/:id/report`、`/rounds/:id/report/export` |

## 已实现 ↔ PRD 映射

| PRD | 状态 |
|---|---|
| FR-1 注册 | ✔ 含邮箱白名单、Mock 验证码、密码强度 |
| FR-2 登录 | ✔ JWT + 5 次错误锁 15 分钟 |
| FR-3 用例集 | ✔ CRUD + 4 级模块树 + Excel 导入/导出 + 版本快照 |
| FR-4 项目 | ✔ CRUD + 成员 + 用例池 + 刷新版本 |
| FR-5 轮次 | ✔ 布尔树筛选 + 4 步向导 + 多人分配 |
| FR-6 钉钉推送 | ✔ Mock 适配器（写库 + 控制台） |
| FR-7 执行 | ✔ 双栏 + 快捷键 P/F/B/N/T + 必填校验 |
| FR-8 执行界面修订用例 | ✔ 同步回用例集 + 版本 +1 + 旧版本快照保留 |
| FR-9 缺陷联动 | ✔ Mock TB 适配器 + 自动回填步骤/版本/用例 |
| FR-10 轮次报告 | ✔ 在线视图 + Excel 导出（含 PRD 配色） |
| FR-11 缺陷看板 | ✔ 4 卡片 + 严重/状态/老化/趋势 4 图表 |
| 用例评审 | ✔ 单集/跨集评审、意见、修订、导出 Excel |
| 工作台 | ✔ 待执行 + 待办评审聚合，登录默认首页 |

## 文档与变更记录

| 文档 | 用途 |
|------|------|
| [CHANGELOG.md](CHANGELOG.md) | **每次代码更新必写**（开发/部署明细） |
| [更新点.md](更新点.md) | 面向使用者的功能更新汇总 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 服务器部署与升级说明 |
| [用户手册.md](用户手册.md) | 平台使用说明 |
| [TCMP对内汇报稿.md](TCMP对内汇报稿.md) | 内部汇报与 onboarding |

## 已知边界（V1 范围外）

- SSO/LDAP、移动端、真实 SMTP、对象存储、APM、i18n
- 评审操作流水表、自动化用例执行、性能测试管理等
- 详见 PRD §12 开放问题、[TCMP设计思路.md](TCMP设计思路.md) 与本仓库设计决策

## 目录结构

```
.
├── backend/                 # NestJS 后端
│   ├── src/
│   │   ├── modules/         # auth users case-sets projects rounds executions defects reports admin
│   │   ├── entities/        # 14 个 TypeORM 实体（与 PRD §5.2 对齐）
│   │   ├── integrations/    # dingtalk / teambition / mail 适配层
│   │   ├── common/          # guards / interceptors / filters / decorators
│   │   ├── main.ts
│   │   └── seed.ts
│   ├── data/                # SQLite 数据库目录
│   ├── uploads/             # 文件上传目录
│   └── Dockerfile
├── frontend/                # Vue3 前端
│   ├── src/
│   │   ├── api/             # axios + API 客户端
│   │   ├── stores/          # Pinia
│   │   ├── views/           # 与 PRD §7 页面对齐
│   │   └── router/
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── 用例管理和执行系统需求规格书.md
```
