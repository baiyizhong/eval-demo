# Langfuse Public API 全接口切换设计

日期：2026-07-24

## 目标

在保持现有 PA API、前端交互和响应结构不变的前提下，让 trace、observation、metric、dataset、dataset item、annotation queue/item、score/config、evaluator/rule、project/member/API key、LLM connection 和 model 以 Langfuse 为唯一业务事实源。

完整接口分类与官方能力证据见 `docs/api/2026-07-23-langfuse-public-api-alignment.md`。

## 架构

- `app/langfuse/public_client.py` 是唯一 Langfuse Public REST 边界，负责认证、参数编码、分页、错误翻译与资源方法。
- FastAPI 路由保留现有 URL、请求 DTO 和 `{code,message,data,txId}` 响应。
- Adapter 可以聚合多个 Langfuse API，但不得保存 Langfuse 业务实体副本。
- OAuth/session、PA 管理员、审计、导出文件、异步任务、报告快照和 scheduler 是 PA 控制面数据，只保存 Langfuse ID。
- Public API 不支持的原生实体写操作不得回退到 SQL。

## 凭据与隔离

- 项目级 API 使用该项目 Public/Secret Key Basic Auth。
- 组织级 API 使用对应组织 Organization API Key Bearer Auth。
- 密钥只从环境配置或受保护的 Langfuse 凭据读取，不进入日志、响应或 PA 影子表。
- 每次请求都必须验证当前用户对 project/organization 的访问权限。

## 兼容与失败策略

- 上游 4xx 映射为稳定 PA 业务错误，上游 5xx/网络错误映射为 502；错误信息不泄露响应体或密钥。
- 429 和可恢复 5xx 采用有界重试；写请求仅在具有幂等 ID/幂等语义时重试。
- 游标分页和页码分页在客户端内部统一，路由继续返回 `{total,datas}`。
- replacement Saga 必须先创建并验证新资源，再切换引用，最后删除旧资源；失败时补偿。

## 受阻能力

Organization 本体 CRUD、dataset update/delete、annotation queue update/delete、score config archive/restore、project archive/restore 在官方等价能力出现或产品契约调整前保持 blocked，不允许 SQL fallback。Dataset item update/archive 使用相同 item ID 的官方 upsert。

## 验收

- 新增客户端方法均有请求方法、URL、认证、参数、响应和错误 contract test。
- 每个切换路由有 API contract test，证明不再调用原生数据库写路径。
- 全量测试通过，生产代码对 Langfuse 原生业务表的 INSERT/UPDATE/DELETE 收敛为 0。
- 不修改 `langfuse/` 和 `dify/`。
