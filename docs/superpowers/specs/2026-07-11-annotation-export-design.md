# 人工标注导出数据设计

日期：2026-07-11

## 背景

当前“应用评测 / 人工标注 / 标注列表”中的导出能力会在前端直接导出 JSON 文件。新需求要求点击导出时先打开导出弹窗，用户确认导出范围、文件类型和 metadata 拆列配置后，再由后台生成文件并以 zip 压缩包返回前端下载。

本设计覆盖人工标注任务详情页的“导出全部/当前筛选结果”和表格批量操作中的“导出选中”。两种入口复用同一个导出弹窗和同一套后端导出作业。

## 目标

- 将现有直接 JSON 下载改为导出弹窗。
- 弹窗展示任务基本信息、评分指标、导出数量和前 N 条数据明细预览。
- 支持导出范围：当前筛选结果、已选数据。
- 支持文件类型：Excel、CSV、TXT。
- 支持 metadata 顶层 key 自动拆列。
- 后台异步生成导出文件，压缩为 zip 后返回前端下载。
- Excel 导出包含“基本信息”“评分指标”“数据明细”三个 sheet。
- Excel 数据明细 sheet 中评分指标列头使用黄色底色高亮。
- Excel 单元格内容超过最大限制时自动截断，不抛出导出异常。

## 非目标

- 不改变 Langfuse 原生表结构。
- 不直接修改 trace、observation、session 或 scores 数据。
- 不实现导出任务列表页、历史导出记录管理或手动清理界面。
- 不在弹窗中加载全量明细。弹窗只展示前 N 条预览，后台按配置导出完整范围。

## 推荐方案

采用“前端导出弹窗 + 后端异步导出作业 + zip 下载”的方案。

前端打开弹窗时加载：

- 标注任务详情。
- 标注任务统计：总量、已完成、待处理。
- 评分指标配置。
- 本次导出范围下的前 N 条明细预览。

用户提交配置后，前端调用创建导出作业接口。后端记录作业状态并启动后台任务生成文件。前端轮询作业状态，成功后下载 zip，失败时展示后端返回的业务错误信息。

## 前端设计

### 入口

- 页面右侧“导出数据”：导出当前搜索和筛选命中的全部数据，不受当前分页限制。
- 表格批量操作“导出选中”：导出当前已选中的数据。

两个入口打开同一个 `AnnotationExportDialog`。弹窗接收 `scope`：

- `filtered`：当前筛选结果。
- `selected`：已选数据，提交时携带 `itemIds`。

### 弹窗内容

弹窗布局采用左侧内容预览、右侧导出配置。

基本信息：

- 任务名称。
- 任务描述。
- 导出数量：总量、已完成、待处理。

评分指标：

- 显示当前任务配置的评分指标。
- 每项展示指标 `name` 和 `dataType`。

数据明细：

- 展示前 N 条预览，默认 20 条。
- 按行展示处理人、标注状态、trace 明细、评分结果。
- trace 明细列包含 `traceID`、`observationId`、`sessionId`、`userId`、`input`、`output`、`metadata`。
- 评分项按评分指标动态生成列，列名为评分指标 `name`。
- 评分项单元格显示对应 label，不显示原始 value。

导出配置：

- 文件类型：Excel、CSV、TXT。
- Metadata 选项：是否将 metadata 顶层 key 自动转换为独立列。
- 文件名预览：标注任务名称 + 导出总数据量 + 当前导出时间。该文件名由后端按默认规则生成，前端只展示预览结果。
- 提交按钮：创建导出任务。

### 状态与反馈

- 弹窗打开时显示预览加载态。
- 创建导出作业后按钮进入处理中状态。
- 轮询期间提示“导出任务已创建，正在生成文件”。
- 成功后自动下载 zip 并提示“导出完成”。
- 失败时展示后端 `errorMessage`，不暴露内部异常细节。
- 如果导出范围为空，禁用提交按钮并提示“当前范围无可导出数据”。

## 后端 API 设计

新增接口遵循项目 REST 和统一响应格式。

### 预览导出内容

`POST /api/projects/{project_id}/annotation-queues/{queue_id}/export-preview`

请求体：

```json
{
  "scope": "filtered",
  "filters": {
    "keyword": "",
    "status": ["COMPLETED"],
    "objectType": ["TRACE"],
    "assigneeIds": ["user_1"]
  },
  "itemIds": [],
  "previewLimit": 20,
  "splitMetadata": true
}
```

响应 `data`：

```json
{
  "queue": {},
  "metrics": {
    "total": 100,
    "completed": 80,
    "pending": 20
  },
  "scoreConfigs": [],
  "metadataKeys": ["channel", "region"],
  "previewItems": []
}
```

### 创建导出作业

`POST /api/projects/{project_id}/annotation-queues/{queue_id}/export-jobs`

请求体：

```json
{
  "scope": "filtered",
  "format": "xlsx",
  "filters": {},
  "itemIds": [],
  "splitMetadata": true
}
```

响应 `data` 为作业记录，不返回 `filePath`。

### 查询导出作业

`GET /api/projects/{project_id}/annotation-queues/{queue_id}/export-jobs/{job_id}`

返回作业状态：`PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED`。

### 下载导出文件

`GET /api/projects/{project_id}/annotation-queues/{queue_id}/export-jobs/{job_id}/download`

仅当作业状态为 `SUCCEEDED` 时返回 zip 文件。未完成返回业务错误。

## 数据模型

新增 PA 扩展表 `pa_annotation_export_jobs`，通过 Alembic 迁移创建，可回滚。

审计字段必须放在首位：

- `create_by`
- `update_by`
- `create_date`
- `update_date`

业务字段：

