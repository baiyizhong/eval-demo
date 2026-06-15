import { afterEach, describe, expect, it, vi } from "vitest";

import { apiPost, joinApiUrl } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("joinApiUrl", () => {
  it("joins the default base URL with an absolute path", () => {
    expect(joinApiUrl("http://localhost:8000", "/api/projects")).toBe("http://localhost:8000/api/projects");
  });

  it("avoids a double slash when the base and path both include one", () => {
    expect(joinApiUrl("http://localhost:8000/", "/api/projects")).toBe("http://localhost:8000/api/projects");
  });

  it("adds a slash when the path is relative", () => {
    expect(joinApiUrl("http://localhost:8000", "api/projects")).toBe("http://localhost:8000/api/projects");
  });
});

describe("apiPost", () => {
  it("posts JSON to the API and returns the envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { task_id: "task-1" }, error: null })
    });
    vi.stubGlobal("fetch", fetchMock);

    const envelope = await apiPost<{ task_id: string }>("/api/projects/project-1/tasks", {
      name: "安全性评测"
    });

    expect(envelope.data?.task_id).toBe("task-1");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/projects/project-1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "安全性评测" })
    });
  });
});
