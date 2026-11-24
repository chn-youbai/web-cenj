# Web-Cenj 项目交接文档 (`HANDOFF.md`)

> **生成时间**：2026-11-20  
> **当前分支**：`main`（已合并 PR #7 并清理冗余旧架构文档，包含 `AGENTS.md` / `HANDOFF.md` 协作规范）  
> **文档性质**：全站唯一权威架构与交接手册，所有描述均与当前真实代码状态严格对齐。
>
> **⚠️ 强制同步规范（所有 AI / Agent 必须遵守）**：见 [`AGENTS.md`](./AGENTS.md)。任何接手或修改本仓库的 AI，在动手前必须先通读本文档；每次完成功能改动、结构调整、分支合并或状态变更后，**必须同步更新本 `HANDOFF.md`**（包括分支/提交状态、文件地图、进度审计与避坑指南），严禁只改代码不更新交接文档。

---

## 1. 项目一句话定位与核心架构

`web-cenj` 是一个部署在 **Cloudflare Pages 全球边缘网络** 上的个人数字空间与工具集（10 个独立页面、暖纸感/暖炭黑双色设计），集成了 **英语词典与高亮速记卡、航拍图库与流媒体点播、资源网盘与代理订阅中心、休闲游乐场，以及仅通过暗号指令进入的记账/留言/Clash 云控工具**。

### 核心技术栈
- **前端多页应用（Vite 6 MPA）**：纯原生 TypeScript（`strict: true` + `noUncheckedIndexedAccess: true`）+ 模块化 CSS + `@fontsource` 本地打包字体（`Newsreader`、`Plus Jakarta Sans`、`IBM Plex Mono`）。无 React/Vue 运行时框架。
- **全站统一外壳（App Shell & Quick Pick）**：所有 10 个页面均通过 `initAppShell({ activePage })` 注入左侧导航栏、移动端顶栏/抽屉、明暗主题自动同步、以及 **VS Code 风格 Quick Pick 全局命令面板（`⌘K` / `⌘⇧P`）**。
- **边缘后端（Cloudflare Pages Functions）**：位于 [`functions/`](./functions/)，包含全局中间件 `_middleware.ts`、公共库 `_lib/*` 和 16 个 TypeScript `/api/*` 路由（含 `[[catchall]].ts` 兜底）。
- **前后端共享契约**：[`shared/types.ts`](./shared/types.ts) 定义前后端共用数据结构，前后端分别使用 [`tsconfig.json`](./tsconfig.json) 与 [`tsconfig.functions.json`](./tsconfig.functions.json) 校验。
- **持久化与离线缓存**：
  - **Cloudflare D1 (`DB` / `web-vocab-db`)**：7 张核心业务表（词库、词根衍生、站点点击、视频元数据、Clash 与订阅配置、2050 过词同步、秘密留言板）。
  - **Cloudflare KV (`TAKEOUT_KV` / `CLICKS_KV`)**：存储外卖账单快照与点赞计数降级存储。
  - **浏览器 IndexedDB / localStorage**：[`vocab.html`](./vocab.html) 与 [`recite.html`](./recite.html) 将万词库与 2050 词库缓存在 IndexedDB 中，规避 iOS Safari `localStorage` 容量限制。
- **质量与构建工具链**：Biome 1.9.4（格式与静态检查）+ TypeScript 5.7 + Vitest 3（`happy-dom` 环境）+ Vite 6。

