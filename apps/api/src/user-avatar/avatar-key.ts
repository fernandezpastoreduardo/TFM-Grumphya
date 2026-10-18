const USER_AVATAR_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$/i;

export function isUserAvatarKey(value: unknown): value is string {
  return typeof value === "string" && USER_AVATAR_KEY_PATTERN.test(value);
}
