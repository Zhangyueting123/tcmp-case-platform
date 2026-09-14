# CHANGELOG · TCMP 用例管理平台

> **约定：本项目每次代码更新（新功能、修复、重构、部署相关改动）都必须在本文件最上方追加一条记录。** 未写入 CHANGELOG 视为变更未完成交付。
>
> 每条记录建议包含：**标题 + 部署标签**、**变更**、**涉及文件**、**部署动作**、**验证**；若面向使用者，可在末尾链接 [更新点.md](更新点.md) 对应章节。
>
> 分类标签（标题行内标注）：
> `仅需重启后端` / `需重建前端` / `需环境变量变更` / `需 seed` / `需 nginx 重载` / `无需部署` / `已部署 151+127`
>
> 新服务器首装：以 [DEPLOYMENT.md](DEPLOYMENT.md) 为基线，再从上到下把每条的"部署动作"叠加执行。
>
> ⚠️ **sql.js 数据库坑**：本项目用 sql.js（纯内存 + 定时落盘），跑 seed / 任何直接读写 `data/tcmp.db` 的脚本前**必须先 `nssm stop TCMP-Backend`**，跑完再 `nssm start`。否则运行中的服务会用它自己的内存态覆盖脚本写入的数据（表现为"seed 明明跑成功了，接口查还是旧数据"）。

## 2026-09-14

### 2026-09-14 发布批次（视觉 + 鉴权 + 产品名）`已部署 151+127`
- 部署：`python deploy/windows/deploy_dist_patch.py`（127 → 151）；前后端 dist 已同步并重启后端。
- 验证：151 `BACKEND_OK`、两机 `FRONT=200`、`NGINX_OK`；127 重启后端口探测曾 `NOT_LISTENING_YET`，约数秒后 API 应恢复（与历史 CHANGELOG 一致）。

### 产品名统一为「用例管理与执行平台」`需重建前端` `已部署 151+127`
- 变更：顶栏、登录页、浏览器标题与 PRD/README 一致；新增 `constants/product.ts` 集中维护 TCMP 与中文全称。
- 涉及文件：`frontend/src/constants/product.ts`；`Layout.vue`；`AuthLayout.vue`；`index.html`；`main.ts`。
- 部署动作：前端 build 后发布。
- 验证：顶栏与 `/login` 标题均为「TCMP · 用例管理与执行平台」。

### 安全：用户 system-roles / status 仅 SysAdmin 可改 `仅需重启后端` `已部署 151+127`
- 变更：新增 `RolesGuard`；`PATCH /users/:id/system-roles` 与 `PATCH /users/:id/status` 加 `@SysAdminOnly()`；`scripts/platform-smoke-test.mjs` 增加 tester 越权改角色应 403 断言。
- 涉及文件：`common/guards/roles.guard.ts`；`common/decorators.ts`；`app.module.ts`；`modules/users/users.controller.ts`；`scripts/platform-smoke-test.mjs`。
- 部署动作：后端 build 后重启服务。
- 验证：`node scripts/platform-smoke-test.mjs http://localhost:3000` 安全项全 PASS。

### 全站视觉：蓝色品牌主题与页面样式统一 `需重建前端` `已部署 151+127`
- 变更：新增设计令牌（`styles/tokens.css`）并映射 Element Plus 主色；扩展全局页面壳（`page-header`、`content-card`、`stat-tile`、`data-table` 等）；顶栏 TCMP 字标改为纯蓝渐变；登录/注册强调色与主应用统一为品牌蓝；工作台、项目/用例集列表与详情、执行页、轮次/报告、评审、缺陷看板、管理页一轮样式收敛（表格 stripe、卡片与间距统一）。
- 涉及文件：`frontend/src/styles/tokens.css`；`frontend/src/styles.css`；`frontend/src/main.ts`；`frontend/src/views/Layout.vue`；`frontend/src/components/AuthLayout.vue`；各主要 `views/**` 页面。
- 部署动作：前端 build 后 `deploy_dist_patch.py`。
- 验证：本地 `npm run build` 通过；登录页、工作台、项目/用例集、执行、评审、缺陷看板、管理页走查 UI。

## 2026-09-11

### 用例顺序：用例执行与用例集列表（code 升序）一致 `需重建前端` `已部署 151+127`
- 变更：**用例集详情保持后端 `ORDER BY code ASC` 不变**；用例执行页用例行/下一条 PENDING 按 `code` 升序；**左侧模块树同级按 `orderNo` 排序**（与用例集模块树一致，修复按 code 插入导致的子模块乱序）。
- 涉及文件：`utils/caseDisplayOrder.ts`；`Rounds/Execute.vue`（`Detail.vue` 已恢复为接口返回顺序）。
- 部署动作：前端 build 后 `deploy_dist_patch.py`（2026-09-11 修正后重发）。
- 验证：127/151 强刷后 `/case-sets/27` 表格 code 顺序与 `/projects/37/rounds/23/execute` 一致。

### 登录 / 注册页分栏品牌布局 `需重建前端` `已部署 151+127`
- 变更：登录、注册页统一左右分栏（左侧能力示意 + 右侧 Mech-Mind Logo 与平台说明）；Tab 切换登录/注册；共用 `AuthLayout.vue`；Logo 通栏浅灰背景（`#f5f7fa`～`#eef1f6`）。
- 涉及文件：`components/AuthLayout.vue`；`views/Login.vue`；`views/Register.vue`。
- 部署动作：前端 build 后 `deploy_dist_patch.py`（2026-09-11，含 Logo 区二次发布）。
- 验证：127/151 首页 200；`/login`、`/register` 加载 `AuthLayout-*.css/js`。

### 模块树拖动排序/移动 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：用例集详情页、用例执行页左侧模块树支持**拖动**子模块/子功能/测试项（level 2～4）：同级 before/after 调整顺序（`orderNo`），或拖入上一级节点内变更归属（更新 `parentId` 与 `path`）。接口 `POST /case-sets/:id/modules/reposition`。
- 涉及文件：`case-sets.service.ts`（`repositionModule`）、`case-sets.controller.ts`；`composables/useModuleTreeDrag.ts`；`CaseSets/Detail.vue`；`Rounds/Execute.vue`；`rounds.service.ts`（modulePath 带 orderNo）。
- 部署动作：前后端 build 后 `deploy_dist_patch.py`（2026-09-11）。
- 验证：127/151 首页与 `/api/docs` 200；127 重启后约 4s 内端口探测可能仍为 DOWN，稍后 API 正常。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-11

### 用例集：移动到其他用例集项目 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：用例集项目详情页支持将用例集移动到其他「用例集项目」（更新 `groupId`）。单行「移动」+ 多选「移动到…」。接口 `POST /case-sets/:id/move-group`、`POST /case-sets/move-group/batch`。
- 涉及文件：`case-sets.service.ts`；`GroupDetail.vue`；`api/index.ts`。
- 部署动作：前后端 build 后 `deploy_dist_patch.py`（2026-09-11）。
- 验证：同上。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-11

## 2026-09-04

### 顶栏品牌：Mech-Mind 公司 Logo `需重建前端` `已部署 151+127`
- 变更：顶部导航栏「TCMP · 用例管理平台」左侧增加 Mech-Mind 官方 Logo（`frontend/src/assets/mech-mind-logo.png`），深色顶栏下反色为白色显示。
- 涉及文件：`frontend/src/views/Layout.vue`、`frontend/src/assets/mech-mind-logo.png`。
- 部署动作：前端 build 后 `deploy_dist_patch.py`。
- 验证：151/127 前端 200；`/assets/mech-mind-logo-*.png` 可访问。

### 用例集模块树：双击重命名子模块/子功能/测试项 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：用例集详情页左侧模块树，**双击**子模块（level 2）、子功能（level 3）、测试项（level 4）名称可行内编辑；Enter 或失焦保存，Esc 取消。顶层模块（level 1）不可在此重命名。后端 `PATCH /case-sets/modules/:moduleId` 增强：校验非空/≤64 字/同级不重名，并重算该节点及全部子孙的 `path`。
- 涉及文件：`backend/src/modules/case-sets/case-sets.service.ts`（`updateModule()`）；`frontend/src/views/CaseSets/Detail.vue`；`frontend/src/api/index.ts`（`updateModule`）。
- 部署动作：前后端 build 后 `deploy_dist_patch.py`。
- 验证：前后端构建通过。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-04

## 2026-09-03

### 2026-09-03 功能批次发布 `已部署 151+127`
- 变更：汇总发布工作台排序与默认首页、用例集列表搜索/排序/删除权限、子项目删除、轮次双击重命名、评审意见导出 Excel 等 2026-09-03 功能条目。
- 部署动作：本地 `backend/frontend npm run build` → `python deploy/windows/deploy_dist_patch.py`（127 → 151）。
- 验证：127/151 前端 200、Swagger `/api/docs` 200；151 重启后 3000 端口 LISTENING；127 重启后约 4s 内端口未就绪（启动较慢），稍后探测 API 200。

