import { describe, expect, it, vi } from "vitest";
import { OpenAiUserAvatarModerator } from "./openai-user-avatar.moderator";

const IMAGE = Buffer.from("small-webp-image");
const IMAGE_DATA_URL = `data:image/webp;base64,${IMAGE.toString("base64")}`;

describe("OpenAiUserAvatarModerator", () => {
  it("submits the normalized image to the all-ages moderation model", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ flagged: false }] }), {
        status: 200,
      }),
    );
    const moderator = new OpenAiUserAvatarModerator("test-key", request);

    await expect(moderator.isSuitableForAllAges(IMAGE)).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(
      "https://api.openai.com/v1/moderations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: [{ type: "image_url", image_url: { url: IMAGE_DATA_URL } }],
        }),
      }),
    );
  });

  it("reports flagged images as unsuitable", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ flagged: true }] }), {
        status: 200,
      }),
    );
    const moderator = new OpenAiUserAvatarModerator("test-key", request);

    await expect(moderator.isSuitableForAllAges(IMAGE)).resolves.toBe(false);
  });

  it("fails closed when the moderation API is unavailable", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const moderator = new OpenAiUserAvatarModerator("test-key", request);

    await expect(moderator.isSuitableForAllAges(IMAGE)).rejects.toMatchObject({
      status: 503,
    });
  });

  it.each([
    ["an HTTP error", () => new Response("unavailable", { status: 429 })],
    ["a response without a result", () => Response.json({ results: [] })],
    [
      "a result without a boolean decision",
      () => Response.json({ results: [{}] }),
    ],
  ])("fails closed for %s", async (_description, responseFactory) => {
    const request = vi.fn().mockResolvedValue(responseFactory());
    const moderator = new OpenAiUserAvatarModerator("test-key", request);

    await expect(moderator.isSuitableForAllAges(IMAGE)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("fails closed when server credentials are not configured", async () => {
    const request = vi.fn();
    const moderator = new OpenAiUserAvatarModerator("", request);

    await expect(moderator.isSuitableForAllAges(IMAGE)).rejects.toMatchObject({
      status: 503,
    });
    expect(request).not.toHaveBeenCalled();
  });
});