### 核心数据流与状态流
1. **页面初始化流**：每个 `*.html` 在 `<head>` 先通过一段内联脚本读取 `localStorage["cenj_theme_v1"]` 与 `prefers-color-scheme` 预设 `data-theme="light|dark"` 防白屏闪烁；随后加载页面入口 `src/pages/<page>/main.ts` → 调用 `initAppShell({ activePage })` → 挂载侧边栏 / 移动顶栏 / 主题监听（[`src/core/theme.ts`](./src/core/theme.ts)）/ 命令面板（[`src/core/command-palette.ts`](./src/core/command-palette.ts)）。
2. **认证鉴权流（Fail-Closed）**：所有受保护接口（`/api/auth`、`/api/subscription`、`/api/videos` 写操作、`/api/board` 删除、`/api/takeout` 与 `/api/clash`）均通过 [`functions/_lib/auth.ts`](./functions/_lib/auth.ts) 执行常量时间字符串比对（`safeEqual`）。若 Cloudflare Pages 环境变量未注入对应密钥，服务端直接返回 `503` 拒绝访问，前端无任何默认兜底密码。
3. **搜索与隐藏入口流**：
   - 可见导航（[`NAV_ITEMS`](./src/core/nav-config.ts)）仅包含 **5 组 8 项**：首页、英语查词、智能过词、视界画廊、资源网盘、2048、航拍拼图、记忆翻卡（原「投递视频」已合并入视界画廊，`upload.html` 保留跳转兼容）。
   - **4 个隐藏工具**（[`takeout.html`](./takeout.html)、[`board.html`](./board.html)、[`clash.html`](./clash.html)、[`key.html`](./key.html)）不在任何菜单或提示文案中暴露，仅当用户在首页 Omnibox 或全局命令面板**精确完整输入** `/bill`、`/msg`、`/clash`、`/key` 时，由 `matchSlashCommands()` 匹配触发跳转。

---

## 2. 关键目录与核心文件地图

```text
web-cenj/
├── index.html                    # 1. 首页工作台（太阳时段问候 + 点赞计数 + Omnibox 搜索/隐藏指令入口）
├── vocab.html                    # 2. 英语查词与词根词族系统（11,160+ 词）
├── recite.html                   # 3. 高考 2050 核心词速记卡（云同步 + 测验）
├── gallery.html                  # 4. 统一视界画廊（航拍默认相册 + 照片/视频分级直传 + 缩略图/封面 + 缩放灯箱）
├── upload.html                   # 5. 兼容重定向页（自动跳转 ./gallery.html?upload=1）
├── pan.html                      # 6. 云端文件库网盘（分级上传/下载、公开私密双模式、在线预览）
├── games.html                    # 7. 独立摸鱼游乐场（2048 / 航拍拼图 / 记忆翻卡，支持 ?tab=）
├── takeout.html                  # 8. [隐藏] 沙县外卖多人记账助手（/bill）
├── board.html                    # 9. [隐藏] 秘密留言板（/msg）
├── clash.html                    # 10. [隐藏] Windows PC Clash Verge 远程控台（/clash）
├── key.html                      # 11. [隐藏] 私人订阅（永久+临时）与美区 Apple ID 中枢（/key）
│
├── shared/
│   └── types.ts                  # 前后端共享接口与数据契约
│
├── src/
│   ├── core/                     # 全站基础设施（改外壳/导航/主题/命令面板去这里）
│   │   ├── nav-config.ts         # 导航元数据 NAV_GROUPS/NAV_ITEMS 与隐藏指令 SLASH_COMMANDS
│   │   ├── shell.ts              # 桌面可折叠侧边栏、仅首页启用的手机细长窄栏、移动顶栏与抽屉
│   │   ├── command-palette.ts    # VS Code Quick Pick 全局命令面板（⌘K / ⌘⇧P / > 命令模式）
│   │   ├── theme.ts              # 明暗主题切换 + 回到系统主题自动同步（pageshow/focus/visibilitychange）
│   │   ├── api.ts                # fetchJson / requestJson 统一封装
│   │   ├── dom.ts                # escapeHtml / byId 等 DOM 辅助
│   │   ├── storage.ts            # localStorage JSON 安全读写
│   │   ├── fonts.ts              # @fontsource 本地字体打包入口
│   │   ├── modal.ts              # 通用弹窗控制器
│   │   └── toast.ts              # 全局提示条
│   │
│   ├── pages/                    # 各页面独立状态机与交互模块（每页均有 main.ts）
│   │   ├── index/                # main.ts, omnibox.ts（6 时段日出日落问候+即时查词）, likes.ts
│   │   ├── games/                # main.ts, games.ts（Tab 与侧栏同步）, game-2048.ts, game-puzzle.ts, game-memory.ts
│   │   ├── vocab/                # main.ts, search.ts, derivatives.ts, word-knowledge.ts, idb.ts, csv.ts, render.ts
│   │   ├── recite/               # main.ts, engine.ts, raw-words.ts, phrases-dict.ts, idb.ts, sync.ts, render.ts
│   │   ├── gallery/              # main.ts, utils.ts（双上传/缩略图/封面）, photos.ts（121 张图库清单）, lightbox.ts（缩放灯箱）
│   │   ├── upload/               # main.ts（重定向 ./gallery.html?upload=1）
│   │   ├── pan/                  # main.ts, utils.ts（云端文件库分级上传/预览/公开私密控制）
│   │   ├── takeout/              # main.ts, settlement.ts, cloud-sync.ts, menu-data.ts, modals.ts, store.ts, render.ts
│   │   ├── board/                # main.ts, identity.ts, messages.ts
│   │   └── clash/                # main.ts, api.ts, auth.ts, renderers.ts
│   │
│   └── styles/                   # base.css + shell.css + 10 个页面独立 CSS
│
├── functions/                    # Cloudflare Pages Functions 边缘后端
│   ├── _middleware.ts            # CORS 预检与 /api/* 异常统一 JSON 兜底
│   ├── _lib/                     # auth.ts, db.ts, env.ts, http.ts
│   └── api/                      # auth, board, clash, click, derivatives, download, recite-sync, recite-vocab,
│                                 # sub, subscription, takeout, upload-asset, video, videos, vocab, [[catchall]]
│
├── data/
│   ├── schema.sql                # D1 7 张表建表 SQL
│   ├── vocab.json                # 1.1 万词离线词库（Vite dev/build 自动复制到 /data/）
│   ├── gaokao_2050.json          # 高考 2050 词库 JSON
│   ├── root_families.json        # 同根词族映射
│   └── csv/                      # 原始课本 CSV 与说明（data/csv/README.md）
│
├── scripts/                      # Python 词库处理、照片清单与 D1 同步工具
├── tests/                        # Vitest 单元测试（共 9 个文件，44 条用例）
├── vite.config.ts                # 10 入口 MPA 配置 + data/*.json 静态注入插件 + /api 代理(8788)
├── wrangler.jsonc                # Pages 构建目录 dist + D1 (web-vocab-db) 绑定配置
├── biome.json                    # Biome 规则（注意忽略了 *.html、scripts、data、public）
└── .env.example                  # Cloudflare 环境变量清单模板
```

