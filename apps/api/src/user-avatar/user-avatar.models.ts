export const USER_AVATAR_REPOSITORY = Symbol("USER_AVATAR_REPOSITORY");
export const USER_AVATAR_STORAGE = Symbol("USER_AVATAR_STORAGE");
export const USER_AVATAR_PROCESSOR = Symbol("USER_AVATAR_PROCESSOR");
export const USER_AVATAR_MODERATOR = Symbol("USER_AVATAR_MODERATOR");

export interface UserAvatarRepository {
  replaceAvatar(userId: string, avatarKey: string): Promise<string | null>;
}

export interface UserAvatarStorage {
  save(avatarKey: string, image: Buffer): Promise<void>;
  read(avatarKey: string): Promise<Buffer | null>;
  remove(avatarKey: string): Promise<void>;
}

export interface UserAvatarProcessor {
  toPublicAvatar(image: Buffer, contentType: string): Promise<Buffer>;
}

export interface UserAvatarModerator {
  isSuitableForAllAges(image: Buffer): Promise<boolean>;
}

export class UserAvatarError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UserAvatarError";
  }
}
