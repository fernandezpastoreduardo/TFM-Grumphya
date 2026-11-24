import { afterEach, describe, expect, it, vi } from "vitest";
import * as abuseChallenge from "../../shared/utils/abuse-challenge";
import { fetchWithAbuseChallenge } from "./fetch-with-abuse-challenge";

const CHALLENGE = { token: "signed-challenge", difficulty: 16 };
const PROOF = "42";
const CHALLENGE_REQUIRED_CODE = "ABUSE_CHALLENGE_REQUIRED";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWithAbuseChallenge", () => {
  it("solves a valid challenge and sends one proof retry", async () => {
    vi.spyOn(abuseChallenge, "solveAbuseChallenge").mockResolvedValue(PROOF);
    const initialResponse = Response.json(
      { code: CHALLENGE_REQUIRED_CODE, challenge: CHALLENGE },
      { status: 428 },
    );
    const retryResponse = Response.json({ accepted: true });
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce(initialResponse)
      .mockResolvedValueOnce(retryResponse);
    const onChallenge = vi.fn();

    const result = await fetchWithAbuseChallenge(sendRequest, onChallenge);

    expect(result).toBe(retryResponse);
    expect(abuseChallenge.solveAbuseChallenge).toHaveBeenCalledWith(CHALLENGE);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(sendRequest.mock.calls[0]).toEqual([]);
    expect(sendRequest).toHaveBeenNthCalledWith(2, {
      "X-Abuse-Challenge": CHALLENGE.token,
      "X-Abuse-Proof": PROOF,
    });
    expect(onChallenge).toHaveBeenCalledOnce();
  });

  it.each([
    ["non-challenge response", Response.json({}, { status: 401 })],
    [
      "unrecognized challenge code",
      Response.json(
        { code: "OTHER_CHALLENGE_REQUIRED", challenge: CHALLENGE },
        { status: 428 },
      ),
    ],
    [
      "invalid challenge data",
      Response.json(
        {
          code: CHALLENGE_REQUIRED_CODE,
          challenge: { ...CHALLENGE, difficulty: 3 },
        },
        { status: 428 },
      ),
    ],
    ["malformed challenge JSON", new Response("not-json", { status: 428 })],
  ])("does not retry after %s", async (_name, response) => {
    const solve = vi.spyOn(abuseChallenge, "solveAbuseChallenge");
    const sendRequest = vi.fn().mockResolvedValue(response);
    const onChallenge = vi.fn();

    const result = await fetchWithAbuseChallenge(sendRequest, onChallenge);

    expect(result).toBe(response);
    expect(sendRequest).toHaveBeenCalledOnce();
    expect(solve).not.toHaveBeenCalled();
    expect(onChallenge).not.toHaveBeenCalled();
  });

  it("does not solve or retry a second challenge response", async () => {
    vi.spyOn(abuseChallenge, "solveAbuseChallenge").mockResolvedValue(PROOF);
    const firstResponse = Response.json(
      { code: CHALLENGE_REQUIRED_CODE, challenge: CHALLENGE },
      { status: 428 },
    );
    const secondResponse = Response.json(
      { code: CHALLENGE_REQUIRED_CODE, challenge: CHALLENGE },
      { status: 428 },
    );
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);

    const result = await fetchWithAbuseChallenge(sendRequest);

    expect(result).toBe(secondResponse);
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(abuseChallenge.solveAbuseChallenge).toHaveBeenCalledOnce();
  });
});
