import {
  isLoginChallenge,
  type LoginChallenge,
} from "./services/login-challenge";
import { LOGIN_CHALLENGE_REQUIRED } from "./authentication.constants";
import type { LoginResponse } from "./authentication.models";

export function isLoginResponse(value: unknown): value is LoginResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    "account" in value &&
    typeof value.account === "object" &&
    value.account !== null &&
    "user" in value.account &&
    typeof value.account.user === "object" &&
    value.account.user !== null &&
    "role" in value.account.user &&
    (value.account.user.role === "user" || value.account.user.role === "admin")
  );
}

export function isChallengeRequiredResponse(
  status: number,
  value: unknown,
): value is {
  code: typeof LOGIN_CHALLENGE_REQUIRED;
  challenge: LoginChallenge;
} {
  return (
    status === 428 &&
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === LOGIN_CHALLENGE_REQUIRED &&
    "challenge" in value &&
    isLoginChallenge(value.challenge)
  );
}
