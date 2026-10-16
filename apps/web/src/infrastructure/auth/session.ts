type AuthResponse = { accessToken: string };

const REFRESH_ENDPOINT = "/api/auth/refresh";
const REFRESH_METHOD = "POST";
const JSON_CONTENT_TYPE = "application/json";
export const SESSION_EXPIRED_EVENT = "grumphya:session-expired";
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let refreshAttempted = false;
let sessionGeneration = 0;

export function setAccessToken(token: string): void {
  sessionGeneration += 1;
  accessToken = token;
  refreshAttempted = false;
}

export function clearAccessToken(): void {
  sessionGeneration += 1;
  accessToken = null;
  refreshInFlight = null;
  refreshAttempted = false;
}

export async function getAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  if (refreshInFlight) return refreshInFlight;
  if (refreshAttempted) return null;
  refreshAttempted = true;
  const refreshPromise = refreshAccessToken();
  refreshInFlight = refreshPromise;
  try {
    return await refreshPromise;
  } finally {
    if (refreshInFlight === refreshPromise) refreshInFlight = null;
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

  const refreshedToken = await refreshAfterUnauthorized(token);
  if (!refreshedToken) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return firstResponse;
  }
  return sendWithBearer(input, init, refreshedToken);
}

async function refreshAfterUnauthorized(
  rejectedToken: string,
): Promise<string | null> {
  if (accessToken && accessToken !== rejectedToken) return accessToken;
  if (!refreshInFlight) {
    accessToken = null;
    refreshAttempted = false;
  }
  return getAccessToken();
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
  const generation = sessionGeneration;
  try {
    const response = await fetch(REFRESH_ENDPOINT, {
      method: REFRESH_METHOD,
      credentials: "same-origin",
      headers: { "Content-Type": JSON_CONTENT_TYPE },
      body: "{}",
    });
    const body: unknown = await response.json();
    if (generation !== sessionGeneration) return accessToken;
    if (!response.ok || !isAuthResponse(body))
      return null;
    accessToken = body.accessToken;
    refreshAttempted = false;
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
