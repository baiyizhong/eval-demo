# 批量标注支持编辑已完成数据设计

## 背景

批量标注工作台允许用户在“已完成”或“全部”视图勾选数据并选择一个评分指标保存，但当前前端始终以 `status=PENDING` 调用批量评分接口，并把全部选中数量作为 `expectedPendingCount`。已完成数据在后端无法命中待标注集合，因此接口返回错误码 `1027`。

人工标注项的 `status` 是数据级完成状态，不是评分指标级状态。已完成数据仍需要支持补充此前未评分的指标，以及修改已经保存过的指标。

## 目标

- 批量保存支持同时处理 `PENDING` 和 `COMPLETED` 标注项。
- 已完成项可以新增不同评分指标，也可以修改已有评分指标。
- 待标注项保存成功后变为 `COMPLETED`。
- 已完成项保存成功后继续保持 `COMPLETED`。
- 保留旧批量接口调用方的 `expectedPendingCount` 行为，避免无关调用回归。
- 批量提交前后选中数据发生删除或权限变化时，仍能通过数量校验阻止误提交。

## 方案

### 前端

批量标注工作台调用 `batch-scores` 时：

- `filters` 只传精确选中的 `itemIds`，不再强制附加 `status: ['PENDING']`。
- 使用新增字段 `expectedMatchCount` 传递提交时的选中数量。
- 仍然只提交用户本次选择的一个评分指标。
- 保存成功后继续使用后端返回的 `successItemIds` 更新选中状态和列表缓存。

请求示例：

```json
{
  "filters": {
    "itemIds": ["item-1", "item-2"]
  },
  "scores": [
    {
      "configId": "score-relevance",
      "value": 4,
      "stringValue": "",
      "comment": ""
    }
  ],
  "expectedMatchCount": 2,
  "confirmLargeBatch": false
}
```

### 后端

`AnnotationBatchScorePayload` 新增可选字段 `expected_match_count`，API alias 为 `expectedMatchCount`。

批量保存分为两种兼容模式：

1. 新模式：请求包含 `expectedMatchCount`。
   - 按全部过滤条件获取 `target_items`。
   - 校验 `expectedMatchCount == len(target_items)`。
   - 对所有 `target_items` 写入评分，不区分 `PENDING` 和 `COMPLETED`。
2. 兼容模式：未提供 `expectedMatchCount`，仍使用 `expectedPendingCount`。
   - 保持现有行为，只统计和处理 `PENDING` 数据。
   - 避免改变旧调用方的接口语义。

新模式数量不一致时继续使用业务错误码 `1027`，错误信息调整为：

```text
批量标注选中数据已变化，请刷新列表后重试
```

### 状态与评分写入

底层评分 ID 由项目、队列、标注项、评分指标和源对象共同确定：

- 同一标注项的不同指标生成不同 score ID，因此可以补充新指标。
- 同一标注项的同一指标生成相同 score ID，因此重复保存执行修改语义。
- 评分写入成功后统一调用现有完成方法。该方法对 `PENDING` 项设置 `COMPLETED`，对已完成项重复设置 `COMPLETED`，不会把状态改回待标注。

## 返回结果

新模式下：

- `successCount`：成功保存的全部选中项数量。
- `failureCount`：评分写入失败的选中项数量。
- `successItemIds`：成功保存的选中项 ID。
- `skippedCount`：固定为 `0`，因为已完成项不再跳过。

兼容模式维持现有返回语义，已完成项计入 `skippedCount`。

## 错误处理

- 选中数据数量变化：返回 `409 / code 1027`，要求刷新列表。
- 评分指标不属于当前任务、指标不存在或已归档：沿用现有业务错误。
- 单项评分写入失败：继续汇总到 `failures`，不影响其他选中项处理。
- 大于 100 条的确认逻辑按实际目标数据数量判断。

## 测试范围

### 后端

- 新模式能够给全部为 `COMPLETED` 的选中项保存不同指标。
- 新模式能够同时处理 `PENDING` 和 `COMPLETED` 项。
- 新模式匹配数量变化时返回 `1027`。
- 新模式大批量确认使用全部目标数量。
- 旧 `expectedPendingCount` 模式继续只处理待标注项。

### 前端

- 批量保存请求不再强制携带 `status=PENDING`。
- 请求使用 `expectedMatchCount`，值等于选中项数量。
- 仍然只提交当前选择的评分指标。

## 非目标

- 不引入评分指标级完成状态。
- 不调整标注队列或 Langfuse 原生表结构。
- 不修改单条标注保存接口。
- 不改变顶部列表筛选和分页交互。
