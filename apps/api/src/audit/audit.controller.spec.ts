import { describe, expect, it, vi } from "vitest";
import { AuditController } from "./audit.controller";

function request(
  method: string,
  resource: string,
  query: Record<string, string> = {},
) {
  return { method, params: { resource }, query } as never;
}

describe("AuditController", () => {
  it("reads an allowed resource without rendering HTML", async () => {
    const service = {
      read: vi.fn().mockResolvedValue({ schemaVersion: "beta-d-0.2" }),
    };
    const controller = new AuditController(service as never);

    await expect(controller.read(request("GET", "quality"))).resolves.toEqual({
      schemaVersion: "beta-d-0.2",
    });
    expect(service.read).toHaveBeenCalledWith("quality");
  });

  it.each([
    ["POST", {}, 405],
    ["GET", { check: "1" }, 400],
    ["GET", {}, 404],
  ])(
    "rejects %s/query/unknown requests with JSON errors",
    async (method, query, status) => {
      const service = { read: vi.fn() };
      const controller = new AuditController(service as never);
      const resource = status === 404 ? "not-a-resource" : "quality";

      expect(() => controller.read(request(method, resource, query))).toThrow();
      try {
        controller.read(request(method, resource, query));
      } catch (error) {
        expect(error).toMatchObject({
          status,
          response: { code: expect.any(String) },
        });
      }
      expect(service.read).not.toHaveBeenCalled();
    },
  );
});
