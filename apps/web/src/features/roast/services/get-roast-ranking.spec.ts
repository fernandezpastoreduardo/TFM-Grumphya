import { afterEach, describe, expect, it, vi } from "vitest";
import { getRoastRanking } from "./get-roast-ranking";

const ENDPOINT = "/api/roast-ranking";
const ORIGINAL_FETCH = globalThis.fetch;
const RANKING = [
  { username: "GrumpyWinner", roastMessagesSent: 30 },
  { username: "TeaSpiller", roastMessagesSent: 21 },
];

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("getRoastRanking", () => {
  it("loads the public ranking without sending credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(RANKING));
    globalThis.fetch = fetchMock;
    const controller = new AbortController();

    await expect(getRoastRanking(controller.signal)).resolves.toEqual(RANKING);

    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, {
      signal: controller.signal,
      credentials: "omit",
    });
  });

  it("rejects malformed or overlong ranking responses", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json([{ username: "someone", roastMessagesSent: -1 }]),
      );
    await expect(getRoastRanking()).rejects.toThrow(
      "Roast ranking response is invalid.",
    );

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json(Array.from({ length: 11 }, () => RANKING[0])),
      );
    await expect(getRoastRanking()).rejects.toThrow(
      "Roast ranking response is invalid.",
    );
  });

  it("rejects unavailable endpoint responses", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getRoastRanking()).rejects.toThrow(
      "Roast ranking request failed.",
    );
  });
});
