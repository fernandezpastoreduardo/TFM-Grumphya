const MIN_SAFE_TITLE_LENGTH = 8;
const MAX_SAFE_TITLE_LENGTH = 72;
const SAFE_TITLE_WORD_PATTERN = /^[\p{L}\p{N}]+(?:[ '\u2019-][\p{L}\p{N}]+)*$/u;
export const PUBLIC_EMAIL_PATTERN = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u;
export const PUBLIC_URL_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
export const PUBLIC_PHONE_PATTERN = /(?:\+?\d[\d ()-]{7,}\d)/u;
export const PUBLIC_CONTROL_PATTERN = /[\p{Cc}\p{Cf}]/u;

export function isSafePublicTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= MIN_SAFE_TITLE_LENGTH &&
    value.length <= MAX_SAFE_TITLE_LENGTH &&
    SAFE_TITLE_WORD_PATTERN.test(value) &&
    !PUBLIC_EMAIL_PATTERN.test(value) &&
    !PUBLIC_URL_PATTERN.test(value) &&
    !PUBLIC_PHONE_PATTERN.test(value) &&
    !PUBLIC_CONTROL_PATTERN.test(value)
  );
}
