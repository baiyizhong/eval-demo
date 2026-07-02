# 导入与确认流程模式

## 适用任务

- 新增文件导入入口。
- 新增删除、覆盖、提交、退出等确认流程。
- 给异步操作补充 toast、confirm 和错误反馈。

## 相关源码

- `src/components/common/import-dialog.tsx`
- `src/components/common/confirm-dialog.tsx`
- `src/lib/confirm.ts`
- `src/components/common/confirm-provider.tsx`
- `src/components/layout/root-layout.tsx`

## 必读前置

- `spec/30-ui/notification.md`
- `spec/40-components/common/import-dialog.md`
- `spec/40-components/common/confirm-dialog.md`

## 核心规则

- 非阻塞结果提示使用 `toast`。
- 需要用户选择后继续执行的操作使用 `confirm()`。
- 文件导入使用 `ImportDialog` 选择和校验文件，解析、上传和错误处理由调用方完成。
- 删除、覆盖等高风险操作必须设置 `destructive: true`。
- 提示文案直接说明结果或风险，不只写“成功”“失败”。

## 推荐示例

```tsx
const confirmed = await confirm({
  title: '删除任务',
  desc: '删除后无法恢复，确定要继续吗？',
  confirmText: '删除',
  destructive: true,
})

if (!confirmed) return

await deleteTask()
toast.success('任务已删除')
```

## 禁止事项

- 不要用 toast 承载必须确认的危险操作。
- 不要在页面内重复实现全局确认弹窗容器。
- 不要让 `ImportDialog` 解析文件或请求业务接口。
- 不要把复杂表单塞进 toast 自定义内容。

## 检查清单

- 低风险反馈使用 toast，高风险流程使用 confirm。
- 确认弹窗标题、描述、按钮文案明确。
- 文件类型限制同时覆盖 MIME、扩展名或通配类型。
- 取消路径不会继续执行业务请求。
- 涉及代码变更时运行 `npm run typecheck`。
