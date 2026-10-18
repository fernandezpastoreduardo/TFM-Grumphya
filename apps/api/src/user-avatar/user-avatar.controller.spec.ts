import { UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { UserAvatarController } from "./user-avatar.controller";
import { UserAvatarService } from "./user-avatar.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const AVATAR_KEY = "00000000-0000-4000-8000-000000000099.webp";
const AVATAR_URL = `/api/avatars/${AVATAR_KEY}`;
const IMAGE_BYTES = Buffer.from("normalized webp");

function createController() {
  const avatars = {
    update: vi.fn().mockResolvedValue({ avatarUrl: AVATAR_URL }),
    read: vi.fn().mockResolvedValue(IMAGE_BYTES),
  } as unknown as UserAvatarService;
  return { controller: new UserAvatarController(avatars), avatars };
}

describe("UserAvatarController", () => {
  it("passes the authenticated user and multipart file to avatar processing", async () => {
    const { controller, avatars } = createController();
    const file = {
      buffer: Buffer.from("original image"),
      mimetype: "image/png",
      size: 14,
    };

    await expect(
      controller.uploadAvatar({ user: { userId: USER_ID } } as never, file),
    ).resolves.toEqual({ avatarUrl: AVATAR_URL });

    expect(avatars.update).toHaveBeenCalledWith(USER_ID, file);
  });

  it("refuses to upload if the authenticated identity is missing", async () => {
    const { controller, avatars } = createController();

    await expect(
      controller.uploadAvatar({} as never, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(avatars.update).not.toHaveBeenCalled();
  });

  it("serves normalized WebP bytes with defensive response headers", async () => {
    const { controller, avatars } = createController();
    const response = {
      setHeader: vi.fn(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
    } as unknown as Response;

    await controller.getAvatar(AVATAR_KEY, response);

    expect(avatars.read).toHaveBeenCalledWith(AVATAR_KEY);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "image/webp",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-store",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Content-Type-Options",
      "nosniff",
    );
    expect(response.send).toHaveBeenCalledWith(IMAGE_BYTES);
  });

  it("returns 404 and an empty response when an avatar is missing", async () => {
    const { controller, avatars } = createController();
    vi.mocked(avatars.read).mockResolvedValueOnce(null);
    const response = {
      setHeader: vi.fn(),
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
    } as unknown as Response;

    await controller.getAvatar(AVATAR_KEY, response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.send).not.toHaveBeenCalled();
  });
});
