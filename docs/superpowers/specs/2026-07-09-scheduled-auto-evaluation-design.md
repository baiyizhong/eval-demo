# 定时自动评测设计

日期：2026-07-09

## 背景

当前 PA 自动评测支持创建任务后立即执行一次，也支持手动重跑。Trace 数据源已经具备按时间范围筛选和预览的能力，前端时间控件使用 `datetime-local`，可以支持小时级选择。

本设计在现有自动评测能力上增加“定时评测”。定时评测不作为独立业务模块，而是自动评测任务的一种运行模式，但调度配置独立存放，避免影响现有立即执行链路。第一阶段默认按天执行，默认评测窗口为“上一天 00:00 到当天 00:00”的 Trace 数据，同时保留失败重试和手动重复执行能力，避免一次失败后任务长期停滞。

Langfuse 原生 `cron_jobs` 表只适合作为内部全局任务的 checkpoint 和锁，不承载 PA 自动评测所需的 project、评估器、Trace 过滤、时区、启停、删除、运行历史等业务字段。因此本设计不复用 `cron_jobs` 作为定时评测任务表，也不修改 Langfuse 原生表结构。

## 目标

- 在自动评测任务中支持“立即执行”和“定时执行”两种运行模式。
- 定时执行默认每天触发一次，内部用 cron 表达式描述调度规则。
- 定时任务默认选择上一天 00:00 到当天 00:00 的 Trace 数据。
- Trace 时间窗口支持小时级配置，边界语义为 `[start, end)`。
- 创建定时任务后默认不自动执行，需要用户显式启动。
- 支持任务启动、停止、物理删除和手动重复执行。
- 支持失败重试，重试策略独立于 cron 调度。
- 每次定时触发、失败重试、手动重跑都生成独立运行记录，不覆盖历史结果。
- 不修改 `langfuse/` 参考源码，不修改 Langfuse 原生表结构。

## 非目标

- 第一阶段不开放完整 cron 表达式编辑器给普通用户。
- 第一阶段不支持分钟级时间窗口。
- 第一阶段不支持复杂日历规则，例如工作日、节假日、每月最后一天。
- 不把 PA 定时评测任务写入 Langfuse `cron_jobs`、`job_configurations` 或 `job_executions`。
- 不实现跨项目共享调度任务。

## 方案比较

### 方案 A：扩展现有自动评测任务表

在 `pa_auto_evaluation_tasks` 上增加调度相关字段，例如 `run_mode`、`schedule_status`、`schedule_config`、`next_run_at`。在 `pa_auto_evaluation_runs` 上增加触发来源、调度窗口、尝试次数等字段。

优点：

- 符合“定时评测是自动评测运行模式”的产品语义。
- 复用现有任务列表、详情、运行记录、报告关系和执行逻辑。
- 第一阶段改动面较小，前后端都可以沿用自动评测模块。
- 手动执行和定时执行共享一套任务配置，用户理解成本低。

代价：

- `pa_auto_evaluation_tasks` 会承载更多状态字段，需要明确字段边界，避免任务状态和调度状态混用。
- 对现有立即执行任务表有侵入，后续如果支持一个任务多个调度规则，需要再次拆表。

### 方案 B：新增 `pa_auto_evaluation_schedules` 表

新增一张 PA 调度表，与自动评测任务一对一或一对多关联。调度状态、cron、时区、下次触发时间都放在新表中。

优点：

- 调度模型更独立，未来支持一个任务多个调度规则时扩展更自然。
- 任务基础配置和调度配置物理隔离。
- 对现有 `pa_auto_evaluation_tasks` 和立即执行功能影响更小。
- 启动、停止、删除等调度生命周期可以独立演进。

代价：

- 第一阶段只有一个调度规则时，表关系和接口会偏重。
- 列表、详情、启停、删除都需要额外联表和一致性处理。

### 方案 C：复用 Langfuse `cron_jobs`

将 PA 定时评测写入 Langfuse 原生 `cron_jobs`。

优点：

- 表名看起来贴近 cron 概念。

代价：

