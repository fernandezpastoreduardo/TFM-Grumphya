import { afterEach, describe, expect, it, vi } from "vitest";
import * as abuseChallenge from "../../shared/utils/abuse-challenge";
import { submitRegistration } from "./register-with-plan.service";

const REGISTRATION_ENDPOINT = "/api/registrations";
const REGISTRATION_INPUT = {
  email: "persona@example.test",
  username: "persona",
  password: "Una contraseña válida 123!",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registration abuse challenge", () => {
  it("solves the server challenge and retries the same registration once", async () => {
    const challenge = { token: "registration-challenge", difficulty: 16 };
    vi.spyOn(abuseChallenge, "solveAbuseChallenge").mockResolvedValue("17");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "ABUSE_CHALLENGE_REQUIRED", challenge },
          { status: 428 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ status: "verification_pending" }));
    const onChallenge = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitRegistration(REGISTRATION_INPUT, onChallenge);

    expect(result.pending).toBe(true);
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      REGISTRATION_ENDPOINT,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-Abuse-Challenge": challenge.token,
          "X-Abuse-Proof": "17",
        },
      }),
    );
  });
});
