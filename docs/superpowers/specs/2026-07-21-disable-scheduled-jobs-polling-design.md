# 取消定时任务页面自动轮询设计

## 目标

取消定时任务页面中任务列表和执行日志的固定 3 秒自动轮询，减少页面停留期间的不必要请求。

## 行为

- 任务列表不再配置 `refetchInterval`。
- 执行日志不再配置 `refetchInterval`。
- 页面首次进入时仍正常请求当前 Tab 数据。
- 分页、筛选和 Tab 切换时仍按现有逻辑请求数据。
- 保留现有“刷新”按钮，点击后仍刷新任务列表和执行日志相关查询。
- 不调整定时任务的创建、编辑、暂停、恢复、触发和删除逻辑。

## 实现

从 `pa-eval-frontend/src/modules/scheduled-jobs/index.tsx` 的 `taskTableRequest` 和 `logTableRequest` 中删除固定的 `refetchInterval: 3000`。

在现有定时任务源码测试中增加断言，确保任务列表和日志列表均不再配置 `refetchInterval`，同时保留手动刷新查询失效逻辑。

## 验证

- 定向测试通过。
- TypeScript 类型检查通过。
- 相关文件 ESLint 无错误。
- 前端生产构建通过。
