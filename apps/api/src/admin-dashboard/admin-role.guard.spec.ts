import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminRoleGuard } from "./admin-role.guard";

function createContext(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { userId } }) }),
  } as unknown as ExecutionContext;
}

describe("AdminRoleGuard", () => {
  it("checks the active account role in the database on every request", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ is_admin: true }] });
    const guard = new AdminRoleGuard({ query } as never);
    await expect(guard.canActivate(createContext("admin-id"))).resolves.toBe(
      true,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("role='admin'"),
      ["admin-id"],
    );
  });

  it("does not authorize a regular user", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ is_admin: false }] });
    const guard = new AdminRoleGuard({ query } as never);
    await expect(
      guard.canActivate(createContext("user-id")),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});
