const PUBLIC_AVATAR_URL_PATTERN =
  /^\/api\/avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$/i;
const PUBLIC_AVATAR_URL_PREFIX = "/api/avatars/";

export function isPublicAvatarUrl(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_AVATAR_URL_PATTERN.test(value);
}

export function publicAvatarUrl(avatarKey: string): string {
  return `${PUBLIC_AVATAR_URL_PREFIX}${avatarKey}`;
}
