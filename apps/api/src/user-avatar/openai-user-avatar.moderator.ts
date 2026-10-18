import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { UserAvatarModerator } from "./user-avatar.models";

const MODERATION_ENDPOINT = "https://api.openai.com/v1/moderations";
const MODERATION_MODEL = "omni-moderation-latest";
const MODERATION_TIMEOUT_MS = 10_000;
const MODERATION_ERROR = {
  code: "AVATAR_MODERATION_UNAVAILABLE",
  message:
    "No se ha podido comprobar la imagen ahora. Inténtalo de nuevo más tarde.",
};

@Injectable()
export class OpenAiUserAvatarModerator implements UserAvatarModerator {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY?.trim() ?? "",
    private readonly request: typeof fetch = fetch,
  ) {}

  async isSuitableForAllAges(image: Buffer): Promise<boolean> {
    if (!this.apiKey) throw new ServiceUnavailableException(MODERATION_ERROR);
    try {
      const response = await this.request(MODERATION_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODERATION_MODEL,
          input: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/webp;base64,${image.toString("base64")}`,
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(MODERATION_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("Moderation request failed.");
      const result: unknown = await response.json();
      const flagged = readFlaggedValue(result);
      if (flagged === null) throw new Error("Invalid moderation response.");
      return !flagged;
    } catch {
      throw new ServiceUnavailableException(MODERATION_ERROR);
    }
  }
}

function readFlaggedValue(value: unknown): boolean | null {
  if (!isRecord(value) || !Array.isArray(value.results)) return null;
  const first = value.results[0];
  if (!isRecord(first) || typeof first.flagged !== "boolean") return null;
  return first.flagged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