### 文档同步：2026-09-03 功能批次 `无需部署`
- 变更：将 2026-09-03 功能同步至 [用户手册.md](用户手册.md)、[README.md](README.md)、[TCMP对内汇报稿.md](TCMP对内汇报稿.md)、[更新点.md](更新点.md)；[deploy/windows/部署操作说明.md](deploy/windows/部署操作说明.md) 补充 Watchdog 与 502 排障。
- 涉及文件：上述文档。
- 部署动作：无（纯文档）。

### 测试轮次列表：双击轮次名重命名 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：项目详情「测试轮次」Tab 中，双击轮次名称进入行内编辑；Enter 或失焦保存，Esc 取消。复用 `PATCH /rounds/:id` 更新 `name`；后端 `update()` 增加轮次名非空与 ≤64 字校验。
- 涉及文件：`frontend/src/views/Projects/Detail.vue`；`backend/src/modules/rounds/rounds.service.ts`。
- 部署动作：前后端 build 后 `deploy_dist_patch.py`。
- 验证：前后端构建通过。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 评审详情：导出评审意见 Excel `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：评审详情页新增「导出评审意见」按钮，下载 xlsx。Excel 含三个 Sheet：①**评审概要**（标题、状态、用例集、成员、用例/意见数、时间）；②**用例与意见**（每条意见一行，附带对应用例的编号/名称/等级/模块/步骤/预期等完整信息，多条意见重复用例行；无用例意见的行留空意见列）；③**整体意见**（caseId=0 的总体建议）。权限与查看评审详情一致（仅发起者/评审成员）。接口 `GET /reviews/:id/export`。
- 涉及文件：后端 `reviews.service.ts`（`exportExcel()`）、`reviews.controller.ts`；前端 `ReviewDetail.vue`、`api/index.ts`（`reviewApi.exportUrl`）。
- 部署动作：前后端 build 后 `deploy_dist_patch.py`。
- 验证：前后端构建通过；导出文件名含评审 id 与标题。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 项目详情：子项目 / 模块功能测试项目支持删除 `需重建前端` `已部署 151+127`
- 变更：项目详情页「子级项目」Tab 的卡片视图与列表视图均新增「删除」按钮（内置项目除外）。删除子项目前需先删其下全部模块功能测试项目；删除模块功能测试项目前需先清理测试轮次；用例池引用随删除一并清除。复用现有 `DELETE /projects/:id` 接口与后端校验（`E4010`/`E4011`）。
- 涉及文件：`frontend/src/views/Projects/Detail.vue`（`onRemoveChild()`、卡片/列表删除按钮）。
- 部署动作：前端 `npm run build` 后 `deploy_dist_patch.py`。
- 验证：前端构建通过；卡片/列表均有删除入口，确认弹窗按层级提示不同说明。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 删除用例集加权限：仅创建者或系统管理员 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：`DELETE /case-sets/:id` 增加权限校验——仅**该用例集的创建者（`ownerUserId`）**或**系统管理员（`systemRoles` 含 `SysAdmin`）**可删除，其他人返回 403 `E3052`。删除用例集是不可恢复的硬删除（连带用例、版本快照、模块树、评审单与意见），故按最严口径收口。前端用例集列表对无权限者把「删除」置灰并加 tooltip 说明。
- 范围说明：本次**只覆盖「删除整个用例集」**。单条用例删除、批量/全部删除、清空用例集（purge）、从项目用例池移除用例均**未改动**，仍是登录即可操作。
- 涉及文件：后端 `backend/src/modules/case-sets/case-sets.service.ts`（`assertCanDeleteCaseSet()`，`remove()` 增加 user 参数）、`case-sets.controller.ts`（`@CurrentUser()` 透传）；前端 `frontend/src/views/CaseSets/GroupDetail.vue`（`canDelete()` + 置灰 tooltip）。
- 部署动作：
  1. 本地 `backend: npm run build`、`frontend: npm run build`。
  2. `python deploy/windows/deploy_dist_patch.py`。
- 验证：前后端构建通过；`req.user` 由 `JwtAuthGuard` 注入，含 `sub` 与 `systemRoles` 数组，权限判定基于此。
- ⚠️ 上线注意：历史用例集的 `ownerUserId` 是当初的创建者。若某用例集由已离职/其他同事创建，本人将无法再删除，需由系统管理员操作或在管理页给相应账号加 `SysAdmin`。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 用例集列表：名称模糊查询 + 隐藏 ID 列 + 按用例更新时间排序 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：①`GET /case-sets` 新增 `keyword` 查询参数，按名称做大小写不敏感模糊匹配（`LOWER(name) LIKE %kw%`，中文同样生效）。②返回值新增 `lastUpdatedAt`＝该用例集下未删除用例的 `MAX(updatedAt)`，无用例时回退到用例集自身 `updatedAt`；列表默认按该时间倒序（时间相同用 id 兜底）。③用例集项目详情页（`GroupDetail.vue`）去掉「ID」列，工具栏右侧加搜索框（输入防抖 300ms），新增可排序的「更新时间」列，默认倒序；搜索无结果时空态文案区分「无匹配」与「暂无用例集」。
- 注意：sqlite 的 datetime 以**不带时区后缀的 UTC 字符串**存储，`MAX()` 聚合走 `getRawMany` 拿到的是原始字符串，直接 `new Date()` 会被当本地时间解析而偏 8 小时；已加 `parseDbDate()` 显式补 `Z` 后解析。
- 涉及文件：后端 `backend/src/modules/case-sets/case-sets.service.ts`（`list()` 重写 + `parseDbDate()`）、`case-sets.controller.ts`（`keyword` 参数）；前端 `frontend/src/api/index.ts`（`caseSetApi.list` 带 keyword）、`frontend/src/views/CaseSets/GroupDetail.vue`。
- 部署动作：
  1. 本地 `backend: npm run build`、`frontend: npm run build`。
  2. `python deploy/windows/deploy_dist_patch.py`。
- 验证：前后端构建通过；对本地库直查校验 `MAX(updatedAt)` 聚合与 `LOWER(name) LIKE` 匹配（`2d`/`2D`/`相机`/`软件` 均命中），排序后时间换算成本地时区显示正确。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 工作台：待执行用例按轮次创建时间排序 + 进入平台默认落到工作台 `需重建前端` `仅需重启后端` `已部署 151+127`
- 变更：①`GET /me/tasks` 的待执行列表由原先「按待执行数倒序」改为**按轮次创建时间倒序**（新建轮次排最前），时间相同用 roundId 兜底；返回值新增 `createdAt` / `plannedStart` / `plannedEnd`，评审项新增 `createdAt`。②工作台两张表新增「创建时间」列，创建时间与待执行数均可点表头切换排序，默认按创建时间倒序。③登录成功后跳转由 `/projects` 改为 `/workbench`；访问首页（`/`）由根路由 `redirect` 落到工作台。深链（如 `/projects/96`）保持直达，不做强制跳转。
- 涉及文件：后端 `backend/src/modules/tasks/tasks.service.ts`（`timeOf()` + 排序 + 时间字段）；前端 `frontend/src/views/Workbench.vue`（时间列、`formatTime`、`byCreatedAt`）、`frontend/src/views/Login.vue`（登录后跳转）。
- 部署动作：
  1. 本地 `backend: npm run build`、`frontend: npm run build`。
  2. `python deploy/windows/deploy_dist_patch.py`（发布 dist 并重启后端）。
- 验证：`backend/frontend` 构建均通过；工作台待执行列表最新轮次排最前、可点表头切换排序；登录后落在工作台；访问 `http://<ip>/` 落到工作台；直接访问 `/projects/96` 仍能直达该页。
- 使用者说明：[更新点.md](更新点.md) · 2026-09-03

### 127 后端高可用：Watchdog 计划任务 + 开机/失败重试优化 `已部署 127`
- 变更：127 后端用计划任务托管，进程正常 shutdown 后不会自动拉起（本次 502 根因）。新增 `TCMP-Backend-Watchdog` 每 3 分钟检测 3000 端口，未监听则重启 `TCMP-Backend`；主任务开启 `StartWhenAvailable`、开机延迟 30s、失败重试 999 次/1 分钟。
- 涉及文件：`deploy/windows/watchdog-tcmp-backend.ps1`、`setup-backend-resilience-127.ps1`、`apply-resilience-127.py`；远程 `C:\tcmp\watchdog-tcmp-backend.ps1`。
- 部署动作：`python deploy/windows/apply-resilience-127.py`（需远程管理员）。
- 验证：`Get-ScheduledTask TCMP-Backend,TCMP-Backend-Watchdog` 均为 Ready；模拟 shutdown 后 3 分钟内 watchdog 日志出现 Restart OK；`POST /api/v1/auth/login` 返回 201。

---

### 条目模板（复制后填）

```markdown
## YYYY-MM-DD

### 简短标题 `部署标签…`
- 变更：……
- 涉及文件：……
- 部署动作：……
- 验证：……
- 使用者说明：[更新点.md](更新点.md)（可选，有用户可见改动时写）
```

---

## 2026-08-11

