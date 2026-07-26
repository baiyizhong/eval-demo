---
name: single-turn-quality
description: 评估单轮问答的回答质量，从准确性、完整性、相关性三个维度评分。适用于单轮 QA 场景。
---

# 单轮问答质量评估

## 输入

你会收到一个 JSON 数组，每个元素包含：

- `sampleId`: 样本唯一标识
- `input`: 用户问题
- `output`: 待评估回答
- `expectedOutput`: 参考答案（可选）
- `context`: 上下文（可选）

## 评估要求

对每个样本从以下维度评分（0.0-1.0）：

- `accuracy`: 事实准确性，回答中的信息是否准确无误
- `completeness`: 回答完整性，是否覆盖了问题的关键要点
- `relevance`: 与问题相关性，是否切中用户意图

## 输出格式

输出严格 JSON 数组（不要包含 markdown 代码块标记），每元素：

```json
{
  "sampleId": "与输入一致",
  "scores": [
    {"name": "accuracy", "value": 0.0, "comment": "说明"},
    {"name": "completeness", "value": 0.0, "comment": "说明"},
    {"name": "relevance", "value": 0.0, "comment": "说明"}
  ],
  "passed": true,
  "reason": "总体评价"
}
```
