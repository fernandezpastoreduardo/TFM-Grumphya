import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessToken,
  setAccessToken,
} from "../../infrastructure/auth/session";
import * as abuseChallenge from "../../shared/utils/abuse-challenge";
import { submitContactMessage } from "./submit-contact-message.service";

const ACCESS_TOKEN = "test-access-token";
const CONTACT_SUBJECT = "Una consulta";
const CONTACT_BODY = "Necesito ayuda con mi cuenta de prueba.";
const IDEMPOTENCY_KEY = "34fdc14e-43bd-428a-920a-0484f40843ae";
const SAVED_MESSAGE = {
  status: "saved",
  confirmation: "sent",
  retryAllowed: false,
  reference: "5cfef363-ecda-491a-9439-a4d0657dc119",
  createdAt: "2026-11-24T12:00:00.000Z",
};

afterEach(() => {
  clearAccessToken();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contact abuse challenge", () => {
  it("retries the authenticated contact request with the same idempotency key", async () => {
    const challenge = { token: "contact-challenge", difficulty: 16 };
    vi.spyOn(abuseChallenge, "solveAbuseChallenge").mockResolvedValue("23");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "ABUSE_CHALLENGE_REQUIRED", challenge },
          { status: 428 },
        ),
      )
      .mockResolvedValueOnce(Response.json(SAVED_MESSAGE));
    const onChallenge = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken(ACCESS_TOKEN);

    const result = await submitContactMessage(
      CONTACT_SUBJECT,
      CONTACT_BODY,
      IDEMPOTENCY_KEY,
      onChallenge,
    );

    expect(result.reference).toBe(SAVED_MESSAGE.reference);
    expect(onChallenge).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryOptions = fetchMock.mock.calls[1]?.[1];
    const retryHeaders = new Headers(retryOptions?.headers);
    expect(retryHeaders.get("Authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(retryHeaders.get("Idempotency-Key")).toBe(IDEMPOTENCY_KEY);
    expect(retryHeaders.get("X-Abuse-Challenge")).toBe(challenge.token);
    expect(retryHeaders.get("X-Abuse-Proof")).toBe("23");
  });
});