### 用例集详情：表格增加「用例名称」+ 左侧树隐藏无用例的子功能/测试项 `已部署 151+127` `需重建前端`
- 变更：①主表在「测试项」后新增「用例名称」列（`title`）。②左侧模块树展示时过滤掉其下无任何用例的**子功能**（level=3）、**测试项**（level=4）节点；模块/子模块仍保留。③若当前筛选节点被过滤，自动清除模块筛选。
- 涉及文件：`frontend/src/views/CaseSets/Detail.vue`（`displayModules`、`filterModulesForDisplay`、`subtreeHasCases`）。
- 部署动作：前端 `npm run build` 后 `deploy_dist_patch.py` 发布到 151/127。
- 验证：用例集详情主表可见用例名称；左侧无对应用例的子功能/测试项不显示；点击有数据的节点筛选正常。

---

### 用例评审增强：多用例集发起 + 评审中调成员/用例 + 整体意见 + 评审中可修订 `已部署 151+127` `需重建前端` `仅需重启后端`
- 变更：
  1. **跨用例集发起评审**：用例集列表页多选后发起；`POST /reviews`（`createMulti`）；`case_reviews` 新增 `caseSetIds`（simple-json）；`listByCaseSet` 兼容多集评审。
  2. **评审中调整**：发起人可在 `IN_REVIEW` 下 `PATCH /reviews/:id/reviewers` 调整成员；`GET /reviews/:id/candidate-cases` + `POST /reviews/:id/cases` + `DELETE /reviews/:id/cases/:cid` 增删用例（更新 `caseIdsSnapshot`）。
  3. **整体意见**：`POST /reviews/:id/comments` 支持 `caseId=0`；`detail()` 返回 `overallComments`；前端独立卡片 + 用例表「意见」列展示全文摘要。
  4. **评审中修订**：前端 `canRevise` 在 `IN_REVIEW`/`REVISING` 且为发起人时开放；多集修订按 `caseObj.caseSetId` 加载模块。
  5. **安全/限流**：`detail`/`listComments`/`candidateCases` 加参与者或发起人校验；批量上限（20 集 / 1 万用例 / 2000 单次添加 / 1 万字符评论）；`setReviewers` 清理已移除成员的 `completedReviewerIds`。
  6. **性能**：`commentMap` 缓存评论；分栏分页默认 100；`activeCaseIdsForSets` 单次 `IN` 查询。
- 涉及文件：
  - 后端：`case-review.entity.ts`；`reviews.service.ts`；`reviews.controller.ts`。
  - 前端：`api/index.ts`（`createMulti`、`candidateCases`、`addCases`、`removeCase`）；`ReviewDetail.vue`；新增 `StartMultiReviewDialog.vue`；`GroupDetail.vue`。
  - 部署：`deploy/windows/deploy_dist_patch.py`（dist 增量部署）；`_ssh_util.py`（支持 `TCMP_SSH_PWD_201127` 等按主机密码）。
- 部署动作：
  1. 本地 `npm run build`（backend + frontend）。
  2. `python deploy/windows/deploy_dist_patch.py 192.168.18.151 192.168.20.127`。
  3. 远程复制 dist → 重启 `TCMP-Backend` 计划任务 → nginx reload。
  4. `caseSetIds` 由 TypeORM `synchronize` 自动加列，无需 seed。
- 验证：151/127 前端入口均为 `index-BA6PKO96.js`；跨集发起评审、`caseSetIds` 落库；评审中增删成员/用例持久化；整体意见 `caseId=0` 可读；非参与者调 `GET /reviews/:id` 返回 403。
- 使用者说明：[更新点.md](更新点.md)（2026-08-07 章节）

---

## 2026-07-28

### 用例评审：评审成员「评审完成」按钮 + 用例列表显示优先级 `需重建前端` `仅需重启后端`
- 变更：①每个评审成员可在评审详情页点「评审完成」标记本人已评审完（可再点撤销）；成员标签完成后变绿并加 ✓，全部成员完成时显示「全部评审完成」。②评审详情用例列表显示用例优先级（分栏左侧新增「等级」列，P0 红/P1 橙/P2 蓝/P3 灰彩色标签；平铺卡片优先级同款配色）。
- 涉及文件：
  - 后端：`backend/src/entities/case-review.entity.ts`（新增 `completedReviewerIds` 列，synchronize 自动加列）；`reviews.service.ts`（新增 `setMyCompletion()`，`detail()` 返回每个成员 `completed` 与 `allReviewersCompleted`）；`reviews.controller.ts`（`PATCH /reviews/:id/complete`）。
  - 前端：`frontend/src/api/index.ts`（`reviewApi.complete`）、`frontend/src/views/CaseReviews/ReviewDetail.vue`（完成按钮/成员完成标记/优先级列）。
- 权限/约束：仅评审成员、仅评审中（`IN_REVIEW`）可标记完成；非成员返回 403。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. `_run_ps.py step-build-backend.ps1`（后端）。
  3. 前端重建：151 用 `rebuild-frontend-clean.ps1`，127 用 `install-build-frontend.ps1`。
  4. `nssm restart TCMP-Backend`（127 用 `restart-backend-task.ps1`）。评审表自动加列，无需 seed。
- 验证：本地成员标记完成返回 200 且 `allReviewersCompleted:true`，detail 中该成员 `completed:true`；非成员标记返回 403；用例列表显示 `priority`。

### 用例评审：修订时「有意见优先」+ 按意见筛选 `需重建前端`
- 变更：评审详情页（`ReviewDetail.vue`）新增一排控件（分栏/平铺均生效）：①「有意见优先」开关——用例列表按「未处理意见数 → 评论总数 → 原顺序」排序，有评审意见的用例排到最前；②筛选按钮组「全部 / 只看有意见 / 只看未处理」。进入修订阶段（`REVISING` 且当前用户是发起者）时「有意见优先」默认自动开启。筛选/排序变化平铺回到第 1 页，无匹配显示空态。
- 涉及文件：`frontend/src/views/CaseReviews/ReviewDetail.vue`（新增 `prioritizeComments`/`commentFilter`/`displayCases`，左侧列表与平铺分页统一基于 `displayCases`）。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. 前端重建：151 用 `rebuild-frontend-clean.ps1`，127 用 `install-build-frontend.ps1`。
  3. 后端无改动，无需重启。
- 验证：修订中评审详情页有意见的用例排最前，「只看未处理」可过滤；标记已处理后该用例未处理数归零、优先级下降。

### 用例评审：发起时钉钉通知评审成员 `已部署 151+127` `仅需重启后端`
- 变更：发起评审（`POST /case-sets/:id/reviews`）成功后，自动给全部评审成员推送钉钉通知（复用全局 `DingtalkAdapter`）——标题「[TCMP] 新的用例评审：<标题>」，正文含发起人、用例集名、用例数，点击直达 `/reviews/:id`。推送为 best-effort：即使钉钉失败也不影响评审发起。生产为 `WEBHOOK` 模式（群机器人 + 按成员手机号 @），本地/未配置为 Mock（仅写 `dingtalk_push_logs` 日志）。
- 涉及文件：`backend/src/modules/reviews/reviews.service.ts`（注入 `DingtalkAdapter`，`create()` 保存后 push）。`IntegrationsModule` 为 `@Global` 且导出 `DingtalkAdapter`，无需改模块 imports。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. `_run_ps.py step-build-backend.ps1`（后端）。
  3. `nssm restart TCMP-Backend`（127 用 `restart-backend-task.ps1`）。前端无改动，无需重建。
- 验证：本地 Mock 下发起评审返回 201，`dingtalk_push_logs` 新增一条 `SUCCESS` 记录，标题为「[TCMP] 新的用例评审：<标题>」，收件人=评审成员 userId。

### 新增：工作台（我的任务）—— 聚合当前用户待办并一键进入 `已部署 151+127` `需重建前端` `仅需重启后端`
- 变更：新增「工作台」页作为登录后首页，聚合当前用户「需要执行的任务」并支持快捷进入：①**待执行用例**——分配给我且未执行（`round_case_instances.assigneeUserId=我 且 result=PENDING`）的用例，按测试轮次聚合（跳过已关闭轮次），点「去执行」直达该轮次执行页；②**待办评审**——我作为评审成员且评审中（待评审）、或我作为发起者且修订中（待修订），点「去评审/去修订」直达评审详情。顶部三张概览卡片（待执行用例数 / 涉及轮次数 / 待办评审数）。
- 涉及文件：后端新增 `backend/src/modules/tasks/`（`tasks.module.ts` / `tasks.controller.ts` / `tasks.service.ts`，接口 `GET /me/tasks`），`app.module.ts` 注册 `TasksModule`；前端新增 `frontend/src/views/Workbench.vue`，改 `api/index.ts`（`taskApi`）、`router/index.ts`（`/workbench` 路由 + 登录后默认跳转改为工作台）、`views/Layout.vue`（导航新增「工作台」置于首位）。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. `_run_ps.py step-build.ps1`（后端）。
  3. `rebuild-frontend-clean.ps1`（前端）。
  4. `nssm restart TCMP-Backend`；前端已重建则 `nssm restart TCMP-Nginx`。
- 验证：`GET /me/tasks` 返回 200，结构 `{executions[], reviews[], summary}`；工作台页正常渲染概览卡片与两类任务区、空状态友好；有待办时「去执行」跳转 `/projects/:pid/rounds/:rid/execute`、「去评审/修订」跳转 `/reviews/:id`。

