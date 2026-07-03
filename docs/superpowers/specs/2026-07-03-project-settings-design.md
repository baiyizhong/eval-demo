# 项目设置前端 Mock 设计

日期：2026-07-03

## 背景

项目设置模块用于管理单个项目的基础信息、评分指标、项目成员、模型配置和项目级 API Keys。本期只实现前端 UI 与本地 mock 交互，不接入后端逻辑，不修改 Langfuse 参考代码。

入口位于项目内左侧主菜单，与“应用评测”“应用观测”同级。

## 目标

- 新增项目设置左侧主菜单入口，指向 `/projects/:projectId/settings`。
- 新增项目设置页面，包含通用设置、评分指标、项目成员、模型设置、API Keys 五个分组。
- 页面内部使用设置类布局，左侧为分组导航，右侧为当前分组内容。
- 用本地 mock 数据和 React 状态完成查看、新增、编辑、删除、归档等交互演示。
- 复用现有 UI 组件和交互模式，避免引入后端依赖。

## 非目标

- 不实现后端 API、数据库、权限校验或审计日志。
- 不新增或修改 Langfuse 原生表结构。
- 不实现真实密钥存储、真实 API Key 创建或 LLM 连接测试。
- 不调整组织设置 `/settings` 的现有语义。

## 路由设计

项目设置挂在现有 `SidebarLayout` 路由分支：

- `/projects/:projectId/settings` 默认重定向到 `/projects/:projectId/settings/general`
- `/projects/:projectId/settings/general`：通用设置
- `/projects/:projectId/settings/score-configs`：评分指标
- `/projects/:projectId/settings/members`：项目成员
- `/projects/:projectId/settings/models`：模型设置
- `/projects/:projectId/settings/api-keys`：API Keys

左侧主菜单 mock 数据新增：

- 标题：项目设置
- URL：`/projects/project_customer_agent/settings/general`
- `activeMatch: "prefix"`
- 图标：`Settings`

## 页面结构

新增模块目录：

- `src/modules/project-settings/index.tsx`：父路由页面和默认重定向组件。
- `src/modules/project-settings/nav.tsx`：项目设置分组导航。
- `src/modules/project-settings/data/mock.ts`：静态 mock 数据。
- `src/modules/project-settings/types.ts`：页面本地类型。
- `src/modules/project-settings/views/*`：五个设置分组页面。

父页面复用 `Page`、`SidebarNav`、`Separator` 和 `Outlet`。子页面复用 `ContentSection` 承载标题、说明和主要内容。

## 功能设计

### 通用设置

展示项目名称、项目 ID、所属组织、描述、创建时间、更新时间、数据保留天数。支持编辑项目名称和项目描述，提交后更新本地状态并用 toast 提示。

### 评分指标

展示指标列表，字段包含名称、类型、范围或选项、状态、更新时间。支持新增、编辑和归档。归档使用 `isArchived` 状态，不从列表物理删除。

指标类型包括 numeric、categorical、boolean、text。新增和编辑使用抽屉或对话框表单，按类型展示必要字段。

### 项目成员

展示成员姓名、邮箱、项目角色、加入时间和最近活跃时间。支持新增成员、调整角色和删除成员。角色包括 owner、admin、member、viewer。

为避免 mock 逻辑过重，本期只做前端可操作状态；保留最后一个 owner、admin 不能操作 owner 等复杂权限限制可用禁用态或提示表现，不接入真实权限。

### 模型设置

拆分为三块：

- 默认评估模型：选择已有 LLM 连接和模型名称，保存到本地状态。
- LLM 连接：展示 provider、adapter、脱敏 key、base URL、自定义模型，支持新增、编辑、删除。
- 模型定义：展示模型名称、匹配规则、计价单位、输入/输出价格，支持新增、编辑、删除。

Secret Key 只在创建成功的 mock 结果中展示一次，列表中始终显示脱敏值。

### API Keys

展示项目级 API Keys，字段包含备注、Public Key、Secret Key 脱敏值、最近使用时间、创建时间。支持新增、编辑备注和删除。

新增后展示一次性 secret 面板，模拟真实创建成功后只能查看一次完整 secret 的交互。

## 状态与数据流

- 本期不接 API。
- 初始数据来自模块内 mock 数据。
- 各子页面使用本地 `useState` 管理列表和表单状态。
- 操作成功统一使用 `toast` 提示。
- 删除、归档等危险操作使用项目现有确认组件或确认工具。

## 组件复用

- 设置布局：`Page`、`SidebarNav`、`ContentSection`
- 基础 UI：`Button`、`Input`、`Textarea`、`Select`、`Badge`、`Table`、`Dialog`、`Sheet`
- 反馈：`toast`
- 图标：`lucide-react`

如现有 `DataTable` 能低成本接入则用于成员、指标和 Key 列表；否则使用 shadcn `Table` 保持 mock 页面简单稳定。

## 验证

实现完成后运行：

- `npm run typecheck`
- `npm run lint`

如 lint 或 typecheck 暴露历史遗留问题，需要区分是否由本次改动引入。

## 约束

- 不提交代码。
- 不修改 `langfuse/`。
- 不写真实密钥、内网 token 或后端地址。
- 不硬编码后端 host。
- 不修改后端代码。
