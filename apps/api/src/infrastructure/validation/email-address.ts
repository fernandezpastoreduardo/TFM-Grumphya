const EMAIL_FORBIDDEN_CHARACTERS = /[\s<>]/u;

export function isEmailAddress(value: string): boolean {
  if (EMAIL_FORBIDDEN_CHARACTERS.test(value)) return false;
  const separator = value.indexOf("@");
  if (separator <= 0 || separator !== value.lastIndexOf("@")) return false;
  const domain = value.slice(separator + 1);
  const dot = domain.indexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

export function containsEmailAddress(value: string): boolean {
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const at = value.indexOf("@", searchFrom);
    if (at < 0) return false;
    const start = findAddressStart(value, at);
    const end = findAddressEnd(value, at);
    if (isEmailAddress(value.slice(start, end))) return true;
    searchFrom = at + 1;
  }
  return false;
}

function findAddressStart(value: string, at: number): number {
  let start = at - 1;
  while (start >= 0 && !isAddressBoundary(value[start])) start -= 1;
  return start + 1;
}

function findAddressEnd(value: string, at: number): number {
  let end = at + 1;
  while (end < value.length && !isAddressBoundary(value[end])) end += 1;
  while (end > at + 1 && '.,!?;:)]}’"'.includes(value[end - 1])) end -= 1;
  return end;
}

function isAddressBoundary(character: string | undefined): boolean {
  return (
    character === undefined ||
    /^\s$/u.test(character) ||
    "<>()[]{},;:'\"".includes(character)
  );
}