- `id`：导出作业 ID。
- `project_id`：项目 ID。
- `queue_id`：标注任务 ID。
- `scope`：`filtered` 或 `selected`。
- `format`：`xlsx`、`csv`、`txt`。
- `status`：`PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED`。
- `total_count`：导出总量。
- `exported_count`：已导出数量。
- `file_name`：返回给前端的 zip 文件名。
- `file_path`：服务器文件路径，仅后端使用，不返回前端。
- `file_size`：zip 文件大小。
- `error_message`：失败原因。
- `started_at`：开始时间。
- `completed_at`：完成时间。
- `expires_at`：过期时间。
- `metadata`：JSONB，保存导出配置快照，包括 filters、itemIds、splitMetadata、默认文件名、内部数据文件名。

迁移脚本需要包含表注释和字段注释，并添加常用索引：

- `(project_id, queue_id)`
- `(project_id, update_date)`

## 导出数据结构

### 基本信息

字段：

- 任务名称。
- 任务描述。
- 导出范围。
- 导出总量。
- 已完成数量。
- 待处理数量。
- 导出时间。

### 评分指标

字段：

- 指标 ID。
- 指标名称。
- 指标类型。
- 指标描述。
- 分类型/布尔型选项 label。

### 数据明细

固定列：

- 数据处理人。
- 标注状态。
- traceID。
- observationId。
- sessionId。
- userId。
- input。
- output。
- metadata。

动态列：

- 如果开启 metadata 拆列，后台扫描本次导出范围内所有数据的 metadata 顶层 key，生成 `metadata.<key>` 列。嵌套对象和数组保留 JSON 字符串。
- 每个评分指标生成一列，列名为评分指标 `name`，值为评分 label。

评分 label 规则：

- `CATEGORICAL`：根据 `score_configs.categories` 中的 value 查找 label。
- `BOOLEAN`：优先按配置选项映射；无配置时使用 `True` / `False` 或项目现有中文展示约定。
- `NUMERIC`：如存在同值分类配置，显示对应 label；否则显示数值字符串。
- `TEXT`：显示 `stringValue`。
- 未标注或无匹配项时为空字符串。

## 文件格式

### Excel

zip 内包含一个 `.xlsx` 文件。

sheet：

- `基本信息`
- `评分指标`
- `数据明细`

要求：

- 数据明细 sheet 中评分指标列头使用黄色底色高亮。
- 所有单元格写入前执行字符串化。
- 单元格文本超过 Excel 限制时自动截断到安全长度。
- 不因为单个超长单元格导致整个导出失败。

### CSV

zip 内包含一个 `.csv` 文件。

- 使用 UTF-8 BOM，方便 Excel 直接打开中文。
- 只导出数据明细表格。
- 基本信息和评分指标写入 zip 内的 `manifest.json`，避免 CSV 主文件变成非标准表格。

### TXT

zip 内包含一个 `.txt` 文件，采用 JSON Lines 格式。

- 每行一条数据明细记录。
- 基本信息、评分指标和导出配置写入 zip 内额外 JSON manifest。

### ZIP

所有导出统一返回 zip。

zip 内容：

- 主数据文件：`.xlsx`、`.csv` 或 `.txt`。
- `manifest.json`：记录基本信息、评分指标、导出配置、导出数量和生成时间。

## 后端生成流程

1. 创建导出作业，状态为 `PENDING`。
2. 后台任务将状态更新为 `RUNNING`。
3. 根据 scope 获取完整导出范围：
   - `filtered`：复用标注列表筛选逻辑。
   - `selected`：按 itemIds 限定。
4. 补齐 queue、metrics、score configs、source snapshot、scores、assignee 信息。
5. 如果开启 metadata 拆列，扫描导出范围内 metadata 顶层 key。
6. 按目标格式写入临时主文件。
7. 写入 `manifest.json`。
8. 生成 zip 文件。
9. 更新作业为 `SUCCEEDED`，写入总量、文件名、路径、大小。
10. 发生异常时更新作业为 `FAILED`，错误信息使用可展示的通用文案。

## 错误处理

- 不支持的导出格式返回业务错误。
- queue 不存在或无权限返回业务错误。
- selected 范围为空返回业务错误。
- 作业未完成下载返回 409。
- 文件不存在或过期返回 404。
- 后台生成失败只返回安全文案，详细错误写服务端日志。
- 密钥、Token、数据库连接等敏感信息不写入日志或导出文件。

## 测试策略

后端：

- 测试创建、查询、下载导出作业。
- 测试 unsupported format 被拒绝。
- 测试 filtered 和 selected 两种范围。
- 测试 metadata 顶层 key 拆列。
- 测试评分 value 转 label。
- 测试 Excel 超长单元格截断。
- 测试失败作业不会暴露内部异常。
- 测试 Alembic migration 包含 `pa_` 表、审计字段和回滚。

前端：

- 测试顶部导出和批量导出都打开同一弹窗。
- 测试弹窗展示基本信息、评分指标、预览明细和导出配置。
- 测试创建导出作业、轮询、下载成功流程。
- 测试导出失败 toast。
- 测试空范围禁用提交。
- 测试 API alias 和参数结构。

## 实施边界

- 优先复用现有 `list_annotation_queue_items_for_user`、筛选构造、数据集导出作业轮询和下载模式。
- 新增导出文件生成逻辑可单独放在 `pa-eval-backend/app/annotation_exports.py`。
- 前端弹窗组件放在 `pa-eval-frontend/src/modules/app-evaluation/components/annotation-export-dialog.tsx`。
- 导出 API helper 扩展在 `annotation-api.ts`，并在全局 API registry 中注册对应 alias。
- 不改 `langfuse/` 和 `dify/` 目录。
