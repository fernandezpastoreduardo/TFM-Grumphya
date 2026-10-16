type AuthResponse = { accessToken: string };

const REFRESH_ENDPOINT = "/api/auth/refresh";
const REFRESH_METHOD = "POST";
const JSON_CONTENT_TYPE = "application/json";
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
  refreshInFlight = null;
}

export async function getAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  if (!refreshInFlight) refreshInFlight = refreshAccessToken();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) return new Response(null, { status: 401 });

  const firstResponse = await sendWithBearer(input, init, token);
  if (firstResponse.status !== 401) return firstResponse;

  clearAccessToken();
  const refreshedToken = await getAccessToken();
  if (!refreshedToken) return firstResponse;
  return sendWithBearer(input, init, refreshedToken);
}

async function sendWithBearer(
  input: RequestInfo | URL,
  init: RequestInit,
  token: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin",
  });
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(REFRESH_ENDPOINT, {
      method: REFRESH_METHOD,
      credentials: "same-origin",
      headers: { "Content-Type": JSON_CONTENT_TYPE },
      body: "{}",
    });
    const body: unknown = await response.json();
    if (!response.ok || !isAuthResponse(body)) return null;
    setAccessToken(body.accessToken);
    return body.accessToken;
  } catch {
    return null;
  }
}

function isAuthResponse(value: unknown): value is AuthResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "accessToken" in value &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0
  );
}