### 用例集删除：未被项目引用则硬删除，被引用则禁止删除 `已部署 151+127` `需重建前端` `仅需重启后端`
- 变更：`DELETE /case-sets/:id` 由原先的「仅归档（软）」改为**智能删除**——先检查该用例集下的用例是否被项目引用（加入项目用例池 `project_case_refs` 或被测试轮次实例 `round_case_instances` 引用）：被引用则拒绝删除并提示（`E3051`，返回 400，列出被引用数量）；未被引用则**硬删除**该用例集及其全部关联数据（用例、版本快照、模块树、评审单与评审意见、用例集行），单事务完成、不可恢复。
- 涉及文件：`backend/src/modules/case-sets/case-sets.service.ts`（新增 `remove()`，注入 `CaseReview`/`CaseReviewComment` 仓库）、`case-sets.controller.ts`（`DELETE :id` 改调 `remove`）、`case-sets.module.ts`（forFeature 增加评审实体）；`frontend/src/views/CaseSets/GroupDetail.vue`（删除确认文案说明「未引用彻底删除/已引用无法删除」+ 捕获后端错误提示）。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. `_run_ps.py step-build.ps1`（后端）。
  3. `rebuild-frontend-clean.ps1`（前端）。
  4. `nssm restart TCMP-Backend`；前端已重建则 `nssm restart TCMP-Nginx`。
- 验证：自动化脚本 7/7 通过——建两个用例集，其一加入 level=3 项目用例池后删除返回 400 `E3051` 且用例集仍在；未引用的用例集删除返回 200 且 `GET` 变 404；撤回引用后可正常删除。

### 新增：用例评审（Review）功能 `已部署 151+127` `需重建前端` `仅需重启后端`
- 变更：在用例集内提供用例评审闭环。用例集 Owner 对【整集/某模块子树】发起评审并指定评审成员 → 评审成员在评审详情页对范围内用例逐条留评论意见 → Owner 手动「结束评审」进入修订 → Owner 按意见直接修订原用例（复用 `cases.service.update` 生成新版本快照）、可勾选评论「已处理」→ 「关闭评审」归档。评论/结束/关闭/成员调整均按 Owner/成员做后端权限校验。「我的评审」入口在顶部导航栏，展示我发起 + 我参与的评审。本期不接钉钉通知。
- 涉及文件：
  - 后端新增：`backend/src/entities/case-review.entity.ts`、`case-review-comment.entity.ts`（并在 `entities/index.ts` 注册）；`backend/src/modules/reviews/`（`reviews.module.ts` / `reviews.controller.ts` / `reviews.service.ts`）；`app.module.ts` 注册 `ReviewsModule`。
  - 新增接口：`POST/GET /case-sets/:id/reviews`、`GET /reviews/mine`、`GET /reviews/:id`、`POST/GET /reviews/:id/comments`、`PATCH /reviews/:id/comments/:cid/resolve`、`PATCH /reviews/:id/end-review`、`PATCH /reviews/:id/close`、`PATCH /reviews/:id/reviewers`。用例修订复用现有 `PATCH /cases/:id`。
  - 前端新增：`frontend/src/views/CaseReviews/StartReviewDialog.vue`、`ReviewDetail.vue`、`MyReviews.vue`；改 `api/index.ts`（`reviewApi`）、`router/index.ts`（`/my-reviews`、`/reviews/:id`）、`views/Layout.vue`（导航「我的评审」）、`views/CaseSets/Detail.vue`（「发起评审」按钮仅 Owner 可见 +「评审记录」弹窗）。
  - 新增数据表（sql.js `synchronize` 自动建）：`case_reviews`、`case_review_comments`。
- 部署动作：
  1. `_transfer.py` 重传代码。
  2. `_run_ps.py step-build.ps1`（后端）。
  3. `rebuild-frontend-clean.ps1`（前端，停 nginx→删 dist→build→校验 index.html→起 nginx）。
  4. `nssm restart TCMP-Backend`（127 用计划任务 `restart-backend-task.ps1`）；前端已重建则 `nssm restart TCMP-Nginx`。
  5. 无需 seed；表由 `synchronize` 自动创建。
- 验证：以 Owner 账号在用例集详情「发起评审」（整集/模块两种范围）；非 Owner 看不到「发起评审」按钮且直接调接口返回 403；评审成员在评审详情逐条留评论、非成员被拒；Owner「结束评审」后评论区置只读，修订一条用例后该用例 `currentVersion+1` 且 `case_versions` 新增快照；Owner 勾「已处理」、「关闭评审」后归档只读；顶部「我的评审」同时展示我发起与我参与的记录。

---

## 2026-07-23

### 执行界面用例树：文字显示不全 → 加横向滚动条 + 面板宽度可拖拽 `已部署 151` `需重建前端`
- 现象：轮次执行页左侧用例树，模块名/用例标题过长时被省略号截断，看不全。
- 修复（`Rounds/Execute.vue`）：
  - 树节点文字改为不换行、去掉省略号截断，超出时 `tree-wrapper` 出现横向滚动条可滚动查看完整内容。
  - 用例树与详情区之间加拖拽条，可左右拖动调节左侧面板宽度（200–900px），宽度持久化到 `localStorage`（`tcmp_exec_tree_width`）下次自动恢复。

---

## 2026-07-16

### 用例编辑弹窗：多选 + 复制选中行（可粘贴到 Excel/其它页面） `已部署 151+127` `需重建前端`
- `SubtreeEditDialog.vue`：每行加复选框、表头全选/半选；工具栏「复制选中行」把勾选行复制成 Excel 兼容 TSV 写入系统剪贴板，可粘贴到 Excel、其它用例集编辑弹窗或任意页面。
- 粘贴解析升级为支持带引号/换行的单元格（RFC4180 风格），多行「测试步骤」等复制后 Ctrl+V 能正确还原不串行。列顺序与「复制表头」一致。


### 修复：导出 Excel 报 500（sheet 名含非法字符） `已部署 151+127` `需重启后端`
- 现象：点「导出 Excel」返回 500 `Sheet name cannot contain : \ / ? * [ ]`，无法导出。
- 根因：`import-export.service.exportExcel` 以顶层模块名建 sheet，而模块名含 Excel 禁止字符（如「AI分类（正反/有无）」含 `/`）。
- 修复：sheet 名净化（`: \ / ? * [ ]` → `_`）+ 截断 31 字符 + 去重。实测 case set 26（1190 条 / 3 sheet）导出成功。


### 修复：在子节点管理弹窗里新增用例会生成错误的顶层模块 `已部署 151+127` `需重建前端`
- 现象：在深层子节点打开「管理该节点下的用例」并新增/插入行、保存后，树上多出一个以该子节点名为顶层的重复结构（如把「配置向导」挂成了顶层模块）。
- 根因：`SubtreeEditDialog.vue` 的 `buildModulePath` 对新增行用 `props.nodeName`（点开的子节点名）当一级主节点。应使用该子树的顶层模块 `nodePath[0]`。
- 修复：root 取 `_origRoot`(已有用例) → `nodePath[0]`(顶层模块) → nodeName 兜底。并已在 151 手工修正误生成的数据（用例移回正确路径、删除空的错误模块）。


### 修复：保存时按顺序重排编号触发 UNIQUE 冲突（软删用例占号 + 子集重排） `已部署 151+127` `需重启后端`
- 现象：编辑保存后弹 `UNIQUE constraint failed: case_set_cases.caseSetId, case_set_cases.code`（保存本身成功，是保存后自动重排失败被全局拦截器弹错）。
- 根因1：唯一约束对软删除行同样生效；用例集里软删的旧用例占着目标编号（如 0001..），活跃用例重排到该区间即撞号。修复：重排事务里先把占用目标编号的软删用例改名到 `__DEL_{id}_{code}` 让路。
- 根因2：在子节点（部分集）保存也会从 0001 重排，与同前缀其它用例撞号。修复：仅当本次用例覆盖该前缀在用例集下的全部用例时才重排（管理顶层节点），子集自动跳过。
- `cases.service.renumberByOrder` 加上以上两重保护。

### 用例集「全部删除」（筛选范围）改批量软删 + 用例编辑保存稳定性修复 `已部署 151+127` `需重启后端` `需重建前端`
- 全部删除：选中模块节点/搜索后点「全部删除」原为逐条软删（N 次串行请求，sql.js 反复整库落盘、慢且易卡）。新增 `POST /case-sets/:id/cases/bulk-delete`（`cases.service.bulkRemove`）单条 UPDATE 一次性软删 + 清理空模块；前端筛选态改为一次调用。无筛选态仍走一次性 purge。
- 稳定性修复①：`SubtreeEditDialog.vue` 保存时若部分行失败、弹窗保留，已创建的行仍为 `new` → 重试会重复创建。改为创建/更新成功即标记为已提交（`_state='original'`+刷新快照+回填 id/code）。
- 稳定性修复②：`CaseForm.vue` 单条编辑保存失败原为静默无提示，补充标题/预期必填校验与失败 `ElMessage.error`。

