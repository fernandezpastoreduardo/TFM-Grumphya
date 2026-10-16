import { describe, expect, it, vi } from "vitest";
import { UserDeleteError } from "./user-delete.models";
import { UserDeleteService } from "./user-delete.service";

const USER_ID = "ee1a4f52-678e-4b87-85f4-7782a92dddb4";

describe("UserDeleteService", () => {
  it("physically deletes the authenticated user's account", async () => {
    const repository = { deleteUser: vi.fn().mockResolvedValue(true) };
    const service = new UserDeleteService(repository);

    await expect(service.deleteCurrentUser(USER_ID)).resolves.toBeUndefined();
    expect(repository.deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("rejects missing or malformed authenticated identities", async () => {
    const repository = { deleteUser: vi.fn() };
    const service = new UserDeleteService(repository);

    await expect(service.deleteCurrentUser(undefined)).rejects.toMatchObject({
      status: 401,
      code: "SESSION_REQUIRED",
    });
    await expect(
      service.deleteCurrentUser("not-a-user-id"),
    ).rejects.toBeInstanceOf(UserDeleteError);
    expect(repository.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects a session whose user no longer exists", async () => {
    const repository = { deleteUser: vi.fn().mockResolvedValue(false) };
    const service = new UserDeleteService(repository);

    await expect(service.deleteCurrentUser(USER_ID)).rejects.toMatchObject({
      status: 401,
      code: "SESSION_REQUIRED",
    });
  });
});
