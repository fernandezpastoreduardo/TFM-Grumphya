import {
  LOGIN_CHALLENGE_HEADER,
  LOGIN_CHALLENGE_NOTICE,
  LOGIN_ENDPOINT,
  LOGIN_ERROR,
  LOGIN_PROOF_HEADER,
} from "./authentication.constants";
import {
  isChallengeRequiredResponse,
  isLoginResponse,
} from "./authentication.validation";
import { solveLoginChallenge } from "./services/login-challenge";

export async function login(
  form: FormData,
  onChallenge: (notice: string) => void,
): Promise<{ accessToken: string; role: "user" | "admin" }> {
  const loginRequest: RequestInit = {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: form.get("identifier"),
      password: form.get("password"),
      rememberMe: form.get("remember") === "on",
    }),
  };
  let response = await fetch(LOGIN_ENDPOINT, loginRequest);
  let body: unknown = await response.json();
  if (isChallengeRequiredResponse(response.status, body)) {
    onChallenge(LOGIN_CHALLENGE_NOTICE);
    const proof = await solveLoginChallenge(body.challenge);
    response = await fetch(LOGIN_ENDPOINT, {
      ...loginRequest,
      headers: {
        ...loginRequest.headers,
        [LOGIN_CHALLENGE_HEADER]: body.challenge.token,
        [LOGIN_PROOF_HEADER]: proof,
      },
    });
    body = await response.json();
  }
  if (!response.ok || !isLoginResponse(body)) throw new Error(LOGIN_ERROR);
  return {
    accessToken: body.accessToken,
    role: body.account.user.role,
  };
}
