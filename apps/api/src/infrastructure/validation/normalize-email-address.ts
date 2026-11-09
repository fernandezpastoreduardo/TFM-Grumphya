import { domainToASCII } from "node:url";
import { isEmailAddress } from "./email-address";

export function normalizeEmailAddress(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length > 254 || !isEmailAddress(trimmed)) return null;
  const separator = trimmed.lastIndexOf("@");
  const localPart = trimmed.slice(0, separator);
  const domain = domainToASCII(trimmed.slice(separator + 1));
  if (!domain || localPart.length > 64 || domain.length > 253) return null;
  const normalized = `${localPart}@${domain}`.toLowerCase();
  return normalized.length <= 254 && isEmailAddress(normalized)
    ? normalized
    : null;
}