### XMind 导入：内容去重 + 测试项合并用「-」连接 `已部署 151+127` `需重启后端`
- 内容去重：整棵 XMind 里内容完全相同的用例（模块路径+标题+等级+前置+步骤+测试数据+预期 全一致）只入库一条，防止源文件把子树复制多份导致重复；`importXmind` 返回 `skipped` 为被去掉的重复数。
- 测试项合并分隔符：`pad4Levels` 中超过 4 级时第 4 级（测试项）由多个子节点合并，分隔符由 `/` 改为 `-`（如 `pose测试-单pose`），避免与层级分隔混淆。
- 实测某重复源文件 650 条 → 入库 333、跳过 317。

### 修复：XMind 导入时「预期结果」被误判为测试步骤 `已部署 151+127` `需重启后端`
- 现象：预期结果节点以 "step" 开头（如 `step运行正常`）时，被步骤正则误判为步骤 → 预期变「（未填写）」，且多出一条 steps="运行正常" 的用例。
- 修复：`xmind-import.service.ts` 的 `STEP_RE` 要求「步骤/step」后必须跟数字或分隔符（`/^\s*(?:步骤|step)\s*(?:(\d+)\s*[:：.、-]?|[:：.、-])\s*(.*)$/i`），纯 `step运行正常`/`step使用说明` 不再被当作步骤；`步骤 1：`/`step 1:`/`步骤：`/`步骤1` 仍正确识别。

### 用例编辑弹窗：选中行上/下插入 + 保存按当前顺序重排编号 `已部署 151+127` `需重启后端` `需重建前端`
- 前端 `CaseSets/SubtreeEditDialog.vue`：点击行首「#」序号列选中该行（高亮，可再点取消）；工具栏新增「↑ 上方插入行」「↓ 下方插入行」（选中后可用），在选中行上/下插入空行并继承其 子模块/子功能/测试项/等级；保存时先删/改/新增，新增回填 id 后按当前行顺序调用重排接口。
- 后端：`cases.service.ts` 用例列表改按 `code` 升序（重排后重载顺序稳定）；新增 `renumberByOrder`（`POST /case-sets/:id/cases/renumber`）：按前缀分组、组内从 `0001` 递增，两阶段临时码避免 (caseSetId, code) 唯一约束瞬时冲突，只写入真正变化的行（前缀不变，如 `M85028_0001…`）。重排在事务内，冲突则整体回滚且前端忽略、保存仍成功。


### 导入用例池内容去重 + 删用例清理空模块节点 `已部署 151+127` `需重启后端` `需重建前端`
- 导入去重：`projects.service.ts` `addCases` 在「按 caseId 去重」基础上增加「按内容去重」（标题+等级+前置+步骤+测试数据+预期结果完全相同即视为同一份，含本批次内重复），返回 `{added, skipped}`；前端「导入到项目用例池」「从用例集加入/导入全部」提示 `已导入 X 条，跳过 Y 条重复`。
- 删用例清理空节点：`case-sets.service.ts` 新增 `pruneEmptyModules`，`cases.service.ts` `remove`（保持软删除 `deleted=true`）后自底向上删除「无有效用例且无子节点」的子模块/子功能/测试项节点；前端删除后 `load()` 重载模块树，左侧树同步移除空节点。两个删除入口（详情表删除、子树弹窗保存删除）均走此路径。


### 修复：用例批量编辑弹窗空白单元格无法输入 `已部署 151+127` `需重建前端`
- 现象：某行有一列内容很多把整行撑高时，同行的空白单元格 textarea 只有 32px、只占单元格顶部，其下方是 td 空白区，点下去无法聚焦 → 看起来“空白单元格不能输入”。
- 修复：`SubtreeEditDialog.vue` 的 autosize 改为「同一行内所有 textarea 高度统一为该行最高内容高度」（按整行收集 textarea → 批量置 auto → 统一读 scrollHeight → 取行最大值回写），空白单元格铺满整格，点击任意位置都能聚焦输入；仍保持内容完整换行显示与批量读写（不卡）。


### 用例集详情页：3000+ 用例性能优化（预计算路径 Map + 主表分页） `已部署 151+127` `需重建前端`
- `CaseSets/Detail.vue`：① `pathAt` 原来每个单元格都对整棵模块树递归 `findPath`（3000 行×3 列=每次渲染上万次遍历），改为一次性预计算 `moduleId→路径` 的 Map，O(1) 查表；`subtreeCases`/`caseModulePathStr` 同样走该 Map。② 主表从一次性渲染全部改为分页（默认每页 50，可切 50/100/200/500），DOM 从上万单元格降到几百；搜索/切模块/换页大小时回第 1 页。「导入到项目用例池」「全部删除」仍作用于完整筛选结果。

### 用例批量编辑弹窗：大数据量（1000+ 行）增量渲染，打开不卡 `已部署 151+127` `需重建前端`
- `CaseSets/SubtreeEditDialog.vue` 改为窗口化增量渲染：打开只渲染首屏 80 行，`.xls-wrap` 滚动到接近底部（剩 300px）再追加 80 行；底部显示「已显示 X/总数」提示。
- 打开/切换筛选时重置回首屏并滚回顶部；「+N 行」「粘贴」后把渲染窗口扩到末尾使新行立即可见。DOM 只保留已滚动到的部分，内存与滚动都轻，编辑/粘贴/保存手感不变。

### 修复：用例批量编辑弹窗在大节点（上千行）打开时页面无响应 `已部署 151+127` `需重建前端`
- 回归来源：当日新增的 `v-autosize` 指令对每个 textarea 逐个「写 auto → 读 scrollHeight → 写高度」，上万个元素触发 N 次强制同步重排（layout thrashing）→ 主线程锥死。
- 修复：`CaseSets/SubtreeEditDialog.vue` 改为批量 + 跨帧分块（每帧≤600 个）：先全部置 auto、统一读一次 scrollHeight、再统一写回（每块仅 1 次重排），requestAnimationFrame 分帧执行，保证页面始终可响应。

### 导入到项目用例池：支持就地新建目标项目 + 导入后直达详情 `已部署 151+127` `需重建前端`
- `CaseSets/Detail.vue` 导入对话框：目标项目下拉旁加「新建」按钮——选一个上级子项目(L2)、填名称即可就地创建「模块功能测试项目」(L3) 并自动选中（复用 `projectApi.create({name, parentId})`，后端按 parent level+1 判定层级）。
- 导入成功后对话框切到成功态，底部出现「前往项目详情」按钮 → `router.push('/projects/:id')`；新增 `resetImport`、`goImportedProject`、`enterCreateMode`、`onCreateTargetProject` 及相关状态。

### 用例批量编辑（节点子树）单元格文字完整换行显示 `已部署 151+127` `需重建前端`
- `CaseSets/SubtreeEditDialog.vue`：把 子模块/子功能/测试项/用例名称/前置条件/测试步骤/测试数据/预期结果/标签1-5 各列的编辑控件统一改为**可自动换行、随内容自增高**的 textarea（新增 `v-autosize` 指令：input 时及挂载/更新后按 scrollHeight 调整高度）；CSS 加 `white-space:pre-wrap; word-break:break-word; overflow:hidden; resize:none`，使每格文字完整显示不再截断。编号列保持单行输入。

### 子项目创建：Teambition URL 配置改为「版本迭代」配置 `已部署 151+127` `需重启后端` `需重建前端`
- 后端：`project.entity.ts` 新增列 `versionIteration`（`varchar(64)`，可空；TypeORM synchronize 自动加列，旧行为 NULL）；`projects.service.ts` `create()` 的 dto 增加 `versionIteration?`，保存到项目。
- 前端：**子项目创建**对话框把「Teambition URL」字段替换为「版本迭代」文本框（占位 `如 3.0.1 或 迭代S1（可选）`）。
  - `Projects/Detail.vue`：子项目/模块功能测试项目创建对话框直接替换；`childForm` 字段 `tbBugSectionUrl`→`versionIteration`。
  - `Projects/List.vue`：该对话框顶层「新建项目」与「新建子项目」共用——用 `v-if="parent"` 区分：建子项目显示「版本迭代」，建顶层项目仍显示「Teambition URL」。
- 仅改动子项目创建对话框；顶层项目的新建/设置里的 Teambition URL 不变。

---

## 2026-07-15

### 用例集分组（"用例集项目"）+ 项目层级交互优化 `本地调试中·未部署` `需重启后端` `需重建前端`
> 本条为 2026-07-15 当天在本地调试的所有改动，尚未部署到 151，等确认后统一发布。

**一、用例集分组（用例集项目）**
- 新增实体 `case-set-group.entity.ts`（`case_set_groups` 表：name 唯一/description/createdBy）；`CaseSet` 增加 `groupId`（`@Index`）。
- `case-sets.service.ts` `implements OnModuleInit`：
  - 启动确保内置分组存在：**MSR、Vision、Viz、DLK、2D智能相机**（按名判断，缺则建）。
  - 旧数据迁移：所有未归组用例集统一归入自动创建的「旧版用例集」分组（幂等）。
  - 新增分组 CRUD：`listGroups/createGroup/updateGroup/removeGroup`（分组下有有效用例集时拒删 E3023）；`list(groupId?)` 支持按分组过滤；`create` 强制校验 `groupId`（缺失报 E3024）。