- `cron_jobs` 只有 `name`、`last_run`、`job_started_at`、`state` 等内部字段，缺少 PA 业务字段。
- 无法自然表达 project、评估器、Trace 过滤、cron、时区、启停、删除、审计和运行历史。
- 会把 PA 业务语义塞进 Langfuse 内部表，违反“不修改/不滥用 Langfuse 原生表结构”的约束。

## 推荐方案

采用方案 B：新增 `pa_auto_evaluation_schedules` 表。自动评测任务仍保存在 `pa_auto_evaluation_tasks`，调度配置、调度状态和下次触发时间独立保存在调度表中。

这个方案更适合当前诉求：创建后不自动执行、支持物理删除、尽量不影响已有立即执行功能，并且后续如果要支持一个任务多个调度计划，不需要再次迁移调度字段。

底层调度规则统一使用 cron 表达式，便于后续扩展每小时、每周、自定义周期。前端第一阶段不直接暴露 cron 输入，而是提供“每天几点执行”的简单控件，保存时转换为 cron，例如每天 01:00 执行保存为 `0 1 * * *`。

失败重试不依赖 cron 表达式，而是使用独立的 `retry_policy`。cron 负责“何时产生一次计划执行”，retry 负责“这次计划执行失败后如何补救”。手动重复执行也独立于 cron，可对某个历史窗口重新生成一条 run。

## 核心语义

### 运行模式

- `IMMEDIATE`：创建后立即执行一次，沿用现有自动评测行为。
- `SCHEDULED`：创建后生成自动评测任务和调度配置，但默认不执行；用户启动后才按照调度配置执行，也可以手动执行一次。

### 调度状态

- `DRAFT`：调度已保存但未启动，创建后默认状态。
- `ACTIVE`：调度启用，调度器会按 `next_run_at` 触发。
- `PAUSED`：调度暂停，保留配置和历史运行记录。

