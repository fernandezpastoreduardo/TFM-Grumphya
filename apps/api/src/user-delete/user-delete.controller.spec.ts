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
});
