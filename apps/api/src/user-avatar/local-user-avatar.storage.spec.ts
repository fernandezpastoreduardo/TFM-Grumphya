import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalUserAvatarStorage } from "./local-user-avatar.storage";

const AVATAR_KEY = "00000000-0000-4000-8000-000000000001.webp";
const IMAGE_BYTES = Buffer.from("normalized webp bytes");
const ORIGINAL_DIRECTORY = process.env.USER_AVATAR_DIRECTORY;
let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory)
    await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
  if (ORIGINAL_DIRECTORY === undefined)
    delete process.env.USER_AVATAR_DIRECTORY;
  else process.env.USER_AVATAR_DIRECTORY = ORIGINAL_DIRECTORY;
});

describe("LocalUserAvatarStorage", () => {
  it("persists, reads and removes avatars under the configured private directory", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "grumphya-avatars-"));
    process.env.USER_AVATAR_DIRECTORY = temporaryDirectory;
    const storage = new LocalUserAvatarStorage();

    await storage.save(AVATAR_KEY, IMAGE_BYTES);

    const savedPath = join(temporaryDirectory, AVATAR_KEY);
    expect(await readFile(savedPath)).toEqual(IMAGE_BYTES);
    expect((await stat(savedPath)).mode & 0o777).toBe(0o600);
    await expect(storage.read(AVATAR_KEY)).resolves.toEqual(IMAGE_BYTES);

    await storage.remove(AVATAR_KEY);
    await expect(storage.read(AVATAR_KEY)).resolves.toBeNull();
  });

  it("does not permit path traversal keys", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "grumphya-avatars-"));
    process.env.USER_AVATAR_DIRECTORY = temporaryDirectory;
    const storage = new LocalUserAvatarStorage();

    await expect(storage.read("../../etc/passwd")).rejects.toThrow(
      "Invalid stored avatar key.",
    );
    await expect(storage.remove("../../etc/passwd")).rejects.toThrow(
      "Invalid stored avatar key.",
    );
  });
});
