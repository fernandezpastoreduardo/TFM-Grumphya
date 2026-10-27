import { describe, expect, it, vi } from "vitest";
import { UserDeleteController } from "./user-delete.controller";

const USER_ID = "ee1a4f52-678e-4b87-85f4-7782a92dddb4";

describe("UserDeleteController", () => {
  it("deletes only the user from the authenticated request and clears refresh cookie", async () => {
    const repository = { deleteUser: vi.fn().mockResolvedValue(true) };
    const controller = new UserDeleteController(repository);
    const response = { clearCookie: vi.fn() };

    await expect(
      controller.deleteAccount(
        { user: { userId: USER_ID } } as never,
        response as never,
      ),
    ).resolves.toEqual({ deleted: true });

    expect(repository.deleteUser).toHaveBeenCalledOnce();
    expect(repository.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(response.clearCookie).toHaveBeenCalledWith(
      "grumphya_refresh",
      expect.objectContaining({ httpOnly: true, path: "/api" }),
    );
  });

  it("returns the session error and keeps the refresh cookie when the request has no user", async () => {
    const repository = { deleteUser: vi.fn().mockResolvedValue(true) };
    const controller = new UserDeleteController(repository);
    const response = { clearCookie: vi.fn() };

    await expect(
      controller.deleteAccount({ user: undefined } as never, response as never),
    ).rejects.toMatchObject({
      status: 401,
      response: {
        statusCode: 401,
        code: "SESSION_REQUIRED",
        message: "Inicia sesión para darte de baja.",
      },
    });

    expect(repository.deleteUser).not.toHaveBeenCalled();
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it("does not clear the refresh cookie when the repository finds no account", async () => {
    const repository = { deleteUser: vi.fn().mockResolvedValue(false) };
    const controller = new UserDeleteController(repository);
    const response = { clearCookie: vi.fn() };

    await expect(
      controller.deleteAccount(
        { user: { userId: USER_ID } } as never,
        response as never,
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: "SESSION_REQUIRED" },
    });

    expect(repository.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it("propagates unexpected repository errors without clearing the refresh cookie", async () => {
    const databaseError = new Error("database details");
    const repository = { deleteUser: vi.fn().mockRejectedValue(databaseError) };
    const controller = new UserDeleteController(repository);
    const response = { clearCookie: vi.fn() };

    await expect(
      controller.deleteAccount(
        { user: { userId: USER_ID } } as never,
        response as never,
      ),
    ).rejects.toBe(databaseError);

    expect(response.clearCookie).not.toHaveBeenCalled();
  });
});