- `case-sets.controller.ts` 新增 `GET/POST /case-sets/groups`、`PATCH/DELETE /case-sets/groups/:gid`、`GET /case-sets?groupId=`（分组路由置于 `:id` 之前）。
- 前端：`CaseSets/List.vue` 改为展示分组（卡片/列表切换、默认卡片、点卡片进入、增删改分组）；新增 `CaseSets/GroupDetail.vue`（`/case-sets/group/:gid` 列该分组用例集，新建时自动带分组）；`api/index.ts` 增加分组接口与 `list(groupId)`。
- 用例集列表：点名称进详情、去掉编码列。

**二、用例集详情表格（平铺展示）**
- 主表去掉展开下拉，改为平铺列：**子模块 / 子功能 / 测试项 / 等级 / 前置条件 / 测试步骤 / 测试数据 / 预期结果 / 操作**（隐藏编号/模块路径/用例名称/类型/阶段/标签/版本）。
- 所有内容列换行完整显示（`cell-wrap`，保留换行、不省略）。
- 工具栏新增「**导入到项目用例池**」：弹窗选目标模块功能测试项目（level 3，显示完整层级路径），复用 `POST /projects/:id/cases` 导入当前（含模块筛选）用例。

**三、项目层级交互优化**
- `Projects/Detail.vue` Tab 按层级显示：用例池/测试轮次仅 level 3、成员仅 level 1；「子级项目」置为第一个 Tab，项目/子项目默认进该 Tab（level 3 默认用例池）；子级项目也支持卡片/列表切换（默认卡片）。
- 修复子项目「进入」无效：`id` 改 `computed(route.params.id)` + `watch` 路由变化重载（同组件仅 :id 变化不重挂载）。
- 「返回」按层级回退到父项目（顶层回列表）。
- `Projects/List.vue` 只展示顶层项目、卡片/列表切换（默认卡片）、点卡片进入、去掉编码列。
- 旧数据迁移（`projects.service.ts onModuleInit`）：顶层项目若仍直接挂轮次/用例，自动补建「子项目 → 模块功能测试项目」两层并把轮次/用例/缺陷下移到最底层；子项目名取默认（最新）轮次名（幂等）。

**部署动作（确认后执行）**：`_transfer.py` → `step-build-backend.ps1` → 重启 `TCMP-Backend` → `rebuild-frontend-clean.ps1`。

### 项目层级化管理：项目 / 子项目 / 模块功能测试项目 + 缺陷看板聚合 `需重启后端` `需重建前端`
- **变更**
  - `project.entity.ts` 新增 `parentId`（自引用，`@Index`）与 `level`（默认 1；1=项目、2=子项目、3=模块功能测试项目）。旧数据 `onModuleInit` 回填 `level=1`。
  - `projects.service.ts`：`create` 按父级推算层级（最深 3 层，超限报 E4007/E4008）；成员仅在顶层「项目」维护，下层通过 `rootOf()` 继承。新增 `tree`（嵌套子树）、`defectBoard`（聚合该节点整棵子树的缺陷）、`remove`（内置 E4009 / 有子级 E4010 / 有轮次 E4011 拒删）。
  - `projects.controller.ts` 新增 `GET /projects/tree`、`GET /projects/:id/defect-board`、`DELETE /projects/:id`。
  - `defects.service.ts` 的 `dashboard`/`listByProject` 改用 `descendantProjectIds` + `In(ids)`，缺陷看板 tab 自动按子树聚合。
  - 前端：`Projects/List.vue` 改为 `el-tree`（按层级建子项目/模块项目、删除、缺陷看板入口）；`Projects/Detail.vue` 新增「子级项目」tab 与 `?tab=board` 直达缺陷看板；`api/index.ts` 增加 `tree`/`defectBoard`/`remove`。
- **部署动作**：`_transfer.py` → `step-build-backend.ps1` → 重启 `TCMP-Backend` → `rebuild-frontend-clean.ps1`。
- **已知限制**：`project.name` 仍是全局唯一索引，不同父级下的同名子项目暂不允许（后续如需放宽再评估，sql.js synchronize 改索引有风险）。

### TB 缺陷创建：自动回填标题/软件版本/备注（油猜脚本 v2.7.6）`需重建前端` `需重装油猜脚本`
- **变更**
  - 执行页按 F（Fail）打开 TB「创建缺陷」弹窗后，油猜脚本自动回填：**标题**←用例实际结果、**软件版本**←轮次软件版本、**备注**←6 段模板（前置条件/操作步骤描述/实际结果/预期结果 从用例回填，问题定位/补充说明留空）。严重程度=一般、是否稳定复现=稳定复现、缺陷分类=按 URL 自动回显，均为 TB 默认值，无需脚本处理。
  - 回填数据经打开 TB 标签页的 URL hash（`tcmp_fill`）传给脚本；备注同时在点 F 时（有用户手势）写入剪贴板作为兜底。
  - **软件版本**为 TB 自定义字段：用稳定的 `data-role="object-field"/object-field-left/object-field-right` 定位，点值区激活后受控赋值。
  - **备注**为 Cangjie（沧颉，Teambition 自研 Slate 0.4x 分支）富文本：合成 paste/beforeinput/execCommand 全部无效。改为从 React fiber 找到 Cangjie 的 editor 与 controller 实例，用低层 `insertText([blockIdx, textIdx], offset, text)` 按段追加；提交入口因版本而异，脚本内置 5 种提交方式（applyOperation/command/run/flush/scheduleFlush）在弹窗打开时自动探测哪种能驱动视图更新并锁定使用。
  - 后端 `/tb-filler/userscript` 按访问域名动态注入 `@updateURL`/`@downloadURL`，修复"从 localhost:3000 装的脚本无法检查更新"。
- **涉及文件**
  - `backend/scripts/tcmp-tb-filler.user.js`（v2.7.6）
  - `backend/src/modules/tb-filler/tb-filler.controller.ts`（动态注入更新地址）
  - `frontend/src/views/Rounds/Execute.vue`（构造回填数据 + 备注写剪贴板）
- **部署动作**
  1. `_transfer.py` 上传代码（脚本随之更新，无需构建）
  2. `_run_ps.py rebuild-frontend-clean.ps1`
  3. 使用者在油猜猴「检查更新」到 v2.7.6（首次需从 `http://<服务器>/api/v1/tb-filler/userscript` 重装以纠正更新地址）
- **验证**
  - 点 F → TB 弹窗标题/软件版本/备注均自动填入；备注 6 段值正确追加在各标记后。

---

## 2026-07-14

### 关联缺陷：回显 Teambition 缺陷标题到关联列表 `仅需重启后端`
- **变更**
  - 关联 TB 任务时（手动粘贴 URL 或油猜脚本自动回传），后端回读 Teambition 缺陷的真实标题（`content` 字段），写回本地缺陷 `title`，使「关联缺陷」列表的标题栏显示的是 TB 上的缺陷标题，而非提交时本地填写的草稿标题。
  - `BugInfo` 新增可选 `title`；真实适配器 `getBug` 返回 `task.content` 作为标题；Mock 适配器在 `createBug` 时保存标题、`getBug` 时返回。
  - `attachTbTask` 关联时调用 `getBug` 一并取回标题与状态；标题拿到才覆盖（拿不到不动原标题），失败仅告警不阻断关联。
- **涉及文件**
  - `backend/src/integrations/teambition.adapter.ts`
  - `backend/src/integrations/teambition.real.adapter.ts`
  - `backend/src/modules/defects/defects.service.ts`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `step-build-backend.ps1` 构建后端
  3. `nssm restart TCMP-Backend`
- **验证**
  - 后端重启后 `POST /auth/login` 返回 201；关联缺陷后列表标题栏显示 TB 缺陷标题。

---

## 2026-07-09

### Teambition 缺陷路径：改为「按轮次」配置（项目级作为回退）`需重建前端` `仅需重启后端`
- **变更**
  - TB 缺陷分组路径（提交缺陷时用的 project/section）从「按项目」下沉为「按轮次」配置：每个轮次可单独粘贴自己的 Teambition 缺陷分组 URL；留空则回退用项目级配置。
  - `round` 实体新增三列 `tbProjectId` / `tbBugSectionId` / `tbBugSectionUrl`（`synchronize:true` 自动补列，均可空）。轮次创建/编辑时把粘贴的 URL 解析成 projectId/sectionId 落库；清空则一并清除。
  - 提交缺陷解析优先级：**轮次配置优先，项目配置回退**（`resolveTb(round, project)`：`round?.tbProjectId || project?.tbProjectId`）。缺陷创建时把当时生效的 TB 配置固化到缺陷行，后续自动填单/补挂任务据此还原分组 URL。
  - 前端：轮次「新建」弹窗与详情页新增「TB 路径」入口（`ElMessageBox.prompt` 粘贴/清空）；执行页读取轮次自身 TB 路径（回退项目）。
  - 项目级 TB 配置**保留不删**：仍作为回退，且项目页的成员拉取/连通性测试确实是项目级能力。
