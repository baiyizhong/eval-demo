# 数据集与人工标注 P0 性能优化设计

## 目标与边界

本次优化数据集导出、人工标注列表、批量预览、同步批量评分、人工标注导出和 Trace 批量创建标注任务。所有公开接口、请求参数、响应结构、排序、筛选、精确计数、部分成功语义和文件格式保持兼容。

本次不修改 Langfuse 原生表结构，不新增数据库迁移，不把同步批量评分改为异步任务，不改变现有导出任务的 `BackgroundTasks` 调度方式，不自动提交代码。

## 1. 人工标注列表

`GET /api/projects/{projectId}/annotation-queues/{queueId}/items` 改为两阶段查询。

第一阶段构造轻量候选集，执行精确 count、现有全部筛选及原排序，只返回当前页 Item ID。source 相关 keyword、metadata、input、output 条件仍在分页前执行，保证 total 和页内容不变。`hasScores` 使用存在性判断，不构造完整 Score JSON。

第二阶段仅为当前页 Item ID查询用户、assignment、source、延迟、成本和 PostgreSQL Score，再执行现有 ClickHouse Score覆盖逻辑。缺失 Trace source 使用批量 `list_trace_sources`，不再顺序调用 `get_trace`。

## 2. 批量预览

`POST /annotation-queues/{queueId}/batch-preview` 使用内部 keyset cursor 分块扫描。每批执行现有 source enrichment 与 `_filter_annotation_items`，只累计精确 total/pending/completed 和前 `limit` 个 samples，不保留整个队列。

扫描顺序保持 `updatedAt DESC, createdAt DESC, id DESC`。所有 samples 与现有实现的前 N 条结果一致。

## 3. 同步批量评分

`POST /annotation-queues/{queueId}/batch-scores` 保持同步。

第一遍分块扫描并确定完整目标 Item ID，完成 `expectedMatchCount`、`expectedPendingCount` 和 `confirmLargeBatch` 校验。所有校验完成前不产生 Score写入。

第二阶段按批调用 `prepare_annotation_score_payloads_batch_for_user`，项目 API Key只读取一次，全部 Score Request使用现有并发配置受控写入 Langfuse。按 Item聚合结果：任一 Score失败则该 Item失败且不标记完成；全部成功的 Item使用集合 SQL批量完成。

返回的 `successItemIds`、`failures` 和计数按原目标顺序组织，保持部分成功语义。

## 4. 人工标注导出

导出 preview 使用与批量预览相同的分块扫描。导出 job保持现有状态和 ZIP/CSV/TXT/XLSX格式。

文件生成执行两遍内部扫描：第一遍计算 metrics 和 split metadata keys，第二遍分块 enrichment并流式写文件。Score始终按当前批 Item范围查询，不因范围超过 500 而查询整个 Queue。

## 5. Trace 批量创建人工标注任务

保持每批 500 条、Trace去重、队列选择、默认 Score Config、历史 Score复制、分配策略和事务边界。

历史 Score通过一次集合查询获取每个 object/config最新记录，并使用集合 INSERT复制。Item assignment使用批量 UPSERT，消除按 Item顺序 SQL。

同步接口保留；显式大批量和筛选范围 Job继续复用当前 worker/cursor。

## 6. Dataset 导出

Dataset export job、文件名、格式、字段和原排序保持不变。`iter_dataset_items_for_export` 改为 `(updated_at, created_at, id)` keyset cursor，每批直接读取数据，不调用普通列表接口，不重复执行精确 count，也不使用递增 OFFSET。

## 7. 错误、事务与兼容性

- 列表与预览仍返回实时精确计数。
- 批量评分校验错误发生在任何写入之前。
- 批量评分继续允许部分成功，并保持输入顺序对应的失败明细。
- Trace任务单个数据库调用继续使用一个 PostgreSQL事务。
- 导出失败继续更新原 Job为 `FAILED`，不改变下载行为。
- 不记录 Token、密钥、input/output或敏感 metadata。

## 8. 测试与性能验证

使用 TDD覆盖：

- 两阶段列表与所有筛选的结果等价性；
- 当前页 enrichment范围；
- preview分块结果、metrics和样本顺序；
- batch score写前校验、部分成功、返回顺序和批量完成；
- 导出格式、metadata keys、metrics与行顺序；
- 历史 Score复制和 assignment集合写入；
- Dataset cursor导出的全量、无重、无漏和稳定排序。

在当前最大 60,020 条 Dataset/Annotation数据上复测：

- Annotation列表第一页 PostgreSQL耗时至少降低 50%；
- preview扫描内存不再随全队列 Item对象线性增长；
- Dataset export后续批次耗时不随页码增长；
- Trace任务复制 Score和 assignment的 SQL数量从 O(N) 降至 O(批次数)。

最终运行后端全量 pytest、Ruff、`git diff --check`，并确认没有修改 `langfuse/`、没有提交代码。
