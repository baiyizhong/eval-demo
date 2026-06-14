import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the admin shell with the projects page selected", () => {
    const html = renderToString(<App />);

    expect(html).toContain("Eval Platform");
    expect(html).toContain("<button");
    expect(html).toContain('<button aria-current="page"');
    expect(html).toContain("项目");
    expect(html).toContain("连接 Docker 启动的 Langfuse 项目。");
    expect(html).toContain("Trace");
    expect(html).toContain("评测任务");
    expect(html).toContain("评估器");
  });
});
