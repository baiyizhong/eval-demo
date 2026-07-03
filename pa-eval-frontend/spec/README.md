# Spec Index for LLM Agents

本文档是 `spec` 目录的唯一入口。大模型执行任务时先读本页，再按任务类型读取最少必要规范，不要一次性读取全部文档。

## 先读顺序

1. 任何任务先读本文件。
2. 涉及工程结构、目录、依赖、环境或质量门禁时，读 `spec/00-project/overview.md` 和 `spec/00-project/env-build-quality.md`。
3. 涉及页面、路由或模块时，读 `spec/20-architecture/modules.md`、`spec/20-architecture/routes.md`、`spec/20-architecture/layouts.md`。
4. 涉及 UI、样式或组件时，读 `spec/30-ui/component-guide.md`、`spec/30-ui/styles-theme.md`、`spec/30-ui/page-layout.md`。
5. 涉及具体组件时，只读对应 `spec/40-components/**` 文档和必要 pattern 文档。

## 按任务查文档

| 任务 | 必读文档 |
| --- | --- |
| 新增业务模块或页面 | `spec/20-architecture/modules.md`、`spec/20-architecture/routes.md`、`spec/30-ui/page-layout.md` |
| 新增列表页 | `spec/50-patterns/list-page.md`、`spec/40-components/common/data-table.md`、`spec/40-components/common/filter-panel.md` |
| 新增设置类页面 | `spec/50-patterns/settings-page-layout.md`、`spec/20-architecture/routes.md`、`spec/30-ui/page-layout.md` |
| 新增表单抽屉 | `spec/50-patterns/form-drawer.md`、`spec/40-components/common/drawer.md`、`spec/40-components/common/base-form.md` |
| 新增导入、删除或确认流程 | `spec/50-patterns/import-confirm.md`、`spec/30-ui/notification.md`、`spec/40-components/common/import-dialog.md` |
| 接入 API | `spec/10-foundation/api.md`、`spec/00-project/env-build-quality.md` |
| 接入权限 | `spec/10-foundation/permission.md`、`spec/20-architecture/routes.md` |
| 新增全局或模块状态 | `spec/10-foundation/state.md`、`spec/20-architecture/modules.md` |
| 修改主题、样式或 shadcn/ui 组件 | `spec/30-ui/styles-theme.md`、`spec/30-ui/component-guide.md` |
| 局部加载态 | `spec/40-components/common/loading.md` |
| 新增或接入报表图表 | `spec/40-components/charts/recharts.spec.md`、`spec/40-components/charts/chart-metric-card.spec.md`、`spec/40-components/charts/chart-avatar-list-card.spec.md`、`spec/40-components/charts/chart-bar-list-card.spec.md` |
| 使用顶部导航或页面壳 | `spec/40-components/layout/top-nav.md`、`spec/40-components/layout/page-shell.md`、`spec/20-architecture/layouts.md` |
| 使用业务组件 AppList 或 LLM Trace | `spec/40-components/business/app-list.md`、`spec/40-components/business/llm-trace-chain.md` |

## 目录说明

| 目录 | 内容 |
| --- | --- |
| `spec/00-project/` | 工程总览、环境变量、构建配置、质量门禁 |
| `spec/10-foundation/` | API、权限、状态等基础能力 |
| `spec/20-architecture/` | 模块、路由、布局和页面接入边界 |
| `spec/30-ui/` | 样式主题、组件分层、页面容器、全局反馈 |
| `spec/40-components/common/` | 跨页面通用组件 |
| `spec/40-components/charts/` | 报表图表组件和 Recharts 使用规范 |
| `spec/40-components/layout/` | 应用壳、导航和页面壳组件 |
| `spec/40-components/business/` | 跨模块业务组件 |
| `spec/50-patterns/` | 高频页面和交互组合模式 |

## 禁止事项速查

- 不要把业务页直接挂在根路由下；必须明确选择 `SidebarLayout` 或 `TopbarLayout`。
- 不要在页面里重复创建全局 provider、router、query client 或 axios 实例。
- 不要在业务代码里硬编码后端 host、部署 base path、颜色值或全局 CSS。
- 不要把单页面私有组件、hooks、store 提前放入全局目录。
- 不要新增 `src/components/index.ts` 这类全量 barrel。
- 不要用硬编码白色背景、灰色文本或 space 间距工具作为正向示例或新代码写法。
- 不要引用旧路径 `spec/*.md` 或 `spec/components/*.md` 作为规范来源。

## 验证命令

代码变更按影响范围增加：

```bash
npm run typecheck
npm run lint
npm run build
```
