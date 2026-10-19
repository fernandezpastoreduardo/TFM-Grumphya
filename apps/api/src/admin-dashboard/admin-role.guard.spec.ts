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

  it("does not authorize an inactive account even when it has the admin role", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const guard = new AdminRoleGuard({ query } as never);

    await expect(
      guard.canActivate(createContext("inactive-admin-id")),
    ).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status='active'"),
      ["inactive-admin-id"],
    );
  });

  it("rejects a request without an authenticated user before querying roles", async () => {
    const query = vi.fn();
    const guard = new AdminRoleGuard({ query } as never);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as never),
    ).rejects.toMatchObject({ status: 401 });
    expect(query).not.toHaveBeenCalled();
  });
});
