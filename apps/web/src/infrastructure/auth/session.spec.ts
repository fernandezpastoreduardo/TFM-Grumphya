import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticatedFetch,
  clearAccessToken,
  getAccessToken,
  notifySessionChanged,
  setAccessToken,
  subscribeToSessionChanges,
} from "./session";

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature";
const SESSION_STORAGE_KEY = "grumphya-auth-session-change";

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  isClosed = false;
  readonly messages: unknown[] = [];

  constructor(readonly name: string) {
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    this.messages.push(data);
    for (const channel of MockBroadcastChannel.instances) {
      if (channel !== this && !channel.isClosed && channel.name === this.name) {
        channel.onmessage?.({ data } as MessageEvent<unknown>);
      }
    }
  }

  close(): void {
    this.isClosed = true;
  }
}

describe("authenticated session client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearAccessToken();
  });

  it("refreshes the HttpOnly session cookie when no in-memory access token exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accessToken: ACCESS_TOKEN }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccessToken()).resolves.toBe(ACCESS_TOKEN);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("does not retry a missing session on every public page request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAccessToken()).resolves.toBeNull();
    await expect(getAccessToken()).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("broadcasts account changes across tabs without persisting credentials", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionChanges(listener);

    notifySessionChanged();
    const eventValue = localStorage.getItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SESSION_STORAGE_KEY,
        newValue: eventValue,
      }),
    );

    expect(listener).toHaveBeenCalledOnce();
    expect(eventValue).toBeTruthy();
    expect(localStorage.getItem("accessToken")).toBeNull();
    unsubscribe();
    localStorage.removeItem(SESSION_STORAGE_KEY);
  });

  it("ignores its own BroadcastChannel echo but accepts another tab's change", () => {
    MockBroadcastChannel.instances = [];
    vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const listener = vi.fn();
    const unsubscribe = subscribeToSessionChanges(listener);

    notifySessionChanged();

    const message = MockBroadcastChannel.instances[1]?.messages[0];
    expect(message).toEqual({
      type: "session-changed",
      clientId: expect.any(String),
    });
    MockBroadcastChannel.instances[0]?.onmessage?.({
      data: message,
    } as MessageEvent<unknown>);
    expect(listener).not.toHaveBeenCalled();
    MockBroadcastChannel.instances[0]?.onmessage?.({
      data: { type: "session-changed", clientId: "another-tab" },
    } as MessageEvent<unknown>);
    expect(listener).toHaveBeenCalledOnce();
    MockBroadcastChannel.instances[0]?.onmessage?.({
      data: { type: "session-changed", clientId: "" },
    } as MessageEvent<unknown>);
    expect(listener).toHaveBeenCalledOnce();
    expect(MockBroadcastChannel.instances[0]?.isClosed).toBe(false);
    unsubscribe();
    expect(MockBroadcastChannel.instances[0]?.isClosed).toBe(true);
  });

  it("shares a pending refresh across simultaneous protected requests", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(refreshResponse);
    vi.stubGlobal("fetch", fetchMock);

    const firstRequest = getAccessToken();
    const secondRequest = getAccessToken();
    resolveRefresh?.(
      new Response(JSON.stringify({ accessToken: ACCESS_TOKEN }), {
        status: 201,
      }),
    );

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      ACCESS_TOKEN,
      ACCESS_TOKEN,
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the access token as a bearer token for protected APIs", async () => {
    setAccessToken(ACCESS_TOKEN);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await authenticatedFetch("/api/account/profile");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/profile",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(authorizationFrom(fetchMock.mock.calls[0]?.[1])).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
  });

  it("retries once with a refreshed bearer token after an expired access token", async () => {
    setAccessToken(ACCESS_TOKEN);
    const refreshedToken = `${ACCESS_TOKEN}.new`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: refreshedToken }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await authenticatedFetch("/api/account/profile");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authorizationFrom(fetchMock.mock.calls[2]?.[1])).toBe(
      `Bearer ${refreshedToken}`,
    );
  });

  it("shares one refresh across simultaneous 401 responses", async () => {
    setAccessToken(ACCESS_TOKEN);
    const refreshedToken = `${ACCESS_TOKEN}.concurrent`;
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    let protectedRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/auth/refresh") {
        expect(init?.method).toBe("POST");
        return refreshResponse;
      }
      protectedRequests += 1;
      if (protectedRequests <= 2)
        return Promise.resolve(new Response("{}", { status: 401 }));
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstRequest = authenticatedFetch("/api/account/profile");
    const secondRequest = authenticatedFetch("/api/account/good-ideas");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
    resolveRefresh?.(
      new Response(JSON.stringify({ accessToken: refreshedToken }), {
        status: 201,
      }),
    );

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      expect.objectContaining({ status: 200 }),
      expect.objectContaining({ status: 200 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.filter(([input]) => input === "/api/auth/refresh"),
    ).toHaveLength(1);
    expect(authorizationFrom(fetchMock.mock.calls[3]?.[1])).toBe(
      `Bearer ${refreshedToken}`,
    );
    expect(authorizationFrom(fetchMock.mock.calls[4]?.[1])).toBe(
      `Bearer ${refreshedToken}`,
    );
  });

  it("does not restore an access token after local session clearing", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(refreshResponse));

    const pendingToken = getAccessToken();
    clearAccessToken();
    resolveRefresh?.(new Response(null, { status: 204 }));

    await expect(pendingToken).resolves.toBeNull();
    await expect(getAccessToken()).resolves.toBeNull();
  });
});

function authorizationFrom(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get("Authorization");
}
