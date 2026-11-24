import { LOGIN_ENDPOINT, LOGIN_ERROR } from "./authentication.constants";
import { isLoginResponse } from "./authentication.validation";
import { fetchWithAbuseChallenge } from "../../infrastructure/api/fetch-with-abuse-challenge";
import { ABUSE_CHALLENGE_NOTICE } from "../../shared/constants/abuse-challenge.constants";

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
  const response = await fetchWithAbuseChallenge(
    (challengeHeaders) =>
      fetch(LOGIN_ENDPOINT, {
        ...loginRequest,
        headers: { ...loginRequest.headers, ...challengeHeaders },
      }),
    () => onChallenge(ABUSE_CHALLENGE_NOTICE),
  );
  const body: unknown = await response.json();
  if (!response.ok || !isLoginResponse(body)) throw new Error(LOGIN_ERROR);
  return {
    accessToken: body.accessToken,
    role: body.account.user.role,
  };
}
