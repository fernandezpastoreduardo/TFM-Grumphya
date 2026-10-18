import sharp from "sharp";
import { Injectable } from "@nestjs/common";
import type { UserAvatarProcessor } from "./user-avatar.models";

const AVATAR_EDGE_PIXELS = 128;
const MAX_INPUT_PIXELS = 20_000_000;
const MIME_FORMATS = new Map<string, ReadonlySet<string>>([
  ["image/jpeg", new Set(["jpeg", "jpg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
]);

@Injectable()
export class SharpUserAvatarProcessor implements UserAvatarProcessor {
  async toPublicAvatar(image: Buffer, contentType: string): Promise<Buffer> {
    const expectedFormats = MIME_FORMATS.get(contentType);
    if (!expectedFormats) throw new Error("Unsupported source image type.");

    const pipeline = sharp(image, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    });
    const metadata = await pipeline.metadata();
    if (!metadata.format || !expectedFormats.has(metadata.format)) {
      throw new Error("Image data does not match the declared media type.");
    }

    const result = await pipeline
      .rotate()
      .resize(AVATAR_EDGE_PIXELS, AVATAR_EDGE_PIXELS, {
        fit: "cover",
        position: "attention",
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });

    if (result.info.format !== "webp")
      throw new Error("Avatar conversion failed.");
    return result.data;
  }
}
