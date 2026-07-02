import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the admin shell with the projects page selected", () => {
    const html = renderToString(<App />);

    expect(html).toContain("ObserveIQ");
    expect(html).toContain("LLM 可观测性平台");
    expect(html).toContain("<button");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("项目列表");
    expect(html).toContain("选择一个项目以查看 Trace 日志并执行评测");
    expect(html).toContain("搜索项目...");
    expect(html).toContain("新建项目");
    expect(html).toContain("正在从 Langfuse API 加载项目...");
    expect(html).toContain("系统管理");
    expect(html).toContain("租户管理");
    expect(html).toContain("用户管理");
    expect(html).toContain("系统设置");
  });

  it("renders projects in the sidebar switcher when it is open", () => {
    const html = renderToString(
      <App
        initialSwitcherOpen
        initialProjects={[
          {
            id: "langfuse-project-1",
            name: "医疗问答助手",
            description: "真实 Langfuse 项目",
            status: "active",
            traceCount: 12847,
            createdAt: null,
            lastActiveAt: "2026-06-10T14:32:11.453Z",
            organizationName: "安辉医疗科技"
          }
        ]}
      />
    );

    expect(html).toContain("医疗问答助手");
    expect(html).toContain("12,847");
    expect(html).toContain("条 Trace");
  });
});
