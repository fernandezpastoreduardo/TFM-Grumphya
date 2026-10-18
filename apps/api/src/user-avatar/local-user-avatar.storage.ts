import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import type { UserAvatarStorage } from "./user-avatar.models";
import { isUserAvatarKey } from "./avatar-key";

const DEFAULT_AVATAR_DIRECTORY = resolve(process.cwd(), "var", "avatars");

@Injectable()
export class LocalUserAvatarStorage implements UserAvatarStorage {
  private readonly directory = resolve(
    process.env.USER_AVATAR_DIRECTORY ?? DEFAULT_AVATAR_DIRECTORY,
  );

  async save(avatarKey: string, image: Buffer): Promise<void> {
    const path = this.pathFor(avatarKey);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, image, { flag: "wx", mode: 0o600 });
  }

  async read(avatarKey: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(avatarKey));
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async remove(avatarKey: string): Promise<void> {
    try {
      await rm(this.pathFor(avatarKey), { force: true });
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  private pathFor(avatarKey: string): string {
    if (!isUserAvatarKey(avatarKey)) {
      throw new Error("Invalid stored avatar key.");
    }
    return resolve(this.directory, avatarKey);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
