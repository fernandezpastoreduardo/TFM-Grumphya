import { describe, expect, it, vi } from "vitest";
import { AuditController } from "./audit.controller";

function request(
  method: string,
  resource: string,
  query: Record<string, string> = {},
) {
  return {
    method,
    params: { resource },
    query,
    auditTechnicalIdentity: {
      issuer: "desarrolloseguro-audit",
      subject: "desarrolloseguro-audit",
      audience: "grumphya-audit",
      environment: "production",
      domain: "grumphya.com",
      hostname: "grumphya.com",
      scopes: new Set([`audit:${resource}`]),
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_240,
      jti: "request-1",
      kid: "ds-auditor-2026",
    },
  } as never;
}

function processorsRequest(method: string, query: Record<string, string> = {}) {
  return {
    method,
    params: { resource: "processors" },
    query,
    auditTechnicalIdentity: {
      issuer: "desarrolloseguro-audit",
      subject: "desarrolloseguro-audit",
      audience: "grumphya-audit",
      environment: "production",
      domain: "grumphya.com",
      hostname: "grumphya.com",
      scopes: new Set(["audit:privacy"]),
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_000_240,
      jti: "request-1",
      kid: "ds-auditor-2026",
    },
  } as never;
}

describe("AuditController", () => {
  it.each([
    "infrastructure",
    "deployment",
    "dependencies",
    "auth",
    "quality",
    "privacy",
    "ai",
  ])("allows the seven Beta D GET resources: %s", async (resource) => {
    const service = {
      read: vi.fn().mockResolvedValue({ schemaVersion: "beta-d-0.2" }),
    };
    await expect(
      new AuditController(service as never, { read: vi.fn() } as never).read(
        request("GET", resource),
      ),
    ).resolves.toMatchObject({ schemaVersion: "beta-d-0.2" });
    expect(service.read).toHaveBeenCalledWith(resource, expect.anything());
  });

  it("reads an allowed resource without rendering HTML", async () => {
    const service = {
      read: vi.fn().mockResolvedValue({ schemaVersion: "beta-d-0.2" }),
    };
    const controller = new AuditController(
      service as never,
      { read: vi.fn() } as never,
    );

    await expect(controller.read(request("GET", "quality"))).resolves.toEqual({
      schemaVersion: "beta-d-0.2",
    });
    expect(service.read).toHaveBeenCalledWith(
      "quality",
      expect.objectContaining({ kid: "ds-auditor-2026" }),
    );
  });

  it.each([
    ["POST", {}, 405],
    ["GET", { check: "1" }, 400],
    ["GET", {}, 404],
  ])(
    "rejects %s/query/unknown requests with JSON errors",
    async (method, query, status) => {
      const service = { read: vi.fn() };
      const controller = new AuditController(
        service as never,
        { read: vi.fn() } as never,
      );
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

  it("serves processors as a separate contract with the privacy scope", async () => {
    const betaService = { read: vi.fn() };
    const inventory = {
      read: vi
        .fn()
        .mockResolvedValue({ schemaVersion: "processor-inventory-v1" }),
    };
    const controller = new AuditController(
      betaService as never,
      inventory as never,
    );

    await expect(controller.read(processorsRequest("GET"))).resolves.toEqual({
      schemaVersion: "processor-inventory-v1",
    });
    expect(inventory.read).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: new Set(["audit:privacy"]) }),
    );
    expect(betaService.read).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", {}, 405],
    ["GET", { probe: "1" }, 400],
  ])(
    "rejects processor %s requests and queries before reading",
    (method, query, status) => {
      const betaService = { read: vi.fn() };
      const inventory = { read: vi.fn() };
      const controller = new AuditController(
        betaService as never,
        inventory as never,
      );

      let caught: unknown;
      try {
        controller.read(processorsRequest(method, query));
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ status });
      expect(inventory.read).not.toHaveBeenCalled();
      expect(betaService.read).not.toHaveBeenCalled();
    },
  );
});
