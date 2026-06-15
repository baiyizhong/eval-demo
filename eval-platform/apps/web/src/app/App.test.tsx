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
});
