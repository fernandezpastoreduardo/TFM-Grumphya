import {
  isAbuseChallenge,
  solveAbuseChallenge,
  type AbuseChallenge,
} from "../../shared/utils/abuse-challenge";

const CHALLENGE_REQUIRED_CODES = [
  "ABUSE_CHALLENGE_REQUIRED",
  "LOGIN_CHALLENGE_REQUIRED",
] as const;
const CHALLENGE_HEADER = "X-Abuse-Challenge";
const PROOF_HEADER = "X-Abuse-Proof";

type AbuseChallengeHeaders = Record<string, string>;
type ChallengeResponse = { challenge: AbuseChallenge };

export async function fetchWithAbuseChallenge(
  sendRequest: (headers?: AbuseChallengeHeaders) => Promise<Response>,
  onChallenge?: () => void,
): Promise<Response> {
  const response = await sendRequest();
  const challenge = await readChallenge(response);
  if (!challenge) return response;

  onChallenge?.();
  const proof = await solveAbuseChallenge(challenge.challenge);
  return sendRequest({
    [CHALLENGE_HEADER]: challenge.challenge.token,
    [PROOF_HEADER]: proof,
  });
}

async function readChallenge(
  response: Response,
): Promise<ChallengeResponse | null> {
  if (response.status !== 428) return null;
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return null;
  }
  if (!isRecord(body) || !isChallengeRequiredCode(body.code)) return null;
  return isAbuseChallenge(body.challenge)
    ? { challenge: body.challenge }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChallengeRequiredCode(value: unknown): boolean {
  return CHALLENGE_REQUIRED_CODES.some((code) => code === value);
}
