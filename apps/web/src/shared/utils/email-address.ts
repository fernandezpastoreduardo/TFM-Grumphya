const EMAIL_ADDRESS_DELIMITERS = /[\s<>(){},;:'"]+/u;
const EMAIL_TRAILING_PUNCTUATION = '.,!?;:)]}’"';

export function isEmailAddress(value: string): boolean {
  const parts = value.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1] || /[\s<>]/u.test(value)) {
    return false;
  }
  const dot = parts[1].indexOf(".");
  return dot > 0 && dot < parts[1].length - 1;
}

export function containsEmailAddress(value: string): boolean {
  for (const token of value.split(EMAIL_ADDRESS_DELIMITERS)) {
    let candidate = token;
    while (
      candidate.length > 0 &&
      EMAIL_TRAILING_PUNCTUATION.includes(candidate.at(-1) ?? "")
    ) {
      candidate = candidate.slice(0, -1);
    }
    if (isEmailAddress(candidate)) return true;
  }
  return false;
}
