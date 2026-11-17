import {
  COMPLETE_ENDPOINT,
  REQUEST_ENDPOINT,
} from "./password-reset.constants";

export async function requestPasswordReset(
  email: FormDataEntryValue,
): Promise<void> {
  await fetch(REQUEST_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function completePasswordReset(
  token: string,
  password: FormDataEntryValue,
): Promise<{ ok: boolean; body: unknown }> {
  const response = await fetch(COMPLETE_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return {
    ok: response.ok,
    body: await response.json().catch(() => null),
  };
}
