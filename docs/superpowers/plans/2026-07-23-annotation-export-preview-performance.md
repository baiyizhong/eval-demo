# 人工标注导出预览性能优化实施计划

1. 更新后端导出预览测试，要求复用分页/聚合能力且只 enrich 预览项，先验证旧实现失败。
2. 在 `app/annotations.py` 提取可复用的分页与筛选计数 helper，列表接口和导出预览共同调用。
3. 导出预览通过 page 1 + `previewLimit` 获取样本，通过 status facet 聚合 metrics，只 enrich 样本。
4. 更新前端测试，要求预览 query key 不含格式/拆列，拆列在前端派生，导出按钮不依赖 preview。
5. 最小修改 `annotation-export-dialog.tsx`，保持现有 Dialog/Button 和导出 Job 流程。
6. 运行前后端相关测试、TypeScript、ESLint、Ruff 和生产构建；不提交代码。

