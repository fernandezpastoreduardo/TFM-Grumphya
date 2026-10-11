import { describe, expect, it } from "vitest";

describe("health response contract", () => {
  it("requires an explicit healthy status and vector extension version", () => {
    const response = { status: "ok", database: "ok", pgvector: "0.8.7" };
    expect(response).toMatchObject({ status: "ok", database: "ok" });
    expect(response.pgvector).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
