import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  USER_AVATAR_MODERATOR,
  USER_AVATAR_PROCESSOR,
  USER_AVATAR_REPOSITORY,
  USER_AVATAR_STORAGE,
  UserAvatarError,
  type UserAvatarModerator,
  type UserAvatarProcessor,
  type UserAvatarRepository,
  type UserAvatarStorage,
} from "./user-avatar.models";
import { isUserAvatarKey } from "./avatar-key";
import { publicAvatarUrl } from "../infrastructure/avatar/public-avatar-url";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ACCEPTED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const INVALID_AVATAR = new UserAvatarError(
  400,
  "INVALID_AVATAR",
  "Sube una imagen JPG, PNG o WebP de hasta 5 MB.",
);
const UNSUITABLE_AVATAR = new UserAvatarError(
  400,
  "AVATAR_NOT_ALLOWED",
  "Esa imagen no puede usarse como avatar. Prueba con otra apta para todos los públicos.",
);

@Injectable()
export class UserAvatarService {
  private readonly logger = new Logger(UserAvatarService.name);
  constructor(
    @Inject(USER_AVATAR_REPOSITORY)
    private readonly repository: UserAvatarRepository,
    @Inject(USER_AVATAR_STORAGE)
    private readonly storage: UserAvatarStorage,
    @Inject(USER_AVATAR_PROCESSOR)
    private readonly processor: UserAvatarProcessor,
    @Inject(USER_AVATAR_MODERATOR)
    private readonly moderator: UserAvatarModerator,
  ) {}

  async update(userId: string, file: unknown): Promise<{ avatarUrl: string }> {
    if (!isAvatarFile(file)) throw INVALID_AVATAR;
    if (
      file.size > MAX_AVATAR_BYTES ||
      !ACCEPTED_CONTENT_TYPES.has(file.mimetype)
    ) {
      throw INVALID_AVATAR;
    }

    let image: Buffer;
    try {
      image = await this.processor.toPublicAvatar(file.buffer, file.mimetype);
    } catch {
      throw INVALID_AVATAR;
    }
    if (!(await this.moderator.isSuitableForAllAges(image))) {
      throw UNSUITABLE_AVATAR;
    }

    const avatarKey = `${randomUUID()}.webp`;
    await this.storage.save(avatarKey, image);
    let previousKey: string | null;
    try {
      previousKey = await this.repository.replaceAvatar(userId, avatarKey);
    } catch (error) {
      await this.storage.remove(avatarKey);
      throw error;
    }
    if (previousKey) {
      try {
        await this.storage.remove(previousKey);
      } catch {
        this.logger.warn(
          "Previous user avatar cleanup failed after replacement.",
        );
      }
    }
    return { avatarUrl: publicAvatarUrl(avatarKey) };
  }

  read(avatarKey: unknown): Promise<Buffer | null> {
    if (!isUserAvatarKey(avatarKey)) {
      return Promise.resolve(null);
    }
    return this.storage.read(avatarKey);
  }
}

type AvatarFile = { buffer: Buffer; mimetype: string; size: number };

function isAvatarFile(value: unknown): value is AvatarFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "buffer" in value &&
    Buffer.isBuffer(value.buffer) &&
    "mimetype" in value &&
    typeof value.mimetype === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0
  );
}
