import { UnauthorizedException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import {
  EXCEPTION_FILTERS_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from "@nestjs/common/constants";
import type { Response } from "express";
import { MulterError } from "multer";
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

type AvatarMulterFilter = {
  catch(exception: MulterError, host: ArgumentsHost): void;
};

function createAvatarMulterFilter(): AvatarMulterFilter {
  const registeredFilters: unknown = Reflect.getMetadata(
    EXCEPTION_FILTERS_METADATA,
    UserAvatarController,
  );
  if (
    !Array.isArray(registeredFilters) ||
    typeof registeredFilters[0] !== "function"
  ) {
    throw new Error("Avatar Multer exception filter is not registered.");
  }
  const FilterConstructor =
    registeredFilters[0] as new () => AvatarMulterFilter;
  return new FilterConstructor();
}

function createHttpHost() {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("UserAvatarController", () => {
  it("declares the service dependency explicitly for Nest injection", () => {
    const dependencies: unknown = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      UserAvatarController,
    );

    expect(dependencies).toEqual([{ index: 0, param: UserAvatarService }]);
  });

  it("returns a sanitized 413 response when Multer rejects an oversized avatar", () => {
    const filter = createAvatarMulterFilter();
    const { host, response } = createHttpHost();

    filter.catch(new MulterError("LIMIT_FILE_SIZE", "avatar"), host);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 413,
      code: "AVATAR_TOO_LARGE",
      message: "La imagen supera el límite de 5 MB.",
    });
  });

  it("returns a sanitized 400 response for Multer structure errors", () => {
    const filter = createAvatarMulterFilter();
    const { host, response } = createHttpHost();

    filter.catch(new MulterError("LIMIT_UNEXPECTED_FILE", "unexpected"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 400,
      code: "INVALID_AVATAR_UPLOAD",
      message: "No se ha podido leer la imagen. Prueba con un JPG, PNG o WebP.",
    });
  });

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
