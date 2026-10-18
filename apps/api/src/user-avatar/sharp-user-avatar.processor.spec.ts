import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SharpUserAvatarProcessor } from "./sharp-user-avatar.processor";

describe("SharpUserAvatarProcessor", () => {
  it("normalizes source image dimensions and metadata into a square WebP", async () => {
    const input = await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 3,
        background: "#38c9bd",
      },
    })
      .jpeg()
      .toBuffer();
    const processor = new SharpUserAvatarProcessor();

    const output = await processor.toPublicAvatar(input, "image/jpeg");
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(128);
    expect(metadata.height).toBe(128);
  });

  it("rejects image bytes whose real format does not match the declared MIME type", async () => {
    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#38c9bd",
      },
    })
      .png()
      .toBuffer();
    const processor = new SharpUserAvatarProcessor();

    await expect(processor.toPublicAvatar(png, "image/jpeg")).rejects.toThrow(
      "Image data does not match the declared media type.",
    );
  });

  it("rejects unsupported decoded formats such as SVG even if passed a raster MIME", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>',
    );
    const processor = new SharpUserAvatarProcessor();

    await expect(processor.toPublicAvatar(svg, "image/png")).rejects.toThrow(
      "Image data does not match the declared media type.",
    );
  });
});