- **涉及文件**
  - `backend/src/entities/round.entity.ts`
  - `backend/src/modules/rounds/rounds.service.ts`
  - `backend/src/modules/defects/defects.service.ts`
  - `backend/src/modules/tb-filler/tb-filler.service.ts`
  - `frontend/src/views/Rounds/RoundCreateDialog.vue`
  - `frontend/src/views/Rounds/Detail.vue`
  - `frontend/src/views/Rounds/Execute.vue`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `nssm restart TCMP-Backend`（触发 `synchronize` 补列）
  3. `_run_ps.py rebuild-frontend-clean.ps1`
- **验证**
  - `PATCH /rounds/10` 传 `tbBugSectionUrl` → 后端正确解析出 `tbProjectId`/`tbBugSectionId`；传空串 → 三字段全部清空回退。
  - 轮次详情页出现「TB 路径」按钮，弹窗标题「配置 TB 路径（按轮次）」，输入框正常预填/清空。

---

## 2026-07-08

### 登录会话：滑动过期（一直操作不掉线，空闲超时才过期）`需重建前端`
- **变更**
  - 实现「滑动过期」：只要用户在操作（点击/键盘/滚动/鼠标移动/触摸）就自动续期 token，永不掉线；空闲超过 30 分钟无操作才让会话过期并跳转登录。
  - 新增会话守护：`frontend/src/utils/activity.ts`（活动检测叶子模块：记录最近活动时间、解析 JWT 过期时间、空闲/续期阈值常量）与 `frontend/src/utils/session.ts`（定时巡检：活跃且 token 临近过期 → 静默续期；空闲超限 → 登出）。`App.vue` 挂载时启动。
  - `stores/auth.ts`：新增 `refreshToken` 状态与 `refreshTokens()`（单飞去重，调用后端 `POST /auth/refresh`，后端滚动签发新的 access/refresh token）。
  - `api/http.ts`：401 拦截改为——用户仍在活跃期内则先静默续期再重放原请求（避免正操作时被踢出）；续期失败或空闲超限才登出。
  - `api/index.ts`：新增 `authApi.refresh`。
  - 阈值：空闲上限 30 分钟、剩余有效期 <5 分钟触发续期、巡检间隔 30 秒（见 `activity.ts` 常量，可调）。后端 token 有效期沿用（access 2h / refresh 7d），无需改后端。
- **涉及文件**
  - `frontend/src/utils/activity.ts`（新增）
  - `frontend/src/utils/session.ts`（新增）
  - `frontend/src/stores/auth.ts`
  - `frontend/src/api/http.ts`
  - `frontend/src/api/index.ts`
  - `frontend/src/App.vue`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `_run_ps.py rebuild-frontend-clean.ps1`
- **验证**
  - `POST /auth/refresh` 返回新 access/refresh token（滚动续期）。
  - 产物含续期逻辑（`auth/refresh` / `lastActivity` / `refreshTokens`）；刷新执行页登录态保持、操作正常。

### 执行用例页：保留右侧树的展开/折叠状态 `需重建前端`
- **变更**
  - `frontend/src/views/Rounds/Execute.vue`：修复执行用例（提交 P/F/BLOCK）后右侧模块树被强制全部展开、无法保持折叠的问题。
  - 把 `defaultExpandedKeys` 从 `computed` 改为 `ref`，只在树首次拿到数据时初始化为"全部展开"；不再随计数刷新重算成"全部 key"。
  - 新增 `@node-expand` / `@node-collapse` 事件，用 `expandedSet` 跟踪用户实际展开的节点；折叠某节点时连同其所有后代分支 key 一并移除。
  - **根因**：el-tree 的 `auto-expand-parent` 默认为 `true`——每次提交结果后 `tree` 计算属性重算、el-tree 重新套用 `default-expanded-keys` 时，展开子节点会连带自动展开父节点，把用户刚折叠的节点又撑开。已显式设 `:auto-expand-parent="false"`。
- **涉及文件**
  - `frontend/src/views/Rounds/Execute.vue`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `_run_ps.py rebuild-frontend-clean.ps1`
- **验证**
  - 浏览器实测（项目3 / 轮次10 执行页）：折叠"相机"节点 → 点击 Pass 提交结果 → 提示"已记录 P"，该节点保持折叠、未被重新展开。

---

## 2026-07-02

### 项目：5 个内置项目 + 卡片/列表切换 `需重建前端` `需 seed`（必须停服后 seed）
- **变更**
  - `projects` 表新增 `isBuiltin: boolean`（默认 false，TypeORM `synchronize:true` 自动 ALTER）。
  - seed 幂等创建 5 个内置项目：Vision / MSR / DLK / Viz / 2D智能相机（key = VISION / MSR / DLK / VIZ / CAM2D），并把它们标为 `isBuiltin=true`；若历史同名项目已存在，则原地升级为内置。
  - 项目列表页新增卡片 / 列表视图切换按钮（工具栏右侧），偏好存 `localStorage['projects.viewMode']`；两种视图都显示黄色"内置"tag。
  - "不允许删除"：目前项目模块尚无删除接口/UI，靠 `isBuiltin` 字段做未来防护，加删除入口时服务端需 `if (project.isBuiltin) throw`。
- **涉及文件**
  - `backend/src/entities/project.entity.ts`
  - `backend/src/seed.ts`
  - `frontend/src/views/Projects/List.vue`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `_run_ps.py step-extract.ps1`
  3. `_run_ps.py step-build.ps1`
  4. `_run_ps.py rebuild-frontend-clean.ps1`
  5. **`nssm stop TCMP-Backend`**（必须！否则 seed 写入会被覆盖）
  6. `_run_ps.py step-seed.ps1`
  7. `nssm start TCMP-Backend`
- **验证**
  - `GET /api/v1/projects` 返回列表中含 Vision / MSR / DLK / Viz / 2D智能相机，各条 `isBuiltin: true`。
  - 项目页可切换卡片/列表视图，刷新后偏好保留。
- **备忘**
  - 若某台环境已有同名（非内置）项目，seed 会把它就地升级为 `isBuiltin=true`，不会重复建。
  - **通用教训（写进本文顶部警告）**：sql.js 场景下 seed 前必须停服。

### 登录页：忘记密码 → 邮箱 + 钉钉双通道验证码 → 重置 `需重建前端` `仅需重启后端`
- **变更**
  - 登录页新增"忘记密码？"入口；弹窗支持"发邮箱验证码（60s 冷却）→ 输入 6 位码 + 新密码 + 确认 → 提交重置"。
  - 后端 `AuthService.forgotPasswordSendCode` / `resetPassword`；对应路由 `POST /api/v1/auth/forgot-password/send-code` 与 `POST /api/v1/auth/reset-password`（均 Public）。
  - 复用现有 in-memory `codes` map：10 分钟有效、5 次错码上限、24h 内 5 次发送上限。
  - 通道：邮件走 `MailAdapter`（当前 Mock 写日志），同时若用户填了手机号且钉钉已配 → 用 `DingtalkAdapter` 推到群里并 @ 该手机号，把验证码带过去。
  - 重置成功后清 `failedLoginCount` / `lockedUntil`，避免刚被锁的账号即便改了密码仍无法登录。
- **涉及文件**
  - `backend/src/modules/auth/auth.service.ts`、`auth.controller.ts`
  - `frontend/src/views/Login.vue`、`frontend/src/api/index.ts`
- **部署动作**
  1. `_transfer.py` → `_run_ps.py step-extract.ps1` → `_run_ps.py step-build.ps1`
  2. `_run_ps.py rebuild-frontend-clean.ps1`
  3. `nssm restart TCMP-Backend`
- **验证**
  - `POST /api/v1/auth/forgot-password/send-code {"email":"admin@mech-mind.net"}` → 201。
  - `POST /api/v1/auth/reset-password` 错码 → 400 E1014"验证码不正确"。
- **备忘**
  - 邮件目前是 Mock 只写后端日志（`C:\tcmp\app\backend\logs\service.*.log`）。生产环境用户实际会通过**钉钉群里 @ 手机号**收到验证码；前提是先在"个人设置"里填过手机号。要真发邮件需替换 `MockMailAdapter` 为 SMTP 适配器。

---

## 2026-07-01

### 用例集：XMind 导入 —— 约定驱动重写 `仅需重启后端`
- **变更**
  - 之前"叶子 topic = 一条用例"的通用规则对真实用例文件不适用。改成按图示的固定约定解析：
    - **层级**：sheet 根 topic = 顶层模块；下面依次是 子模块 / 子功能 / 测试项 / **tc-pX-...**（用例节点）。用例节点祖先链 → 4 层 modulePath（不足补默认名，多余合并到第 4 层）。
    - **用例节点识别**：title 以 `tc-p0-` / `tc-p1-` / `tc-p2-` / `tc-p3-`（大小写、下划线、空格容错）开头。priority 由 pX 得出。
    - **前置/策略**：用例节点子孙里以 `pc:` 开头 → precondition；`策略:` → testData（可累加）。仅取节点自身正文，不吸收其子孙（重要：P0 用例在文件里是嵌套结构，pc 下面还挂着 策略/步骤/预期）。
    - **步骤+预期 = 一条用例**：进入用例节点后 DFS —— 遇到 `步骤N:` 记为当前步骤，继续 DFS；遇到 `预期:` 就与最近的当前步骤配对 emit 一条用例。这样平铺（P1 风格）和嵌套（P0 风格）都能正确识别，每个"预期"节点独立一行。
    - 若整棵树没有 tc-pX- 节点，回退到"叶子=用例"的通用逻辑保持向后兼容。
  - 修复：`walkForCaseNodes` 初始 ancestors 传空数组，避免根 topic title 被重复添加导致 modulePath 首层重复。
  - 修复：新增 `backend/scripts/` 后 nest build 的 rootDir 上移，导致 `dist/main.js` 被打到 `dist/src/main.js`；在 `backend/tsconfig.json` 显式 `"include":["src/**/*.ts"]` + `"exclude":["scripts"]` 修好。
  - 附：新增 `backend/scripts/xmind-dryrun.ts` 供本地干跑，快速验证解析结果不入库。
