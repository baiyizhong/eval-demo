from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import random
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import psycopg
from psycopg.rows import dict_row


DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
DEFAULT_LANGFUSE_URL = "http://127.0.0.1:3000"
DEFAULT_PROJECT_ID = "project_3da8d83d6d3d4b5d923a5f1466a4ad3c"
DEFAULT_SALT = "mysalt"


@dataclass(frozen=True)
class Scenario:
    key: str
    name: str
    intent: str
    tags: list[str]
    input_text: str
    output_text: str
    channel: str
    customer_tier: str
    city: str
    product_line: str
    risk_level: str
    status: str
    environment: str


SCENARIOS = [
    Scenario(
        key="refund_policy",
        name="refund-agent-vip",
        intent="refund",
        tags=["agent", "refund", "vip", "policy"],
        input_text="我昨天买的降噪耳机今天降价了，可以退差价或者退款吗？",
        output_text="已核验订单在价保期内，建议优先申请价保；如仍需退款，可走极速退款。",
        channel="web",
        customer_tier="VIP",
        city="上海",
        product_line="consumer-electronics",
        risk_level="low",
        status="success",
        environment="production",
    ),
    Scenario(
        key="logistics_exception",
        name="logistics-exception-diagnosis",
        intent="delivery_delay",
        tags=["agent", "order", "logistics", "warning"],
        input_text="订单显示已到配送站但两天没动，明天生日必须收到。",
        output_text="已识别为站点滞留，将升级同城催派并给出补偿券。",
        channel="app",
        customer_tier="Gold",
        city="杭州",
        product_line="fresh-grocery",
        risk_level="medium",
        status="warning",
        environment="production",
    ),
    Scenario(
        key="address_change",
        name="post-payment-address-change",
        intent="address_change",
        tags=["agent", "address", "tool-call"],
        input_text="刚下单发现地址写错了，能改到深圳南山区吗？",
        output_text="当前订单未出库，已完成收货地址校验并提交修改。",
        channel="mini_program",
        customer_tier="Standard",
        city="深圳",
        product_line="fashion",
        risk_level="low",
        status="success",
        environment="production",
    ),
    Scenario(
        key="payment_risk",
        name="payment-risk-review",
        intent="payment_risk",
        tags=["agent", "payment", "risk", "handoff"],
        input_text="为什么我的支付一直失败？我已经换了三张卡。",
        output_text="检测到风控拦截，需要补充身份验证后由人工继续处理。",
        channel="web",
        customer_tier="Standard",
        city="广州",
        product_line="cross-border",
        risk_level="high",
        status="error",
        environment="production",
    ),
    Scenario(
        key="rag_answer",
        name="knowledge-rag-answer",
        intent="product_qa",
        tags=["agent", "rag", "knowledge-base"],
        input_text="这款空气炸锅能不能直接放洗碗机清洗？",
        output_text="根据说明书，炸篮可放入洗碗机，上盖和加热组件不能浸泡或机洗。",
        channel="app",
        customer_tier="Silver",
        city="成都",
        product_line="home-appliance",
        risk_level="low",
        status="success",
        environment="production",
    ),
    Scenario(
        key="coupon_recommendation",
        name="coupon-recommendation-agent",
        intent="promotion",
        tags=["agent", "coupon", "recommendation"],
        input_text="我购物车差一点满减，帮我看看怎么凑单最划算。",
        output_text="推荐加入洗衣凝珠小包装，可触发满 299 减 40 且不增加运费。",
        channel="app",
        customer_tier="VIP",
        city="北京",
        product_line="daily-care",
        risk_level="low",
        status="success",
        environment="staging",
    ),
    Scenario(
        key="tool_timeout",
        name="inventory-tool-timeout",
        intent="inventory_check",
        tags=["agent", "tool-timeout", "inventory"],
        input_text="门店自提今天能拿到吗？帮我查附近还有没有货。",
        output_text="库存服务超时，已降级返回最近一次库存快照并提示用户二次确认。",
        channel="web",
        customer_tier="Gold",
        city="南京",
        product_line="offline-retail",
        risk_level="medium",
        status="warning",
        environment="production",
    ),
    Scenario(
        key="hallucination_guardrail",
        name="guardrail-corrected-answer",
        intent="medical_compliance",
        tags=["agent", "guardrail", "compliance", "fallback"],
        input_text="孩子发烧能不能吃这个保健品替代退烧药？",
        output_text="不能替代药物治疗，建议按药品说明或咨询医生，并提供售后退货入口。",
        channel="mini_program",
        customer_tier="Standard",
        city="武汉",
        product_line="health",
        risk_level="high",
        status="corrected",
        environment="testing",
    ),
]


def utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def create_sha_hash(secret_key: str, salt: str) -> str:
    salt_hash = hashlib.sha256(salt.encode("utf-8")).hexdigest()
    return hashlib.sha256((secret_key + salt_hash).encode("utf-8")).hexdigest()


def display_secret(secret_key: str) -> str:
    return f"{secret_key[:6]}...{secret_key[-4:]}"


def create_project_api_key(
    database_url: str,
    project_id: str,
    salt: str,
) -> tuple[str, str]:
    public_key = f"pk-lf-{uuid.uuid4()}"
    secret_key = f"sk-lf-{uuid.uuid4()}"
    now = datetime.now(UTC).replace(tzinfo=None)

    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name
                FROM projects
                WHERE id = %(project_id)s AND deleted_at IS NULL
                """,
                {"project_id": project_id},
            )
            project = cur.fetchone()
            if not project:
                raise RuntimeError(f"Project not found: {project_id}")

            cur.execute(
                """
                INSERT INTO api_keys (
                    id,
                    created_at,
                    note,
                    public_key,
                    hashed_secret_key,
                    display_secret_key,
                    project_id,
                    fast_hashed_secret_key,
                    scope,
                    is_in_app_agent_key
                )
                VALUES (
                    %(id)s,
                    %(created_at)s,
                    %(note)s,
                    %(public_key)s,
                    %(hashed_secret_key)s,
                    %(display_secret_key)s,
                    %(project_id)s,
                    %(fast_hashed_secret_key)s,
                    'PROJECT',
                    false
                )
                """,
                {
                    "id": str(uuid.uuid4()),
                    "created_at": now,
                    "note": "PA Eval trace seed key",
                    "public_key": public_key,
                    "hashed_secret_key": f"pa-eval-seed-placeholder-{uuid.uuid4()}",
                    "display_secret_key": display_secret(secret_key),
                    "project_id": project_id,
                    "fast_hashed_secret_key": create_sha_hash(secret_key, salt),
                },
            )
        conn.commit()

    return public_key, secret_key


def add_event(
    events: list[dict[str, Any]],
    event_type: str,
    body: dict[str, Any],
    timestamp: datetime,
) -> None:
    events.append(
        {
            "id": str(uuid.uuid4()),
            "type": event_type,
            "timestamp": utc_iso(timestamp),
            "body": body,
        }
    )


def usage(seed: int, base_input: int, base_output: int) -> dict[str, Any]:
    input_tokens = base_input + seed % 110
    output_tokens = base_output + seed % 75
    total = input_tokens + output_tokens
    return {
        "input": input_tokens,
        "output": output_tokens,
        "total": total,
        "unit": "TOKENS",
        "inputCost": round(input_tokens * 0.0000025, 6),
        "outputCost": round(output_tokens * 0.00001, 6),
        "totalCost": round(input_tokens * 0.0000025 + output_tokens * 0.00001, 6),
    }


def build_trace_events(trace_no: int, scenario: Scenario, base_time: datetime) -> list[dict[str, Any]]:
    rand = random.Random(20260706 + trace_no)
    trace_id = f"trace_pa_eval_{scenario.key}_{trace_no:03d}_{uuid.uuid4().hex[:8]}"
    session_id = f"session_{scenario.channel}_{trace_no % 11:02d}"
    user_id = f"user_{scenario.customer_tier.lower()}_{10000 + trace_no}"
    business_id = f"biz-{scenario.product_line}-{base_time.strftime('%m%d')}-{trace_no:04d}"
    status = scenario.status
    issue = status in {"warning", "error", "corrected"}
    latency_ms = rand.randint(1200, 9800) if not issue else rand.randint(4500, 18000)
    start = base_time
    end = start + timedelta(milliseconds=latency_ms)
    environment = scenario.environment

    events: list[dict[str, Any]] = []
    add_event(
        events,
        "trace-create",
        {
            "id": trace_id,
            "timestamp": utc_iso(start),
            "name": scenario.name,
            "input": {
                "message": scenario.input_text,
                "locale": "zh-CN",
                "channel": scenario.channel,
                "attachments": []
                if trace_no % 5
                else [{"type": "image", "name": "damaged_package.jpg"}],
            },
            "output": {
                "answer": scenario.output_text,
                "resolution": status,
                "nextAction": "human_handoff" if scenario.risk_level == "high" else "self_service",
            },
            "sessionId": session_id,
            "userId": user_id,
            "environment": environment,
            "metadata": {
                "status": status,
                "businessId": business_id,
                "appId": "pa-eval-demo",
                "scenario": scenario.key,
                "intent": scenario.intent,
                "channel": scenario.channel,
                "city": scenario.city,
                "customerTier": scenario.customer_tier,
                "riskLevel": scenario.risk_level,
                "productLine": scenario.product_line,
                "latencyMs": latency_ms,
                "source": "pa-eval-seed",
                "quality": {
                    "resolved": status in {"success", "corrected"},
                    "requiresHuman": scenario.risk_level == "high",
                    "confidence": round(rand.uniform(0.63, 0.98), 2),
                },
            },
            "release": "pa-eval-demo@2026.07",
            "version": f"agent-router-v{1 + trace_no % 3}",
            "tags": scenario.tags + [scenario.channel, scenario.customer_tier.lower()],
        },
        start,
    )

    root_span_id = f"obs_route_{uuid.uuid4().hex}"
    add_event(
        events,
        "span-create",
        {
            "id": root_span_id,
            "traceId": trace_id,
            "environment": environment,
            "name": "agent-router",
            "startTime": utc_iso(start + timedelta(milliseconds=20)),
            "endTime": utc_iso(start + timedelta(milliseconds=220 + rand.randint(0, 180))),
            "input": {
                "message": scenario.input_text,
                "availableAgents": ["order", "refund", "risk", "knowledge", "promotion"],
            },
            "output": {
                "selectedAgent": scenario.name,
                "intent": scenario.intent,
                "confidence": round(rand.uniform(0.78, 0.99), 2),
            },
            "metadata": {"router": "semantic-v2", "experiment": f"route-{trace_no % 4}"},
            "level": "DEFAULT",
        },
        start + timedelta(milliseconds=30),
    )

    retriever_id = f"obs_retriever_{uuid.uuid4().hex}"
    add_event(
        events,
        "retriever-create",
        {
            "id": retriever_id,
            "traceId": trace_id,
            "parentObservationId": root_span_id,
            "environment": environment,
            "name": "knowledge-retriever",
            "startTime": utc_iso(start + timedelta(milliseconds=260)),
            "endTime": utc_iso(start + timedelta(milliseconds=760 + rand.randint(0, 420))),
            "input": {
                "query": scenario.input_text,
                "collections": ["order_policy", "product_manual", "risk_rules"],
                "topK": 5,
            },
            "output": {
                "documents": [
                    {
                        "id": f"doc-{scenario.key}-policy",
                        "score": round(rand.uniform(0.72, 0.96), 3),
                        "title": f"{scenario.intent} 处理规则",
                    },
                    {
                        "id": f"doc-{scenario.product_line}-faq",
                        "score": round(rand.uniform(0.58, 0.88), 3),
                        "title": f"{scenario.product_line} 常见问题",
                    },
                ],
            },
            "metadata": {"embeddingModel": "bge-m3", "rerank": trace_no % 2 == 0},
            "level": "WARNING" if scenario.key == "rag_answer" and trace_no % 6 == 0 else "DEFAULT",
            "statusMessage": "低置信召回，已扩大检索范围"
            if scenario.key == "rag_answer" and trace_no % 6 == 0
            else None,
        },
        start + timedelta(milliseconds=270),
    )

    tool_id = f"obs_tool_{uuid.uuid4().hex}"
    tool_error = scenario.key in {"tool_timeout", "payment_risk"} and trace_no % 3 != 1
    add_event(
        events,
        "tool-create",
        {
            "id": tool_id,
            "traceId": trace_id,
            "parentObservationId": root_span_id,
            "environment": environment,
            "name": tool_name_for(scenario),
            "startTime": utc_iso(start + timedelta(milliseconds=900)),
            "endTime": utc_iso(start + timedelta(milliseconds=1500 + rand.randint(0, 2500))),
            "input": {
                "businessId": business_id,
                "userId": user_id,
                "intent": scenario.intent,
                "parameters": tool_parameters_for(scenario),
            },
            "output": tool_output_for(scenario, tool_error),
            "metadata": {
                "service": "commerce-orchestrator",
                "httpStatus": 504 if tool_error else 200,
                "retryCount": rand.randint(0, 2) if tool_error else 0,
                "region": "cn-east-1",
            },
            "level": "ERROR" if tool_error else "DEFAULT",
            "statusMessage": "工具调用超时，已使用缓存或转人工" if tool_error else None,
        },
        start + timedelta(milliseconds=920),
    )

    generation_id = f"obs_gen_{uuid.uuid4().hex}"
    input_tokens = rand.randint(620, 1600)
    output_tokens = rand.randint(120, 520)
    generation_level = "ERROR" if scenario.status == "error" else "WARNING" if scenario.status in {"warning", "corrected"} else "DEFAULT"
    add_event(
        events,
        "generation-create",
        {
            "id": generation_id,
            "traceId": trace_id,
            "parentObservationId": root_span_id,
            "environment": environment,
            "name": "response-generation",
            "startTime": utc_iso(start + timedelta(milliseconds=1800)),
            "completionStartTime": utc_iso(start + timedelta(milliseconds=2500 + rand.randint(0, 900))),
            "endTime": utc_iso(end - timedelta(milliseconds=220)),
            "model": ["gpt-4o-mini", "claude-3-5-haiku", "qwen2.5-72b-instruct"][trace_no % 3],
            "modelParameters": {
                "temperature": round(0.2 + (trace_no % 4) * 0.1, 2),
                "max_tokens": 1024,
                "response_format": "json_object",
            },
            "input": {
                "messages": [
                    {"role": "system", "content": "你是电商客服智能体，必须基于工具和知识库回答。"},
                    {"role": "user", "content": scenario.input_text},
                ],
                "context": {
                    "retrievedDocs": [f"doc-{scenario.key}-policy"],
                    "toolObservationId": tool_id,
                },
            },
            "output": {
                "content": scenario.output_text,
                "structured": {
                    "intent": scenario.intent,
                    "resolution": status,
                    "confidence": round(rand.uniform(0.66, 0.96), 2),
                    "handoffReason": "risk_review" if scenario.risk_level == "high" else None,
                },
            },
            "usage": usage(trace_no, input_tokens, output_tokens),
            "usageDetails": {
                "input": input_tokens,
                "output": output_tokens,
                "total": input_tokens + output_tokens,
                "input_cache_read": rand.randint(0, 220),
            },
            "costDetails": {
                "input": round(input_tokens * 0.0000025, 6),
                "output": round(output_tokens * 0.00001, 6),
                "total": round(input_tokens * 0.0000025 + output_tokens * 0.00001, 6),
            },
            "metadata": {
                "promptTemplate": "pa-customer-service-v3",
                "guardrailApplied": scenario.key == "hallucination_guardrail",
                "fallbackUsed": tool_error,
            },
            "level": generation_level,
            "statusMessage": status_message_for(scenario, tool_error),
            "version": "prompt-v3.4",
        },
        start + timedelta(milliseconds=1820),
    )

    eval_id = f"obs_eval_{uuid.uuid4().hex}"
    quality_score = round(rand.uniform(0.42, 0.72), 2) if issue else round(rand.uniform(0.78, 0.98), 2)
    add_event(
        events,
        "evaluator-create",
        {
            "id": eval_id,
            "traceId": trace_id,
            "parentObservationId": generation_id,
            "environment": environment,
            "name": "answer-quality-evaluator",
            "startTime": utc_iso(end - timedelta(milliseconds=180)),
            "endTime": utc_iso(end),
            "input": {
                "answer": scenario.output_text,
                "criteria": ["faithfulness", "policy_compliance", "helpfulness"],
            },
            "output": {
                "score": quality_score,
                "label": "pass" if quality_score >= 0.75 else "review",
                "reasons": evaluator_reasons_for(scenario, quality_score, tool_error),
            },
            "metadata": {"evaluator": "llm-as-judge", "threshold": 0.75},
            "level": "WARNING" if quality_score < 0.75 else "DEFAULT",
            "statusMessage": "质量评分低于阈值，建议复核" if quality_score < 0.75 else None,
        },
        end - timedelta(milliseconds=160),
    )

    return events


def tool_name_for(scenario: Scenario) -> str:
    return {
        "refund_policy": "refund-policy-api",
        "logistics_exception": "shipment-tracker-api",
        "address_change": "order-address-update-api",
        "payment_risk": "payment-risk-api",
        "rag_answer": "product-manual-api",
        "coupon_recommendation": "coupon-recommend-api",
        "tool_timeout": "store-inventory-api",
        "hallucination_guardrail": "compliance-guardrail-api",
    }[scenario.key]


def tool_parameters_for(scenario: Scenario) -> dict[str, Any]:
    base = {"city": scenario.city, "productLine": scenario.product_line}
    if scenario.key == "address_change":
        base["newAddress"] = "深圳市南山区科技园科兴科学园"
    if scenario.key == "coupon_recommendation":
        base["cartAmount"] = 276.5
        base["targetPromotion"] = "满299减40"
    if scenario.key == "payment_risk":
        base["paymentAttempts"] = 3
    return base


def tool_output_for(scenario: Scenario, is_error: bool) -> dict[str, Any]:
    if is_error:
        return {"ok": False, "errorCode": "UPSTREAM_TIMEOUT", "fallback": "cache_or_handoff"}
    return {
        "ok": True,
        "result": {
            "policyMatched": scenario.key in {"refund_policy", "hallucination_guardrail"},
            "orderEditable": scenario.key == "address_change",
            "eta": "2026-07-07 18:00:00" if scenario.key == "logistics_exception" else None,
            "recommendationId": f"rec-{scenario.key}",
        },
    }


def status_message_for(scenario: Scenario, tool_error: bool) -> str | None:
    if scenario.status == "error":
        return "高风险请求已转人工，自动处理终止"
    if tool_error:
        return "工具异常触发降级回答"
    if scenario.status == "corrected":
        return "合规护栏修正了原始回答"
    if scenario.status == "warning":
        return "链路存在延迟或低置信步骤"
    return None


def evaluator_reasons_for(
    scenario: Scenario, quality_score: float, tool_error: bool
) -> list[str]:
    reasons = []
    if quality_score >= 0.75:
        reasons.append("回答覆盖用户核心诉求")
    if scenario.risk_level == "high":
        reasons.append("高风险场景已触发人工或合规保护")
    if tool_error:
        reasons.append("依赖工具异常，回答使用了降级信息")
    if not reasons:
        reasons.append("需要检查政策依据是否完整")
    return reasons


def build_events(count: int) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    events: list[dict[str, Any]] = []
    for index in range(count):
        scenario = SCENARIOS[index % len(SCENARIOS)]
        if index < max(8, count // 2):
            age = timedelta(minutes=8 + index * 17)
        else:
            age = timedelta(hours=8 + index * 3)
        base_time = now - age
        events.extend(build_trace_events(index + 1, scenario, base_time))
    events.sort(key=lambda event: event["timestamp"])
    return events


def post_batches(
    langfuse_url: str,
    public_key: str,
    secret_key: str,
    events: list[dict[str, Any]],
    batch_size: int,
) -> None:
    endpoint = f"{langfuse_url.rstrip('/')}/api/public/ingestion"
    auth_token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30, trust_env=False) as client:
        for start in range(0, len(events), batch_size):
            batch = events[start : start + batch_size]
            response = client.post(endpoint, headers=headers, json={"batch": batch})
            try:
                payload = response.json()
            except json.JSONDecodeError:
                payload = {"raw": response.text[:500]}

            if response.status_code not in {200, 207}:
                raise RuntimeError(
                    f"Ingestion failed with HTTP {response.status_code}: {payload}"
                )

            errors = payload.get("errors") or []
            if errors:
                raise RuntimeError(f"Ingestion returned errors: {errors[:3]}")

            print(f"Synced batch {start // batch_size + 1}: {len(batch)} events")


def fetch_clickhouse_count(
    clickhouse_url: str,
    project_id: str,
    since: datetime,
    user: str,
    password: str,
) -> tuple[int, int]:
    query = """
    SELECT
      (SELECT count() FROM traces WHERE project_id = {project_id:String} AND timestamp >= {since:DateTime64(3)}) AS traces,
      (SELECT count() FROM observations WHERE project_id = {project_id:String} AND start_time >= {since:DateTime64(3)}) AS observations
    FORMAT JSONEachRow
    """
    params = {
        "query": query,
        "param_project_id": project_id,
        "param_since": since.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
    }
    auth = (user, password) if user else None
    response = httpx.get(
        clickhouse_url.rstrip("/"),
        params=params,
        timeout=20,
        trust_env=False,
        auth=auth,
    )
    response.raise_for_status()
    line = response.text.strip().splitlines()[0]
    row = json.loads(line)
    return int(row["traces"]), int(row["observations"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed realistic PA Eval traces into Langfuse through ingestion API."
    )
    parser.add_argument("--project-id", default=os.getenv("LANGFUSE_PROJECT_ID", DEFAULT_PROJECT_ID))
    parser.add_argument("--count", type=int, default=48)
    parser.add_argument("--batch-size", type=int, default=80)
    parser.add_argument(
        "--database-url",
        default=os.getenv("LANGFUSE_DATABASE_URL", DEFAULT_DATABASE_URL),
    )
    parser.add_argument(
        "--langfuse-url",
        default=os.getenv("LANGFUSE_BASE_URL", DEFAULT_LANGFUSE_URL),
    )
    parser.add_argument(
        "--clickhouse-url",
        default=os.getenv("LANGFUSE_CLICKHOUSE_URL", "http://127.0.0.1:8123"),
    )
    parser.add_argument(
        "--clickhouse-user",
        default=os.getenv("LANGFUSE_CLICKHOUSE_USER", "clickhouse"),
    )
    parser.add_argument(
        "--clickhouse-password",
        default=os.getenv("LANGFUSE_CLICKHOUSE_PASSWORD", "clickhouse"),
    )
    parser.add_argument("--salt", default=os.getenv("LANGFUSE_SALT", DEFAULT_SALT))
    parser.add_argument("--skip-verify", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.count < 1:
        raise SystemExit("--count must be positive")

    health = httpx.get(
        f"{args.langfuse_url.rstrip('/')}/api/public/health",
        timeout=10,
        trust_env=False,
    )
    health.raise_for_status()

    public_key, secret_key = create_project_api_key(
        args.database_url, args.project_id, args.salt
    )
    print(f"Created project API key: {public_key}")

    events = build_events(args.count)
    post_batches(
        args.langfuse_url,
        public_key,
        secret_key,
        events,
        args.batch_size,
    )

    print(
        f"Submitted {args.count} traces and {len(events) - args.count} observations "
        f"({len(events)} events total)."
    )

    if not args.skip_verify:
        since = datetime.now(UTC) - timedelta(days=8)
        for attempt in range(1, 13):
            traces, observations = fetch_clickhouse_count(
                args.clickhouse_url,
                args.project_id,
                since,
                args.clickhouse_user,
                args.clickhouse_password,
            )
            if traces >= args.count and observations >= args.count * 4:
                print(
                    "Verified in ClickHouse: "
                    f"{traces} traces, {observations} observations in the last 8 days."
                )
                return
            print(
                "Waiting for Langfuse worker flush "
                f"({attempt}/12): {traces} traces, {observations} observations."
            )
            time.sleep(5)

        traces, observations = fetch_clickhouse_count(
            args.clickhouse_url,
            args.project_id,
            since,
            args.clickhouse_user,
            args.clickhouse_password,
        )
        print(
            "Verification still catching up: "
            f"{traces} traces, {observations} observations in ClickHouse."
        )


if __name__ == "__main__":
    main()
