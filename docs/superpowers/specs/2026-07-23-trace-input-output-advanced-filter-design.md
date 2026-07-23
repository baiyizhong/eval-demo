# Trace 日志 Input/Output 高级筛选设计

## 目标

在 Trace 日志页面的高级筛选中，增加 Input 和 Output 条件。两者与现有 Metadata、创建时间、Session ID、User ID 等筛选字段处于同一层级，并复用 Metadata 多条件编辑方式。

筛选直接作用于 Trace 自身的 `input`、`output`，不检查 Trace 下属 Observation。列表总数、分页结果以及基于“全部匹配项”的批量操作必须使用同一套筛选条件。

## 已确认的产品语义

- Metadata、Input、Output 是高级筛选中三个相互独立的同级字段，不存在包含或嵌套关系。
- 三个字段都支持添加、删除多条条件。
- 每条条件结构统一为 `{ key, operator, value }`，其中 key 必填。
- 操作符沿用 Metadata 当前能力：
  - `contains`：提取目标 key 的值后执行包含匹配；
  - `equals`：提取目标 key 的值后执行精确匹配；
  - `exists`：判断目标 key 是否存在，value 不参与查询。
- key 仅表示 JSON 对象的顶层字段名。本次不增加点路径、数组下标或 JSONPath 语法。
- 同一字段中的多条条件，以及 Metadata、Input、Output 之间的条件，统一使用 AND 组合。
- Input/Output 不是 JSON 对象、JSON 无法解析或不存在指定 key 时，该条件不匹配。
- 本次不提供针对整段 Input/Output 纯文本的无 key 搜索。

## 方案选择

### 采用：同级独立字段

在现有 `筛选条件` 分组中，将 Metadata、Input、Output 配置为三个同级的自定义筛选字段。每个字段维护独立条件数组，但复用同一个 Trace 模块私有条件编辑器。

该方案与现有高级筛选结构一致，用户可以明确区分筛选目标，也不会改变公共 `FilterPanel` 的职责。

### 未采用：统一条件列表

将目标类型放入每条条件，通过下拉框选择 Metadata、Input 或 Output。该方案更紧凑，但改变现有 Metadata 交互，单条条件的信息密度和误操作风险更高。

### 未采用：标签页分组

使用 Metadata、Input、Output 标签页切换编辑器。该方案节省纵向空间，但隐藏标签中的生效条件不易被发现，需要额外状态提示。

## 前端设计

### 筛选字段与组件

在 Trace 日志高级筛选的同一个 `FilterGroup.fields` 中按以下顺序配置字段：

1. Metadata
2. Input
3. Output
4. Trace 创建时间范围
5. Session ID
6. 其余现有字段

Metadata、Input、Output 使用同一个 Trace 模块私有对象条件编辑器。编辑器通过标题和提交字段名等配置适配三类筛选，保持现有两行条件布局：第一行是 key 和删除操作，第二行是操作符和 value。

编辑器继续使用现有中文输入法 composition 处理，避免拼音组合阶段提前写入错误筛选值。不修改公共 `FilterPanel`、公共 DataTable 或其他业务页面组件。

### 状态与 URL

新增两个 URL 筛选字段：

- `inputFilters`：JSON 数组；
- `outputFilters`：JSON 数组。

现有 `metadataFilters` 保持不变。页面刷新或复制链接后，三个条件数组均可恢复。

条件变更继续沿用 FilterPanel 当前即时生效机制，不新增“应用”按钮或额外弹窗。key 为空的编辑态条件在生成 API 查询时被剔除，不参与查询；清空高级筛选时三个条件数组一并清除。

### 请求构造

Trace 列表查询类型增加 `inputFilters`、`outputFilters`。构建请求时对三个条件数组执行统一规范化：

- 丢弃非对象项和空 key 条件；
- 将未知操作符回退为 `contains`；
- `exists` 条件不依赖 value；
- 有效数组序列化为 JSON 字符串，空数组不发送。

