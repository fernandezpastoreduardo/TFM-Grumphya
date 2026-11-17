import { authenticatedFetch } from "../../infrastructure/auth/session";
import { isPublicAvatarUrl } from "../../infrastructure/avatar/public-avatar-url";
import type { AccountProfile, GoodIdea, PlanCode } from "./user-profile.models";
import {
  isAccountProfile,
  isGoodIdeasResponse,
  isRecord,
  readJson,
} from "./user-profile.validation";

export async function loadUserProfile(): Promise<{
  profile: AccountProfile | null;
  goodIdeas: GoodIdea[];
  status: number;
}> {
  const [profileResponse, ideasResponse] = await Promise.all([
    authenticatedFetch("/api/account/profile"),
    authenticatedFetch("/api/account/good-ideas"),
  ]);
  const [profileBody, ideasBody]: [unknown, unknown] = await Promise.all([
    readJson(profileResponse),
    readJson(ideasResponse),
  ]);
  if (!profileResponse.ok || !ideasResponse.ok) {
    return {
      profile: null,
      goodIdeas: [],
      status: profileResponse.status === 401 ? 401 : ideasResponse.status,
    };
  }
  if (!isAccountProfile(profileBody) || !isGoodIdeasResponse(ideasBody)) {
    return { profile: null, goodIdeas: [], status: 0 };
  }
  return { profile: profileBody, goodIdeas: ideasBody.ideas, status: 200 };
}

export async function purchaseUserPlan(
  plan: PlanCode,
  idempotencyKey: string,
): Promise<{ profile: AccountProfile | null; status: number }> {
  const response = await authenticatedFetch(
    "/api/account/subscriptions/purchase",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ plan }),
    },
  );
  const body: unknown = await readJson(response);
  return {
    profile: response.ok && isAccountProfile(body) ? body : null,
    status: response.status,
  };
}

export async function uploadUserAvatar(file: File): Promise<{
  avatarUrl: string | null;
  status: number;
  message: string | null;
}> {
  const form = new FormData();
  form.append("avatar", file);
  const response = await authenticatedFetch("/api/account/avatar", {
    method: "POST",
    body: form,
  });
  const body: unknown = await readJson(response);
  if (
    !response.ok ||
    !isRecord(body) ||
    typeof body.avatarUrl !== "string" ||
    !isPublicAvatarUrl(body.avatarUrl)
  ) {
    return {
      avatarUrl: null,
      status: response.status,
      message:
        response.status < 500 &&
        isRecord(body) &&
        typeof body.message === "string"
          ? body.message
          : null,
    };
  }
  return { avatarUrl: body.avatarUrl, status: response.status, message: null };
}

export async function updateUserRankingPreference(
  enabled: boolean,
): Promise<{ profile: AccountProfile | null; status: number }> {
  const response = await authenticatedFetch("/api/account/privacy/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const body: unknown = await readJson(response);
  return {
    profile: response.ok && isAccountProfile(body) ? body : null,
    status: response.status,
  };
}
