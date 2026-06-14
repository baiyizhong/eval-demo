import { describe, expect, it } from "vitest";

import { joinApiUrl } from "./api";

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
