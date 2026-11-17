export function readResetToken(): string | null {
  const token = window.location.hash.slice(1);
  return /^[a-f0-9]{64}$/u.test(token) ? token : null;
}

export function hasErrorCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === code
  );
}
