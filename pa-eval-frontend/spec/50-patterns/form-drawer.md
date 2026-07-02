# 表单抽屉组合模式

## 适用任务

- 新增右侧新建、编辑或详情抽屉。
- 在抽屉中组合表单校验、提交按钮、加载态和关闭逻辑。
- 将页面内重复抽屉状态管理收敛到统一模式。

## 相关源码

- `src/components/common/drawer.tsx`
- `src/components/common/base-form.tsx`
- `src/hooks/use-dialog-state.tsx`

## 必读前置

- `spec/40-components/common/drawer.md`
- `spec/40-components/common/base-form.md`
- `spec/30-ui/notification.md`

## 核心规则

- `Drawer` 只负责容器、标题、内容区和操作区，不负责业务请求。
- `BaseForm` 负责创建表单实例和接入 schema，字段渲染由调用方通过 render props 完成。
- 新建和编辑抽屉的 open 状态由页面或模块 hook 管理。
- 提交成功后由业务逻辑决定关闭抽屉、刷新列表和展示 toast。
- 危险提交或覆盖操作先使用 `confirm()` 二次确认。

## 推荐示例

```tsx
<Drawer
  open={open}
  onOpenChange={setOpen}
  title='编辑配置'
  confirmText='保存'
  confirmProps={{ type: 'submit', form: 'module-form' }}
>
  <BaseForm
    id='module-form'
    schema={schema}
    defaultValues={defaultValues}
    onSubmit={handleSubmit}
    className='flex flex-col gap-4'
  >
    {(form) => (
      <>
        {/* FormField fields */}
      </>
    )}
  </BaseForm>
</Drawer>
```

## 禁止事项

- 不要让 `Drawer` 直接发请求或读取模块 store。
- 不要在 `BaseForm` 内写默认业务字段。
- 不要用普通 `div` 临时模拟抽屉、弹窗或表单容器。
- 不要绕开 schema 校验直接提交未验证数据。

## 检查清单

- 抽屉标题必传且语义明确。
- 表单默认值、schema、提交回调一致。
- loading 时按钮避免重复提交。
- 成功、失败和取消路径都有明确处理。
- 涉及代码变更时运行 `npm run typecheck`。
