import { describe, expect, it, vi } from "vitest";
import {
  UserAvatarError,
  type UserAvatarModerator,
  type UserAvatarProcessor,
  type UserAvatarRepository,
  type UserAvatarStorage,
} from "./user-avatar.models";
import { UserAvatarService } from "./user-avatar.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const IMAGE_BYTES = Buffer.from("valid image data");
const VALID_FILE = {
  buffer: IMAGE_BYTES,
  mimetype: "image/png",
  size: IMAGE_BYTES.byteLength,
};

function createService(moderationResult = true) {
  const repository: UserAvatarRepository = {
    replaceAvatar: vi.fn().mockResolvedValue(null),
  };
  const storage: UserAvatarStorage = {
    save: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(IMAGE_BYTES),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const processor: UserAvatarProcessor = {
    toPublicAvatar: vi.fn().mockResolvedValue(IMAGE_BYTES),
  };
  const moderator: UserAvatarModerator = {
    isSuitableForAllAges: vi.fn().mockResolvedValue(moderationResult),
  };
  return {
    service: new UserAvatarService(repository, storage, processor, moderator),
    repository,
    storage,
    processor,
    moderator,
  };
}

describe("UserAvatarService", () => {
  it("normalizes and moderates the image before storing and linking it", async () => {
    const { service, repository, storage, processor, moderator } =
      createService();

    const result = await service.update(USER_ID, VALID_FILE);

    expect(processor.toPublicAvatar).toHaveBeenCalledWith(
      IMAGE_BYTES,
      "image/png",
    );
    expect(moderator.isSuitableForAllAges).toHaveBeenCalledWith(IMAGE_BYTES);
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}\.webp$/i),
      IMAGE_BYTES,
    );
    expect(repository.replaceAvatar).toHaveBeenCalledWith(
      USER_ID,
      expect.stringMatching(/\.webp$/),
    );
    expect(result.avatarUrl).toMatch(/^\/api\/avatars\/[0-9a-f-]{36}\.webp$/i);
  });

  it("rejects inappropriate content without storing it", async () => {
    const { service, storage, repository } = createService(false);

    await expect(service.update(USER_ID, VALID_FILE)).rejects.toMatchObject({
      code: "AVATAR_NOT_ALLOWED",
    });
    expect(storage.save).not.toHaveBeenCalled();
    expect(repository.replaceAvatar).not.toHaveBeenCalled();
  });

  it("rejects unknown file shapes and unsupported media types", async () => {
    const { service, moderator } = createService();

    await expect(service.update(USER_ID, null)).rejects.toBeInstanceOf(
      UserAvatarError,
    );
    await expect(
      service.update(USER_ID, { ...VALID_FILE, mimetype: "image/svg+xml" }),
    ).rejects.toMatchObject({ code: "INVALID_AVATAR" });
    expect(moderator.isSuitableForAllAges).not.toHaveBeenCalled();
  });

  it("rejects oversized files before decoding or contacting moderation", async () => {
    const { service, processor, moderator, storage } = createService();

    await expect(
      service.update(USER_ID, { ...VALID_FILE, size: 5 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ code: "INVALID_AVATAR" });

    expect(processor.toPublicAvatar).not.toHaveBeenCalled();
    expect(moderator.isSuitableForAllAges).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("removes a newly saved image if the account cannot be updated", async () => {
    const { service, repository, storage } = createService();
    vi.mocked(repository.replaceAvatar).mockRejectedValueOnce(
      new Error("account unavailable"),
    );

    await expect(service.update(USER_ID, VALID_FILE)).rejects.toThrow(
      "account unavailable",
    );

    expect(storage.save).toHaveBeenCalledOnce();
    expect(storage.remove).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}\.webp$/i),
    );
  });

  it("does not return storage data for a path-like key", async () => {
    const { service, storage } = createService();

    await expect(service.read("../../etc/passwd")).resolves.toBeNull();
    expect(storage.read).not.toHaveBeenCalled();
  });
});