---

## 3. 环境依赖与本地启动/验证命令

### 运行环境要求
- **Node.js**：`20+` 或 `24 LTS`（生产构建由 Cloudflare Pages 执行 `npm run build`）
- **Python 3**（可选）：仅运行 `scripts/*.py` 处理词库或部署脚本时需要
- **Wrangler CLI**（可选）：本地模拟 Cloudflare Pages Functions + D1/KV 联调时需要

### 常用命令
```bash
# 1. 安装依赖
npm install

# 2. 仅启动前端 Vite 开发服务器（注意：/api/* 会反向代理到 http://127.0.0.1:8788）
npm run dev

# 3. 前后端完整本地联调（先构建或监听 dist，再启动 wrangler pages dev）
npm run build
npx wrangler pages dev dist --port 8788

# 4. 代码格式化 + 全量质量门禁（提交前必跑）
npm run format && npm run check
# check 依次执行: biome check . -> tsc 前端 & Functions 双校验 -> vitest run -> vite build
```

### 环境变量与绑定配置（Cloudflare Pages）
所有密钥**不能写进代码或配置文件**，必须在 **Cloudflare Dashboard → `web-cenj` → Settings → Variables and secrets**（本地用 `.dev.vars`，已被 `.gitignore` 忽略）中注入后，执行 **Retry deployment** 生效：