- **涉及文件**
  - `backend/src/modules/case-sets/xmind-import.service.ts`（重写解析核心）
  - `backend/tsconfig.json`（新增 include/exclude）
  - `backend/scripts/xmind-dryrun.ts`（新）
- **部署动作**
  1. `_transfer.py` → `_run_ps.py step-extract.ps1` → `_run_ps.py step-build.ps1`
  2. `nssm restart TCMP-Backend`
  3. 前端未变，无需重建
- **验证**
  - 用真实用例文件 `2D 匹配优化_阶段二_测试用例.xmind` 干跑得 116 条：P0 用例（嵌套结构）拆成 2 步骤×1 = 2 条；P1 用例（平铺）每步骤/预期各 1 条；末尾 tc-p2- 空节点兜底为 1 条"未填写"。生产上传返回 `imported=116, skipped=0, errors=0`，与干跑一致。
  - modulePath 4 层无重复：`<sheet根> / <子模块> / <子功能> / <测试项>`。
- **备忘**
  - 本地干跑不入库：`cd backend && npx ts-node -T -r tsconfig-paths/register scripts/xmind-dryrun.ts [可选xmind路径]`（默认扫 `test-xmind/*.xmind` 第一个）。
  - `test-xmind/` 已加 .gitignore，只用于本地调试。

### 用例集：XMind 导入（首版） `需重建前端` `仅需重启后端`
- **变更**
  - 用例集 Detail 页新增“导入 XMind”按钮（与“导入 Excel”并排）。
  - 后端新增 `POST /api/v1/case-sets/:id/import-xmind`（20MB 上限）；`XmindImportService` 用 `jszip` 解压 .xmind，优先读 `content.json`（XMind Zen / 2020~2025），回退 `content.xml`（XMind 8，`fast-xml-parser`）。
  - 转换约定：叶子 topic = 一条用例；祖先链 → 4 层模块路径（不足补默认名，多余合并到第 4 层）；`priority-N` marker 映射 P0~P3；notes 按 `前置|步骤|预期|数据|标签`(中/英) 小节切分；`labels` 与 notes 标签合并去重取前 5。
  - 复用 Excel 导入的批量通路：`cases.bulkCreate`（单事务、内存编号分配），最终响应形状 `{imported, skipped, errors}` 与 Excel 导入一致。
- **涉及文件**
  - `backend/src/modules/case-sets/xmind-import.service.ts`（新）
  - `backend/src/modules/case-sets/case-sets.controller.ts`、`case-sets.module.ts`
  - `frontend/src/views/CaseSets/Detail.vue`
  - `backend/package.json`：新增 `jszip@3.10.1`、`fast-xml-parser@4.4.1`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `_run_ps.py step-extract.ps1`
  3. `_run_ps.py step-build.ps1`（**新依赖需要 npm ci 重装**；已在脚本里加 `NODE_OPTIONS=--use-system-ca` 走系统 CA）
  4. `_run_ps.py rebuild-frontend-clean.ps1`（停 nginx → 清 dist → 重建 → 起 nginx）
  5. `nssm restart TCMP-Backend`
- **验证**
  - 造一个包含 `priority-1` marker + `labels` + `notes` 分节的 .xmind：
    ```json
    {"rootTopic":{"title":"顶层模块","children":{"attached":[
      {"title":"子模块","children":{"attached":[
        {"title":"子功能","children":{"attached":[
          {"title":"用例名","markers":[{"markerId":"priority-1"}],
           "labels":["smoke"],
           "notes":{"plain":{"content":"前置: A\n步骤:\n1..\n预期: B\n标签: reg"}}}
        ]}}
      ]}}
    ]}}}
    ```
    POST 到 `/api/v1/case-sets/:id/import-xmind` 应返回 `imported=1, skipped=0`；库里字段 priority=P0，precondition="A"，steps="1..", expectedResult="B", tags=["smoke","reg"]，path 4 层齐全。
- **备忘**
  - `step-build.ps1` / `rebuild-frontend-clean.ps1` 已注入 `NODE_OPTIONS=--use-system-ca`，用来穿透公司出口 sangfor 的 HTTPS 中间人；换新服务器若无该拦截也不会有副作用。
  - XMind 若无 notes 时 steps/expectedResult 会填占位符「（导入自 XMind，未填写...）」以满足数据库 NOT NULL 约束。

### 个人设置（用户名 / 手机号 / 密码）  `需重建前端` `仅需重启后端`
- **变更**
  - 新增 `PATCH /api/v1/auth/me`，可修改 `name` / `phone` / (`currentPassword` + `newPassword`)。
  - 邮箱不可改（登录标识 + 域名白名单）；手机号校验 `^1[3-9]\d{9}$`；新密码走注册相同规则 `8-64 位 + 字母 + 数字 + 特殊字符`；改密码必须提供 `currentPassword` 并 `bcrypt.compare` 通过。
  - 前端顶栏用户名下拉新增“个人设置”弹窗，一次可改用户名 / 手机号 / 密码；`useAuthStore` 同步刷新。
- **涉及文件**
  - `backend/src/modules/auth/auth.controller.ts`、`backend/src/modules/auth/auth.service.ts`
  - `frontend/src/views/Layout.vue`、`frontend/src/stores/auth.ts`、`frontend/src/api/index.ts`
- **部署动作**
  1. `_transfer.py` 上传代码
  2. `_run_ps.py step-extract.ps1`
  3. `_run_ps.py step-build.ps1`（后端构建）
  4. `_run_ps.py rebuild-frontend-clean.ps1`（**必须**：停 nginx → 清 dist → 重建 → 起 nginx；vite 无法覆盖被 nginx 占用的 dist 文件）
  5. `nssm restart TCMP-Backend`
- **验证**
  - 未鉴权 `GET/PATCH /api/v1/auth/me` 返回 401（路由存在）。
  - 登录后 `PATCH /auth/me` 空体 → 返回当前 profile；`{"phone":"12345"}` → `E400 手机号格式不正确`；错误 `currentPassword` → `E1010 当前密码不正确`。
  - 前端刷新（Ctrl+F5）右上角出现“个人设置”入口。

### 钉钉群推送修复（打通 sangfor SSL 拦截 + 换 webhook） `需环境变量变更` `仅需重启后端`
- **变更**
  - 公司出口 sangfor(深信服) HTTPS 中间人会把 `*.dingtalk.com` 证书换成 sangfor CA 签的，Node 默认 CA 校验失败 → 推送全 FAILED（`UNABLE_TO_VERIFY_LEAF_SIGNATURE`）。
  - Windows 证书库已装 sangfor 根 CA，让 Node 走系统 CA 即通。
  - 同时更换失效的群机器人 access_token / 加签密钥。
- **涉及文件**
  - 无代码变更，仅服务环境变量。诊断脚本：`deploy/windows/probe-dingtalk.ps1`、`deploy/windows/test-dingtalk-push.ps1`、`deploy/windows/set-node-system-ca.ps1`
- **部署动作**
  1. `nssm set TCMP-Backend AppEnvironmentExtra` 必须**一次带齐**所有变量（该字段是覆盖式），新增/更新项：
     - `NODE_OPTIONS=--use-system-ca`（Node22+ 走系统证书库；勿用 `NODE_TLS_REJECT_UNAUTHORIZED=0`）
     - `DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=<新 token>`
     - `DINGTALK_SECRET=<新加签密钥>`
     - 保留：`NODE_ENV`、`PORT`、`JWT_SECRET`、`DINGTALK_MODE=WEBHOOK`、`DINGTALK_PUBLIC_BASE_URL`
  2. `nssm restart TCMP-Backend`
- **验证**
  - 用 `deploy/windows/test-dingtalk-push.ps1` 直连钉钉返回 `HTTP 200 {"errcode":0,"errmsg":"ok"}` 且群里能收到。
  - 平台内做一次“分配用例”，群里应收到 `[TCMP] {轮次名} 新分配 N 个用例`（会 @ 已填手机号的人）。
  - 查 `dingtalk_push_logs` 表最新几条 `status=SUCCESS`。
- **备忘**
  - 若换新服务器：先确认该服务器 Windows 证书库里是否已装 sangfor CA（打开浏览器访问 https 站点无警告即已装）。若未装，需先装或改用不经公司出口的通道。
  - 群机器人 token 一旦被踢/重置会返回 `{"errcode":300005,"errmsg":"token is not exist"}`，改环境变量重启即可，无需 rebuild。
