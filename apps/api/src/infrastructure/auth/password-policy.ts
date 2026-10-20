const PASSWORD_UPPERCASE_PATTERN = /\p{Lu}/u;
const PASSWORD_LOWERCASE_PATTERN = /\p{Ll}/u;
const PASSWORD_NUMBER_PATTERN = /\p{N}/u;
const PASSWORD_SPECIAL_PATTERN = /[^\p{L}\p{N}\s]/u;

export function isStrongPassword(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 128 ||
    hasControlCharacters(value)
  ) {
    return false;
  }
  return (
    PASSWORD_UPPERCASE_PATTERN.test(value) &&
    PASSWORD_LOWERCASE_PATTERN.test(value) &&
    PASSWORD_NUMBER_PATTERN.test(value) &&
    PASSWORD_SPECIAL_PATTERN.test(value)
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) {
      return true;
    }
  }
  return false;
}