| 变量 / 绑定名 | 类型 | 用途说明 |
| :--- | :--- | :--- |
| `DB` | D1 Binding | 绑定 `web-vocab-db`（ID 见 [`wrangler.jsonc`](./wrangler.jsonc)），7 张表 SQL 见 [`data/schema.sql`](./data/schema.sql) |
| `TAKEOUT_KV` / `CLICKS_KV` | KV Binding | 外卖云备份与点赞降级存储 |
| `ADMIN_PASSWORD` | Secret | 管理员密码（`/api/auth`、视频管理、留言删帖、外卖接口、`clash` 默认回退） |
| `ACCESS_PASSWORD` | Secret | 网盘解锁密码（`/api/subscription`） |
| `CLASH_DAEMON_SECRET` | Secret | Windows PC 守护进程 `X-Clash-Daemon-Secret` 请求头校验密钥 |
| `DJJC_TOKEN` | Secret | 顶级机场订阅 Token（D1 未存储 `djjc_config` 时使用） |
| `VPN07_EMAIL` / `VPN07_PASSWORD` | Secret | VPN07 登录凭据（优先环境变量，否则回退读取 D1 `vpn07_credentials`） |
| `APPLE_ID_EMAIL` / `APPLE_ID_PASSWORD` | Secret | 网盘解锁后下发的共享美区 Apple ID 账号密码 |
| `GITHUB_MEDIA_TOKEN` | Secret（可选） | 配置后视频上传页支持凭管理员密码免填 GitHub Token 直传 Releases |

### Cloudflare Pages Functions 接口清单（`functions/api/`）
| 端点 | 方法 | 鉴权要求 | 说明 |
| :--- | :--- | :--- | :--- |
| `/api/auth` | `POST` | `ADMIN_PASSWORD` | 统一管理员密码验证入口，未配置返回 `503` |
| `/api/click` | `GET`, `POST` | 公开 | 首页点赞计数读写（`site_stats` / KV 降级） |
| `/api/board` | `GET`, `POST`, `DELETE` | 删除需 `ADMIN_PASSWORD` | 秘密留言板读取、发布回复点赞、管理删除 |
| `/api/clash` | `GET`, `POST` | `CLASH_DAEMON_SECRET` 或 D1 `auth_pwd` / `ADMIN_PASSWORD` | PC 守护进程心跳/状态上报与手机指令下发 |
| `/api/vocab` | `GET`, `POST`, `DELETE` | 写入/删除需 `ADMIN_PASSWORD` | 1.1 万词库在线检索、快照同步与词条维护 |
| `/api/derivatives` | `GET` | 公开 | 同根派生词群检索（`word_derivatives`） |
| `/api/recite-vocab` | `GET` | 公开 | 读取 2050 词库静态或补充结构 |
| `/api/recite-sync` | `GET`, `POST` | Sync Key 校验 | 跨设备记忆标记、助记笔记与个性化设置云同步 |
| `/api/takeout` | `GET`, `POST` | `ADMIN_PASSWORD` | 外卖账单 KV 读写备份与时间戳冲突保护 |
| `/api/videos` | `GET`, `PATCH`, `DELETE` | 写入/删除需 `ADMIN_PASSWORD` | 历史视频接口（向后兼容保留） |
| `/api/video` | `GET`, `HEAD` | 公开 | 历史视频流式透传（向后兼容保留） |
| `/api/upload-asset` | `POST` | `ADMIN_PASSWORD` 或请求携带 GitHub Token | 历史视频直传接口（向后兼容保留） |
| `/api/media` | `GET`, `POST`, `PATCH`, `DELETE` | 公开浏览/上传；私密/编辑/删除需 `ADMIN_PASSWORD` | 统一视界画廊媒体库 CRUD、`≤20MB` D1 分块存储（`cf_d1`）、`>20MB` GitHub Releases 直传/80MB 分片（`v_media`）、缩略图/封面写入与旧 `videos` 无感迁移 |
| `/api/media-file` | `GET`, `HEAD` | 公开免密；私密需 `ADMIN_PASSWORD` | 画廊原图/缩略图/视频分级流式输出（支持 WebP 缩略图缓存、D1 分块流、GitHub 分片零内存拼接与 `Range 206`） |
| `/api/pan` | `GET`, `POST`, `PATCH`, `DELETE` | 公开浏览/上传；私密/编辑/删除需 `ADMIN_PASSWORD` | 云端文件库 CRUD、`≤20MB` D1 分块存储（`cf_d1`）、`>20MB` GitHub Releases 直传/80MB 分片（`v_pan`）与外链登记 |
| `/api/pan-file` | `GET`, `HEAD` | 公开免密；私密需 `ADMIN_PASSWORD` | 网盘文件分级流式下载/在线预览（支持 D1 分块流、GitHub 分片零内存流式拼接与 `Range` 断点续传） |
| `/api/download` | `GET`, `HEAD` | 公开 | 历史预置安装包边缘流式直链下载（向后兼容保留） |
| `/api/subscription` | `GET`, `POST` | `ADMIN_PASSWORD` 或 `ACCESS_PASSWORD` | 机场流量查询（D1 缓存 24 小时自动刷新）、VPN07 刷新、美区 Apple ID 凭证下发 |
| `/api/sub` | `GET`, `HEAD` | 永久直链 / `?token=tmp_...` | Clash YAML 订阅下发：支持永久直链（`?type=djjc\|vpn07`）与限时/限次/可吊销的临时私人链接（`?token=...`） |
| `/api/sub-links` | `GET`, `POST`, `PATCH`, `DELETE` | `ADMIN_PASSWORD` | 临时私人订阅链接生成、状态查询、吊销与删除 |
| `/api/*` | `*` | - | `[[catchall]].ts` 返回规范 404 JSON |

