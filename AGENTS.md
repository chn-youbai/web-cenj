# AGENTS.md — Web-Cenj AI 协作与文档同步规范

所有在本仓库工作的 AI 助手 / Coding Agent 必须严格遵守以下规则：

## 1. 强制与 `HANDOFF.md` 保持双向同步
1. **接手先读文档**：开始任何分析或编码前，必须先阅读根目录的 [`HANDOFF.md`](./HANDOFF.md)，并通过 `git status`、`git log -n 5 --oneline` 与源码核对当前真实状态。
2. **改动必同步更新**：凡是执行了以下任意动作，必须在同一轮次内同步更新 [`HANDOFF.md`](./HANDOFF.md)：
   - 新增、删除或重命名页面、模块、API 路由或测试文件（更新第 2 节文件地图）；
   - 修改核心交互机制、认证鉴权流、导航规则、环境变量或高风险耦合约束（更新第 1 / 3 / 5 节）；
   - 完成或新增待办任务、合并 PR、切换或推进分支提交（更新顶部状态与第 4 / 6 节）。
3. **禁止盲从过期内容**：若发现旧文档 [`PROJECT_ARCHITECTURE.md`](./PROJECT_ARCHITECTURE.md) 与当前代码不一致，一律以真实代码为准，并在 `HANDOFF.md` 中明确记录最新状态。

## 2. 工程与安全硬性约束
- **提交前质量门禁**：任何代码修改后必须运行 `npm run format && npm run check`（Biome + 前后端 TypeScript 双校验 + Vitest + Vite MPA 构建）且全部通过。
- **隐藏工具严格静默**：`takeout.html`（`/bill`）、`board.html`（`/msg`）、`clash.html`（`/clash`）不得出现在可见导航、占位符、提示文案、命令面板 `>` 列表或最近使用记录中；`matchSlashCommands` 必须保持精确全等匹配。
- **零密钥硬编码**：严禁将任何密码、PAT、Token 或 `.env` 实际值写入仓库文件。
