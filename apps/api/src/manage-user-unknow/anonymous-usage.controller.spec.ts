import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AnonymousUsageService } from "./anonymous-usage.service";
import { AnonymousUsageController } from "./anonymous-usage.controller";

const ROAST_MESSAGE = "Grumphya, hoy has venido especialmente inspirada.";
const IDEMPOTENCY_KEY = "d54e74e8-4d23-46d4-9944-0b39bcda0914";
const RESERVED = {
  state: "reserved" as const,
  usage: {
    ideas: { limit: 3 as const, used: 0, remaining: 3 },
    roasts: { limit: 3 as const, used: 1, remaining: 2 },
  },
};
const REPLY =
  "He recibido tu mensaje. Mi respuesta definitiva todavía está de vacaciones.";

function createController() {
  const usage = {
    initialize: vi
      .fn()
      .mockResolvedValue({ token: "a".repeat(43), usage: RESERVED.usage }),
    reserve: vi.fn().mockResolvedValue(RESERVED),
    commit: vi.fn().mockResolvedValue(RESERVED.usage),
    release: vi.fn().mockResolvedValue(undefined),
  } as unknown as AnonymousUsageService & {
    initialize: ReturnType<typeof vi.fn>;
    reserve: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
  return { controller: new AnonymousUsageController(usage), usage };
}

describe("AnonymousUsageController roast endpoint", () => {
  it("validates the bounded text and reserves and commits a server-side use", async () => {
    const { controller, usage } = createController();
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    expect(usage.reserve).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
    expect(usage.commit).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      { reply: REPLY },
    );
  });

  it("returns a cached idempotent response without consuming another use", async () => {
    const { controller, usage } = createController();
    usage.reserve.mockResolvedValue({
      state: "cached",
      response: { reply: REPLY },
      usage: RESERVED.usage,
    });
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).resolves.toEqual({ reply: REPLY });
    expect(usage.commit).not.toHaveBeenCalled();
  });

  it("rejects extra fields and oversized messages before reserving a use", async () => {
    const { controller, usage } = createController();
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(
        request,
        { message: ROAST_MESSAGE, count: 3 },
        IDEMPOTENCY_KEY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.roast(request, { message: "x".repeat(401) }, IDEMPOTENCY_KEY),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it("releases a reservation when storing the demo response fails", async () => {
    const { controller, usage } = createController();
    usage.commit.mockRejectedValue(new Error("database unavailable"));
    const request = {
      headers: { cookie: `grumphya_anon=${"a".repeat(43)}` },
    } as never;

    await expect(
      controller.roast(request, { message: ROAST_MESSAGE }, IDEMPOTENCY_KEY),
    ).rejects.toThrow("database unavailable");
    expect(usage.release).toHaveBeenCalledWith(
      "a".repeat(43),
      "roasts",
      expect.stringMatching(/^[a-f0-9]{64}$/u),
    );
  });
});
