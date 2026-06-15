import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TraceLogs } from "./TraceLogs";

describe("TraceLogs", () => {
  it("asks the user to choose a project before loading traces", () => {
    const html = renderToString(<TraceLogs selectedProject={null} />);

    expect(html).toContain("Trace 日志");
    expect(html).toContain("请先选择一个项目");
  });

  it("renders the selected project context and trace table shell", () => {
    const html = renderToString(
      <TraceLogs
        selectedProject={{
          id: "langfuse-project-1",
          name: "医疗问答助手"
        }}
      />
    );

    expect(html).toContain("医疗问答助手");
    expect(html).toContain("正在从 Langfuse API 加载 Trace...");
    expect(html).toContain("Trace ID");
    expect(html).toContain("用户");
    expect(html).toContain("会话");
    expect(html).toContain("创建评测任务");
  });
});