规范化后的两个新增条件需要参与非时间筛选状态计算，并写入 DataTable 查询 key，确保条件变化触发正确请求。

## API 与后端设计

### 接口参数

现有 `GET /api/projects/{project_id}/traces` 增加可选查询参数：

- `inputFilters`；
- `outputFilters`。

参数格式与 `metadataFilters` 一致，均为 JSON 数组字符串。API 响应结构保持不变。

普通列表请求沿用 Metadata 当前兼容策略：参数不是合法 JSON 数组时按无有效条件处理。批量操作中的筛选快照继续执行严格校验，格式错误时返回现有 Trace 筛选格式业务错误，不启动任务。

### ClickHouse 查询

Trace reader 的列表、计数和筛选构造接口增加 `input_filters`、`output_filters`。查询直接作用于 Langfuse ClickHouse `traces` 表中的 Trace `input`、`output` 字段，不修改任何表结构。

每条条件按以下顺序处理：

1. 校验 key 非空；
2. 判断 payload 是可读取的 JSON 对象并且顶层 key 存在；
3. `exists` 到此即匹配；
4. `equals` 或 `contains` 提取字段值后按现有 Metadata 比较语义执行匹配。

查询参数必须使用 ClickHouse 参数绑定。不得拼接用户输入的 key 或 value。多个条件生成 AND 表达式。

同一个筛选 SQL 必须用于精确总数和分页数据查询。Trace 总数缓存 key 增加规范化后的 `inputFilters`、`outputFilters`，避免不同条件错误共享缓存。

用于本地回退或测试的内存匹配逻辑同步支持这两个条件，语义与 ClickHouse 保持一致。

### 全部匹配项与批量操作

Trace 列表的“选择全部匹配项”会保存当前规范化筛选快照。快照解析白名单增加：

- `inputFilters` → `input_filters`；
- `outputFilters` → `output_filters`。

批量导出、添加数据集、添加标注任务在按筛选条件解析 Trace 时，必须携带这两个字段，确保批量操作对象与页面当前总数及列表一致。

## 异常与兼容性

- Input/Output 非 JSON 对象或 key 不存在时只判定条件不匹配，不暴露 ClickHouse 内部错误。
- 普通列表的非法筛选字符串沿用现有宽松兼容行为；批量筛选快照沿用现有业务错误码管理。
- 不改变 Metadata、时间范围、分页、排序、Score 筛选及现有 URL 参数行为。
- 不修改 Langfuse 或 PA 数据库表，不需要 Alembic 迁移。
- 不修改 `langfuse/`、`dify/` 参考代码。

## 测试与验证

### 前端

- Metadata、Input、Output 以三个同级自定义字段出现；
- 三者复用同一条件编辑器，key 均为必填语义；
- Input/Output 支持添加、删除、`contains`、`equals`、`exists`；
- IME 输入处理保持有效；
- URL 能序列化并恢复 `inputFilters`、`outputFilters`；
- 请求构造能过滤空 key、规范化操作符并正确序列化；
- 列表“全部匹配项”的筛选快照保留新增条件。

### 后端

- API 能解析并向 reader 透传多个 Input/Output 条件；
- 非法普通查询参数按无条件处理，非法批量筛选快照返回业务错误；
- ClickHouse SQL 覆盖 `contains`、`equals`、`exists` 和多条件 AND；
- 非 JSON、非对象及 key 不存在时不匹配；
- 列表总数、分页查询、计数缓存 key均包含新增条件；
- 批量筛选快照能够规范化并传递新增条件；
- 原 Metadata 筛选及无新增条件查询通过回归测试。

实施后按影响范围运行前端相关测试、`npm run typecheck`、`npm run lint`，以及后端相关 pytest 与项目现有 Python 静态检查命令。

## 非目标

- 不筛选 Observation 的 Input/Output；
- 不提供整段 payload 的无 key 文本搜索；
- 不支持嵌套 key、数组下标或 JSONPath；
- 不调整高级筛选面板宽度、布局骨架或公共组件；
- 不新增数据库字段、索引或物化视图。