### D1 数据库初始化与词库脚本（[`data/schema.sql`](./data/schema.sql)）
D1 核心表：`textbook_words`、`word_derivatives`、`site_stats`、`videos`、`clash_control`、`recite_sync`、`guestbook_messages`，以及按需幂等自动创建的网盘表（`pan_files`、`pan_blobs`、`pan_meta` via [`ensurePanTables`](./functions/_lib/db.ts)）、画廊媒体表（`media_items`、`media_blobs`、`media_thumbs`、`media_meta` via [`ensureGalleryTables`](./functions/_lib/db.ts)）与临时订阅链接表 `sub_temp_links`（[`ensureSubLinksTable`](./functions/_lib/db.ts)）。初始化与词库维护命令：
```bash
npx wrangler d1 execute web-vocab-db --remote --file=data/schema.sql
python scripts/seed_d1.py
python scripts/seed_cet.py
python scripts/verify_vocab.py
```

---

## 4. 当前开发进度审计（已完成 vs 待收尾）

- **已完成并已验证通过的功能**：
  - 全站 10 个 MPA 页面迁移与全栈 TypeScript 强类型改造。
  - 首页 Claude 纸感布局：6 时段日出日落精细问候（无个人姓名）、Omnibox 即输即查（支持 `/api/vocab` 失败时降级读 `./data/vocab.json`）、心形点赞胶囊、桌面与手机顶部主题切换按钮。
  - **首页专属可折叠细长图标窄栏** + 非首页保留标准桌面可折叠侧边栏与手机端顶栏抽屉（已移除侧边栏与手机抽屉内搜索触发框，替换为横线分割 `.app-sidebar-divider`；打开手机抽屉时通过 `drawer-open` 类与遮罩 `touchmove` 拦截锁定背景页面滚动）。
  - **VS Code 风格 Quick Pick 全局命令面板**（`⌘K` 搜索页面/单词/主题、最近使用置顶、`⌘⇧P` 或输入 `>` 进入命令模式并高亮模糊匹配）。
  - **系统主题自动同步修复**：手切回到与系统一致的主题时自动清除 `localStorage` 覆盖，并监听 `pageshow` / `focus` / `visibilitychange` / `storage`。
  - **独立游乐场 [`games.html`](./games.html)**：支持 `?tab=2048|puzzle|memory` 与侧边栏高亮同步，航拍拼图与记忆翻卡复用画廊图库清单（[`photos.ts`](./src/pages/gallery/photos.ts)）；记忆翻卡（[`game-memory.ts`](./src/pages/games/game-memory.ts)）已实现开局 100% 并发预加载与进度遮罩（`#memPreloadOverlay`），移除 `loading="lazy"` 并改为原地 DOM class 切换翻转；航拍拼图（[`game-puzzle.ts`](./src/pages/games/game-puzzle.ts)）基于曼哈顿距离+线性冲突的 A*/加权 A* 求解器（[`solvePuzzle`](./src/pages/games/game-puzzle.ts#L207)）支持 3×3 与 4×4 的「提示一步」高亮闪动、70ms/步「自动求解」快速演示（不弹结算遮罩），以及可选「显示编号」角标开关。
  - **隐藏工具严格隐身且免密直达**（[`matchSlashCommands`](./src/core/nav-config.ts) 全等匹配 + 移除所有页面提示；`/bill` [`takeout.html`](./takeout.html)、`/msg` [`board.html`](./board.html)、`/clash` [`clash.html`](./clash.html)、`/key` [`key.html`](./key.html) 均已取消页面与对应接口的密码门禁，知晓命令即视为访问凭证）。
  - **智能过词彻底重构（[`recite.html`](./recite.html) / [`src/pages/recite/*`](./src/pages/recite/main.ts)）**：移除 390px 模拟手机壳、底部 TabBar、卡片盒外框、真题变形/短语块与前后端助记笔记字段（`memos` 已从 `/api/recite-sync`、[`shared/types.ts`](./shared/types.ts) 与 6 列 CSV 中彻底移除）；主过词界面采用无卡片开阔画布 + 底部 `position: fixed` 锚定三态熟练度栏（`.mark-dock`，按钮位置恒定丝毫不动，支持左右滑动/拖拽与 `←/→` 切词），并支持全屏纯享专注模式（`#zenFullscreen`，仅显示单词与中文）；**自测练习**修复 `[hidden]` 被 `display: flex/grid` 覆盖导致题型重叠的 Bug，升级为 5 选 1 紧凑无卡片开阔画布（`看英选中` / `看中选英` / `听音选义` / `拼写` / `全部混合`），答对 650ms 自动下一题，答错停住显示正解并提供一键「标不会 / 标模糊」快捷按钮。
  - **资源网盘彻底重构（[`pan.html`](./pan.html) / [`src/pages/pan/*`](./src/pages/pan/main.ts) / [`functions/api/pan.ts`](./functions/api/pan.ts) / [`functions/api/pan-file.ts`](./functions/api/pan-file.ts)）**：移出原有机场订阅与 Apple ID 前端界面（后端 `/api/sub` 与 `/api/subscription` 保持兼容），重构为统一 Claude Editorial 风格的云端文件库；实现按体积自动分级存储（`≤ 20 MB` 走 Cloudflare D1 `512 KB` 分块直存、`20–90 MB` 单步直传 GitHub Releases `v_pan`、`> 90 MB` 自动 `80 MB` 分片并在下载端 `TransformStream` 零内存流式拼接 + 支持外链登记），支持公开/私密双模式（免密公开浏览/下载/上传，私密空间与删除/编辑强制校验 `ADMIN_PASSWORD`）、拖拽多文件上传、常见文件在线预览与首批 3 个经典安装包自动一次性预置。
  - **视界画廊与视频系统重构（[`gallery.html`](./gallery.html) / [`src/pages/gallery/*`](./src/pages/gallery/main.ts) / [`functions/api/media.ts`](./functions/api/media.ts) / [`functions/api/media-file.ts`](./functions/api/media-file.ts)）**：保留 121 张航拍图作为默认「航拍精选」相册（游乐场拼图/翻卡零破坏），并将原「投递视频」合并进画廊（侧边栏精简为 8 项，[`upload.html`](./upload.html) 自动重定向 `./gallery.html?upload=1`）；支持照片+视频双上传与全页拖拽、`≤20MB CF D1 / 20–90MB GitHub 直传 / >90MB 80MB 分片` 分级存储、浏览器自动生成 WebP 缩略图与视频首帧封面、自定义相册、与网盘一致的公开/私密双模式权限控制、升级版滚轮/双指缩放与原图下载灯箱，以及旧 `videos` 表无感自动迁移。
  - **已合入 `main` 并清理旧文档**：已合并 PR #7，删除过期冗余的 `PROJECT_ARCHITECTURE.md`，全部内容整合至本 `HANDOFF.md`。
- **待收尾 / 可选清理事项**：
  1. **仓库内历史遗留冗余资产（非功能阻塞，但可择机清理）**：
     - [`src/styles/index.css`](./src/styles/index.css#L974-L1229) 末尾仍残留约 250 行旧版游乐场（`.g2048-*`、`.puzzle-*`、`.memory-*`）CSS 样式；游乐场已独立使用 [`src/styles/games.css`](./src/styles/games.css)。
     - [`public/left_avatar.png`](./public/left_avatar.png) 与 [`public/right_avatar.jpg`](./public/right_avatar.jpg) 在移除首页左上角头像后已无任何引用（[`OIP-C.jpg`](./public/OIP-C.jpg) 仍作为全站 favicon 使用，不可删除）。
  2. **运维排障速查**：
     - **接口返回 503**：Cloudflare Pages 环境变量（`ADMIN_PASSWORD`/`ACCESS_PASSWORD`）未配置或配置后未执行 `Retry deployment`。
     - **构建后静态图或 JSON 404**：静态图片须置于 `public/`；JSON 数据须列入 [`vite.config.ts`](./vite.config.ts#L5) 的 `DATA_ASSETS`。
     - **iPhone 视频无画面或无法拖拽**：检查 `/api/video` 是否返回 `206 Partial Content` 与 `Cache-Control: no-store`。
     - **Clash 状态长期离线**：检查 PC 端 `clash_daemon.pyw` 运行状态及 `X-Clash-Daemon-Secret` 是否与 Pages Secret 一致。

---

## 5. 核心逻辑与高风险避坑指南

1. **首页专属窄栏 vs 子页标准布局的强耦合（`data-active-page="index"`）**
   - **约束文件**：[`src/core/shell.ts`](./src/core/shell.ts#L74-L165)、[`src/styles/shell.css`](./src/styles/shell.css#L14-L68)。
   - **机制说明**：只有当 `activePage === "index"` 时，手机端（`< 920px`）才渲染左侧 `52px` 细长图标窄栏且不渲染 `#mobileMenuBtn`，并将 `.mobile-topbar` 的 `left` 偏移到窄栏右侧；也只有首页才读取 `cenj_sidebar_expanded`（默认收起），其他 9 个子页读取 `cenj_sidebar_collapsed`（默认展开）。
   - **避坑**：切勿在修改 [`shell.css`](./src/styles/shell.css) 时去掉 `body[data-active-page="index"]` 限定，否则会直接导致 [`takeout.html`](./takeout.html) 底部 `.tab-bar` 或 [`vocab.html`](./vocab.html) 吸顶搜索栏在手机端被左侧窄栏遮挡。

2. **首页点赞按钮跨断点 DOM 物理迁移（`syncLikeButtonSlot`）**
   - **约束文件**：[`src/pages/index/main.ts`](./src/pages/index/main.ts#L11-L27)。
   - **机制说明**：由于 `<920px` 时 `.workspace-topbar` 被 `display: none` 隐藏，`syncLikeButtonSlot()` 会监听 `matchMedia("(max-width: 919px)")` 把真实 DOM 节点 `#likeBtn` 在 `.workspace-topbar .topbar-actions` 与 `#mobileTopBar .mobile-topbar-right` 之间物理搬移（而非克隆两份按钮导致计数器或事件失步）。
   - **避坑**：若调整窗口大小从移动端切回桌面端，`desktopActions.append(likeBtn)` 会将 `#likeBtn` 放到主题切换按钮之后；若改动此处按钮顺序或结构，需保持 `#likeBtn` 与 `#likeCount` ID 唯一，并注意在 `initAppShell()` **之后** 调用搬移逻辑。

3. **系统主题自动同步与 `<head>` 内联防闪脚本的一致性**
   - **约束文件**：[`src/core/theme.ts`](./src/core/theme.ts#L44-L108) 及 10 个 `*.html` 头部内联 `<script>`。
   - **机制说明**：
     - 每次手动点击切换主题，若目标主题恰好等于当前系统主题（`getSystemTheme()`），`toggleTheme()` 会主动执行 `removeStorageItem("cenj_theme_v1")` 解除手动覆盖，之后即重新自动跟随系统切换。
     - `initThemeToggle()` 额外监听了 `pageshow`、`focus`、`visibilitychange` 与跨标签页 `storage` 事件，专门解决 iOS Safari 锁屏/后台挂起时不触发 `MediaQueryList.change` 的问题。
   - **避坑**：不要在 `toggleTheme()` 里无条件写入 `localStorage`；同时 10 个 HTML 头部内联脚本读取的 Key（`cenj_theme_v1`）与颜色值（`#faf9f5` / `#262624`）必须与 [`theme.ts`](./src/core/theme.ts) 保持完全一致。

4. **隐藏指令的严格静默策略（`/bill`、`/msg`、`/clash`）**
   - **约束文件**：[`src/core/nav-config.ts`](./src/core/nav-config.ts#L161-L261)、[`src/core/command-palette.ts`](./src/core/command-palette.ts#L345-L360)。
   - **机制说明**：`matchSlashCommands(query)` 使用精确全等 `cmd.command.toLowerCase() === raw`；同时 `command-palette.ts` 标记了 `isHiddenSlash: true` 的条目，**禁止写入 `cenj_cmd_recent_v1` 最近使用历史**，也禁止在 `>` 命令模式列表中出现。
   - **避坑**：不要把 `matchSlashCommands` 改回 `startsWith` 或在 `raw === "/"` 时返回全部指令，也不要在首页提示、placeholder、空状态或 `recentIds` 中泄露这三个路径或命令。

5. **Vite MPA 与 Biome 检查边界**
   - **约束文件**：[`vite.config.ts`](./vite.config.ts)、[`biome.json`](./biome.json)。
   - **机制说明**：
     - Vite 只打包 HTML 引用的模块及 `public/` 下静态文件；`data/*.json` 通过 `vite.config.ts` 内 `dataAssetsPlugin()` 在 dev 中拦截提供并在 build 后拷贝至 `dist/data/`。
     - [`biome.json`](./biome.json#L22) 开启了 `recommended` 规则（禁止 `.forEach()`，需使用 `for...of`；禁止无插值模板字符串），且明确忽略了 `*.html`、`scripts`、`data`、`public`。
     - 若新增测试文件涉及 Cloudflare Workers 全局类型（如 `functions/` 后端逻辑），命名必须匹配 [`tsconfig.functions.json`](./tsconfig.functions.json#L19) 的 `tests/functions-*.test.ts`，否则前端 [`tsconfig.json`](./tsconfig.json) 会报类型缺失错误。

6. **游乐场多入口与侧栏高亮联动**
   - **约束文件**：[`src/core/nav-config.ts`](./src/core/nav-config.ts#L127-L158)、[`src/pages/games/games.ts`](./src/pages/games/games.ts#L50-L82)、[`src/pages/games/main.ts`](./src/pages/games/main.ts#L7-L17)。
   - **机制说明**：侧边栏 `04 游乐场` 下三个子项指向同一个 HTML（`./games.html?tab=2048|puzzle|memory`），页面内切换 Tab 时通过 `history.replaceState` 同步 URL 并手动更新 `.app-nav-link[data-nav-id]` 的 `.active` 类名。

---

## 6. 给下一个 Agent 的首步行动指令

### 建议推进路线
1. **第一阶段：先拉取并核验 `main` 最新状态** → 确认工作区与 `npm run check` 全绿，核对 `HANDOFF.md` 与 [`AGENTS.md`](./AGENTS.md)。
2. **第二阶段（可选清理与文档对齐）**：清理 `index.css` 残留游乐场样式、`public/` 中未引用的双头像图，并同步更新或精简 `PROJECT_ARCHITECTURE.md`。
3. **第三阶段：按用户新需求迭代**（优先修改对应 `src/pages/<page>/*` 或 `functions/api/*`，每次改动必须运行 `npm run format && npm run check` 并同步更新本 `HANDOFF.md`）。

### 接手后第一条应执行的检查命令
```bash
git status && git log -n 5 --oneline && npm run check
```
- 期望结果：`working tree clean`，处于 `main` 最新合并提交，且 `npm run check`（Biome lint、前后端 `tsc`、Vitest 9 文件 44 用例、Vite MPA 打包）全部退出码 `0`。
- 若准备验证受保护服务端接口（如 `/api/subscription`、`/api/auth`、`/api/takeout`），请先确认运行环境中是否已准备好 `.dev.vars` 或 Cloudflare Pages Secrets 与 D1/KV 绑定。