任务执行状态和调度状态分开表达。一次 run 可以是 `PENDING`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED`，任务的调度状态仍然可以保持 `ACTIVE`。

### 时间窗口

默认窗口为上一天 00:00 到当天 00:00，使用任务配置的 timezone 计算。

边界语义：

```text
window_start <= trace.timestamp < window_end
```

示例：任务在 `Asia/Shanghai` 每天 01:00 触发，2026-07-09 01:00 的默认窗口为：

```text
2026-07-08 00:00:00 <= trace.timestamp < 2026-07-09 00:00:00
```

第一阶段窗口支持小时级偏移，例如上一天 02:00 到当天 02:00。前端沿用 Trace 选择能力中的时间控件和预览接口。

### 启动、停止、删除

- 启动：将 `pa_auto_evaluation_schedules.status` 置为 `ACTIVE`，计算 `next_run_at`。启动动作不立即执行，等下一个触发点；用户可点击“立即执行一次”手动补跑。
- 停止：将 `pa_auto_evaluation_schedules.status` 置为 `PAUSED`，不删除配置、运行历史和报告。
- 删除：物理删除 PA 自有的调度记录和对应自动评测任务记录，停止后续调度；关联运行记录和报告按现有自动评测删除策略处理，不触碰 Langfuse 原生 Trace、Score、Dataset 等数据。
- 重复执行：用户可基于当前配置或指定历史窗口手动创建一条 run，不影响 `next_run_at`。

### 并发与幂等

同一任务同一调度窗口只允许存在一个由调度触发的有效 run。调度器触发前先根据 `task_id + trigger_source + window_start + window_end` 做幂等检查。

如果上一条 run 仍在执行，下一次触发默认跳过并记录一条调度事件；第一阶段不排队，避免积压导致成本失控。后续如果需要补齐漏跑窗口，可增加“补跑未完成窗口”能力。

## 数据模型

### 新增 `pa_auto_evaluation_schedules`

新增 PA 调度扩展表，审计字段放在字段定义首位：

```text
create_by           varchar     创建人
update_by           varchar     更新人
create_date         timestamptz 创建时间，默认当前时间
update_date         timestamptz 更新时间，默认当前时间
id                  varchar     调度 ID
project_id          varchar     项目 ID
task_id             varchar     自动评测任务 ID
status              varchar     调度状态：DRAFT / ACTIVE / PAUSED
cron_expression     varchar     cron 表达式，例如 0 1 * * *
timezone            varchar     时区，例如 Asia/Shanghai
window_config       jsonb       Trace 时间窗口配置
retry_policy        jsonb       失败重试策略
next_run_at         timestamptz 下次计划触发时间
last_scheduled_at   timestamptz 最近一次调度触发时间
last_window_start   timestamptz 最近一次调度窗口开始时间
last_window_end     timestamptz 最近一次调度窗口结束时间
```

建议第一阶段保持 `task_id` 唯一，即一个自动评测任务最多一个调度配置；后续如需多个调度规则，移除唯一约束并调整前端展示即可。

`window_config` 和 `retry_policy` 示例：

```json
{
  "windowConfig": {
    "mode": "previous_day",
    "startHour": 0,
    "endHour": 0
  },
  "retryPolicy": {
    "maxAttempts": 3,
    "backoffMinutes": [10, 30, 60]
  }
}
```

数据库变更必须通过 Alembic 实现，支持 downgrade，并补充表注释和字段注释。

### `pa_auto_evaluation_tasks` 调整

尽量不增加调度字段。为了列表筛选和兼容前端，可以只增加或复用最小运行模式字段：

```text
run_mode            varchar     运行模式：IMMEDIATE / SCHEDULED
```

如果现有任务表已经可以通过关联 schedule 判断是否为定时任务，则 `run_mode` 也可以不新增，由接口组装返回。

### `pa_auto_evaluation_runs` 调整

新增字段建议：

```text
trigger_source      varchar     触发来源：MANUAL / SCHEDULED / RETRY
window_start        timestamptz 本次评测 Trace 窗口开始时间
window_end          timestamptz 本次评测 Trace 窗口结束时间
scheduled_fire_at   timestamptz 本次计划触发时间
attempt_no          integer     第几次尝试，从 1 开始
parent_run_id       varchar     重试 run 指向原始 run
run_config_snapshot jsonb       本次运行配置快照
```

运行记录保存快照，确保任务配置后续变更后，历史 run 仍可追溯当时使用的评估器、Trace 过滤、时间窗口和重试策略。

## 后端设计

### 调度器

Plus 层增加一个轻量调度循环，定期扫描：

```text
pa_auto_evaluation_schedules.status = ACTIVE
next_run_at <= now()
```

扫描到任务后：

1. 获取任务级锁，防止多实例重复触发。
2. 根据 cron、timezone 和 window 配置计算本次 `window_start/window_end`。
3. 做幂等检查，避免同一窗口重复创建计划 run。
4. 创建 `SCHEDULED` run，并复用现有自动评测执行逻辑。
5. 计算并更新下一次 `next_run_at`。

锁可以第一阶段使用数据库行级锁或应用层 advisory lock。可以借鉴 Langfuse `cron_jobs` 的 checkpoint/锁思路，但不复用其表承载 PA 业务任务。

### 失败重试

run 失败后，如果 `attempt_no < maxAttempts`，按 `backoffMinutes` 计算下一次重试时间。重试创建 `trigger_source = RETRY` 的新 run，`parent_run_id` 指向首次失败 run，并复用相同窗口和配置快照。

如果重试全部失败，任务调度状态仍保持 `ACTIVE`，下一次 cron 触发继续评测新的时间窗口。失败信息显示在任务详情和运行记录中。

### API

沿用 RESTful 风格和统一响应格式。

建议新增或扩展接口：

```text
POST   /projects/{projectId}/auto-evaluation-tasks
PATCH  /projects/{projectId}/auto-evaluation-tasks/{taskId}
POST   /projects/{projectId}/auto-evaluation-tasks/{taskId}/schedule
PATCH  /projects/{projectId}/auto-evaluation-tasks/{taskId}/schedule
POST   /projects/{projectId}/auto-evaluation-tasks/{taskId}/schedule/start
POST   /projects/{projectId}/auto-evaluation-tasks/{taskId}/schedule/pause
DELETE /projects/{projectId}/auto-evaluation-tasks/{taskId}
POST   /projects/{projectId}/auto-evaluation-tasks/{taskId}/runs
GET    /projects/{projectId}/auto-evaluation-tasks/{taskId}/runs
```

`POST /runs` 支持手动执行一次，可传入 `windowStart/windowEnd`；不传时使用当前任务配置计算默认窗口。

创建定时任务时可以由 `POST /auto-evaluation-tasks` 在一个事务内创建任务和 schedule，也可以先创建任务再调用 `POST /schedule`。第一阶段推荐前端一次提交，后端事务内完成，避免出现只有任务没有调度配置的半成品。

### 错误处理

- cron 配置非法：返回可展示的业务错误。
- Trace 窗口命中 0 条：第一阶段 run 标记为 `FAILED`，失败原因展示“未命中 Trace 数据”。
- 任务正在运行时再次触发：调度触发跳过并记录原因；手动触发返回业务错误，提示已有运行中的任务。
- 删除调度任务时如存在运行中的 run：返回业务错误，提示先停止或等待运行结束，避免物理删除破坏执行中的上下文。
- 调度器异常：不影响 API 服务启动；记录日志和 txId，下一轮扫描继续处理。

## 前端设计

### 创建和编辑

自动评测创建表单增加“运行方式”：

- 立即执行。
- 定时执行。

选择定时执行后展示：

- 执行频率：第一阶段固定为“每天”。
- 执行时间：小时级选择，例如 01:00。
- 时区：默认 `Asia/Shanghai`，后续可跟随项目设置。
- Trace 时间窗口：默认上一天 00:00 到当天 00:00，支持小时级调整。
- 失败重试：默认开启，最多 3 次，间隔 10、30、60 分钟。

点击“保存”后只创建任务和调度配置，不自动执行。保存成功后列表状态显示为“草稿”，用户需要点击“启动”后才进入定时调度。

前端不直接展示 cron 输入。后端返回的 cron 可作为详情页中的只读技术信息展示给管理员。

### 列表和详情

自动评测列表增加：

- 运行方式列：立即 / 定时。
- 调度状态列：草稿 / 已启动 / 已暂停。
- 下次执行时间。
- 操作：启动、停止、立即执行一次、删除。

任务详情增加：

- 调度配置卡片。
- 下次执行时间和最近调度时间。
- 运行记录中展示触发来源、时间窗口、尝试次数和失败原因。

## 测试策略

### 后端

- cron 表达式生成和解析测试。
- timezone 下默认窗口计算测试。
- `[start, end)` Trace 过滤边界测试。
- 调度扫描只触发到期 ACTIVE 任务。
- 创建定时任务后 schedule 状态为 DRAFT，且不会立即创建 run。
- 同一任务同一窗口幂等测试。
- 运行中任务遇到下一次触发时跳过测试。
- 失败重试次数和 backoff 计算测试。
- start、pause、delete API 状态流转和物理删除测试。

### 前端

- 创建定时任务 payload 包含 `runMode` 和 schedule 配置。
- 创建成功后状态显示为草稿，不展示为运行中。
- 默认时间窗口显示为上一天 00:00 到当天 00:00。
- 小时级窗口调整后 payload 正确。
- 列表操作按钮在不同状态下显示和禁用正确。
- 详情页运行记录展示 `MANUAL`、`SCHEDULED`、`RETRY`。

## 实施顺序

1. 后端 Alembic 新增 `pa_auto_evaluation_schedules`，并给运行记录增加触发来源、窗口和重试字段。
2. 后端扩展自动评测任务 schema、创建、编辑、删除和运行接口，支持事务内创建 task + schedule。
3. 后端实现时间窗口计算、cron 解析、幂等和重试策略。
4. 后端增加调度循环或调度入口，扫描 schedule 表。
5. 前端扩展自动评测创建/编辑表单，保存后默认草稿。
6. 前端扩展列表、详情和运行记录展示。
7. 补齐后端和前端测试。

## 待后续扩展

- 高级 cron 编辑器和 cron 预览。
- 每小时、每周、每月等更多频率。
- 任务漏跑窗口补跑。
- 多实例调度器的更强租约和监控页面。
- 调度事件审计表，例如 `pa_auto_evaluation_schedule_events`。
