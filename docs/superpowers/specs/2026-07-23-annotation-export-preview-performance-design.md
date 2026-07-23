# 人工标注导出预览性能优化设计

## 目标

人工标注任务包含 1～3 万条数据时，导出弹窗应立即打开，预览接口耗时不再随命中数据量线性执行详情和评分 enrichment；不新增数据库表，不改变现有导出接口响应和后台导出任务语义。

## 设计

1. `export-preview` 复用现有列表分页与筛选计数能力：数据库或 ClickHouse 聚合得到精确总量及状态计数，只查询前 `previewLimit` 条。
2. 仅对前 `previewLimit` 条加载完整详情、ClickHouse Score 和 Trace source，禁止为全量数据执行 enrichment。
3. 前端预览请求固定使用与文件格式无关的参数；Metadata 拆列由已返回的 5 条 raw metadata 在浏览器派生，切换 Excel/CSV/TXT 或拆列开关不重新请求。
4. 创建导出任务不依赖预览完成；预览失败不阻止提交已有后台导出任务，空范围最终由后台任务按现有逻辑处理。

## 兼容性

- 保持 `/export-preview`、`/export-jobs` 契约不变。
- 保持筛选总数、待处理/已完成计数及前 5 条顺序一致。
- 保持 selected/filtered 两种范围及实际导出文件内容不变。
- 不修改 Langfuse 原生表，不新增迁移。

## 验证

- 大批量预览只 enrich 5 条，不调用全量 iterator。
- 普通筛选和 ClickHouse source 筛选均返回精确 metrics。
- 格式与 Metadata 拆列切换不进入 React Query key。
- 预览未完成时可以创建导出任务。

